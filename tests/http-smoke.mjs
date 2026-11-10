// Live Worker integration test; local-only and disposable fixtures.
import assert from "node:assert/strict";
const base = process.env.MONEY_LOG_TEST_URL ?? "http://127.0.0.1:5173";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname))
  throw new Error("이 테스트는 폐기 가능한 로컬 환경에서만 실행합니다.");
const password = process.env.MONEY_LOG_TEST_PASSWORD;
if (!password) throw new Error("테스트용 로컬 비밀번호 환경변수가 필요합니다.");
let jar = "";
function cookie(response) {
  const values = response.headers.getSetCookie();
  for (const value of values) {
    const pair = value.split(";")[0];
    const name = pair.split("=")[0];
    jar = jar
      .split("; ")
      .filter((x) => x && !x.startsWith(name + "="))
      .concat(pair)
      .join("; ");
  }
}
async function get(path, authenticated = true) {
  return fetch(base + path, {
    redirect: "manual",
    headers: authenticated ? { Cookie: jar } : {},
  });
}
async function post(path, values, origin = base) {
  const body = new URLSearchParams(values);
  const response = await fetch(base + path, {
    method: "POST",
    redirect: "manual",
    headers: { Cookie: jar, Origin: origin },
    body,
  });
  cookie(response);
  return response;
}
function input(html, name) {
  const match = html.match(
    new RegExp(`<input[^>]*name="${name}"[^>]*value="([^"]*)"`),
  );
  assert.ok(match, `hidden field ${name}`);
  return match[1];
}
for (const path of [
  "/",
  "/reports",
  "/accounts/new",
  "/accounts/missing",
  "/reports/missing/download",
]) {
  const r = await get(path, false);
  assert.equal(r.status, 302);
  assert.equal(r.headers.get("location"), "/login");
  assert.match(r.headers.get("cache-control"), /no-store/);
}
const initial = await get("/login");
cookie(initial);
let html = await initial.text();
let loginCsrf = input(html, "login_csrf");
assert.ok(
  [400, 403].includes(
    (
      await post(
        "/login",
        { login_csrf: loginCsrf, password },
        "https://invalid.test",
      )
    ).status,
  ),
);
const wrong = await post("/login", {
  login_csrf: loginCsrf,
  password: "incorrect-local-password",
});
html = await wrong.text();
assert.match(html, /비밀번호를 확인/);
loginCsrf = input(html, "login_csrf");
const ok = await post("/login", { login_csrf: loginCsrf, password });
assert.equal(ok.status, 302);
assert.match(jar, /money-session=/);
html = await (await get("/accounts/new")).text();
const csrf = input(html, "csrf");
assert.equal((await post("/accounts/new", { csrf: "invalid" })).status, 403);
assert.ok(
  [400, 403].includes(
    (await post("/accounts/new", { csrf }, "https://invalid.test")).status,
  ),
);
const prefix = `HTTP-${Date.now()}`;
const entries = [
  ["하나", "checking"],
  ["신한", "checking"],
  ["CMA", "cma"],
  ["ISA", "isa"],
  ["IRP", "irp"],
  ["연금", "pension"],
  ["적금", "savings"],
  ["청약", "housing"],
];
for (const [name, type] of entries) {
  const r = await post("/accounts/new", {
    csrf,
    alias: `${prefix}-${name}`,
    institution: "가상 기관",
    account_type: type,
    tracking_start_date: "2026-01-01",
  });
  assert.equal(r.status, 302);
}
html = await (await get("/")).text();
for (const [name] of entries) assert.ok(html.includes(`${prefix}-${name}`));
let reportHtml = await (await get("/reports")).text();
const key = input(reportHtml, "request_key");
const created = await post("/reports", {
  csrf,
  request_key: key,
  as_of_date: "2026-11-04",
});
assert.equal(created.status, 302);
const path = created.headers.get("location");
assert.equal((await get(path + "/download")).status, 400);
const preview = await (await get(path)).text();
assert.ok(preview.includes(prefix));
const saved = await post(path, { csrf });
assert.equal(saved.status, 200);
const file = await get(path + "/download");
assert.equal(file.status, 200);
assert.match(file.headers.get("content-type"), /text\/markdown/);
const md = await file.text();
for (const [name] of entries) assert.ok(md.includes(`${prefix}-${name}`));
assert.equal((await get(path + "/download", false)).status, 302);
assert.equal((await post("/logout", { csrf })).status, 302);
assert.equal((await get("/")).status, 302);
console.log(
  "HTTP 검증 통과: 인증·출처·CSRF·8개 계좌·MD 생성/확정/다운로드·로그아웃",
);
