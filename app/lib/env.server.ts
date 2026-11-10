import { env } from "cloudflare:workers";
export function bindings() {
  return env as unknown as {
    DB: D1Database;
    PASSWORD_HASH?: string;
    AUTH_VERSION: string;
    APP_ORIGIN?: string;
  };
}
