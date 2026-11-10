export const accountTypes = {
  checking: "입출금",
  cma: "CMA",
  isa: "ISA",
  irp: "IRP",
  pension: "연금저축",
  savings: "적금",
  housing: "청약",
  cash: "현금",
  other: "기타",
} as const;
export type AccountType = keyof typeof accountTypes;
export const metricLabels = {
  cash_balance: "확인 잔액",
  initial_contributions: "초기 총 납입",
  initial_withdrawals: "초기 총 인출",
  valuation: "계좌 전체 평가액",
} as const;
export type Metric = keyof typeof metricLabels;
export const sources = {
  app: "앱 직접 확인",
  statement: "명세서",
  estimate: "사용자 추정",
  other: "기타",
} as const;
export const precisions = {
  exact: "원 단위 확인",
  estimated: "추정",
  rounded: "반올림",
} as const;
export const risks = {
  risk: "위험자산",
  safe: "안전자산",
  unknown: "미분류",
} as const;
export const groups = ["입출금·현금성", "투자·연금", "저축·청약", "기타"];
export function isInvestment(type: string) {
  return ["isa", "irp", "pension"].includes(type);
}
export function group(type: string) {
  return isInvestment(type)
    ? groups[1]
    : ["savings", "housing"].includes(type)
      ? groups[2]
      : ["checking", "cma", "cash"].includes(type)
        ? groups[0]
        : groups[3];
}
export function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export class InputError extends Error {}
export class ConflictError extends Error {}
export function textValue(
  form: FormData,
  name: string,
  required = false,
  max = 500,
) {
  const value = String(form.get(name) ?? "").trim();
  if ((required && !value) || value.length > max)
    throw new InputError(
      `${nameLabels[name] ?? name}: ${required ? "필수 항목이며 " : ""}${max}자 이내로 입력해 주세요.`,
    );
  return value;
}
const nameLabels: Record<string, string> = {
  alias: "계좌 이름",
  institution: "금융기관",
  name: "상품명",
  reason: "정정 사유",
  note: "메모",
  source_note: "출처 설명",
};
export function dateValue(value: string, minimum?: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value ||
    value > today() ||
    (minimum && value < minimum)
  )
    throw new InputError(
      "확인일은 관리 시작일 이후부터 오늘까지의 올바른 날짜여야 합니다.",
    );
  return value;
}
export function money(value: string): number | null {
  const input = value.trim();
  if (!input) return null;
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(input))
    throw new InputError("금액은 0 이상의 원 단위 정수로 입력해 주세요.");
  const amount = Number(input.replaceAll(",", ""));
  if (!Number.isSafeInteger(amount))
    throw new InputError("금액이 허용 범위를 넘었습니다.");
  return amount;
}
export function quantity(value: string) {
  if (!/^\d{1,18}(?:\.\d{1,8})?$/.test(value.trim()))
    throw new InputError(
      "수량은 정수부 18자리, 소수부 8자리 이내의 0 이상 숫자로 입력해 주세요.",
    );
  const [a, b = ""] = value.trim().split(".");
  const n = a.replace(/^0+(?=\d)/, "");
  const d = b.replace(/0+$/, "");
  return d ? `${n}.${d}` : n;
}
export function choice<T extends string>(
  value: string,
  choices: Record<T, unknown>,
): T {
  if (!Object.hasOwn(choices, value))
    throw new InputError("선택 값을 확인해 주세요.");
  return value as T;
}
export function won(value: number | null | undefined) {
  return value == null ? "미확인" : `${value.toLocaleString("ko-KR")}원`;
}
export interface Account {
  id: string;
  alias: string;
  institution: string;
  account_type: AccountType;
  tracking_start_date: string;
  note: string;
  holdings_status: "unknown" | "some" | "none";
  version: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface Observation {
  id: string;
  account_id: string;
  metric: Metric;
  amount_krw: number;
  as_of_date: string;
  source: keyof typeof sources;
  source_note: string;
  precision: keyof typeof precisions;
  rounding_unit: string;
  revision_of: string | null;
  correction_reason: string;
  superseded_by: string | null;
  recorded_at: string;
}
export interface Product {
  id: string;
  account_id: string;
  name: string;
  version: number;
  created_at: string;
  updated_at: string;
}
export interface ProductObservation {
  id: string;
  product_id: string;
  quantity_decimal: string;
  as_of_date: string;
  risk_class: keyof typeof risks | null;
  revision_of: string | null;
  correction_reason: string;
  superseded_by: string | null;
  recorded_at: string;
}
export interface Snapshot {
  asOf: string;
  generatedAt: string;
  accounts: Account[];
  observations: Observation[];
  products: Product[];
  quantities: ProductObservation[];
}
export function current<
  T extends {
    as_of_date: string;
    recorded_at: string;
    superseded_by: string | null;
  },
>(rows: T[], asOf: string) {
  return rows
    .filter((r) => !r.superseded_by && r.as_of_date <= asOf)
    .sort(
      (a, b) =>
        b.as_of_date.localeCompare(a.as_of_date) ||
        b.recorded_at.localeCompare(a.recorded_at),
    )[0];
}
