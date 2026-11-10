import type { Route } from "./+types/download";
import { requireSession } from "~/lib/auth.server";
import { readReport } from "~/lib/db.server";
import { bindings } from "~/lib/env.server";
export async function loader({ request, params }: Route.LoaderArgs) {
  const s = await requireSession(request);
  const r = await readReport(bindings().DB, params.reportId, s.id);
  if (r.status !== "saved")
    throw new Response("보고서를 먼저 저장해 주세요.", { status: 400 });
  return new Response(r.markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="money-log-${r.as_of_date}.md"`,
      "Cache-Control": "private, no-store",
    },
  });
}
