export interface SavingsRule {
  destination_id: string;
  effective_month: string;
  account_id: string;
  payment_day: number;
  amount_krw: number;
  ends_on: string | null;
}

export function savingsDueDate(rule: SavingsRule, month: string) {
  const [year, number] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const day = String(Math.min(rule.payment_day, lastDay)).padStart(2, "0");
  return `${month}-${day}`;
}
