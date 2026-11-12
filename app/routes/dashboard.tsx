export { shouldRevalidate } from "~/lib/revalidation";
import { Link, useLoaderData } from "react-router";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight,
  Plus,
  Wallet,
} from "lucide-react";
import type { Route } from "./+types/dashboard";
import { AccountSettings } from "~/components/account-settings";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { requireSession } from "~/lib/auth.server";
import { balanceWon } from "~/lib/balance";
import { snapshot } from "~/lib/db.server";
import { dashboard } from "~/lib/dashboard";
import { today } from "~/lib/domain";
import { bindings } from "~/lib/env.server";
import { ledgerKinds } from "~/lib/ledger";
import {
  listSavingsRules,
  plannedSavings,
} from "~/lib/recurring-savings.server";

export async function loader({ request }: Route.LoaderArgs) {
  await requireSession(request);
  const { DB } = bindings();
  const asOf = today();
  const [data, rules] = await Promise.all([
    snapshot(DB, asOf, "all"),
    listSavingsRules(DB),
  ]);
  const summary = dashboard(data);
  const plans = await plannedSavings(DB, rules, summary.month);
  return {
    ...summary,
    asOf,
    pending: plans
      .filter((plan) => !plan.transaction)
      .map(({ rule, due }) => ({
        name: data.accounts.find(
          (account) => account.id === rule.destination_id,
        )?.alias,
        amount: rule.amount_krw,
        due,
      })),
  };
}

function amount(value: string) {
  return BigInt(value).toLocaleString("ko-KR");
}

const fundSeries = [
  { key: "saving", label: "적금·청약", color: "bg-primary" },
  { key: "isa", label: "ISA", color: "bg-sky-500" },
  { key: "pension", label: "연금저축·IRP", color: "bg-indigo-400" },
] as const;

