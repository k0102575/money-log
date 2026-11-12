import { Form, useRouteLoaderData } from "react-router";
import { LogOut, Settings } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "~/components/ui/sheet";
import { ThemeToggle } from "~/components/theme";
import type { loader } from "~/routes/shell";

export function AccountSettings() {
  const data = useRouteLoaderData<typeof loader>("routes/shell");
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="md:hidden"
          aria-label="설정"
        >
          <Settings aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="account-settings rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>설정</SheetTitle>
          <SheetDescription>
            화면 테마와 로그인 상태를 관리하세요.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-6 px-4 pb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-medium">화면 테마</span>
            <ThemeToggle />
          </div>
          <Form method="post" action="/logout">
            <input type="hidden" name="csrf" value={data?.csrf ?? ""} />
            <Button type="submit" variant="outline" className="w-full">
              <LogOut aria-hidden="true" />
              로그아웃
            </Button>
          </Form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
