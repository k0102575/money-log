import type { ComponentProps } from "react";
import { Input } from "./ui/input";

function formatAmount(digits: string) {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

type Props = Omit<
  ComponentProps<typeof Input>,
  "defaultValue" | "onChange" | "value"
> & {
  defaultValue?: number;
};

export function MoneyInput({ defaultValue, ...props }: Props) {
  return (
    <Input
      {...props}
      inputMode="numeric"
      defaultValue={
        defaultValue === undefined ? "" : formatAmount(String(defaultValue))
      }
      onChange={({ currentTarget: input }) => {
        if (!/^[\d,]*$/.test(input.value)) return;
        const cursor = input.selectionStart ?? input.value.length;
        let digitsBeforeCursor = input.value
          .slice(0, cursor)
          .replaceAll(",", "").length;
        const formatted = formatAmount(input.value.replaceAll(",", ""));
        if (input.value === formatted) return;
        let nextCursor = 0;
        while (digitsBeforeCursor > 0 && nextCursor < formatted.length) {
          if (formatted[nextCursor] !== ",") digitsBeforeCursor--;
          nextCursor++;
        }
        input.value = formatted;
        input.setSelectionRange(nextCursor, nextCursor);
      }}
    />
  );
}
