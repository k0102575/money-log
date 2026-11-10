export { shouldRevalidate } from "~/lib/revalidation";
import { useEffect } from "react";
import { Link, useLoaderData, useFetcher } from "react-router";
import type { Route } from "./+types/report-detail";
import { mutation, requireSession } from "~/lib/auth.server";
import { bindings } from "~/lib/env.server";
import { finalizeReport, readReport } from "~/lib/db.server";
import { actionFailure } from "~/lib/actions.server";
import { ActionError, Csrf } from "~/components/forms";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, Download, Check, Clock3 } from "lucide-react";
export async function loader({ request, params }: Route.LoaderArgs) {
  const s = await requireSession(request);
  const report = await readReport(bindings().DB, params.reportId, s.id);
  return {
    report: {
      id: report.id,
      markdown: report.markdown,
      status: report.status,
      asOf: report.as_of_date,
      generatedAt: report.generated_at,
    },
  };
}
export async function action({ request, params }: Route.ActionArgs) {
  try {
    const f = await request.formData();
    const s = await mutation(request, f);
    await finalizeReport(bindings().DB, params.reportId, s.id);
    return {
      error: undefined,
      downloadUrl: `/reports/${params.reportId}/download`,
    };
  } catch (e) {
    return actionFailure(e);
  }
}
export default function ReportDetail() {
  const { report: r } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const result = fetcher.data;
  useEffect(() => {
    if (result && "downloadUrl" in result && result.downloadUrl)
      window.location.assign(result.downloadUrl);
  }, [result]);
  return (
    <main className="page max-w-5xl">
      <Link
        to="/reports"
        className="mb-6 flex items-center gap-2 text-xs text-muted-foreground"
      >
        <ArrowLeft className="size-3.5" />
        보고서 목록
      </Link>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge variant="outline" className="mb-3">
            {r.status === "saved" ? (
              <>
                <Check className="size-3" />
                저장된 보고서
              </>
            ) : (
              <>
                <Clock3 className="size-3" />
                미리보기 · 1시간 유지
              </>
            )}
          </Badge>
          <h1 className="page-title">{r.asOf} 계좌 현황</h1>
          <p className="helper mt-2">
            내용을 확인하고 Markdown 파일로 내려받으세요.
          </p>
        </div>
        {r.status === "saved" ? (
          <Button asChild>
            <a href={`/reports/${r.id}/download`} download>
              <Download />
              MD 다운로드
            </a>
          </Button>
        ) : (
          <fetcher.Form method="post">
            <Csrf />
            <Button type="submit" disabled={fetcher.state !== "idle"}>
              <Download />
              {fetcher.state !== "idle" ? "저장 중…" : "저장·MD 다운로드"}
            </Button>
          </fetcher.Form>
        )}
      </div>
      <ActionError error={result?.error} />
      <p className="callout mb-6">
        {r.status === "draft"
          ? "현재 미리보기는 생성 당시 내용으로 고정되어 있습니다. 저장 후 MD를 다운로드할 수 있습니다."
          : "저장 이후 계좌를 수정해도 이 보고서의 내용은 유지됩니다."}{" "}
        최신 기록을 반영하려면 새 보고서를 생성하세요.
      </p>
      <article className="markdown rounded-xl border bg-card p-5 shadow-sm md:p-10">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{r.markdown}</ReactMarkdown>
      </article>
      <details className="mt-5 rounded-xl border bg-card p-5">
        <summary className="cursor-pointer text-xs text-muted-foreground">
          Markdown 원문 보기
        </summary>
        <pre className="mt-4 overflow-x-auto whitespace-pre-wrap text-xs leading-6">
          {r.markdown}
        </pre>
      </details>
    </main>
  );
}
