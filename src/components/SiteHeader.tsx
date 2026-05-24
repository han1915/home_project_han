import { Link } from "@tanstack/react-router";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 bg-white border-b border-[#E5E8EB]">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-5">
        <Link to="/" className="flex items-center gap-2 font-bold text-[#191F28]">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#3182F6] text-white text-sm font-bold">H</span>
          <span className="text-base tracking-tight">HomeDirect</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm font-medium">
          {[
            { to: "/", label: "홈" },
            { to: "/search", label: "실거래 조회" },
            { to: "/market", label: "시세 분석" },
          ].map((l) => (
            <Link
              key={l.to}
              to={l.to}
              activeOptions={{ exact: true }}
              activeProps={{ className: "bg-[#EFF6FF] text-[#3182F6] font-semibold" }}
              className="rounded-lg px-3 py-2 text-[#8B95A1] transition hover:text-[#191F28] hover:bg-[#F2F4F6]"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
