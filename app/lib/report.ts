import {
  accountTypes,
  current,
  group,
  groups,
  isInvestment,
  metricLabels,
  precisions,
  risks,
  sources,
  won,
} from "./domain.ts";
import type { Snapshot } from "./domain.ts";
export function mdCell(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("|", "\\|")
    .replace(/[\r\n]+/g, " ")
    .replace(/([`*_<>\[\]#])/g, "\\$1");
}
export function makeMarkdown(snapshot: Snapshot) {
  const { asOf, generatedAt } = snapshot;
  const lines = [
    "# 계좌·보유 상품 현황",
    "",
    `- 기준일: ${asOf}`,
    `- 생성 시각: ${new Date(generatedAt).toLocaleString("sv-SE", { timeZone: "Asia/Seoul" })} (Asia/Seoul)`,
    "- 자료: Money Log에 직접 입력한 기록. 금액과 수량은 각 항목의 확인일 기준입니다.",
    "- 범위: 직접 등록한 계좌와 보유 상품. 부채·수입·지출은 포함하지 않습니다.",
    "- 전체 현재 순자산은 계산하지 않습니다. 투자 납입액은 현재 자산 가치가 아닙니다.",
    "",
  ];
  const eligible = snapshot.accounts.filter(
    (a) => a.tracking_start_date <= asOf,
  );
  for (const section of groups) {
    const accounts = eligible.filter((a) => group(a.account_type) === section);
    if (!accounts.length) continue;
    lines.push(`## ${section}`, "");
    for (const account of accounts) {
      lines.push(
        `### ${mdCell(account.alias)} · ${accountTypes[account.account_type]}`,
        `- 금융기관: ${mdCell(account.institution)}`,
        `- 관리 시작일: ${account.tracking_start_date}`,
      );
      if (account.archived_at)
        lines.push(
          `- 상태: 보관 (${account.archived_at.slice(0, 10)} 처리, 잔액을 0으로 간주하지 않음)`,
        );
      if (account.note) lines.push(`- 메모: ${mdCell(account.note)}`);
      const metrics = isInvestment(account.account_type)
        ? ([
            "initial_contributions",
            "initial_withdrawals",
            "valuation",
          ] as const)
        : (["cash_balance"] as const);
      const chosen = Object.fromEntries(
        metrics.map((metric) => [
          metric,
          current(
            snapshot.observations.filter(
              (o) => o.account_id === account.id && o.metric === metric,
            ),
            asOf,
          ),
        ]),
      );
      for (const metric of metrics) {
        const o = chosen[metric];
        lines.push(
          `- ${metricLabels[metric]}: ${o ? `${won(o.amount_krw)} / ${o.as_of_date}${o.as_of_date < asOf ? " (기준일 이전 확인)" : ""} / ${sources[o.source]}·${precisions[o.precision]}${o.rounding_unit ? ` (${mdCell(o.rounding_unit)})` : ""}${o.source_note ? ` / ${mdCell(o.source_note)}` : ""}` : "미확인"}`,
        );
      }
      if (isInvestment(account.account_type)) {
        const c = chosen.initial_contributions,
          w = chosen.initial_withdrawals;
        lines.push(
          `- 초기 순납입: ${c && w && c.as_of_date === w.as_of_date ? won(c.amount_krw - w.amount_krw) + (c.precision !== "exact" || w.precision !== "exact" ? " (추정·반올림 포함)" : "") : "계산하지 않음 (납입·인출 미확인 또는 기준일 불일치)"}`,
          "- 초기 납입·인출은 관리 시작일까지의 과거 누적치이며 당월 실적이 아닙니다.",
          "",
        );
        const productRows = snapshot.products
          .filter((p) => p.account_id === account.id)
          .map((p) => ({
            p,
            q: current(
              snapshot.quantities.filter((q) => q.product_id === p.id),
              asOf,
            ),
          }))
          .filter(({ q }) => q && q.quantity_decimal !== "0");
        if (!productRows.length)
          lines.push(
            account.holdings_status === "none" &&
              !snapshot.products.some((p) => p.account_id === account.id)
              ? "- 보유 상품: 없음 확인 (생성 당시 사용자 표시)"
              : "- 보유 상품: 해당 기준일까지 확인된 보유 상품 없음. 상품 구성이 완전하다고 보장하지 않습니다.",
          );
        else {
          lines.push(
            account.account_type === "irp"
              ? "| 상품명 | 보유 수량 | IRP 분류 | 확인일 |"
              : "| 상품명 | 보유 수량 | 확인일 |",
            account.account_type === "irp"
              ? "|---|---:|---|---|"
              : "|---|---:|---|",
          );
          for (const { p, q } of productRows)
            lines.push(
              `| ${mdCell(p.name)} | ${q!.quantity_decimal} | ${account.account_type === "irp" ? `${risks[q!.risk_class ?? "unknown"]} | ` : ""}${q!.as_of_date} |`,
            );
        }
      }
      lines.push("");
    }
  }
  if (!eligible.length) lines.push("기준일까지 등록된 계좌가 없습니다.", "");
  const cash = eligible
    .filter((a) => !isInvestment(a.account_type))
    .map((a) =>
      current(
        snapshot.observations.filter(
          (o) => o.account_id === a.id && o.metric === "cash_balance",
        ),
        asOf,
      ),
    );
  const cashByDate = new Map<string, NonNullable<(typeof cash)[number]>[]>();
  for (const record of cash) {
    if (!record) continue;
    const records = cashByDate.get(record.as_of_date) ?? [];
    records.push(record);
    cashByDate.set(record.as_of_date, records);
  }
  lines.push(
    "## 확인 범위",
    "",
    `- 등록 계좌: ${eligible.length}개`,
    `- 비투자 계좌 잔액 미확인: ${cash.filter((o) => !o).length}개`,
  );
  if (cashByDate.size) {
    lines.push(
      "",
      "| 잔액 확인일 | 비투자 계좌 수 | 잔액 소계 |",
      "|---|---:|---:|",
    );
    for (const date of [...cashByDate.keys()].sort().reverse()) {
      const records = cashByDate.get(date)!;
      const total = records.reduce(
        (sum, record) => sum + BigInt(record.amount_krw),
        0n,
      );
      const amount =
        total <= BigInt(Number.MAX_SAFE_INTEGER)
          ? won(Number(total))
          : "표시 범위 초과";
      const precision = records.some((record) => record.precision !== "exact")
        ? " (추정·반올림 포함)"
        : "";
      lines.push(`| ${date} | ${records.length} | ${amount}${precision} |`);
    }
    lines.push("");
  }
  lines.push(
    "- 다른 날짜의 금액이나 투자 누적 납입액을 현재 자산으로 합산하지 않았습니다.",
    "- 상품별 평가액·매입금액·위험자산 비중은 관리하지 않습니다.",
    "- 과거 기준일 재생성 시 계좌 이름·상품명은 생성 당시 정보를 사용합니다. 당시 출력은 저장된 보고서를 확인하세요.",
    "",
  );
  return lines.join("\n");
}
