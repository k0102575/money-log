export { shouldRevalidate } from "~/lib/revalidation";
import { Link, redirect, useActionData } from "react-router";
import type { Route } from "./+types/account-new";
import { mutation, requireSession } from "~/lib/auth.server";
import { bindings } from "~/lib/env.server";
import { createAccount } from "~/lib/db.server";
import { actionFailure } from "~/lib/actions.server";
import {
  AccountFields,
  ActionError,
  Csrf,
  RecordForm,
  Submit,
} from "~/components/forms";
import { Card, CardContent } from "~/components/ui/card";
import { ArrowLeft } from "lucide-react";
export async function loader({ request }: Route.LoaderArgs) {
  await requireSession(request);
  return null;
}
export async function action({ request }: Route.ActionArgs) {
  try {
    const f = await request.formData();
    await mutation(request, f);
    return redirect(
      `/accounts/${await createAccount(bindings().DB, f)}?created=1`,
    );
  } catch (e) {
    return actionFailure(e);
  }
}
export default function NewAccount() {
  const result = useActionData<typeof action>();
  return (
    <main className="page max-w-3xl">
      <Link
        to="/accounts"
        className="mb-7 flex items-center gap-2 text-xs text-muted-foreground"
      >
        <ArrowLeft className="size-3.5" />
        계좌 현황
      </Link>
      <p className="eyebrow mb-3">NEW ACCOUNT</p>
      <h1 className="page-title">계좌 등록</h1>
      <p className="helper mt-2 mb-7">
        기본 정보를 먼저 등록하고 잔액이나 보유 상품을 추가하세요.
      </p>
      <ActionError error={result?.error} />
      <Card className="shadow-none">
        <CardContent className="p-6 md:p-8">
          <RecordForm className="space-y-6">
            <Csrf />
            <AccountFields />
            <div className="flex justify-end border-t pt-5">
              <Submit>계좌 등록</Submit>
            </div>
          </RecordForm>
        </CardContent>
      </Card>
    </main>
  );
}
