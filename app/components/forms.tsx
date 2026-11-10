import { ChevronDown } from "lucide-react";
import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  Form,
  useActionData,
  useBeforeUnload,
  useNavigation,
  useRouteLoaderData,
  useRevalidator,
} from "react-router";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { accountTypes, precisions, sources, today } from "~/lib/domain";
import type { Account } from "~/lib/domain";
export function Csrf() {
  const s = useRouteLoaderData("routes/shell") as { csrf: string } | undefined;
  return <input type="hidden" name="csrf" value={s?.csrf ?? ""} />;
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  const fieldId = useId();
  return (
    <div className="field">
      <label htmlFor={fieldId}>{label}</label>
      {Children.map(children, (child, index) =>
        index === 0 && isValidElement(child)
          ? cloneElement(
              child as React.ReactElement<{
                id: string;
                "aria-describedby"?: string;
              }>,
              {
                id: fieldId,
                ...(hint ? { "aria-describedby": `${fieldId}-hint` } : {}),
              },
            )
          : child,
      )}
      {hint && (
        <span id={`${fieldId}-hint`} className="helper font-normal">
          {hint}
        </span>
      )}
    </div>
  );
}

export function Select({
  options,
  ...props
}: React.ComponentProps<"select"> & { options: Record<string, string> }) {
  return (
    <div className="relative min-w-0">
      <select {...props} className={`native-select ${props.className ?? ""}`}>
        {Object.entries(options).map(([key, value]) => (
          <option key={key} value={key}>
            {value}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden="true" className="native-select-chevron" />
    </div>
  );
}
export function Submit({
  children = "저장",
  ...props
}: React.ComponentProps<typeof Button>) {
  const navigation = useNavigation();
  return (
    <Button type="submit" disabled={navigation.state !== "idle"} {...props}>
      {navigation.state !== "idle" ? "처리 중…" : children}
    </Button>
  );
}
export function ActionError({ error }: { error?: string }) {
  const revalidator = useRevalidator();
  return error ? (
    <div
      role="alert"
      className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive mb-5"
    >
      {error}
      {(error.includes("로그인") || error.includes("인증 정보")) && (
        <a
          className="ml-2 underline"
          href="/login"
          target="_blank"
          rel="noreferrer"
        >
          새 탭에서 로그인
        </a>
      )}
      {(error.includes("로그인") || error.includes("인증 정보")) && (
        <button
          type="button"
          className="ml-3 underline"
          onClick={() => revalidator.revalidate()}
        >
          재인증 확인
        </button>
      )}
    </div>
  ) : null;
}
export function RecordForm({
  children,
  className,
  ...props
}: React.ComponentProps<typeof Form>) {
  const [dirty, setDirty] = useState(false);
  const nav = useNavigation();
  const ref = useRef(false);
  const actionResult = useActionData<{ error?: string }>();
  useEffect(() => {
    if (nav.state === "submitting") {
      ref.current = true;
    }
    if (nav.state === "idle" && ref.current) {
      setDirty(Boolean(actionResult?.error));
      ref.current = false;
    }
  }, [nav.state, actionResult]);
  useBeforeUnload((e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  useEffect(() => {
    const listener = (e: MouseEvent) => {
      const anchor = (e.target as Element)?.closest("a");
      if (
        dirty &&
        anchor &&
        anchor.target !== "_blank" &&
        anchor.href !== location.href &&
        !window.confirm("저장하지 않은 입력이 있습니다. 이동할까요?")
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("click", listener, true);
    return () => document.removeEventListener("click", listener, true);
  }, [dirty]);
  return (
    <Form
      method="post"
      {...props}
      className={className}
      onChange={() => setDirty(true)}
      onSubmit={() => {
        ref.current = true;
        setDirty(false);
      }}
    >
      {children}
    </Form>
  );
}
export function AccountFields({ account }: { account?: Account }) {
  return (
    <>
      <div className="form-grid">
        <Field label="계좌 이름">
          <Input
            name="alias"
            defaultValue={account?.alias}
            placeholder="예: 생활비 계좌"
            required
            maxLength={80}
          />
        </Field>
        <Field label="금융기관">
          <Input
            name="institution"
            defaultValue={account?.institution}
            placeholder="금융기관 이름"
            required
            maxLength={80}
          />
        </Field>
        <Field label="계좌 유형">
          <Select
            name="account_type"
            options={accountTypes}
            defaultValue={account?.account_type ?? "checking"}
            required
          />
        </Field>
        <Field label="관리 시작일" hint="기록을 시작하는 기준 날짜입니다.">
          <Input
            type="date"
            name="tracking_start_date"
            defaultValue={account?.tracking_start_date ?? today()}
            max={today()}
            required
          />
        </Field>
      </div>
      <Field label="메모 (선택)">
        <Textarea
          name="note"
          defaultValue={account?.note}
          maxLength={500}
          placeholder="이 계좌의 용도를 적어두세요."
        />
      </Field>
    </>
  );
}
export function Evidence({
  defaults,
}: {
  defaults?: {
    source?: string;
    precision?: string;
    rounding_unit?: string;
    source_note?: string;
  };
}) {
  const [precision, setPrecision] = useState(defaults?.precision ?? "exact");
  return (
    <details className="rounded-lg border p-3">
      <summary className="cursor-pointer text-xs text-muted-foreground">
        출처·정확도:{" "}
        {sources[(defaults?.source ?? "app") as keyof typeof sources]} ·{" "}
        {precisions[precision as keyof typeof precisions]} (변경 가능)
      </summary>
      <div className="form-grid pt-4">
        <Field label="출처">
          <Select
            name="source"
            options={sources}
            defaultValue={defaults?.source ?? "app"}
          />
        </Field>
        <Field label="정확도">
          <Select
            name="precision"
            options={precisions}
            value={precision}
            onChange={(e) => setPrecision(e.target.value)}
          />
        </Field>
        {precision === "rounded" && (
          <Field label="반올림 단위">
            <Input
              name="rounding_unit"
              defaultValue={defaults?.rounding_unit}
              placeholder="예: 만원"
              required
              maxLength={40}
            />
          </Field>
        )}
        <Field label="출처 설명 (선택)">
          <Input
            name="source_note"
            defaultValue={defaults?.source_note}
            maxLength={500}
          />
        </Field>
      </div>
    </details>
  );
}
