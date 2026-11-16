import type { Route } from "./+types/transactions-csv";
import { requireSession } from "~/lib/auth.server";
import { bindings } from "~/lib/env.server";
export async function loader({ request }: Route.LoaderArgs) {
  await requireSession(request);
  const month = new URL(request.url).searchParams.get("month");
  if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    throw new Response("조회 월을 확인해 주세요.", { status: 400 });
  const query = bindings().DB.prepare(
    `SELECT t.occurred_on,t.kind,t.amount_krw,a.alias AS source,d.alias AS destination,t.category,t.note FROM ledger_transactions t JOIN accounts a ON a.id=t.account_id LEFT JOIN accounts d ON d.id=t.destination_id ${month ? "WHERE substr(t.occurred_on,1,7)=?" : ""} ORDER BY t.occurred_on,t.created_at,t.id`,
  );
  const rows = await (month ? query.bind(month) : query).all<
    Record<string, unknown>
  >();
  const cell = (value: unknown) => {
    let text = String(value ?? "");
    if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  const csv = [
    [
      "거래일",
      "유형",
      "금액(원)",
      "출금·수입 계좌",
      "입금 계좌",
      "분류",
      "메모",
    ],
    ...rows.results.map((row) => [
      row.occurred_on,
      row.kind,
      row.amount_krw,
      row.source,
      row.destination,
      row.category,
      row.note,
    ]),
  ]
    .map((row) => row.map(cell).join(","))
    .join("\r\n");
  return new Response("\uFEFF" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="money-log-${month ?? "all"}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
