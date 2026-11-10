export { shouldRevalidate } from "~/lib/revalidation";
import { Link, redirect, useLoaderData, useActionData } from "react-router";
import type { Route } from "./+types/reports";
import { mutation, requireSession } from "~/lib/auth.server";
import { bindings } from "~/lib/env.server";
import { draftReport } from "~/lib/db.server";
import { dateValue, textValue, today } from "~/lib/domain";
import { actionFailure } from "~/lib/actions.server";
import {
  ActionError,
  Csrf,
  Field,
  RecordForm,
  Submit,
} from "~/components/forms";
import { Card, CardContent } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { FileText, ArrowUpRight, CalendarDays, FileDown } from "lucide-react";
export async function loader({ request }: Route.LoaderArgs) {
  await requireSession(request);
  const saved = await bindings()
    .DB.prepare(
      "SELECT id,as_of_date,generated_at FROM reports WHERE status='saved' ORDER BY generated_at DESC LIMIT 100",
    )
    .all<{ id: string; as_of_date: string; generated_at: string }>();
  return { reports: saved.results, requestKey: crypto.randomUUID() };
}
export async function action({ request }: Route.ActionArgs) {
  try {
    const f = await request.formData();
    const s = await mutation(request, f);
    const asOf = dateValue(textValue(f, "as_of_date"));
    const key = textValue(f, "request_key", true, 100);
    return redirect(
      `/reports/${await draftReport(bindings().DB, asOf, s.id, key)}`,
    );
  } catch (e) {
    return actionFailure(e);
  }
}
export default function Reports() {
  const { reports, requestKey } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  return (
    <main className="page">
      <p className="eyebrow mb-3">YOUR FINANCIAL SNAPSHOT</p>
      <h1 className="page-title">MD 보고서</h1>
      <p className="helper mt-2 mb-8">
        계좌와 보유 상품을 한 문서로 정리하세요.
      </p>
      <ActionError error={result?.error} />
      <Card className="mb-10 overflow-hidden shadow-none">
        <CardContent className="grid gap-8 p-6 md:grid-cols-2 md:p-8">
          <div>
            <div className="mb-5 flex size-12 items-center justify-center rounded-xl bg-muted">
              <FileDown className="size-6 text-primary" />
            </div>
            <h2 className="text-lg font-semibold tracking-tight">
              현재 기록으로 보고서 만들기
            </h2>
            <p className="helper mt-3 max-w-sm">
              기준일까지 확인한 잔액과 상품 수량을 모아줍니다. 미입력 금액이
              있어도 생성할 수 있어요.
            </p>
            <p className="helper mt-4 text-xs">
              전체 순자산·월별 수입·지출은 포함하지 않습니다.
              <br />
              잔액 소계는 확인일별로 나누어 표시합니다.
            </p>
          </div>
          <RecordForm className="flex flex-col justify-center gap-5">
            <Csrf />
            <input type="hidden" name="request_key" value={requestKey} />
            <Field label="보고서 기준일">
              <Input
                type="date"
                name="as_of_date"
                required
                defaultValue={today()}
                max={today()}
              />
            </Field>
            <Submit className="w-full">
              미리보기 생성 <ArrowUpRight />
            </Submit>
            <p className="helper text-xs">
              미리보기 내용은 고정됩니다. 내용을 확인한 뒤 저장·다운로드하세요.
            </p>
          </RecordForm>
        </CardContent>
      </Card>
      <div className="mb-4 flex items-center gap-2">
        <CalendarDays className="size-4 text-muted-foreground" />
        <h2 className="section-title">저장한 보고서</h2>
        <span className="text-xs text-muted-foreground">{reports.length}</span>
      </div>
      {reports.length ? (
        <div className="overflow-hidden rounded-xl border bg-card">
          {reports.map((r) => (
            <Link
              to={`/reports/${r.id}`}
              key={r.id}
              className="flex items-center gap-4 border-b p-5 transition hover:bg-muted/50 last:border-0"
            >
              <span className="flex size-10 items-center justify-center rounded-lg border">
                <FileText className="size-4 text-muted-foreground" />
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium">{r.as_of_date} 계좌 현황</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  생성{" "}
                  {new Date(r.generated_at).toLocaleString("ko-KR", {
                    timeZone: "Asia/Seoul",
                  })}
                </p>
              </div>
              <ArrowUpRight className="size-4 text-muted-foreground" />
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed px-5 py-12 text-center">
          <FileText className="mx-auto mb-3 size-6 text-muted-foreground" />
          <p className="text-sm font-medium">아직 저장한 보고서가 없어요</p>
          <p className="helper mt-2">
            위에서 미리보기를 만들고 첫 보고서를 저장해 보세요.
          </p>
        </div>
      )}
    </main>
  );
}
