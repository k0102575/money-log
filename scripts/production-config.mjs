import { writeFileSync } from "node:fs";
const databaseId = process.env.MONEY_LOG_D1_ID,
  origin = process.env.MONEY_LOG_ORIGIN;
if (
  !databaseId ||
  !/^[\da-f-]{36}$/i.test(databaseId) ||
  databaseId === "00000000-0000-0000-0000-000000000000"
)
  throw new Error("MONEY_LOG_D1_ID에 실제 운영 DB ID가 필요합니다.");
if (
  !origin ||
  new URL(origin).protocol !== "https:" ||
  new URL(origin).origin !== origin
)
  throw new Error("MONEY_LOG_ORIGIN에 경로 없는 HTTPS origin이 필요합니다.");
writeFileSync(
  "wrangler.production.jsonc",
  JSON.stringify(
    {
      name: "money-log",
      main: "workers/app.ts",
      compatibility_date: "2026-11-03",
      compatibility_flags: ["nodejs_compat"],
      vars: { APP_ORIGIN: origin },
      d1_databases: [
        {
          binding: "DB",
          database_name: "money-log-production",
          database_id: databaseId,
          migrations_dir: "migrations",
        },
      ],
      observability: { enabled: false },
    },
    null,
    2,
  ) + "\n",
);
console.log("운영 빌드 설정을 준비했습니다.");
