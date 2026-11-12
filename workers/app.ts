import { requestSessions } from "../app/lib/request-session.server";
import { createRequestHandler } from "react-router";
const robotsTag = "noindex, nofollow";
const handle = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);
export default {
  async fetch(request) {
    try {
      const response = await requestSessions.run(new Map(), () =>
        handle(request),
      );
      const headers = new Headers(response.headers);
      headers.set("X-Robots-Tag", robotsTag);
      headers.set("Cache-Control", "private, no-store");
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("Referrer-Policy", "same-origin");
      headers.set("X-Frame-Options", "DENY");
      headers.set(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=()",
      );
      headers.set(
        "Content-Security-Policy",
        "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
      );
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch {
      return new Response(
        "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        {
          status: 500,
          headers: { "Cache-Control": "no-store", "X-Robots-Tag": robotsTag },
        },
      );
    }
  },
} satisfies ExportedHandler<Env>;
