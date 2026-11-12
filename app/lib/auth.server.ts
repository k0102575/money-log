import { requestSessions } from "./request-session.server";
import { redirect } from "react-router";
import { bindings } from "./env.server";
import { randomToken, sha, verifyPassword } from "./crypto";
export interface Session {
  id: string;
  token_hash: string;
  csrf_token: string;
  expires_at: string;
  auth_version: string;
  created_at: string;
}
export function cookie(request: Request, name: string) {
  const v = request.headers
    .get("Cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${name}=`));
  return v?.slice(name.length + 1) ?? "";
}
export function secure(request: Request) {
  return new URL(request.url).protocol === "https:";
}
const sessionName = (request: Request) =>
  secure(request) ? "__Host-money-session" : "money-session";
export function sessionCookie(
  request: Request,
  token: string,
  maxAge = 604800,
) {
  return `${sessionName(request)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure(request) ? "; Secure" : ""}`;
}
export function checkOrigin(request: Request) {
  const { APP_ORIGIN } = bindings();
  const expected = APP_ORIGIN ?? new URL(request.url).origin;
  if (request.headers.get("Origin") !== expected)
    throw new Response("요청 출처를 확인할 수 없습니다.", { status: 403 });
  if (request.method !== "POST")
    throw new Response("허용되지 않은 요청입니다.", { status: 405 });
}
export function session(request: Request) {
  const cache = requestSessions.getStore();
  const token = cookie(request, sessionName(request));
  if (!cache) return readSession(request);
  let result = cache.get(token);
  if (!result) {
    result = readSession(request);
    cache.set(token, result);
  }
  return result;
}
async function readSession(request: Request) {
  const token = cookie(request, sessionName(request));
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const { DB, AUTH_VERSION } = bindings();
  return DB.prepare(
    "SELECT * FROM sessions WHERE token_hash=? AND expires_at>? AND auth_version=?",
  )
    .bind(await sha(token), new Date().toISOString(), AUTH_VERSION)
    .first<Session>();
}
export async function requireSession(request: Request) {
  const s = await session(request);
  if (!s) throw redirect("/login");
  return s;
}
export async function mutation(request: Request, form: FormData) {
  const s = await session(request);
  if (!s)
    throw new Response(
      "로그인이 만료되었습니다. 새 탭에서 로그인한 뒤 이 화면에서 다시 저장해 주세요.",
      { status: 401 },
    );
  checkOrigin(request);
  if (String(form.get("csrf") ?? "") !== s.csrf_token)
    throw new Response("인증 정보가 변경되었습니다. 새로고침해 주세요.", {
      status: 403,
    });
  return s;
}
export async function login(request: Request, form: FormData) {
  checkOrigin(request);
  const { DB, PASSWORD_HASH, AUTH_VERSION } = bindings();
  if (!PASSWORD_HASH)
    return {
      error:
        "아직 비밀번호가 설정되지 않았습니다. 실행 안내에 따라 비밀번호를 설정해 주세요.",
    };
  const csrf = cookie(request, "money-login");
  if (!csrf || csrf !== String(form.get("login_csrf") ?? ""))
    return {
      error: "로그인 화면이 만료되었습니다. 새로고침 후 다시 시도해 주세요.",
    };
  const ip = request.headers.get("CF-Connecting-IP") ?? "local";
  const ipHash = await sha(ip + PASSWORD_HASH.slice(-16));
  const time = Date.now();
  const attempt = await DB.prepare(
    "SELECT failures,window_start FROM login_attempts WHERE ip_hash=?",
  )
    .bind(ipHash)
    .first<{ failures: number; window_start: number }>();
  if (attempt && time - attempt.window_start < 900000 && attempt.failures >= 8)
    return { error: "로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요." };
  // Count before verification so parallel incorrect requests cannot bypass the threshold.
  const counted = await DB.prepare(
    `INSERT INTO login_attempts(ip_hash,failures,window_start) VALUES(?,1,?) ON CONFLICT(ip_hash) DO UPDATE SET failures=CASE WHEN ?-window_start>=900000 THEN 1 ELSE failures+1 END,window_start=CASE WHEN ?-window_start>=900000 THEN ? ELSE window_start END RETURNING failures`,
  )
    .bind(ipHash, time, time, time, time)
    .first<{ failures: number }>();
  if (counted && counted.failures > 8)
    return { error: "로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요." };
  const password = String(form.get("password") ?? "");
  if (password.length > 512 || !(await verifyPassword(password, PASSWORD_HASH)))
    return { error: "비밀번호를 확인해 주세요." };
  const token = randomToken(),
    sessionId = crypto.randomUUID(),
    created = new Date().toISOString();
  await DB.batch([
    DB.prepare("DELETE FROM login_attempts WHERE ip_hash=?").bind(ipHash),
    DB.prepare(
      "UPDATE reports SET session_id=NULL WHERE session_id IN (SELECT id FROM sessions WHERE expires_at<? OR auth_version!=?)",
    ).bind(created, AUTH_VERSION),
    DB.prepare(
      "DELETE FROM sessions WHERE expires_at<? OR auth_version!=?",
    ).bind(created, AUTH_VERSION),
    DB.prepare(
      "INSERT INTO sessions(id,token_hash,csrf_token,expires_at,auth_version,created_at) VALUES(?,?,?,?,?,?)",
    ).bind(
      sessionId,
      await sha(token),
      randomToken(),
      new Date(time + 604800000).toISOString(),
      AUTH_VERSION,
      created,
    ),
  ]);
  return redirect("/", {
    headers: { "Set-Cookie": sessionCookie(request, token) },
  });
}
