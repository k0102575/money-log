import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useRouteError,
  Link,
} from "react-router";
import "./app.css";
const themeScript = `(()=>{try{const t=localStorage.getItem('money-theme')||'system';document.documentElement.classList.toggle('dark',t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches))}catch{}})()`;
export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
        <meta name="color-scheme" content="light dark" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <title>Money Log · 나의 계좌 기록</title>
        <meta
          name="description"
          content="계좌와 보유 상품을 기록하고 나의 재무 현황을 정리합니다."
        />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg"/>
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
export default function App() {
  return <Outlet />;
}
export function ErrorBoundary() {
  const e = useRouteError();
  const known = isRouteErrorResponse(e);
  return (
    <main className="page max-w-xl py-24">
      <p className="eyebrow mb-4">MONEY LOG</p>
      <h1 className="page-title mb-4">
        {known && e.status === 404
          ? "요청한 기록을 찾을 수 없습니다"
          : "화면을 불러오지 못했습니다"}
      </h1>
      <p className="helper mb-6">
        {known && typeof e.data === "string"
          ? e.data
          : "잠시 후 다시 시도해 주세요. 계속되면 실행 환경과 DB 설정을 확인해 주세요."}
      </p>
      <Link to="/" className="underline">
        계좌 목록으로
      </Link>
    </main>
  );
}
