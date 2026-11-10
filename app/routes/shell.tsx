export { shouldRevalidate } from "~/lib/revalidation";
import { useEffect } from "react";
import {
  Form,
  NavLink,
  Outlet,
  useLoaderData,
  useLocation,
} from "react-router";
import type { Route } from "./+types/shell";
import { requireSession } from "~/lib/auth.server";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "~/components/ui/sidebar";
import { Separator } from "~/components/ui/separator";
import { Button } from "~/components/ui/button";
import { ThemeToggle } from "~/components/theme";
import {
  Wallet,
  LayoutGrid,
  FileText,
  LogOut,
  ShieldCheck,
} from "lucide-react";
export async function loader({ request }: Route.LoaderArgs) {
  const s = await requireSession(request);
  return { csrf: s.csrf_token };
}
function CloseMobileOnNavigation() {
  const location = useLocation();
  const { setOpenMobile } = useSidebar();
  useEffect(
    () => setOpenMobile(false),
    [location.pathname, location.search, setOpenMobile],
  );
  return null;
}
export default function Shell() {
  const { csrf } = useLoaderData<typeof loader>();
  const location = useLocation();
  return (
    <SidebarProvider>
      <CloseMobileOnNavigation />
      <Sidebar variant="inset">
        <SidebarHeader className="px-5 py-7">
          <NavLink to="/" className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Wallet className="size-5" />
            </span>
            <span>
              <span className="block text-base font-semibold tracking-tight">
                money log
              </span>
              <span className="text-[10px] uppercase tracking-[.14em] text-muted-foreground">
                personal workspace
              </span>
            </span>
          </NavLink>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>나의 기록</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {[
                  { url: "/", label: "계좌 현황", icon: LayoutGrid },
                  { url: "/reports", label: "MD 보고서", icon: FileText },
                ].map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={
                        item.url === "/"
                          ? !location.pathname.startsWith("/reports")
                          : location.pathname.startsWith("/reports")
                      }
                      className="h-11 px-4"
                    >
                      <NavLink to={item.url}>
                        <item.icon />
                        <span>{item.label}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="gap-5 px-5 py-5">
          <div className="rounded-xl border bg-background p-4">
            <ShieldCheck className="mb-2 size-4 text-primary" />
            <p className="text-xs font-medium">나만의 재무 기록</p>
            <p className="helper mt-1 text-[11px]">
              계좌를 기록하고
              <br />
              현황을 MD로 정리하세요.
            </p>
          </div>
          <div className="flex items-center justify-between">
            <ThemeToggle />
            <Form method="post" action="/logout">
              <input type="hidden" name="csrf" value={csrf} />
              <Button
                type="submit"
                variant="ghost"
                size="icon"
                aria-label="로그아웃"
                title="로그아웃"
              >
                <LogOut className="size-4" />
              </Button>
            </Form>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0 bg-background">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b bg-card/70 px-5">
          <SidebarTrigger aria-label="메뉴 열기·닫기" title="메뉴 열기·닫기" />
          <Separator orientation="vertical" className="h-4" />
          <span className="text-sm text-muted-foreground">내 워크스페이스</span>
          <span className="ml-auto rounded-full border px-2.5 py-1 text-[10px] tracking-wide text-muted-foreground">
            PERSONAL
          </span>
        </header>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}
