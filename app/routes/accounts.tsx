import { cachedPage } from "~/lib/page-cache";
import { PageHeader } from "~/components/page-header";
export { shouldRevalidate } from "~/lib/revalidation";
import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/accounts";
import { requireSession } from "~/lib/auth.server";
import { bindings } from "~/lib/env.server";
import { balanceHistory, balanceWon } from "~/lib/balance";
import { snapshot } from "~/lib/db.server";
import {
  accountTypes,
  current,
  group,
  groups,
  isInvestment,
  today,
  won,
} from "~/lib/domain";
import { AccountSettings } from "~/components/account-settings";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import {
  ArrowRight,
  ArrowUpRight,
  Plus,
  Wallet,
  Landmark,
  Layers3,
  PiggyBank,
  FileDown,
} from "lucide-react";
export async function loader({ request }: Route.LoaderArgs) {
  await requireSession(request);
  const { transactions, ...data } = await snapshot(
    bindings().DB,
    today(),
    "all",
  );
  const calculatedBalances = Object.fromEntries(
    data.accounts
      .filter((account) => !isInvestment(account.account_type))
      .map((account) => [
        account.id,
        balanceHistory(
          account.id,
          data.observations,
          transactions ?? [],
          data.asOf,
          false,
        ),
      ]),
  );
  return { ...data, calculatedBalances };
}
export default function Accounts() {
  const s = useLoaderData<typeof loader>();
  const active = s.accounts.filter((a) => !a.archived_at);
  return (
    <main className="page">
      <PageHeader
        title="나의 계좌 현황"
        description="흩어진 계좌와 보유 상품을 한곳에서 확인하세요."
        actions={
          <>
            <AccountSettings />
            <Button variant="outline" asChild>
              <Link to="/reports">
                <FileDown />
                MD 보고서
              </Link>
            </Button>
            <Button asChild>
              <Link to="/accounts/new">
                <Plus />
                계좌 추가
              </Link>
            </Button>
          </>
        }
      />
      <div className="mb-9 grid gap-3 sm:grid-cols-3">
        {[
          {
            label: "등록 계좌",
            value: `${active.length}`,
            suffix: "개",
            note: "현재 관리 중인 계좌",
            icon: Wallet,
          },
          {
            label: "투자·연금 계좌",
            value: `${active.filter((a) => isInvestment(a.account_type)).length}`,
            suffix: "개",
            note: "보유 상품을 함께 관리",
            icon: Layers3,
          },
          {
            label: "기록 기준",
            value: s.asOf.replaceAll("-", "."),
            suffix: "",
            note: "금액별 확인일은 각각 표시됩니다",
            icon: Landmark,
          },
        ].map((item) => (
          <Card key={item.label} className="shadow-none">
            <CardContent className="p-5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                {item.label}
                <item.icon className="size-4" />
              </div>
              <p
                className={`mt-4 font-semibold tracking-tight ${item.label === "기록 기준" ? "text-xl" : "text-3xl"}`}
              >
                {item.value}
                <span className="ml-1 text-sm font-normal text-muted-foreground">
                  {item.suffix}
                </span>
              </p>
              <p className="helper mt-1 text-xs">{item.note}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      {!s.accounts.length ? (
        <Card className="shadow-none">
          <CardContent className="flex flex-col items-center px-6 py-20 text-center">
            <span className="mb-6 flex size-16 items-center justify-center rounded-2xl bg-muted">
              <Wallet className="size-7 text-primary" />
            </span>
            <h2 className="text-xl font-semibold tracking-tight">
              첫 번째 계좌를 기록해 볼까요?
            </h2>
            <p className="helper mt-3 mb-7 max-w-sm">
              은행, CMA, ISA, IRP, 적금과 청약까지.
              <br />
              알고 있는 정보부터 입력하면 됩니다.
              <br />
              투자 평가액은 없어도 괜찮아요.
            </p>
            <Button asChild>
              <Link to="/accounts/new">
                <Plus />
                계좌 등록하기
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        groups.map((section) => {
          const accounts = s.accounts.filter(
            (a) => group(a.account_type) === section,
          );
          if (!accounts.length) return null;
          const Icon =
            section === groups[1]
              ? Layers3
              : section === groups[2]
                ? PiggyBank
                : Landmark;
          return (
            <section key={section} className="mb-8">
              <div className="mb-4 flex items-center gap-2">
                <Icon className="size-4 text-muted-foreground" />
                <h2 className="section-title">{section}</h2>
                <span className="text-xs text-muted-foreground">
                  {accounts.length}
                </span>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {accounts.map((a) => {
                  const invested = isInvestment(a.account_type);
                  const balance = current(
                    s.observations.filter(
                      (o) =>
                        o.account_id === a.id &&
                        o.metric ===
                          (invested ? "initial_contributions" : "cash_balance"),
                    ),
                    s.asOf,
                  );
                  const valuation = current(
                    s.observations.filter(
                      (o) => o.account_id === a.id && o.metric === "valuation",
                    ),
                    s.asOf,
                  );
                  const products = s.products
                    .filter((p) => p.account_id === a.id)
                    .filter((p) => {
                      const q = current(
                        s.quantities.filter((q) => q.product_id === p.id),
                        s.asOf,
                      );
                      return q && q.quantity_decimal !== "0";
                    });
                  return (
                    <Link
                      key={a.id}
                      to={`/accounts/${a.id}`}
                      className={`group rounded-xl border bg-card p-5 transition hover:border-primary/50 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-primary ${a.archived_at ? "opacity-65" : ""}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Badge
                          variant="secondary"
                          className="text-[10px] font-medium"
                        >
                          {accountTypes[a.account_type]}
                          {a.archived_at ? " · 보관" : ""}
                        </Badge>
                        <ArrowUpRight className="size-4 text-muted-foreground transition group-hover:text-primary" />
                      </div>
                      <h3 className="mt-4 font-semibold tracking-tight">
                        {a.alias}
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {a.institution}
                      </p>
                      <div className="mt-6 border-t pt-4">
                        <p className="mb-1 text-[11px] text-muted-foreground">
                          {invested ? "초기 누적 납입" : "잔액"}
                        </p>
                        <p className="text-xl font-semibold tracking-tight tabular-nums">
                          {invested
                            ? won(balance?.amount_krw)
                            : balanceWon(
                                s.calculatedBalances[a.id]?.calculated ?? null,
                              )}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {balance
                            ? invested
                              ? `${balance.as_of_date} 확인`
                              : `${balance.as_of_date} 확인값 기준${s.calculatedBalances[a.id]?.partial ? " · 일부 기간 미집계" : ""}`
                            : "아직 금액을 입력하지 않았어요"}
                        </p>
                        {invested && (
                          <p className="mt-3 text-xs text-muted-foreground">
                            보유 상품 {products.length}개
                            {valuation
                              ? ` · 평가액 ${won(valuation.amount_krw)}`
                              : ""}
                          </p>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })
      )}
      <div className="mt-8 flex flex-wrap items-center gap-3 rounded-xl border border-dashed p-5">
        <FileDown className="size-5 text-muted-foreground" />
        <p className="helper flex-1">
          기록한 계좌 현황을 상담용 Markdown으로 정리할 수 있어요.
        </p>
        <Link
          to="/reports"
          className="flex items-center gap-2 text-xs font-medium text-primary"
        >
          보고서 만들기
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </main>
  );
}

export async function clientLoader({
  request,
  serverLoader,
}: Route.ClientLoaderArgs) {
  return cachedPage(request, serverLoader);
}
