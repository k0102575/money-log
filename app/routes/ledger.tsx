export { shouldRevalidate } from "~/lib/revalidation";
import { useState } from "react";
import {
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
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
import {
  listSavingsRules,
  plannedSavings,
} from "~/lib/recurring-savings.server";
import { actionFailure } from "~/lib/actions.server";
import { mutation, requireSession } from "~/lib/auth.server";
import { listAccounts } from "~/lib/db.server";
import { today, won } from "~/lib/domain";
import { bindings } from "~/lib/env.server";
import {
  deleteTransaction,
  ledgerMonth,
  saveTransaction,
} from "~/lib/ledger.server";
import {
  ledgerKinds,
  ledgerStart,
  ledgerSummary,
  transferCategories,
} from "~/lib/ledger";
import type { Transaction } from "~/lib/ledger";

export async function loader({ request }: Route.LoaderArgs) {
  await requireSession(request);
  const query = new URL(request.url).searchParams;
  const month = ledgerMonth(query.get("month"));
  const { DB } = bindings();
  const [accounts, transactions, rules] = await Promise.all([
    listAccounts(DB),
    DB.prepare(
      "SELECT * FROM ledger_transactions WHERE occurred_on >= ? AND occurred_on <= ? ORDER BY occurred_on DESC, created_at DESC, id",
    )
      .bind(`${month}-01`, `${month}-31`)
      .all<Transaction>(),
    listSavingsRules(DB),
  ]);
  const rows = transactions.results;
  const editing = rows.find((row) => row.id === query.get("edit"));
  return {
    month,
    accounts,
    rows,
    editing,
    pendingSavings: (await plannedSavings(DB, rules, month)).filter(
      (plan) => !plan.transaction,
    ).length,
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
    return redirect(`/ledger?month=${await saveTransaction(DB, form)}`);
  } catch (error) {
    return actionFailure(error);
  }
}

function TransactionForm({
  data,
}: {
  data: Awaited<ReturnType<typeof loader>>;
}) {
  const { accounts, editing, month, requestKey } = data;
  const [kind, setKind] = useState<Transaction["kind"]>(
    editing?.kind ?? "expense",
  );
  const options = Object.fromEntries(
    accounts
      .filter(
        (account) =>
          !account.archived_at ||
          account.id === editing?.account_id ||
          account.id === editing?.destination_id,
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
            defaultValue={
              editing?.occurred_on ??
              (today().startsWith(month) ? today() : `${month}-01`)
            }
          />
        </Field>
        <Field label="거래 유형">
          <Select
            name="kind"
            options={ledgerKinds}
            value={kind}
            onChange={(event) =>
              setKind(event.target.value as Transaction["kind"])
            }
          />
        </Field>
        <Field label={kind === "income" ? "입금 계좌" : "출금 계좌"}>
          <Select
            name="account_id"
            required
            defaultValue={editing?.account_id ?? ""}
            options={{ "": "계좌 선택", ...options }}
          />
        </Field>
        <Field label="금액 (원)">
          <MoneyInput
            name="amount"
            required
            defaultValue={editing?.amount_krw}
          />
        </Field>
        {kind === "transfer" ? (
          <>
            <Field label="입금 계좌">
              <Select
                name="destination_id"
                required
                defaultValue={editing?.destination_id ?? ""}
                options={{ "": "계좌 선택", ...options }}
              />
            </Field>
            <Field label="이체 목적">
              <Select
                name="transfer_category"
                options={transferCategories}
                defaultValue={
                  editing?.kind === "transfer" ? editing.category : "general"
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
              defaultValue={
                editing?.kind !== "transfer" ? editing?.category : ""
              }
            />
          </Field>
        )}
        <Field label="메모 (선택)">
          <Input name="note" maxLength={300} defaultValue={editing?.note} />
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
  const data = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const { month, accounts, rows, editing, requestKey } = data;
  const totals = ledgerSummary(rows);
  const names = new Map(accounts.map((account) => [account.id, account.alias]));
  return (
    <main className="page space-y-6">
      <header>
        <h1 className="page-title">월별 가계부</h1>
        <p className="helper mt-2">
          월말에 한 달 치를 모아 입력해도 됩니다. 거래일은 실제로 돈이 오간
          날짜를 선택하세요.
        </p>
      </header>
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
      <ActionError error={result?.error} />
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
      <Card className="py-0 sm:py-6">
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
              key={editing ? `${editing.id}:${editing.version}` : requestKey}
              data={data}
            />
          ) : (
            <Link to="/accounts/new" className="underline">
              거래에 사용할 계좌 등록하기
            </Link>
          )}
        </CardContent>
      </Card>
      <section className="space-y-3">
        <h2 className="section-title">거래 내역</h2>
        {rows.length === 0 && (
          <p className="helper">이 달에 입력한 거래가 없습니다.</p>
        )}
        {rows.map((row) => (
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
                ` · ${row.kind === "transfer" ? transferCategories[row.category as keyof typeof transferCategories] : row.category}`}
            </p>
            {row.note && <p className="break-words text-sm">{row.note}</p>}
            <div className="mt-2 flex gap-2">
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
                  if (!window.confirm("이 거래를 삭제할까요?"))
                    event.preventDefault();
                }}
              >
                <Csrf />
                <input type="hidden" name="intent" value="delete" />
                <input type="hidden" name="month" value={month} />
                <input type="hidden" name="transaction_id" value={row.id} />
                <input type="hidden" name="version" value={row.version} />
                <Submit className="min-h-10" variant="ghost">
                  삭제
                </Submit>
              </Form>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
