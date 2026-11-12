import { today } from "./domain";
import { clearPageCache } from "./page-cache";
import type { ShouldRevalidateFunction } from "react-router";
// Keep in-memory form inputs on auth failures; explicitly revalidate after signing in again.
export const shouldRevalidate: ShouldRevalidateFunction = ({
  actionStatus,
  currentUrl,
  formMethod,
  nextUrl,
  defaultShouldRevalidate,
}) => {
  if (
    !formMethod &&
    currentUrl.pathname === "/ledger" &&
    nextUrl.pathname === "/ledger"
  ) {
    const current = new URL(currentUrl);
    const next = new URL(nextUrl);
    current.searchParams.delete("edit");
    next.searchParams.delete("edit");
    current.hash = "";
    next.hash = "";
    current.searchParams.set(
      "month",
      current.searchParams.get("month") || today().slice(0, 7),
    );
    next.searchParams.set(
      "month",
      next.searchParams.get("month") || today().slice(0, 7),
    );
    if (
      current.href === next.href &&
      currentUrl.searchParams.get("edit") !== nextUrl.searchParams.get("edit")
    )
      return false;
  }
  if (currentUrl.href === nextUrl.href) clearPageCache();
  return actionStatus === 401 || actionStatus === 403
    ? false
    : defaultShouldRevalidate;
};
