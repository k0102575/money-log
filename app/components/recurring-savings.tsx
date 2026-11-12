import { useEffect, useState } from "react";
import {
  ActionError,
  Csrf,
  Field,
  RecordForm,
  Select,
  Submit,
} from "~/components/forms";
import { Button } from "~/components/ui/button";
import { Form, Link, useActionData } from "react-router";
import { MoneyInput } from "~/components/money-input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "~/components/ui/sheet";
import { CalendarClock, MoreHorizontal, Plus } from "lucide-react";
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
  const result = useActionData<{ error?: string }>();
  const [destinationId, setDestinationId] = useState("");
  const [panel, setPanel] = useState<"manage" | "edit" | "stop" | "new" | null>(
    null,
  );
  const [confirmId, setConfirmId] = useState<string | null>(null);
  useEffect(() => {
    setPanel(null);
    setConfirmId(null);
  }, [rules, plans]);
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
  const latest = versions[0];
  const currentMonth = today().slice(0, 7);
  const schedules = rules.filter(
    (rule, index) =>
      rules.findIndex(
        (candidate) => candidate.destination_id === rule.destination_id,
      ) === index,
  );
  function openManage(id: string) {
    setDestinationId(id);
    setPanel("manage");
  }
  return (
    <section id="planned-savings" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="section-title">이번 달 납입</h2>
          <p className="helper mt-1">은행에서 출금된 뒤 납입을 확인하세요.</p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setDestinationId("");
            setPanel("new");
          }}
        >
          <Plus aria-hidden="true" />
          추가
        </Button>
      </div>
      {schedules.length === 0 && (
        <div className="rounded-xl border border-dashed p-6 text-center">
          <p className="font-medium">정기 납입을 등록해 보세요</p>
          <p className="helper mt-2">
            입금 계좌, 매월 납입일과 금액을 한 번 설정하면 됩니다.
          </p>
        </div>
      )}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {schedules.map((latestRule) => {
          const plan = plans.find(
            (plan) => plan.rule.destination_id === latestRule.destination_id,
          );
          const rule = plan?.rule ?? latestRule;
          const transaction = plan?.transaction;
          const due = plan?.due;
          const status = transaction
            ? "납입 완료"
            : plan
              ? "납입 예정"
              : latestRule.effective_month > month
                ? "시작 전"
                : "납입 없음";
          return (
            <Card key={rule.destination_id} className="py-0">
              <CardContent className="space-y-5 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="mb-2 text-xs font-medium text-primary">
                      {status}
                    </p>
                    <h3 className="break-words text-base font-semibold">
                      {names.get(rule.destination_id)}
                    </h3>
                  </div>
                  <CalendarClock
                    className="size-5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </div>
                <div>
                  <p className="text-2xl font-semibold tabular-nums">
                    {won(transaction?.amount_krw ?? rule.amount_krw)}
                  </p>
                  <p className="helper mt-2">
                    {transaction
                      ? transaction.occurred_on + " 출금 확인"
                      : due
                        ? due + " 예정"
                        : latestRule.ends_on
                          ? latestRule.ends_on + " 종료"
                          : latestRule.effective_month + "부터 시작"}
                  </p>
                  <p className="helper mt-1">
                    {names.get(transaction?.account_id ?? rule.account_id)}에서
                    출금 · 매월 {rule.payment_day}일
                  </p>
                </div>
                <div className="flex gap-2 border-t pt-4">
                  {plan && !transaction && (
                    <Button
                      className="flex-1"
                      onClick={() =>
                        setConfirmId(
                          confirmId === rule.destination_id
                            ? null
                            : rule.destination_id,
                        )
                      }
                    >
                      {confirmId === rule.destination_id
                        ? "확인 취소"
                        : "납입 확인"}
                    </Button>
                  )}
                  {transaction && (
                    <Button variant="outline" className="flex-1" asChild>
                      <Link
                        to={`/ledger?month=${transaction.occurred_on.slice(0, 7)}&edit=${encodeURIComponent(transaction.id)}#transaction-form`}
                      >
                        거래 보기
                      </Link>
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    className={!plan ? "w-full" : ""}
                    onClick={() => openManage(rule.destination_id)}
                  >
                    <MoreHorizontal aria-hidden="true" />
                    관리
                  </Button>
                </div>
                {plan && !transaction && confirmId === rule.destination_id && (
                  <div className="rounded-lg bg-muted/40 p-3">
                    <p className="text-sm font-medium">실제 출금 내역</p>
                    <RecordForm
                      key={JSON.stringify(rule) + month}
                      className="mt-3 space-y-3"
                    >
                      <Csrf />
                      <input
                        type="hidden"
                        name="intent"
                        value="confirm-savings"
                      />
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
                            defaultValue={due && due <= today() ? due : ""}
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
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      <Sheet
        open={panel !== null}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-lg"
        >
          <SheetHeader>
            <SheetTitle>
              {panel === "new"
                ? "정기 납입 추가"
                : panel === "edit"
                  ? "납입 설정 수정"
                  : panel === "stop"
                    ? "납입 중단"
                    : names.get(destinationId)}
            </SheetTitle>
            <SheetDescription>
              {panel === "manage"
                ? "변경할 작업을 선택하세요."
                : panel === "stop"
                  ? "선택한 달부터 예정 납입을 중단합니다."
                  : "매월 납입할 금액과 날짜를 설정하세요."}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4 pb-8">
            <ActionError error={result?.error} />
            {panel === "manage" && (
              <>
                <p className="helper">
                  매월 {latest?.payment_day}일 · {won(latest?.amount_krw)}
                </p>
                <Button
                  variant="outline"
                  className="min-h-14 w-full justify-start"
                  onClick={() => setPanel("edit")}
                >
                  금액·날짜 수정
                </Button>
                <Button
                  variant="outline"
                  className="min-h-14 w-full justify-start"
                  onClick={() => setPanel("stop")}
                >
                  납입 중단
                </Button>
                <Form
                  method="post"
                  onSubmit={(event) => {
                    if (
                      !window.confirm(
                        "이 계좌의 반복 규칙을 삭제할까요? 확정 내역이 있으면 삭제할 수 없습니다.",
                      )
                    )
                      event.preventDefault();
                  }}
                >
                  <Csrf />
                  <input type="hidden" name="intent" value="delete-savings" />
                  <input
                    type="hidden"
                    name="destination_id"
                    value={destinationId}
                  />
                  <input type="hidden" name="month" value={month} />
                  <Submit
                    variant="ghost"
                    className="min-h-12 w-full justify-start text-destructive"
                  >
                    잘못 등록한 규칙 삭제
                  </Submit>
                </Form>
                <p className="helper">
                  확정 내역이 있는 규칙은 납입 중단을 이용하세요.
                </p>
              </>
            )}
            {(panel === "edit" || panel === "new") &&
              (sources.length && destinations.length ? (
                <RecordForm className="mt-3 space-y-3">
                  <Csrf />
                  <input type="hidden" name="intent" value="save-savings" />
                  <input type="hidden" name="month" value={month} />
                  {panel !== "new" && (
                    <input
                      type="hidden"
                      name="destination_id"
                      value={destinationId}
                    />
                  )}
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
                      disabled={panel !== "new"}
                      onChange={(event) => setDestinationId(event.target.value)}
                    />
                  </Field>
                  {versions.length > 0 && (
                    <details className="helper">
                      <summary className="cursor-pointer">변경 이력</summary>
                      <ul className="mt-2 space-y-1">
                        {versions.map((rule) => (
                          <li key={rule.effective_month}>
                            {rule.effective_month}부터 · 매월 {rule.payment_day}
                            일 · {won(rule.amount_krw)}
                            {rule.ends_on && ` · ${rule.ends_on}까지`}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {destinationId && (
                    <div
                      key={destinationId + JSON.stringify(latest)}
                      className="space-y-3"
                    >
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
              ) : (
                <Link to="/accounts/new" className="text-sm text-primary">
                  출금 계좌와 적금·청약 계좌 등록하기 →
                </Link>
              ))}
            {panel === "stop" && (
              <RecordForm className="mt-3 space-y-3">
                <Csrf />
                <input type="hidden" name="intent" value="stop-savings" />
                <input
                  type="hidden"
                  name="destination_id"
                  value={destinationId}
                />
                <input type="hidden" name="month" value={month} />
                <Field label="중단 시작 월">
                  <Input
                    type="month"
                    name="stop_month"
                    required
                    min={currentMonth}
                    defaultValue={currentMonth}
                  />
                </Field>
                <p className="helper">
                  선택한 달부터 예정 납입을 중단합니다. 예약된 향후 설정에도
                  적용하며, 확정한 거래는 가계부에서 관리합니다.
                </p>
                <Submit variant="outline">납입 중단 적용</Submit>
              </RecordForm>
            )}
            {(panel === "edit" || panel === "stop") && (
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => setPanel("manage")}
              >
                관리로 돌아가기
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </section>
  );
}
