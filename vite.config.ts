import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
export default defineConfig({
  plugins: [
    cloudflare({
      configPath:
        process.env.MONEY_LOG_PRODUCTION === "1"
          ? "wrangler.production.jsonc"
          : "wrangler.jsonc",
      viteEnvironment: { name: "ssr" },
    }),
    tailwindcss(),
    reactRouter(),
  ],
  resolve: { tsconfigPaths: true },
});
