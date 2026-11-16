import { useEffect, useState } from "react";
import { useRevalidator } from "react-router";
import { invalidatePages } from "~/lib/page-cache";
import { Button } from "~/components/ui/button";
import { RefreshCw } from "lucide-react";
export function RefreshData() {
  const revalidator = useRevalidator();
  const [updated, setUpdated] = useState("");
  useEffect(() => {
    if (revalidator.state === "idle")
      setUpdated(
        new Date().toLocaleTimeString("ko-KR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
  }, [revalidator.state]);
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">
        {updated && updated + " 조회"}
      </span>
      <Button
        variant="outline"
        size="icon"
        aria-label="최신 데이터 새로고침"
        disabled={revalidator.state !== "idle"}
        onClick={() => {
          invalidatePages();
          revalidator.revalidate();
        }}
      >
        <RefreshCw
          className={revalidator.state !== "idle" ? "animate-spin" : ""}
        />
      </Button>
    </div>
  );
}
