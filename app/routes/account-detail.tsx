export { shouldRevalidate } from "~/lib/revalidation";
import {
  Link,
  useLoaderData,
  useActionData,
  useSearchParams,
  data,
} from "react-router";
import type { Route } from "./+types/account-detail";
import { mutation, requireSession } from "~/lib/auth.server";
import { balanceWon } from "~/lib/balance";
import { bindings } from "~/lib/env.server";
import {
  archiveAccount,
  confirmNoHoldings,
  detail,
  getAccount,
  saveMoney,
  saveProduct,
  updateAccount,
} from "~/lib/db.server";
import { actionFailure } from "~/lib/actions.server";
import {
  accountTypes,
  current,
  isInvestment,
  metricLabels,
  precisions,
  risks,
  sources,
  today,
  won,
} from "~/lib/domain";
import type {
  Account,
  Observation,
  Product,
  ProductObservation,
} from "~/lib/domain";
import {
  AccountFields,
  ActionError,
  Csrf,
  Evidence,
  Field,
  RecordForm,
  Select,
  Submit,
} from "~/components/forms";
import { MoneyInput } from "~/components/money-input";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  ArrowLeft,
  Plus,
  History,
  Package,
  Landmark,
  Archive,
  Check,
} from "lucide-react";
export async function loader({ request, params }: Route.LoaderArgs) {
  await requireSession(request);
  return detail(bindings().DB, params.accountId);
}
export async function action({ request, params }: Route.ActionArgs) {
  try {
    const f = await request.formData();
    await mutation(request, f);
    const db = bindings().DB,
      a = await getAccount(db, params.accountId);
    switch (String(f.get("intent"))) {
      case "account":
        await updateAccount(db, a, f);
        break;
      case "money":
        await saveMoney(db, a, f);
        break;
      case "product":
        await saveProduct(db, a, f);
        break;
      case "archive":
        await archiveAccount(db, a, f);
        break;
      case "none":
        await confirmNoHoldings(db, a, f);
        break;
      default:
        throw new Response("잘못된 요청", { status: 400 });
    }
    return data({ error: undefined, success: "저장했습니다." });
  } catch (e) {
    return actionFailure(e);
  }
}
function Hidden({ account, intent }: { account: Account; intent: string }) {
  return (
    <>
      <Csrf />
      <input type="hidden" name="version" value={account.version} />
      <input type="hidden" name="intent" value={intent} />
    </>
  );
}
function MoneyForm({
  account,
  old,
  initial,
  rows,
}: {
  account: Account;
  old?: Observation;
  initial?: boolean;
  rows: Observation[];
}) {
  const invested = isInvestment(account.account_type);
  const hasInitial = rows.some(
    (o) => !o.superseded_by && o.metric.startsWith("initial_"),
  );
  const isCorrection = !!old || (initial && hasInitial);
  const get = (metric: string) =>
    rows.find((o) => o.metric === metric && !o.superseded_by);
  return (
    <RecordForm className="space-y-5">
      <Hidden account={account} intent="money" />
      <input
        type="hidden"
        name="mode"
        value={isCorrection ? "correct" : "add"}
      />
      <input
        type="hidden"
        name="metric"
        value={initial ? "initial" : invested ? "valuation" : "cash_balance"}
      />
      {old && <input type="hidden" name="observation_id" value={old.id} />}
      <div className="form-grid">
        {initial ? (
          <>
            <Field label="초기 총 납입 (원)">
              <MoneyInput
                name="initial_contributions"
                defaultValue={get("initial_contributions")?.amount_krw}
                placeholder="모르면 비워두세요"
              />
            </Field>
            <Field label="초기 총 인출 (원)">
              <MoneyInput
                name="initial_withdrawals"
                defaultValue={get("initial_withdrawals")?.amount_krw}
                placeholder="없음을 확인했다면 0"
              />
            </Field>
          </>
        ) : (
          <Field label={`${invested ? "계좌 전체 평가액" : "확인 잔액"} (원)`}>
            <MoneyInput
              name="amount"
              defaultValue={old?.amount_krw}
              required
              placeholder="예: 1,000,000"
            />
          </Field>
        )}
        {initial ? (
          <div className="callout text-xs">
            초기 기준일: {account.tracking_start_date}
            <br />
            관리 시작일까지의 과거 누적치입니다.
          </div>
        ) : (
          <Field label="확인일">
            <Input
              type="date"
              name="as_of_date"
              defaultValue={old?.as_of_date ?? today()}
              min={account.tracking_start_date}
              max={today()}
              required
            />
          </Field>
        )}
      </div>
      {!invested && (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="before_day_transactions"
            defaultChecked={old?.before_day_transactions === 1}
            className="mt-1"
          />
          <span>
            확인일의 거래를 반영하기 전 잔액입니다.
            <br />
            <span className="helper">
              선택하면 확인일 당일 거래도 잔액에 더하거나 뺍니다.
            </span>
          </span>
        </label>
      )}
      <Evidence
        defaults={
          old ??
          (initial
            ? (get("initial_contributions") ?? get("initial_withdrawals"))
            : undefined)
        }
      />
      {isCorrection && (
        <Field label="정정 사유">
          <Input
            name="reason"
            required
            maxLength={500}
            placeholder="이전 기록을 고치는 이유"
          />
        </Field>
      )}
      <Submit>{isCorrection ? "정정 기록 저장" : "확인 기록 저장"}</Submit>
    </RecordForm>
  );
}
function ProductForm({
  account,
  product,
  old,
}: {
  account: Account;
  product?: Product;
  old?: ProductObservation;
}) {
  return (
    <RecordForm className="space-y-5">
      <Hidden account={account} intent="product" />
      <input type="hidden" name="mode" value={old ? "correct" : "add"} />
      {product && (
        <input type="hidden" name="product_id" value={product.id} />
      )}{" "}
      {old && <input type="hidden" name="observation_id" value={old.id} />}
      <Field label="상품명">
        <Input
          name="name"
          defaultValue={product?.name}
          maxLength={120}
          required
          placeholder="보유 중인 상품 이름"
        />
      </Field>
      <div className="form-grid">
        <Field label="보유 수량" hint="전량 처분했다면 0을 입력하세요.">
          <Input
            name="quantity"
            inputMode="decimal"
            defaultValue={old?.quantity_decimal}
            required
            placeholder="예: 12 또는 0.5"
          />
        </Field>
        <Field label="확인일">
          <Input
            type="date"
            name="as_of_date"
            defaultValue={old?.as_of_date ?? today()}
            min={account.tracking_start_date}
            max={today()}
            required
          />
        </Field>
      </div>
      {account.account_type === "irp" && (
        <Field label="IRP 자산 구분">
          <Select
            name="risk_class"
            options={risks}
            defaultValue={old?.risk_class ?? "unknown"}
          />
          <span className="helper">
            금융기관의 상품 구분을 확인해 선택하세요.
          </span>
        </Field>
      )}
      {old && (
        <Field label="정정 사유">
          <Input name="reason" required maxLength={500} />
        </Field>
      )}
      <Submit>
        {old ? "상품 기록 정정" : product ? "수량 갱신" : "상품 등록"}
      </Submit>
    </RecordForm>
  );
}
export default function AccountDetail() {
  const {
    account: a,
    observations,
    products,
    quantities,
    balance: calculatedBalance,
  } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const [params] = useSearchParams();
  const invested = isInvestment(a.account_type);
  const oldMoney = observations.find(
    (o) => o.id === params.get("money") && !o.superseded_by,
  );
  const oldProduct = quantities.find(
    (q) => q.id === params.get("quantity") && !q.superseded_by,
  );
  const product = products.find(
    (p) => p.id === (oldProduct?.product_id ?? params.get("product")),
  );
  const contribution = current(
      observations.filter((o) => o.metric === "initial_contributions"),
      today(),
    ),
    withdrawal = current(
      observations.filter((o) => o.metric === "initial_withdrawals"),
      today(),
    );
  const balance = current(
    observations.filter(
      (o) => o.metric === (invested ? "valuation" : "cash_balance"),
    ),
    today(),
  );
  return (
    <main className="page">
      <Link
        to="/"
        className="mb-6 flex items-center gap-2 text-xs text-muted-foreground"
      >
        <ArrowLeft className="size-3.5" />
        계좌 현황
      </Link>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-3 flex gap-2">
            <Badge variant="secondary">{accountTypes[a.account_type]}</Badge>
            {a.archived_at && <Badge variant="outline">보관된 계좌</Badge>}
          </div>
          <h1 className="page-title">{a.alias}</h1>
          <p className="helper mt-2">
            {a.institution} · {a.tracking_start_date}부터 기록
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/reports">MD로 정리</Link>
        </Button>
      </div>
      <ActionError error={result?.error} />
      {result && "success" in result && (
        <div
          role="status"
          className="callout mb-5 flex items-center gap-2 text-primary"
        >
          <Check className="size-4" />
          {result.success}
        </div>
      )}
      {params.has("created") && !observations.length && (
        <div className="callout mb-6">
          계좌가 등록됐습니다. 알고 있는 금액
          {invested ? "과 보유 상품을" : "을"} 아래에서 입력해 주세요.
        </div>
      )}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(invested
          ? [
              { label: "초기 총 납입", o: contribution },
              { label: "초기 총 인출", o: withdrawal },
              { label: "계좌 전체 평가액 (선택)", o: balance },
            ]
          : [{ label: "확인 잔액", o: balance }]
        ).map(({ label, o }) => (
          <Card className="shadow-none" key={label}>
            <CardContent className="p-5">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">
                {won(o?.amount_krw)}
              </p>
              <p className="helper mt-1 text-xs">
                {o ? `${o.as_of_date} · ${precisions[o.precision]}` : "미입력"}
              </p>
            </CardContent>
          </Card>
        ))}
        {calculatedBalance && (
          <Card className="shadow-none">
            <CardContent className="p-5">
              <p className="text-xs text-muted-foreground">계산 잔액</p>
              <p className="mt-3 text-2xl font-semibold tabular-nums">
                {balanceWon(calculatedBalance.calculated)}
              </p>
              <p className="helper mt-1 text-xs">
                {calculatedBalance.baseDate
                  ? `${calculatedBalance.baseDate} 확인 잔액에 ${calculatedBalance.includesBaseDay ? "당일부터" : "다음 날부터"} 거래 반영`
                  : "확인 잔액을 한 번 입력하면 계산을 시작합니다."}
              </p>
              {calculatedBalance.partial && (
                <p className="helper text-xs">
                  11월 거래 기록 시작 전 구간은 미집계입니다.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
      {calculatedBalance && a.account_type === "cma" && (
        <Card className="mb-6 shadow-none">
          <CardHeader>
            <CardTitle className="text-base">CMA 확인 잔액 대조</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="helper">
              월말에 증권사에서 확인한 잔액을 입력하세요. 새 확인값이 다음
              날부터 계산 기준이 되며, 차이는 월별 수입·지출과 별도로
              표시됩니다.
            </p>
            {calculatedBalance.adjustments.length === 0 && (
              <p className="helper">두 번째 확인 잔액부터 차이를 표시합니다.</p>
            )}
            {calculatedBalance.adjustments.map((row) => (
              <div className="rounded-lg border p-3 text-sm" key={row.date}>
                <p className="font-medium">
                  {row.date} · CMA 잔액 차이{" "}
                  {BigInt(row.difference) > 0n ? "+" : ""}
                  {balanceWon(row.difference)}
                </p>
                <p className="helper">
                  {row.previousDate} 이후 계산 {balanceWon(row.expected)} · 확인{" "}
                  {won(row.confirmed)}
                </p>
                {row.partial && (
                  <p className="helper">
                    11월 이전 미집계 구간이 포함된 비교입니다.
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      {invested && (
        <p className="helper mb-7">
          초기 납입·인출은 과거 누적치이며 현재 평가액이 아닙니다. 상품 평가액과
          매입금액은 관리하지 않습니다.
        </p>
      )}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="space-y-6">
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Landmark className="size-4" />
                계좌 정보
              </CardTitle>
            </CardHeader>
            <CardContent>
              <details>
                <summary className="cursor-pointer text-sm text-primary">
                  기본 정보 수정
                </summary>
                <RecordForm
                  key={`account-${a.version}`}
                  className="mt-5 space-y-5"
                >
                  <Hidden account={a} intent="account" />
                  <AccountFields account={a} />
                  <p className="helper">
                    금액·상품을 등록한 뒤에는 유형과 시작일을 고정합니다.
                  </p>
                  <Submit>정보 저장</Submit>
                </RecordForm>
              </details>
              {a.note && (
                <p className="helper mt-4 whitespace-pre-wrap">{a.note}</p>
              )}
            </CardContent>
          </Card>
          {!a.archived_at && (
            <Card className="shadow-none">
              <CardHeader>
                <CardTitle className="text-base">
                  {oldMoney
                    ? "확인 기록 정정"
                    : invested
                      ? "계좌 금액 기록"
                      : "잔액 확인 기록 추가"}
                </CardTitle>
              </CardHeader>
              <CardContent
                key={`money-${a.version}-${oldMoney?.id ?? ""}`}
                className="space-y-6"
              >
                {invested && !oldMoney ? (
                  <>
                    <details open={!contribution && !withdrawal}>
                      <summary className="cursor-pointer text-sm font-medium">
                        초기 누적 납입·인출
                      </summary>
                      <div className="pt-5">
                        <MoneyForm account={a} initial rows={observations} />
                      </div>
                    </details>
                    <details>
                      <summary className="cursor-pointer text-sm font-medium">
                        계좌 전체 평가액 (선택)
                      </summary>
                      <div className="pt-5">
                        <MoneyForm account={a} rows={observations} />
                      </div>
                    </details>
                  </>
                ) : (
                  <MoneyForm account={a} old={oldMoney} rows={observations} />
                )}{" "}
                {oldMoney && (
                  <Link to={`/accounts/${a.id}`} className="text-xs underline">
                    정정 취소
                  </Link>
                )}
              </CardContent>
            </Card>
          )}
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="size-4" />
                금액 확인 이력
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!observations.length ? (
                <p className="helper">아직 확인 기록이 없습니다.</p>
              ) : (
                <div className="space-y-4">
                  {observations.map((o) => (
                    <div
                      key={o.id}
                      className={`border-b pb-4 last:border-0 ${o.superseded_by ? "opacity-50" : ""}`}
                    >
                      <div className="flex justify-between gap-3 text-xs">
                        <span>{metricLabels[o.metric]}</span>
                        <span className="text-muted-foreground">
                          {o.as_of_date}
                        </span>
                      </div>
                      <p className="mt-1 font-medium tabular-nums">
                        {won(o.amount_krw)}
                      </p>
                      <p className="helper text-xs">
                        {sources[o.source]} · {precisions[o.precision]}
                        {o.rounding_unit && ` (${o.rounding_unit})`}
                        {o.superseded_by ? " · 정정 전 기록" : ""}
                      </p>
                      {o.correction_reason && (
                        <p className="helper text-xs">
                          정정: {o.correction_reason}
                        </p>
                      )}
                      {!o.superseded_by &&
                        !a.archived_at &&
                        !o.metric.startsWith("initial_") && (
                          <Link
                            to={`?money=${o.id}`}
                            className="text-xs text-primary underline"
                          >
                            오입력 정정
                          </Link>
                        )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          <RecordForm key={`archive-${a.version}`}>
            <Hidden account={a} intent="archive" />
            <Submit variant="ghost" className="text-muted-foreground">
              <Archive />
              {a.archived_at ? "계좌 보관 해제" : "계좌 보관"}
            </Submit>
            <p className="helper mt-1 text-xs">
              보관해도 기록과 금액은 유지됩니다.
            </p>
          </RecordForm>
        </section>
        {invested && (
          <section className="space-y-6">
            <Card className="shadow-none">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Package className="size-4" />
                  보유 상품{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    이름과 수량만 간단하게
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!products.length ? (
                  <div>
                    <p className="helper mb-4">
                      {a.holdings_status === "none"
                        ? "보유 상품 없음으로 확인했습니다."
                        : "등록된 상품이 없습니다."}
                    </p>
                    {!a.archived_at && a.holdings_status !== "none" && (
                      <RecordForm>
                        <Hidden account={a} intent="none" />
                        <Submit variant="outline" size="sm">
                          보유 상품 없음 확인
                        </Submit>
                      </RecordForm>
                    )}
                  </div>
                ) : (
                  <div className="space-y-5">
                    {products.map((p) => {
                      const q = current(
                        quantities.filter((q) => q.product_id === p.id),
                        today(),
                      );
                      return (
                        <div key={p.id} className="border-b pb-4 last:border-0">
                          <div className="flex justify-between gap-3">
                            <p className="text-sm font-medium">{p.name}</p>
                            <span className="shrink-0 font-semibold tabular-nums">
                              {q?.quantity_decimal ?? "미확인"}
                              <span className="ml-1 text-xs font-normal text-muted-foreground">
                                주/좌
                              </span>
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span>{q?.as_of_date ?? "확인 기록 없음"}</span>
                            {a.account_type === "irp" && (
                              <Badge variant="outline" className="text-[10px]">
                                {risks[q?.risk_class ?? "unknown"]}
                              </Badge>
                            )}
                            {q?.quantity_decimal === "0" && (
                              <span>보유 종료</span>
                            )}
                          </div>
                          {!a.archived_at && (
                            <div className="mt-3 flex gap-4">
                              <Link
                                to={`?product=${p.id}`}
                                className="text-xs text-primary underline"
                              >
                                수량 갱신
                              </Link>
                              {q && (
                                <Link
                                  to={`?quantity=${q.id}`}
                                  className="text-xs text-muted-foreground underline"
                                >
                                  오입력 정정
                                </Link>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
            {!a.archived_at && (
              <Card className="shadow-none">
                <CardHeader>
                  <CardTitle className="text-base">
                    {oldProduct
                      ? "상품 기록 정정"
                      : product
                        ? "상품 수량 갱신"
                        : "상품 추가"}
                  </CardTitle>
                </CardHeader>
                <CardContent
                  key={`product-${a.version}-${product?.id ?? ""}-${oldProduct?.id ?? ""}`}
                >
                  <ProductForm account={a} product={product} old={oldProduct} />
                  {product && (
                    <Link
                      to={`/accounts/${a.id}`}
                      className="mt-4 inline-block text-xs underline"
                    >
                      새 상품 추가로 돌아가기
                    </Link>
                  )}
                </CardContent>
              </Card>
            )}
            <details className="rounded-xl border bg-card p-5">
              <summary className="cursor-pointer text-sm font-medium">
                상품 수량 이력
              </summary>
              <div className="mt-4 space-y-4">
                {quantities.length ? (
                  quantities.map((q) => (
                    <div
                      key={q.id}
                      className={`border-b pb-3 text-xs ${q.superseded_by ? "opacity-50" : ""}`}
                    >
                      <p className="font-medium">
                        {products.find((p) => p.id === q.product_id)?.name} ·{" "}
                        {q.quantity_decimal}
                      </p>
                      <p className="helper text-xs">
                        {q.as_of_date}
                        {q.superseded_by ? " · 정정 전 기록" : ""}
                      </p>
                      {q.correction_reason && (
                        <p className="helper">{q.correction_reason}</p>
                      )}
                      {!q.superseded_by && !a.archived_at && (
                        <Link
                          to={`?quantity=${q.id}`}
                          className="text-primary underline"
                        >
                          오입력 정정
                        </Link>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="helper">아직 상품 기록이 없습니다.</p>
                )}
              </div>
            </details>
          </section>
        )}
      </div>
    </main>
  );
}
