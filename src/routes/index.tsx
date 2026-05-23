import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowRight, Search, TrendingUp, Shield, BarChart3, LineChart } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/tracking";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "HomeDirect — 데이터로 보는 부동산" },
      { name: "description", content: "서울 주요 매물 실거래가와 사용자 행동 데이터를 한곳에서 확인하세요." },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  useEffect(() => {
    trackEvent("home_view");
  }, []);

  return (
    <div className="min-h-screen">
      <SiteHeader />

      {/* Hero */}
      <section className="hero-gradient relative overflow-hidden text-primary-foreground">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,oklch(0.55_0.12_248_/_0.35),transparent_50%)]" />
        <div className="relative mx-auto max-w-7xl px-6 py-24 md:py-32">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium uppercase tracking-wider text-white/80">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              실시간 실거래 데이터
            </span>
            <h1 className="mt-6 font-display text-5xl font-extrabold leading-[1.05] md:text-6xl">
              집을 찾는 가장<br />
              <span className="text-[color:var(--navy-soft)]">정직한 방법.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-white/75">
              서울 25개 자치구 아파트 실거래가 데이터를 한 곳에서. 중개인 없이, 데이터로 결정하세요.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Button asChild size="lg" className="bg-white text-primary hover:bg-white/90">
                <Link to="/search">
                  <Search className="mr-2 h-4 w-4" />
                  실거래 조회
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white">
                <Link to="/market">
                  <LineChart className="mr-2 h-4 w-4" />
                  시세 분석 보기
                </Link>
              </Button>
            </div>

            <dl className="mt-16 grid max-w-2xl grid-cols-3 gap-8 border-t border-white/10 pt-8">
              {[
                { v: "25", l: "서울 자치구" },
                { v: "MA", l: "이동평균 보조지표" },
                { v: "100%", l: "국토부 실거래 기반" },
              ].map((s) => (
                <div key={s.l}>
                  <dt className="font-display text-3xl font-bold tracking-tight number-tabular">{s.v}</dt>
                  <dd className="mt-1 text-sm text-white/60">{s.l}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* Value props */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <div className="mb-14 max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-accent">왜 HomeDirect 인가</p>
          <h2 className="mt-3 font-display text-4xl font-bold">데이터, 그 자체로 충분합니다.</h2>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { icon: TrendingUp, t: "실거래가 투명성", d: "국토부 신고가 기반 아파트 매매 실거래가를 그대로 조회합니다. 가격 왜곡 없음." },
            { icon: LineChart, t: "시세 분석 · 예측", d: "구별 평균·중위가·표준편차 기반 시세 범위와 MA 이동평균 보조지표를 제공합니다." },
            { icon: BarChart3, t: "행동 데이터 인사이트", d: "조회 → 필터 → 상세 → 찜 → 문의로 이어지는 퍼널을 실시간으로 추적합니다." },
          ].map((f) => (
            <div key={f.t} className="card-elevated group rounded-2xl border border-border bg-card p-7 transition hover:border-accent/40">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-secondary text-primary group-hover:bg-accent group-hover:text-accent-foreground">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 font-display text-lg font-semibold">{f.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border bg-secondary/40">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-6 py-16 md:flex-row md:items-center">
          <div>
            <h3 className="font-display text-2xl font-bold">지금 실거래 내역을 확인하세요.</h3>
            <p className="mt-2 text-muted-foreground">자치구, 가격, 거래 유형으로 빠르게 필터링.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/search">
                실거래 조회 <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/market">
                시세 분석 <LineChart className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-10 text-center text-sm text-muted-foreground">
        © 2026 HomeDirect · MVP demo
      </footer>
    </div>
  );
}
