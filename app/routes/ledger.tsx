import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "~/components/ui/sheet";
import { RefreshData } from "~/components/refresh-data";
import { snapshot } from "~/lib/db.server";
import { dashboard } from "~/lib/dashboard";
import { uncachedAction } from "~/lib/page-cache";
import { cachedPage } from "~/lib/page-cache";
import { PageHeader } from "~/components/page-header";
export { shouldRevalidate } from "~/lib/revalidation";
import { useEffect, useState } from "react";
import {
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
  useSearchParams,
  useNavigate,
} from "react-router";
import type { Route } from "./+types/ledger";
import {
  ActionError,
  Csrf,
  Field,
  RecordForm,
  Select,
  Submit,
} from "~/components/forms";
import { MoneyInput } from "~/components/money-input";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { savingsPageData } from "~/lib/recurring-savings.server";
import { actionFailure } from "~/lib/actions.server";
import { mutation, requireSession } from "~/lib/auth.server";
import { today, won } from "~/lib/domain";
import { bindings } from "~/lib/env.server";
import {
  deleteTransaction,
  ledgerMonth,
  saveTransaction,
  saveTransferThenExpense,
} from "~/lib/ledger.server";
import {
  ledgerKinds,
  ledgerStart,
  ledgerSummary,
  transferCategories,
  suggestedTransferCategory,
  displayTransferCategory,
} from "~/lib/ledger";
import type { Transaction } from "~/lib/ledger";

export async function loader({ request }: Route.LoaderArgs) {
  await requireSession(request);
  const query = new URL(request.url).searchParams;
  const month = ledgerMonth(query.get("month"));
  const { DB } = bindings();
  const { accounts, rows, plans } = await savingsPageData(DB, month, true);
  return {
    month,
    accounts,
    rows,
    pendingSavings: plans.filter((plan) => !plan.transaction && !plan.blocked)
      .length,
    requestKey: crypto.randomUUID(),
  };
}

export async function action({ request }: Route.ActionArgs) {
  try {
    const form = await request.formData();
    await mutation(request, form);
    const { DB } = bindings();
    const intent = form.get("intent");
    if (intent === "delete") {
      await deleteTransaction(DB, form);
      return redirect(
        `/ledger?month=${ledgerMonth(String(form.get("month") ?? ""))}`,
      );
    }
    const before = dashboard(await snapshot(DB, today(), "all"));
    const isCombined = form.get("kind") === "transfer_then_expense";
    if (isCombined) await saveTransferThenExpense(DB, form);
    else await saveTransaction(DB, form);
    const after = dashboard(await snapshot(DB, today(), "all"));
    const previous = new Map([
      ...before.balances.map((row) => [row.id, row.calculated] as const),
      ...before.investments.map((row) => [row.id, row.amount] as const),
    ]);
    const current = [
      ...after.balances.map((row) => ({ ...row, value: row.calculated })),
      ...after.investments.map((row) => ({ ...row, value: row.amount })),
    ];
    const format = (value: string | null | undefined) =>
      value == null ? "미확인" : BigInt(value).toLocaleString("ko-KR") + "원";
    const changes = current
      .filter((row) => previous.get(row.id) !== row.value)
      .map(
        (row) =>
          `${row.name}: ${format(previous.get(row.id))} → ${format(row.value)}`,
      );
    return {
      success:
        (isCombined
          ? "이체와 지출을 저장했습니다. "
          : "거래를 저장했습니다. ") + changes.join(" · "),
    };
  } catch (error) {
    return actionFailure(error);
  }
}

