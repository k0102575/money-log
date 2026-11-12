import { uncachedAction } from "~/lib/page-cache";
import { requestSessions } from "~/lib/request-session.server";
import { redirect } from "react-router";
import type { Route } from "./+types/logout";
import { mutation, sessionCookie } from "~/lib/auth.server";
import { bindings } from "~/lib/env.server";
export async function action({ request }: Route.ActionArgs) {
  const f = await request.formData();
  const s = await mutation(request, f);
  const { DB } = bindings();
  await DB.batch([
    DB.prepare("UPDATE reports SET session_id=NULL WHERE session_id=?").bind(
      s.id,
    ),
    DB.prepare("DELETE FROM sessions WHERE id=?").bind(s.id),
  ]);
  requestSessions.getStore()?.clear();
  return redirect("/login", {
    headers: { "Set-Cookie": sessionCookie(request, "", 0) },
  });
}
export function loader() {
  return redirect("/");
}

export async function clientAction({ serverAction }: Route.ClientActionArgs) {
  return uncachedAction(serverAction);
}
