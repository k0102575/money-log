import { useState } from "react";
import { Csrf, Field, RecordForm, Select, Submit } from "~/components/forms";
import { MoneyInput } from "~/components/money-input";
import { Card, CardContent } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { today, won } from "~/lib/domain";
import { ledgerStart } from "~/lib/ledger";
import type { loader } from "~/routes/recurring";

export function RecurringSavings({
  data: { accounts, month, plans, rules },
}: {
  data: Awaited<ReturnType<typeof loader>>;
}) {
  const [destinationId, setDestinationId] = useState("");
  const sources = accounts.filter(
    (account) =>
      !account.archived_at &&
      ["checking", "cma", "cash"].includes(account.account_type),
  );
  const destinations = accounts.filter(
    (account) =>
      !account.archived_at &&
      ["savings", "housing"].includes(account.account_type),
  );
  const names = new Map(accounts.map((account) => [account.id, account.alias]));
  const versions = rules.filter(
    (rule) => rule.destination_id === destinationId,
  );
  const currentMonth = today().slice(0, 7);
  const latest = versions[0];

  return (
    <Card className="py-0 sm:py-6">
      <CardContent
        id="planned-savings"
        className="scroll-mt-4 space-y-4 p-4 sm:p-5"
      >
        <h2 className="font-semibold">예정 납입</h2>
        <p className="helper">
          실제 출금을 확인한 뒤 확정하면 저축 이체가 등록되고 잔액에 반영됩니다.
        </p>
        {plans.length === 0 && (
          <p className="helper">이 달에 예정된 납입이 없습니다.</p>
        )}
        {plans.map(({ rule, due, transaction }) => (
          <div
            key={rule.destination_id}
            className="space-y-3 rounded-lg border p-3 sm:p-4"
          >
            <div className="flex flex-wrap justify-between gap-2">
              <p className="font-medium break-words">
                {names.get(transaction?.account_id ?? rule.account_id)} →{" "}
                {names.get(rule.destination_id)}
              </p>
              <p className="font-semibold tabular-nums">
                {won(transaction?.amount_krw ?? rule.amount_krw)}
              </p>
            </div>
            <p className="helper">
              {transaction
                ? `확정 · ${transaction.occurred_on}`
                : `예정 · ${due}`}
            </p>
            {!transaction && (
              <details>
                <summary className="cursor-pointer text-sm font-medium text-primary">
                  실제 납입 확정하기
                </summary>
                <RecordForm
                  key={JSON.stringify(rule) + month}
                  className="mt-3 space-y-3"
                >
                  <Csrf />
                  <input type="hidden" name="intent" value="confirm-savings" />
                  <input type="hidden" name="month" value={month} />
                  <input
                    type="hidden"
                    name="destination_id"
                    value={rule.destination_id}
                  />
                  <input
                    type="hidden"
                    name="rule"
                    value={JSON.stringify(rule)}
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="실제 납입일">
                      <Input
                        type="date"
                        name="occurred_on"
                        required
                        min={ledgerStart}
                        max={today()}
                        defaultValue={due <= today() ? due : ""}
                      />
                    </Field>
                    <Field label="실제 금액 (원)">
                      <MoneyInput
                        name="amount"
                        required
                        defaultValue={rule.amount_krw}
                      />
                    </Field>
                  </div>
                  <Submit>납입 확정</Submit>
                </RecordForm>
              </details>
            )}
          </div>
        ))}
        <details className="rounded-lg border p-3 sm:p-4">
          <summary className="cursor-pointer font-medium">반복 설정</summary>
          {sources.length === 0 || destinations.length === 0 ? (
            <p className="helper mt-3">
              출금 계좌와 적금 또는 청약 계좌를 먼저 등록해 주세요.
            </p>
          ) : (
            <RecordForm className="mt-3 space-y-3">
              <Csrf />
              <input type="hidden" name="intent" value="save-savings" />
              <input type="hidden" name="month" value={month} />
              <Field label="입금 계좌">
                <Select
                  name="destination_id"
                  required
                  options={{
                    "": "적금·청약 계좌 선택",
                    ...Object.fromEntries(
                      destinations.map((account) => [
                        account.id,
                        account.alias,
                      ]),
                    ),
                  }}
                  value={destinationId}
                  onChange={(event) => setDestinationId(event.target.value)}
                />
              </Field>
              {versions.length > 0 && (
                <ul className="helper space-y-1">
                  {versions.map((rule) => (
                    <li key={rule.effective_month}>
                      {rule.effective_month}부터 · 매월 {rule.payment_day}일 ·{" "}
                      {won(rule.amount_krw)}
                      {rule.ends_on && ` · ${rule.ends_on}까지`}
                    </li>
                  ))}
                </ul>
              )}
              {destinationId && (
                <div key={destinationId} className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="출금 계좌">
                      <Select
                        name="account_id"
                        required
                        defaultValue={latest?.account_id ?? ""}
                        options={{
                          "": "출금 계좌 선택",
                          ...Object.fromEntries(
                            sources.map((account) => [
                              account.id,
                              account.alias,
                            ]),
                          ),
                        }}
                      />
                    </Field>
                    <Field label="적용 월">
                      <Input
                        name="effective_month"
                        type="month"
                        required
                        min={ledgerStart.slice(0, 7)}
                        defaultValue={
                          latest && latest.effective_month > currentMonth
                            ? latest.effective_month
                            : currentMonth
                        }
                      />
                    </Field>
                    <Field label="매월 납입일">
                      <Input
                        name="payment_day"
                        type="number"
                        min={1}
                        max={31}
                        required
                        defaultValue={latest?.payment_day}
                      />
                    </Field>
                    <Field label="납입액 (원)">
                      <MoneyInput
                        name="amount"
                        required
                        defaultValue={latest?.amount_krw}
                      />
                    </Field>
                    <Field label="만기·종료일 (선택)">
                      <Input
                        name="ends_on"
                        type="date"
                        defaultValue={latest?.ends_on ?? ""}
                      />
                    </Field>
                  </div>
                  <p className="helper">
                    적용 월부터 새 설정을 사용합니다. 이미 확정한 거래는
                    그대로입니다. 납입일이 없는 달은 말일에 표시합니다.
                  </p>
                  <Submit>반복 설정 저장</Submit>
                </div>
              )}
            </RecordForm>
          )}
        </details>
      </CardContent>
    </Card>
  );
}