function TransactionForm({
  data,
}: {
  data: Awaited<ReturnType<typeof loader>> & {
    editing?: Transaction;
    preset?: Partial<Transaction>;
  };
}) {
  const { accounts, editing, month, requestKey, rows } = data;
  const values = editing ?? data.preset;
  const [kind, setKind] = useState<
    Transaction["kind"] | "transfer_then_expense"
  >(values?.kind ?? "expense");
  const combined = kind === "transfer_then_expense";
  const [date, setDate] = useState(
    values?.occurred_on ??
      (today().startsWith(month) ? today() : `${month}-01`),
  );
  const [source, setSource] = useState(values?.account_id ?? "");
  const [destination, setDestination] = useState(values?.destination_id ?? "");
  const [amount, setAmount] = useState(values?.amount_krw ?? 0);
  const [category, setCategory] = useState(
    values?.kind === "transfer"
      ? displayTransferCategory(values as Transaction, accounts)
      : undefined,
  );
  const suggested = suggestedTransferCategory(
    accounts.find((account) => account.id === source),
    accounts.find((account) => account.id === destination),
  );
  const candidates = combined
    ? rows.filter(
        (row) =>
          row.kind === "transfer" &&
          row.category === "general" &&
          row.account_id === source &&
          row.destination_id === destination &&
          row.occurred_on === date &&
          row.amount_krw === amount,
      )
    : [];
  function selectSource(value: string) {
    setSource(value);
    setCategory(undefined);
  }
  function selectDestination(value: string) {
    setDestination(value);
    setCategory(undefined);
  }
  const options = Object.fromEntries(
    accounts
      .filter(
        (account) =>
          !account.archived_at ||
          account.id === values?.account_id ||
          account.id === values?.destination_id,
      )
      .map((account) => [account.id, account.alias]),
  );
  return (
    <RecordForm className="space-y-4">
      <Csrf />
      <input type="hidden" name="request_key" value={requestKey} />
      {editing && (
        <>
          <input type="hidden" name="transaction_id" value={editing.id} />
          <input type="hidden" name="version" value={editing.version} />
        </>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="거래일">
          <Input
            type="date"
            name="occurred_on"
            required
            min={ledgerStart}
            max={today()}
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </Field>
        <Field label="거래 유형">
          <Select
            name="kind"
            options={
              editing
                ? ledgerKinds
                : { ...ledgerKinds, transfer_then_expense: "이체 후 지출" }
            }
            value={kind}
            onChange={(event) => setKind(event.target.value as typeof kind)}
          />
        </Field>
        <Field label={kind === "income" ? "입금 계좌" : "출금 계좌"}>
          <Select
            name="account_id"
            required
            value={source}
            onChange={(event) => selectSource(event.target.value)}
            options={{ "": "계좌 선택", ...options }}
          />
        </Field>
        {combined && (
          <Field
            label="지출 계좌"
            hint="출금 계좌에서 이 계좌로 이체한 뒤 지출한 것으로 기록합니다."
          >
            <Select
              name="destination_id"
              required
              value={destination}
              onChange={(event) => selectDestination(event.target.value)}
              options={{ "": "계좌 선택", ...options }}
            />
          </Field>
        )}
        <Field label={combined ? "지출액 (원)" : "금액 (원)"}>
          <MoneyInput
            name="amount"
            required
            defaultValue={values?.amount_krw}
            onInput={(event) =>
              setAmount(Number(event.currentTarget.value.replaceAll(",", "")))
            }
          />
        </Field>
        {kind === "transfer" ? (
          <>
            <Field label="입금 계좌">
              <Select
                name="destination_id"
                required
                value={destination}
                onChange={(event) => selectDestination(event.target.value)}
                options={{ "": "계좌 선택", ...options }}
              />
            </Field>
            <Field label="이체 목적">
              <Select
                name="transfer_category"
                options={
                  suggested === "general"
                    ? { general: transferCategories.general }
                    : {
                        general: transferCategories.general,
                        [suggested]: transferCategories[suggested],
                      }
                }
                value={category ?? suggested}
                onChange={(event) =>
                  setCategory(
                    event.target.value as keyof typeof transferCategories,
                  )
                }
              />
            </Field>
          </>
        ) : (
          <Field label="분류 (선택)">
            <Input
              name="category"
              maxLength={40}
              placeholder="예: 급여, 식비, 온누리 충전"
              defaultValue={values?.kind !== "transfer" ? values?.category : ""}
            />
          </Field>
        )}
        {candidates.length > 0 && (
          <Field
            label="같은 이체가 있어요"
            hint="이미 입력한 이체를 골라 연결하거나 실제로 별도 이체했다면 새 이체를 선택하세요."
          >
            <Select
              key={candidates.map((row) => row.id).join(",")}
              name="funding_choice"
              required
              options={{
                "": "기존 이체 또는 새 이체를 선택하세요",
                ...Object.fromEntries(
                  candidates
                    .filter((row) => !row.linked_id && !row.funding_transfer_id)
                    .map((row) => [
                      row.id,
                      `${row.occurred_on} · ${won(row.amount_krw)}${row.note ? " · " + row.note : ""}`,
                    ]),
                ),
                new: "별도로 보낸 새 이체 기록",
              }}
              defaultValue=""
            />
          </Field>
        )}
        <Field label="메모 (선택)">
          <Input name="note" maxLength={300} defaultValue={values?.note} />
        </Field>
      </div>
      <Submit>{editing ? "거래 수정 저장" : "거래 추가"}</Submit>
      {editing && (
        <Button variant="ghost" asChild>
          <Link to={`/ledger?month=${month}`}>수정 취소</Link>
        </Button>
      )}
    </RecordForm>
  );
}

export default function Ledger() {
  const [notice, setNotice] = useState("");
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<Partial<Transaction>>();
  const [accountFilter, setAccountFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const navigate = useNavigate();
  const loaded = useLoaderData<typeof loader>();
  const [query] = useSearchParams();
  const data = {
    preset,
    ...loaded,
    editing: loaded.rows.find((row) => row.id === query.get("edit")),
  };
  const result = useActionData<typeof action>();
  const { month, accounts, rows, editing, requestKey } = data;
  useEffect(() => {
    if (result && "success" in result) {
      setNotice(result.success);
      setOpen(false);
      navigate("/ledger?month=" + month, { replace: true });
    }
  }, [result]);
  const visible = rows.filter(
    (row) =>
      (!accountFilter ||
        row.account_id === accountFilter ||
        row.destination_id === accountFilter) &&
      (!kindFilter || row.kind === kindFilter),
  );
  const totals = ledgerSummary(rows, accounts);
  const shiftMonth = (offset: number) => {
    const [year, number] = month.split("-").map(Number);
    return new Date(Date.UTC(year, number - 1 + offset, 1))
      .toISOString()
      .slice(0, 7);
  };
  const names = new Map(accounts.map((account) => [account.id, account.alias]));
  return (
    <main className="page space-y-6">
      <PageHeader
        title="월별 가계부"
        description="실제로 돈이 오간 날짜로 거래를 입력하고 월별 내역을 확인하세요."
        actions={
          <>
            <RefreshData />
            <Button
              onClick={() => {
                setPreset(undefined);
                setOpen(true);
              }}
            >
              거래 추가
            </Button>
          </>
        }
      />
      <Form
        method="get"
        className="grid w-full max-w-xs grid-cols-[minmax(0,1fr)_auto] items-end gap-2"
      >
        <Field label="조회 월">
          <Input
            type="month"
            name="month"
            required
            min={ledgerStart.slice(0, 7)}
            max={today().slice(0, 7)}
            defaultValue={month}
            key={month}
          />
        </Field>
        <Button type="submit" variant="outline" className="min-h-11">
          조회
        </Button>
      </Form>
      <ActionError
        error={result && "error" in result ? result.error : undefined}
      />
      {notice && (
        <p role="status" className="callout">
          {notice}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={shiftMonth(-1) < ledgerStart.slice(0, 7)}
          onClick={() => navigate("/ledger?month=" + shiftMonth(-1))}
        >
          이전 달
        </Button>
        <Button variant="outline" onClick={() => navigate("/ledger")}>
          이번 달
        </Button>
        <Button
          variant="outline"
          disabled={shiftMonth(1) > today().slice(0, 7)}
          onClick={() => navigate("/ledger?month=" + shiftMonth(1))}
        >
          다음 달
        </Button>
        <Button variant="ghost" asChild>
          <a href={`/transactions.csv?month=${month}`} download>
            이 달 CSV
          </a>
        </Button>
        <Button variant="ghost" asChild>
          <a href="/transactions.csv" download>
            전체 CSV
          </a>
        </Button>
      </div>
      {data.pendingSavings > 0 && (
        <Link
          to={`/recurring?month=${month}`}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-4 py-3 text-sm"
        >
          <span>미확정 정기 납입 {data.pendingSavings}건</span>
          <span className="font-medium text-primary">정기 납입 확인 →</span>
        </Link>
      )}
      <Card className="py-0 sm:py-6">
        <CardContent className="space-y-3 p-5">
          <h2 className="font-semibold">
            {month} 입력한 거래 {rows.length}건
          </h2>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(
              [
                ["수입", totals.income],
                ["소비 지출", totals.expense],
                ["부채 상환", totals.repayment],
                ["수입 − 지출 − 상환", totals.net],
                ["계좌이체", totals.transfer],
                ["이체 중 저축 납입", totals.saving],
                ["이체 중 투자 납입", totals.investment],
              ] as const
            ).map(([label, amount]) => (
              <div
                key={label}
                className="min-w-0 rounded-lg border bg-muted/40 p-3"
              >
                <dt className="helper">{label}</dt>
                <dd className="mt-1 break-words font-semibold tabular-nums">
                  {amount.toLocaleString("ko-KR")}원
                </dd>
              </div>
            ))}
          </dl>
          <p className="helper">
            집계는 입력한 거래 기준입니다. 계좌 잔액은 금융기관에서 확인한
            값으로 계좌 화면에 따로 기록합니다.
          </p>
        </CardContent>
      </Card>
      <details className="rounded-xl border p-4">
        <summary className="cursor-pointer text-sm font-medium">
          자주 쓰는 거래
        </summary>
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            {
              kind: "transfer",
              category: "general",
              note: "CMA → 하나",
              account_id: accounts.find((a) => a.account_type === "cma")?.id,
              destination_id: accounts.find(
                (a) =>
                  a.institution.includes("하나") &&
                  a.account_type === "checking",
              )?.id,
            },
            {
              kind: "transfer",
              category: "general",
              note: "CMA → 신한",
              account_id: accounts.find((a) => a.account_type === "cma")?.id,
              destination_id: accounts.find(
                (a) =>
                  a.institution.includes("신한") &&
                  a.account_type === "checking",
              )?.id,
            },
            { kind: "expense", category: "온누리 충전" },
            { kind: "expense", category: "카드대금" },
          ].map((item, index) => (
            <Button
              key={index}
              variant="outline"
              onClick={() => {
                setPreset(item as Partial<Transaction>);
                setOpen(true);
              }}
            >
              {item.note ?? item.category}
            </Button>
          ))}
          {rows
            .filter(
              (row, index, all) =>
                all.findIndex(
                  (other) =>
                    other.account_id === row.account_id &&
                    other.destination_id === row.destination_id &&
                    other.category === row.category,
                ) === index,
            )
            .slice(0, 5)
            .map((row) => (
              <Button
                key={row.id}
                variant="outline"
                onClick={() => {
                  setPreset({
                    ...row,
                    amount_krw: undefined,
                    occurred_on: undefined,
                  });
                  setOpen(true);
                }}
              >
                {names.get(row.account_id)} ·{" "}
                {row.kind === "transfer"
                  ? names.get(row.destination_id ?? "")
                  : row.category || ledgerKinds[row.kind]}
              </Button>
            ))}
        </div>
      </details>
      <Sheet
        open={open || !!editing}
        onOpenChange={(value) => {
          setOpen(value);
          if (!value && editing) navigate("/ledger?month=" + month);
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{editing ? "거래 수정" : "거래 추가"}</SheetTitle>
            <SheetDescription>
              실제 거래일과 금액을 입력하세요.
            </SheetDescription>
          </SheetHeader>
          <ActionError
            error={result && "error" in result ? result.error : undefined}
          />
          <CardContent
            id="transaction-form"
            className="scroll-mt-4 space-y-4 p-4 sm:p-5"
          >
            <h2 className="font-semibold">
              {editing ? "거래 수정" : "거래 입력"}
            </h2>
            <p className="helper">
              온누리는 실제 충전 출금액만 지출로 입력하세요. 카드 지출을
              결제액으로 기록하면 개별 사용액은 같은 집계에 다시 넣지 않습니다.
            </p>
            {editing || accounts.some((account) => !account.archived_at) ? (
              <TransactionForm
                key={
                  editing
                    ? `${editing.id}:${editing.version}`
                    : requestKey + JSON.stringify(preset)
                }
                data={data}
              />
            ) : (
              <Link to="/accounts/new" className="underline">
                거래에 사용할 계좌 등록하기
              </Link>
            )}
          </CardContent>
        </SheetContent>
      </Sheet>
      <section className="space-y-3">
        <h2 className="section-title">거래 내역 · {visible.length}건</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="계좌">
            <Select
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              options={{
                "": "모든 계좌",
                ...Object.fromEntries(accounts.map((a) => [a.id, a.alias])),
              }}
            />
          </Field>
          <Field label="거래 종류">
            <Select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value)}
              options={{ "": "모든 종류", ...ledgerKinds }}
            />
          </Field>
        </div>
        {rows.length === 0 && (
          <p className="helper">이 달에 입력한 거래가 없습니다.</p>
        )}
        {visible.map((row) => (
          <div key={row.id} className="rounded-lg border bg-card p-4">
            <div className="flex flex-wrap justify-between gap-2">
              <span className="font-medium">
                {ledgerKinds[row.kind]} · {won(row.amount_krw)}
              </span>
              <span className="helper">{row.occurred_on}</span>
            </div>
            <p className="helper break-words">
              {names.get(row.account_id)}
              {row.destination_id && ` → ${names.get(row.destination_id)}`}
              {row.category &&
                ` · ${row.kind === "transfer" ? transferCategories[displayTransferCategory(row, accounts)] : row.category}`}
            </p>
            {row.note && <p className="break-words text-sm">{row.note}</p>}
            {row.linked_id && row.linked_date && (
              <Link
                className="mt-2 block text-sm text-primary underline"
                to={`/ledger?month=${row.linked_date.slice(0, 7)}&edit=${encodeURIComponent(row.linked_id)}#transaction-form`}
              >
                연결된 {row.linked_kind === "expense" ? "지출" : "이체"} ·{" "}
                {row.linked_date} · {won(row.linked_amount)}
              </Link>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="outline" className="min-h-10" asChild>
                <Link
                  to={`/ledger?month=${month}&edit=${row.id}#transaction-form`}
                >
                  수정
                </Link>
              </Button>
              <Form
                method="post"
                onSubmit={(event) => {
                  const submitter = (event.nativeEvent as SubmitEvent)
                    .submitter;
                  const both =
                    submitter instanceof HTMLButtonElement &&
                    submitter.name === "delete_linked";
                  const message = both
                    ? "이 거래와 연결된 거래를 모두 삭제할까요?"
                    : row.linked_id
                      ? "이 거래만 삭제할까요? 연결된 거래는 가계부에 남습니다."
                      : "이 거래를 삭제할까요?";
                  if (!window.confirm(message)) event.preventDefault();
                }}
              >
                <Csrf />
                <input type="hidden" name="intent" value="delete" />
                <input type="hidden" name="month" value={month} />
                <input type="hidden" name="transaction_id" value={row.id} />
                <input type="hidden" name="version" value={row.version} />
                {row.linked_id && (
                  <>
                    <input
                      type="hidden"
                      name="linked_id"
                      value={row.linked_id}
                    />
                    <input
                      type="hidden"
                      name="linked_version"
                      value={row.linked_version ?? ""}
                    />
                  </>
                )}
                <Submit className="min-h-10" variant="ghost">
                  {row.linked_id ? "이 거래만 삭제" : "삭제"}
                </Submit>
                {row.linked_id && (
                  <Submit
                    name="delete_linked"
                    value="yes"
                    className="min-h-10"
                    variant="ghost"
                  >
                    연결 거래도 삭제
                  </Submit>
                )}
              </Form>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}

export async function clientLoader({
  request,
  serverLoader,
}: Route.ClientLoaderArgs) {
  return cachedPage(request, serverLoader);
}

export async function clientAction({ serverAction }: Route.ClientActionArgs) {
  return uncachedAction(serverAction);
}
