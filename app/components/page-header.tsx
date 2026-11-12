import type { ReactNode } from "react";
import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";

export function PageHeader({
  title,
  description,
  actions,
  badge,
  back,
}: {
  title: ReactNode;
  description: ReactNode;
  actions?: ReactNode;
  badge?: ReactNode;
  back?: { to: string; label: string };
}) {
  return (
    <header className="mb-6 space-y-4">
      {back && (
        <Link
          to={back.to}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {badge && <div className="mb-3 flex flex-wrap gap-2">{badge}</div>}
          <h1 className="page-title break-words">{title}</h1>
          <p className="helper mt-2 max-w-2xl">{description}</p>
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
