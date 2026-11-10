import { pbkdf2Sync, randomBytes } from "node:crypto";
import { writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
const remote = process.argv.includes("--remote");
if (!process.stdin.isTTY) {
  console.error("터미널에서 실행해 비밀번호를 직접 입력해 주세요.");
  process.exit(1);
}
async function hidden(prompt) {
  process.stdout.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  let value = "";
  return await new Promise((resolve) => {
    const read = (chunk) => {
      for (const char of chunk) {
        if (char === "\u0003") {
          process.stdin.setRawMode(false);
          process.exit(130);
        }
        if (char === "\r" || char === "\n") {
          process.stdin.off("data", read);
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (char === "\u007f") value = value.slice(0, -1);
        else if (char >= " ") value += char;
      }
    };
    process.stdin.on("data", read);
  });
}
const password = await hidden(
  "새 비밀번호 (9자 이상, 입력은 표시되지 않음): ",
);
const confirm = await hidden("비밀번호 확인: ");
if (password.length < 9 || password.length > 512 || password !== confirm) {
  console.error("9~512자의 일치하는 비밀번호가 필요합니다.");
  process.exit(1);
}
const salt = randomBytes(16);
const hash = `pbkdf2-sha256$100000$${salt.toString("hex")}$${pbkdf2Sync(password, salt, 100000, 32, "sha256").toString("hex")}`;
const version = randomBytes(16).toString("hex");
if (remote) {
  for (const [key, value] of [
    ["PASSWORD_HASH", hash],
    ["AUTH_VERSION", version],
  ]) {
    const result = spawnSync(
      "npx",
      [
        "wrangler",
        "secret",
        "put",
        key,
        "--config",
        "wrangler.production.jsonc",
      ],
      { input: value, stdio: ["pipe", "inherit", "inherit"] },
    );
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
  console.log("운영 비밀번호가 변경됐습니다. 기존 세션은 만료됩니다.");
} else {
  if (existsSync(".dev.vars") && !process.argv.includes("--replace")) {
    console.error(".dev.vars가 있습니다. 교체하려면 --replace를 사용하세요.");
    process.exit(1);
  }
  writeFileSync(
    ".dev.vars",
    `PASSWORD_HASH="${hash}"\nAUTH_VERSION="${version}"\n`,
    { mode: 0o600 },
  );
  console.log("로컬 비밀번호 설정을 저장했습니다. 개발 서버를 재시작하세요.");
}
