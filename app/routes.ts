import {
  type RouteConfig,
  index,
  route,
  layout,
} from "@react-router/dev/routes";
export default [
  route("login", "routes/login.tsx"),
  route("logout", "routes/logout.tsx"),
  layout("routes/shell.tsx", [
    index("routes/dashboard.tsx"),
    route("accounts", "routes/accounts.tsx"),
    route("accounts/new", "routes/account-new.tsx"),
    route("accounts/:accountId", "routes/account-detail.tsx"),
    route("ledger", "routes/ledger.tsx"),
    route("recurring", "routes/recurring.tsx"),
    route("reports", "routes/reports.tsx"),
    route("reports/:reportId", "routes/report-detail.tsx"),
  ]),
  route("reports/:reportId/download", "routes/download.ts"),
] satisfies RouteConfig;
