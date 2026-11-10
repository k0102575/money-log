import { useEffect, useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
export function ThemeToggle() {
  const [theme, setTheme] = useState("system");
  useEffect(() => {
    setTheme(localStorage.getItem("money-theme") ?? "system");
  }, []);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const preference = localStorage.getItem("money-theme") ?? "system";
      document.documentElement.classList.toggle(
        "dark",
        preference === "dark" || (preference === "system" && media.matches),
      );
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  return (
    <div className="flex rounded-md border bg-card p-1" aria-label="화면 테마">
      {[
        ["light", "라이트", Sun],
        ["dark", "다크", Moon],
        ["system", "시스템", Monitor],
      ].map(([value, label, Icon]) => {
        const Component = Icon as typeof Sun;
        return (
          <button
            key={value as string}
            type="button"
            aria-label={`${label} 모드`}
            title={`${label} 모드`}
            aria-pressed={theme === value}
            onClick={() => {
              localStorage.setItem("money-theme", value as string);
              setTheme(value as string);
            }}
            className={`rounded p-1.5 transition-colors ${theme === value ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Component className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
}
