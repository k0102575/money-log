export { shouldRevalidate } from "~/lib/revalidation";
import { Form, Link, Outlet, useLoaderData, useLocation } from "react-router";
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
import { Button } from "~/components/ui/button";
import { ThemeToggle } from "~/components/theme";
import {
  Wallet,
  House,
  LayoutGrid,
  FileText,
  BookOpen,
  CalendarClock,
  LogOut,
  ShieldCheck,
} from "lucide-react";
export async function loader({ request }: Route.LoaderArgs) {
  const s = await requireSession(request);
  return { csrf: s.csrf_token };
}
const navigation = [
  { url: "/", label: "대시보드", mobileLabel: "홈", icon: House },
  {
    url: "/ledger",
    label: "월별 가계부",
    mobileLabel: "가계부",
    icon: BookOpen,
  },
  {
    url: "/recurring",
    label: "정기 납입",
    mobileLabel: "정기 납입",
    icon: CalendarClock,
  },
  {
    url: "/accounts",
    label: "계좌 현황",
    mobileLabel: "계좌",
    icon: LayoutGrid,
  },
  {
    url: "/reports",
    label: "MD 보고서",
    mobileLabel: "보고서",
    icon: FileText,
  },
];

function isActive(pathname: string, url: string) {
  return url === "/"
    ? pathname === "/"
    : pathname === url || pathname.startsWith(url + "/");
}

function DesktopSidebar({ csrf }: { csrf: string }) {
  const location = useLocation();
  const { isMobile } = useSidebar();
  if (isMobile) return null;
  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader className="px-4 py-6 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-0">
        <div className="flex items-center justify-between gap-2">
          <Link
            to="/"
            className="flex min-w-0 items-center gap-3 group-data-[collapsible=icon]:hidden"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Wallet className="size-5" />
            </span>
            <span className="font-semibold tracking-tight">money log</span>
          </Link>
          <SidebarTrigger
            aria-label="사이드바 접기·펼치기"
            title="사이드바 접기·펼치기"
          />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>나의 기록</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.map((item) => {
                const active = isActive(location.pathname, item.url);
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.label}
                      className="h-11 px-4"
                    >
                      <Link
                        to={item.url}
                        aria-current={active ? "page" : undefined}
                      >
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="gap-5 px-5 py-5 group-data-[collapsible=icon]:hidden">
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
  );
}

export default function Shell() {
  const { csrf } = useLoaderData<typeof loader>();
  const location = useLocation();
  return (
    <SidebarProvider>
      <DesktopSidebar csrf={csrf} />
      <SidebarInset className="workspace-content min-w-0 bg-background">
        <Outlet />
      </SidebarInset>
      <nav
        aria-label="주요 메뉴"
        className="mobile-navigation fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-card md:hidden"
      >
        {navigation.map((item) => {
          const active = isActive(location.pathname, item.url);
          return (
            <Link
              key={item.url}
              to={item.url}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 px-1 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-ring ${active ? "font-semibold text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              <span
                className={`flex h-7 w-12 items-center justify-center rounded-full ${active ? "bg-primary/10" : ""}`}
              >
                <item.icon className="size-5" aria-hidden="true" />
              </span>
              <span>{item.mobileLabel}</span>
            </Link>
          );
        })}
      </nav>
    </SidebarProvider>
  );
}
