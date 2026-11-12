import { uncachedAction } from "~/lib/page-cache";
import { cachedPage } from "~/lib/page-cache";
import { PageHeader } from "~/components/page-header";
export { shouldRevalidate } from "~/lib/revalidation";
import {
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
} from "react-router";
import type { Route } from "./+types/recurring";
import { ActionError, Field } from "~/components/forms";
import { RecurringSavings } from "~/components/recurring-savings";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { actionFailure } from "~/lib/actions.server";
import { mutation, requireSession } from "~/lib/auth.server";
import { InputError, today } from "~/lib/domain";
import { bindings } from "~/lib/env.server";
import { ledgerStart } from "~/lib/ledger";
import { ledgerMonth } from "~/lib/ledger.server";
import {
  manageSavingsRule,
  confirmSavings,
  savingsPageData,
  saveSavingsRule,
} from "~/lib/recurring-savings.server";

export async function loader({ request }: Route.LoaderArgs) {
  await requireSession(request);
  const month = ledgerMonth(new URL(request.url).searchParams.get("month"));
  const { DB } = bindings();
  const { accounts, rules, plans } = await savingsPageData(DB, month);
  return { accounts, rules, month, plans };
}

export async function action({ request }: Route.ActionArgs) {
  try {
    const form = await request.formData();
    await mutation(request, form);
    const { DB } = bindings();
    const month = ledgerMonth(String(form.get("month") ?? ""));
    switch (form.get("intent")) {
      case "stop-savings":
      case "delete-savings":
        await manageSavingsRule(DB, form);
        break;
      case "save-savings":
        await saveSavingsRule(DB, form);
        break;
      case "confirm-savings":
        await confirmSavings(DB, form, month);
        break;
      default:
        throw new InputError("처리할 정기 납입을 다시 확인해 주세요.");
    }
    return redirect(`/recurring?month=${month}`);
  } catch (error) {
    return actionFailure(error);
  }
}

export default function Recurring() {
  const data = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  return (
    <main className="page space-y-6">
      <PageHeader
        title="정기 납입"
        description="매달 납입할 금액과 날짜를 관리하고 실제 출금 내역을 확인하세요."
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
            defaultValue={data.month}
            key={data.month}
          />
        </Field>
        <Button type="submit" variant="outline" className="min-h-11">
          조회
        </Button>
      </Form>
      <ActionError error={result?.error} />
      <RecurringSavings data={data} />
      <Button variant="outline" asChild>
        <Link to={`/ledger?month=${data.month}`}>이 달의 가계부 보기</Link>
      </Button>
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
