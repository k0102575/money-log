import type { ShouldRevalidateFunction } from "react-router";
// Keep in-memory form inputs on auth failures; explicitly revalidate after signing in again.
export const shouldRevalidate: ShouldRevalidateFunction = ({
  actionStatus,
  defaultShouldRevalidate,
}) =>
  actionStatus === 401 || actionStatus === 403
    ? false
    : defaultShouldRevalidate;
