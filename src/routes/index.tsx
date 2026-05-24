import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowRight, Search, BarChart3, LineChart } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/tracking";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "HomeDirect — 서울 아파트 실거래" },
      { name: "description", content: "국토부 공공데이터 기반 서울 아파트 실거래가 조회 서비스" },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  useEffect(() => { trackEvent("home_view"); }, []);
  return (
    <div className="min-h-screen bg-[#F2F4F6]">
      <SiteHeader />

      {/* Hero — blue gradient */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0c2461] via-[#1a56db] to-[#3182F6]">
        {/* Decorative circles */}
        <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute top-1/2 right-1/4 h-64 w-64 -translate-y-1/2 rounded-full bg-white/[0.04]" />

        <div className="relative mx-auto max-w-7xl px-5 py-20 md:py-28">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/20">
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
              국토교통부 공공데이터 기반
            </span>
            <h1 className="mt-5 font-display text-4xl font-extrabold leading-tight text-white md:text-5xl">
              서울 아파트 실거래,<br />
              <span className="text-[#93C5FD]">데이터로 확인하세요.</span>
            </h1>
            <p className="mt-5 text-lg text-white/80 leading-relaxed">
              2006년부터 현재까지 서울 25개 자치구 아파트 매매 실거래 내역을 한눈에.
              중개인 없이, 공공데이터로 직접 확인하세요.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="bg-white text-[#1a56db] hover:bg-[#EFF6FF] rounded-xl px-6 font-bold shadow-lg">
                <Link to="/search"><Search className="mr-2 h-4 w-4" />실거래 조회</Link>
              </Button>
              <Button asChild size="lg" className="bg-white/10 border border-white/25 text-white hover:bg-white/20 rounded-xl px-6 backdrop-blur-sm">
                <Link to="/market"><LineChart className="mr-2 h-4 w-4" />시세 분석</Link>
              </Button>
            </div>

            {/* Stats strip */}
            <dl className="mt-14 grid grid-cols-3 gap-6 border-t border-white/20 pt-8">
              {[
                { v: "25개", l: "서울 자치구" },
                { v: "2006~", l: "데이터 기간" },
                { v: "100%", l: "국토부 공공데이터" },
              ].map((s) => (
                <div key={s.l}>
                  <dt className="font-display text-2xl font-bold text-white number-tabular">{s.v}</dt>
                  <dd className="mt-1 text-sm text-white/65">{s.l}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-7xl px-5 py-16">
        <h2 className="text-2xl font-bold text-[#191F28] mb-8">주요 기능</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              icon: Search,
              t: "실거래 조회",
              d: "자치구·가격·면적으로 필터링해 원하는 매물의 실거래 이력을 빠르게 검색합니다.",
              to: "/search",
            },
            {
              icon: LineChart,
              t: "시세 분석",
              d: "서울 전체 및 자치구별 평균가·이동평균·가격 분포·층별 분석을 차트로 시각화합니다.",
              to: "/market",
            },
            {
              icon: BarChart3,
              t: "행동 분석",
              d: "방문 → 검색 → 조회로 이어지는 사용자 퍼널을 실시간으로 추적합니다.",
              to: "/analytics",
            },
          ].map((f) => (
            <Link key={f.t} to={f.to} className="card p-6 group hover:shadow-lg transition-shadow">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#3182F6] group-hover:bg-[#3182F6] group-hover:text-white transition-colors">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-semibold text-[#191F28]">{f.t}</h3>
              <p className="mt-2 text-sm text-[#8B95A1] leading-relaxed">{f.d}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-white border-t border-[#E5E8EB]">
        <div className="mx-auto max-w-7xl px-5 py-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <h3 className="font-bold text-xl text-[#191F28]">지금 바로 실거래 내역을 확인하세요.</h3>
            <p className="mt-1 text-[#8B95A1] text-sm">자치구·가격·면적으로 빠르게 필터링</p>
          </div>
          <Button asChild size="lg" className="bg-[#3182F6] hover:bg-[#1b6ef3] text-white rounded-xl">
            <Link to="/search">실거래 조회 시작 <ArrowRight className="ml-2 h-4 w-4" /></Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-[#E5E8EB] py-8 text-center text-sm text-[#8B95A1]">
        © 2026 HomeDirect · 국토교통부 실거래가 공공데이터 기반
      </footer>
    </div>
  );
}