export default function Dashboard() {
  const data = useLoaderData<typeof loader>();
  const hasBalance = data.balances.some((row) => row.calculated !== null);
  const hasInvestment = data.investments.some((row) => row.amount !== null);
  const maximum = Math.max(
    1,
    ...data.monthly.flatMap((row) =>
      fundSeries.map((series) => Number(row[series.key])),
    ),
  );
  const combined = (
    BigInt(data.totalBalance) + BigInt(data.totalInvested)
  ).toString();
  const palette = [
    "#24715b",
    "#78968a",
    "#a2b8ab",
    "#45a78b",
    "#d4aa50",
    "#4392cb",
    "#7b73bd",
    "#cc7b99",
  ];
  const accounts = [
    ...data.balances.map((row) => ({
      id: row.id,
      name: row.name,
      value: row.calculated,
    })),
    ...data.investments.map((row) => ({
      id: row.id,
      name: row.name,
      value: row.amount,
    })),
  ];
  const chartTotal = accounts.reduce(
    (sum, row) => sum + Math.max(0, Number(row.value)),
    0,
  );
  let offset = 0;
  const slices = accounts.map((row, index) => {
    const share =
      chartTotal > 0 ? (Math.max(0, Number(row.value)) / chartTotal) * 100 : 0;
    const slice = {
      ...row,
      share,
      offset,
      color: palette[index % palette.length],
    };
    offset += share;
    return slice;
  });
  const hasNegative = accounts.some((row) => Number(row.value) < 0);
  return (
    <main className="page space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow mb-2">MY MONEY</p>
          <h1 className="page-title">나의 자산 흐름</h1>
          <p className="helper mt-2">{data.asOf} · 직접 기록한 내 돈의 현황</p>
        </div>
        <div className="flex gap-2">
          <AccountSettings />
          <Button variant="outline" asChild>
            <Link to="/ledger">
              <Plus aria-hidden="true" />
              거래 입력
            </Link>
          </Button>
        </div>
      </header>

      <Card>
        <CardContent className="space-y-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="section-title">잔액·투자 원금 합계</h2>
            <Link
              to="/accounts"
              className="flex items-center gap-1 text-xs font-medium text-primary"
            >
              계좌 보기
              <ChevronRight className="size-4" />
            </Link>
          </div>
          <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-10">
            <div className="space-y-4">
              <div className="relative mx-auto size-60 max-w-full">
                <svg
                  viewBox="0 0 240 240"
                  className="size-full -rotate-90"
                  role="img"
                  aria-label={`계좌별 잔액·투자 원금 구성. 합계 ${hasBalance || hasInvestment ? amount(combined) + "원" : "미확인"}`}
                >
                  <circle
                    cx="120"
                    cy="120"
                    r="103"
                    fill="none"
                    strokeWidth="20"
                    className="stroke-muted"
                  />
                  {slices
                    .filter((slice) => slice.share > 0)
                    .map((slice) => (
                      <circle
                        key={slice.id}
                        cx="120"
                        cy="120"
                        r="103"
                        fill="none"
                        strokeWidth="20"
                        pathLength="100"
                        stroke={slice.color}
                        strokeDasharray={`${slice.share} ${100 - slice.share}`}
                        strokeDashoffset={-slice.offset}
                      >
                        <title>
                          {slice.name} · {balanceWon(slice.value)} ·{" "}
                          {slice.share.toFixed(1)}%
                        </title>
                      </circle>
                    ))}
                </svg>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 px-7 text-center">
                  <span className="text-xs text-muted-foreground">
                    {data.missingBalances + data.missingInvestments > 0
                      ? "확인된 계좌 소계"
                      : "잔액 + 투자 원금"}
                  </span>
                  <p className="max-w-full break-words text-2xl font-semibold tracking-tight tabular-nums">
                    {hasBalance || hasInvestment ? amount(combined) : "—"}
                  </p>
                  <span className="text-xs text-muted-foreground">원</span>
                </div>
              </div>
              <p className="helper text-center">
                현금·저축은 계산 잔액, 투자는 순납입 원금 기준
              </p>
            </div>
            <div className="min-w-0 space-y-3">
              <div className="flex items-center justify-between border-b pb-3">
                <h3 className="text-sm font-medium">계좌별 구성</h3>
                <span className="text-xs text-muted-foreground">
                  {accounts.length}개 계좌
                </span>
              </div>
              {slices.map((row) => (
                <Link
                  key={row.id}
                  to={`/accounts/${row.id}`}
                  className="flex items-start justify-between gap-3 rounded-lg px-1 py-1 text-sm hover:bg-muted/50"
                >
                  <span className="flex min-w-0 items-start gap-2">
                    <i
                      className="mt-1.5 size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: row.color }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 break-words text-muted-foreground">
                      {row.name}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-medium tabular-nums">
                      {row.value === null ? "미확인" : balanceWon(row.value)}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {row.value === null || Number(row.value) < 0
                        ? "—"
                        : `${row.share.toFixed(1)}%`}
                    </span>
                  </span>
                </Link>
              ))}
              {accounts.length === 0 && (
                <Link className="text-sm text-primary" to="/accounts/new">
                  첫 계좌 등록하기 →
                </Link>
              )}
            </div>
          </div>
          {(data.missingBalances > 0 ||
            data.missingInvestments > 0 ||
            data.partialBalances ||
            hasNegative) && (
            <div className="space-y-1 rounded-lg bg-muted/50 p-3">
              {data.missingBalances > 0 && (
                <p className="helper">
                  기준 잔액 미입력 {data.missingBalances}개
                </p>
              )}
              {data.missingInvestments > 0 && (
                <p className="helper">
                  초기 납입·인출 기준 확인 필요 {data.missingInvestments}개
                </p>
              )}
              {data.partialBalances && (
                <p className="helper">
                  일부 계좌는 기준일 이후 거래 기록이 완전하지 않을 수 있습니다.
                </p>
              )}
              {hasNegative && (
                <p className="helper">
                  합계에는 음수를 반영하고, 도넛의 비중은 양수 금액으로
                  표시합니다.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="section-title">
            {Number(data.month.slice(5))}월 돈의 흐름
          </h2>
          <Link
            to={`/ledger?month=${data.month}`}
            className="text-xs font-medium text-primary"
          >
            가계부 보기 →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {[
            ["수입", data.totals.income, ArrowDownLeft],
            ["소비 지출", data.totals.expense, ArrowUpRight],
            ["모은 돈", data.totals.saved, Wallet],
          ].map(([label, value, Icon]) => {
            const Symbol = Icon as typeof Wallet;
            return (
              <div
                key={String(label)}
                className={`min-w-0 rounded-xl border bg-card p-4 ${label === "모은 돈" ? "col-span-2 lg:col-span-1" : ""}`}
              >
                <Symbol
                  className="mb-3 size-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <p className="helper">{String(label)}</p>
                <p className="mt-1 break-words text-lg font-semibold tabular-nums">
                  {amount(String(value))}
                  <span className="ml-0.5 text-xs font-normal">원</span>
                </p>
              </div>
            );
          })}
        </div>
        <p className="helper">
          입력한 거래 기준 · 모은 돈은 적금·청약·ISA·연금저축·IRP 납입 합계 ·
          부채 상환 {amount(data.totals.repayment)}원
        </p>
      </section>

      <Card>
        <CardContent className="space-y-5 p-5 sm:p-6">
          <div>
            <h2 className="section-title">매달 쌓는 돈</h2>
            <p className="helper mt-1">모은 돈의 계좌별 납입 기록</p>
          </div>
          <div className="flex flex-wrap gap-4 text-xs">
            {fundSeries.map((series) => (
              <span key={series.key} className="flex items-center gap-2">
                <i
                  className={`size-2 rounded-full ${series.color}`}
                  aria-hidden="true"
                />
                {series.label}
              </span>
            ))}
          </div>
          <div className="flex min-h-44 items-end gap-3 border-b pb-3">
            {data.monthly.map((row) => (
              <div
                key={row.month}
                className="min-w-0 flex-1 space-y-2 text-center"
              >
                <div className="flex h-32 items-end justify-center gap-1 sm:gap-2">
                  {fundSeries.map((series) => (
                    <div
                      key={series.key}
                      className={`w-6 max-w-[25%] rounded-t ${series.color}`}
                      style={{
                        height: `${(Number(row[series.key]) / maximum) * 100}%`,
                        minHeight: Number(row[series.key]) > 0 ? 3 : 0,
                      }}
                      title={`${row.month} ${series.label} ${amount(row[series.key])}원`}
                    />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {Number(row.month.slice(5))}월
                </p>
                <p className="break-words text-xs font-medium">
                  {amount(row.total)}원
                </p>
              </div>
            ))}
          </div>
          <p className="helper">
            일반 이체와 적금·투자계좌 사이의 재배치는 제외합니다. 2026년
            11월부터 최근 6개월까지 표시합니다.
          </p>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">월별 금액 보기</summary>
            <ul className="mt-2 space-y-2">
              {data.monthly.map((row) => (
                <li key={row.month}>
                  <p className="font-medium">
                    {row.month} · 합계 {amount(row.total)}원
                  </p>
                  {fundSeries.map((series) => (
                    <p key={series.key}>
                      {series.label} {amount(row[series.key])}원
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="section-title">다가오는 납입</h2>
            <Link to="/recurring" className="text-xs text-primary">
              정기 납입 →
            </Link>
          </div>
          {data.pending.length === 0 && (
            <p className="helper">이번 달에 미확정 납입이 없습니다.</p>
          )}
          {data.pending.map((row, index) => (
            <Link
              key={index}
              to="/recurring"
              className="flex items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div className="min-w-0">
                <p className="break-words text-sm font-medium">{row.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.due} · {row.due < data.asOf ? "출금 확인 필요" : "예정"}
                </p>
              </div>
              <p className="shrink-0 text-sm font-semibold tabular-nums">
                {row.amount.toLocaleString("ko-KR")}원
              </p>
            </Link>
          ))}
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="section-title">최근 기록</h2>
          <Link to="/ledger" className="text-xs text-primary">
            전체 보기 →
          </Link>
        </div>
        {data.recent.length === 0 && (
          <p className="helper rounded-xl border border-dashed p-5">
            거래를 입력하면 최근 돈의 흐름을 여기에 보여드려요.
          </p>
        )}
        {data.recent.map((row) => (
          <Link
            key={row.id}
            to={`/ledger?month=${row.occurred_on.slice(0, 7)}&edit=${encodeURIComponent(row.id)}#transaction-form`}
            className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {ledgerKinds[row.kind]} · {row.accountName}
                {row.destinationName && ` → ${row.destinationName}`}
              </p>
              <p className="helper mt-1">
                {row.occurred_on}
                {row.note && ` · ${row.note}`}
              </p>
            </div>
            <p className="shrink-0 text-sm font-semibold tabular-nums">
              {row.amount_krw.toLocaleString("ko-KR")}원
            </p>
          </Link>
        ))}
      </section>
    </main>
  );
}
