import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
if (!existsSync("wrangler.production.jsonc"))
  throw new Error(
    "README에 따라 wrangler.production.jsonc와 운영 D1·비밀번호를 먼저 준비하세요.",
  );
const text = readFileSync("wrangler.production.jsonc", "utf8");
if (
  text.includes("REPLACE_") ||
  text.includes("YOUR-") ||
  text.includes("00000000-0000-0000-0000-000000000000")
)
  throw new Error("운영 주소와 실제 D1 ID를 설정해 주세요.");
for (const args of [
  ["run", "check"],
  [
    "exec",
    "wrangler",
    "--",
    "deploy",
    "--config",
    "build/server/wrangler.json",
  ],
]) {
  const result = spawnSync("npm", args, {
    stdio: "inherit",
    env: { ...process.env, MONEY_LOG_PRODUCTION: "1" },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
