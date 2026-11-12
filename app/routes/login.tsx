import { uncachedAction } from "~/lib/page-cache";
import {
  data,
  redirect,
  useLoaderData,
  useActionData,
  Form,
} from "react-router";
import type { Route } from "./+types/login";
import { login, secure, session } from "~/lib/auth.server";
import { randomToken } from "~/lib/crypto";
import { ActionError, Submit } from "~/components/forms";
import { Input } from "~/components/ui/input";
import { ThemeToggle } from "~/components/theme";
import { ArrowUpRight, LockKeyhole, Wallet } from "lucide-react";
export async function loader({ request }: Route.LoaderArgs) {
  if (await session(request)) return redirect("/");
  const csrf = randomToken();
  return data(
    { csrf },
    {
      headers: {
        "Set-Cookie": `money-login=${csrf}; Path=/; HttpOnly; SameSite=Strict; Max-Age=3600${secure(request) ? "; Secure" : ""}`,
      },
    },
  );
}
export async function action({ request }: Route.ActionArgs) {
  try {
    return await login(request, await request.formData());
  } catch (e) {
    if (e instanceof Response) throw e;
    return data(
      { error: "로그인 설정을 확인해 주세요. 잠시 후 다시 시도해 주세요." },
      { status: 500 },
    );
  }
}
export default function Login() {
  const { csrf } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  return (
    <main className="min-h-svh flex flex-col bg-background">
      <header className="flex items-center justify-between px-6 py-5 md:px-12">
        <div className="flex items-center gap-2 font-semibold tracking-tight">
          <Wallet className="size-5 text-primary" />
          money log
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            나의 계좌 기록
          </span>
        </div>
        <ThemeToggle />
      </header>
      <div className="flex flex-1 items-center justify-center px-5 py-16">
        <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl border bg-card shadow-sm md:grid-cols-2">
          <div className="hidden bg-primary px-10 py-14 text-primary-foreground md:flex md:flex-col md:justify-between">
            <div>
              <p className="text-xs tracking-[.2em] opacity-70">
                YOUR MONEY, CLEARLY.
              </p>
              <h1 className="mt-10 text-4xl font-medium leading-[1.4] tracking-tight">
                흩어진 계좌를
                <br />
                한곳에, 차분하게.
              </h1>
              <p className="mt-5 text-sm leading-7 opacity-75">
                오늘의 계좌와 보유 상품을 기록하고
                <br />
                나만의 재무 현황을 정리하세요.
              </p>
            </div>
            <div className="mt-20 flex items-center gap-2 border-t border-current/20 pt-5 text-xs opacity-70">
              <ArrowUpRight className="size-4" />
              기록은 가볍게, 현황은 명확하게
            </div>
          </div>
          <section className="px-7 py-12 md:px-10 md:py-16">
            <div className="mb-6 flex size-11 items-center justify-center rounded-xl border bg-muted">
              <LockKeyhole className="size-5" />
            </div>
            <p className="eyebrow mb-3">PRIVATE WORKSPACE</p>
            <h2 className="text-2xl font-semibold tracking-tight">
              내 기록으로 들어가기
            </h2>
            <p className="helper mt-3 mb-8">
              비밀번호를 입력해 계좌 현황을 확인하세요.
            </p>
            <ActionError error={result?.error} />
            <Form method="post" className="space-y-5">
              <input type="hidden" name="login_csrf" value={csrf} />
              <label className="field">
                비밀번호
                <Input
                  autoFocus
                  type="password"
                  name="password"
                  required
                  maxLength={512}
                  autoComplete="current-password"
                  placeholder="비밀번호 입력"
                  className="h-11"
                />
              </label>
              <Submit className="h-11 w-full">
                로그인 <ArrowUpRight />
              </Submit>
            </Form>
            <p className="helper mt-6 text-xs">
              개인용 공간입니다. 로그인은 기기별로 7일간 유지됩니다.
            </p>
          </section>
        </div>
      </div>
      <footer className="px-6 py-5 text-center text-xs text-muted-foreground">
        Money Log · Personal finance journal
      </footer>
    </main>
  );
}

export async function clientAction({ serverAction }: Route.ClientActionArgs) {
  return uncachedAction(serverAction);
}
