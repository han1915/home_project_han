import { Link } from "@tanstack/react-router";
import { Building2 } from "lucide-react";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2 font-display font-bold text-primary">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Building2 className="h-5 w-5" />
          </span>
          <span className="text-lg tracking-tight">HomeDirect</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm font-medium">
          {[
            { to: "/", label: "홈" },
            { to: "/search", label: "실거래 조회" },
            { to: "/market", label: "시세 분석" },
            { to: "/analytics", label: "분석 대시보드" },
          ].map((l) => (
            <Link
              key={l.to}
              to={l.to}
              activeOptions={{ exact: true }}
              activeProps={{ className: "bg-secondary text-primary" }}
              className="rounded-md px-3 py-2 text-muted-foreground transition hover:text-primary"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
