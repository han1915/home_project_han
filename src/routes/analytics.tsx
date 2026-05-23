import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, Legend,
} from "recharts";
import { TrendingDown, AlertTriangle, Lightbulb, Users } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/tracking";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "분석 대시보드 · HomeDirect" },
      { name: "description", content: "방문 → 검색 → 매물 조회 → 찜 → 문의로 이어지는 사용자 퍼널과 병목 구간." },
    ],
  }),
  component: AnalyticsPage,
});

const FUNNEL_STEPS = [
  { key: "home_view", label: "홈 방문" },
  { key: "search_start", label: "검색 시작" },
  { key: "search_filter_apply", label: "필터 적용" },
  { key: "property_view", label: "매물 조회" },
  { key: "favorite_add", label: "찜하기" },
  { key: "contact_click", label: "문의 클릭" },
] as const;

type EventRow = { event_type: string; session_id: string; event_data: any; created_at: string };

function AnalyticsPage() {
  useEffect(() => { trackEvent("analytics_view"); }, []);

  const { data: events, isLoading } = useQuery({
    queryKey: ["events_all"],
    queryFn: async () => {
      const since = new Date(Date.now() - 14 * 86400_000).toISOString();
      const { data, error } = await supabase
        .from("user_events")
        .select("event_type, session_id, event_data, created_at")
        .gte("created_at", since)
        .limit(10000);
      if (error) throw error;
      return data as EventRow[];
    },
  });

  const stats = useMemo(() => {
    if (!events) return null;
    const sessionsBy: Record<string, Set<string>> = {};
    FUNNEL_STEPS.forEach((s) => (sessionsBy[s.key] = new Set()));
    for (const e of events) {
      if (sessionsBy[e.event_type]) sessionsBy[e.event_type].add(e.session_id);
    }
    const funnel = FUNNEL_STEPS.map((s, i) => {
      const count = sessionsBy[s.key].size;
      const prev = i === 0 ? count : sessionsBy[FUNNEL_STEPS[i - 1].key].size;
      const conv = prev > 0 ? (count / prev) * 100 : 0;
      return { step: s.label, count, conv: i === 0 ? 100 : conv, dropoff: i === 0 ? 0 : 100 - conv };
    });

    // bottleneck: largest drop between consecutive steps (excluding first)
    let bottleneckIdx = 1;
    for (let i = 2; i < funnel.length; i++) {
      if (funnel[i].dropoff > funnel[bottleneckIdx].dropoff) bottleneckIdx = i;
    }

    // daily series
    const dayMap: Record<string, Record<string, Set<string>>> = {};
    for (const e of events) {
      const d = e.created_at.slice(0, 10);
      dayMap[d] = dayMap[d] || {};
      dayMap[d][e.event_type] = dayMap[d][e.event_type] || new Set();
      dayMap[d][e.event_type].add(e.session_id);
    }
    const daily = Object.keys(dayMap).sort().map((d) => ({
      date: d.slice(5),
      home: dayMap[d].home_view?.size ?? 0,
      view: dayMap[d].property_view?.size ?? 0,
      contact: dayMap[d].contact_click?.size ?? 0,
    }));

    // district filter popularity
    const dist: Record<string, number> = {};
    for (const e of events) {
      if (e.event_type === "search_filter_apply" && e.event_data?.sigun_gu) {
        const k = e.event_data.sigun_gu;
        if (k !== "전체") dist[k] = (dist[k] || 0) + 1;
      }
    }
    const districtChart = Object.entries(dist).map(([k, v]) => ({ name: k, count: v })).sort((a, b) => b.count - a.count);

    const totalSessions = new Set(events.map((e) => e.session_id)).size;
    const overallConv = funnel[0].count > 0 ? (funnel[funnel.length - 1].count / funnel[0].count) * 100 : 0;

    return { funnel, bottleneckIdx, daily, districtChart, totalSessions, overallConv };
  }, [events]);

  if (isLoading || !stats) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="grid place-items-center py-24 text-muted-foreground">분석 데이터 집계 중...</div>
      </div>
    );
  }

  if (stats.totalSessions === 0) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="mx-auto max-w-3xl px-6 py-24 text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-accent">아직 데이터가 없습니다</p>
          <h1 className="mt-3 font-display text-3xl font-bold">사용자 행동 이벤트가 누적되면 자동으로 분석됩니다</h1>
          <p className="mt-3 text-muted-foreground">
            홈 방문 → 검색 → 매물 조회 → 찜 → 문의로 이어지는 실제 클릭이 쌓이면 단계별 퍼널, 병목 구간, 인사이트가 이 화면에 나타납니다.
            먼저 매물 검색 화면을 둘러보거나 관리자 페이지에서 실거래 데이터를 적재해 보세요.
          </p>
        </div>
      </div>
    );
  }

  const bottleneck = stats.funnel[stats.bottleneckIdx];

  return (
    <div className="min-h-screen">
      <SiteHeader />

      {/* Header */}
      <div className="border-b border-border page-section-header">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <p className="text-sm font-semibold uppercase tracking-wider text-accent">사용자 행동 분석</p>
          <h1 className="mt-2 font-display text-4xl font-bold">퍼널 · 병목 · 인사이트</h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">최근 14일간 사용자 여정을 단계별로 분해하고, 가장 큰 이탈이 발생하는 구간을 자동으로 식별합니다.</p>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-10 px-6 py-10">
        {/* KPI cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KPI label="총 세션" value={stats.totalSessions.toLocaleString()} icon={Users} />
          <KPI label="홈 → 문의 전환율" value={`${stats.overallConv.toFixed(1)}%`} icon={TrendingDown} />
          <KPI label="최대 병목 구간" value={bottleneck.step} icon={AlertTriangle} accent />
          <KPI label="병목 이탈률" value={`${bottleneck.dropoff.toFixed(1)}%`} icon={TrendingDown} accent />
        </div>

        {/* Funnel */}
        <Section title="단계별 퍼널" subtitle="단계 간 고유 세션 수와 전환율">
          <div className="space-y-3">
            {stats.funnel.map((f, i) => {
              const max = stats.funnel[0].count || 1;
              const width = (f.count / max) * 100;
              const isBottleneck = i === stats.bottleneckIdx;
              return (
                <div key={f.step} className={`rounded-xl border p-4 transition ${isBottleneck ? "border-destructive/40 bg-destructive/5" : "border-border bg-card"}`}>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 font-medium">
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-xs text-primary-foreground">{i + 1}</span>
                      {f.step}
                      {isBottleneck && <span className="rounded-md bg-destructive/15 px-2 py-0.5 text-xs font-semibold text-destructive">병목</span>}
                    </div>
                    <div className="flex items-center gap-4 text-muted-foreground number-tabular">
                      <span>{f.count.toLocaleString()} 세션</span>
                      {i > 0 && <span className={isBottleneck ? "font-semibold text-destructive" : ""}>전환 {f.conv.toFixed(1)}%</span>}
                    </div>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-all ${isBottleneck ? "bg-destructive" : "bg-accent"}`}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        {/* Daily trend + district chart */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="일별 트래픽 추이" subtitle="홈 방문, 매물 조회, 문의 클릭">
            <div className="h-72">
              <ResponsiveContainer>
                <LineChart data={stats.daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.91 0.012 250)" />
                  <XAxis dataKey="date" stroke="oklch(0.48 0.03 255)" fontSize={12} />
                  <YAxis stroke="oklch(0.48 0.03 255)" fontSize={12} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid oklch(0.91 0.012 250)" }} />
                  <Legend />
                  <Line type="monotone" dataKey="home" stroke="oklch(0.22 0.07 260)" strokeWidth={2} name="홈 방문" />
                  <Line type="monotone" dataKey="view" stroke="oklch(0.55 0.12 248)" strokeWidth={2} name="매물 조회" />
                  <Line type="monotone" dataKey="contact" stroke="oklch(0.58 0.22 25)" strokeWidth={2} name="문의" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Section>

          <Section title="인기 검색 자치구" subtitle="필터 적용 횟수 기준">
            <div className="h-72">
              <ResponsiveContainer>
                <BarChart data={stats.districtChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.91 0.012 250)" />
                  <XAxis dataKey="name" stroke="oklch(0.48 0.03 255)" fontSize={12} />
                  <YAxis stroke="oklch(0.48 0.03 255)" fontSize={12} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid oklch(0.91 0.012 250)" }} />
                  <Bar dataKey="count" fill="oklch(0.34 0.08 258)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Section>
        </div>

        {/* Insights */}
        <Section title="자동 도출 인사이트" subtitle="데이터 기반 액션 아이템">
          <div className="grid gap-4 md:grid-cols-2">
            <InsightCard
              title={`병목: ${bottleneck.step} 단계`}
              body={`이전 단계 대비 ${bottleneck.dropoff.toFixed(1)}%가 이탈합니다. 해당 화면의 진입 마찰(로딩 속도, 정보 부족, CTA 위치)을 우선 점검하세요.`}
              tone="danger"
            />
            <InsightCard
              title={`전체 전환 ${stats.overallConv.toFixed(1)}%`}
              body={`${stats.totalSessions.toLocaleString()}개 세션 중 최종 문의까지 도달한 비율입니다. 업계 평균 1-3% 대비 위치를 점검하세요.`}
              tone="info"
            />
            <InsightCard
              title={`상위 자치구: ${stats.districtChart[0]?.name ?? "-"}`}
              body={`해당 지역 매물 노출을 우선순위로 두고, 추천 모듈에 가중치를 부여하는 것을 고려하세요.`}
              tone="info"
            />
            <InsightCard
              title="찜 → 문의 전환 점검"
              body={`찜 ${stats.funnel[4].count}건 대비 문의 ${stats.funnel[5].count}건. 찜한 매물에 대한 알림/리마인더 도입 시 전환을 끌어올릴 여지가 있습니다.`}
              tone="success"
            />
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-5">
        <h2 className="font-display text-xl font-bold">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="card-elevated rounded-2xl border border-border bg-card p-6">{children}</div>
    </section>
  );
}

function KPI({ label, value, icon: Icon, accent }: { label: string; value: string; icon: any; accent?: boolean }) {
  return (
    <div className={`card-elevated rounded-2xl border bg-card p-5 ${accent ? "border-accent/40" : "border-border"}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        <Icon className={`h-4 w-4 ${accent ? "text-accent" : "text-muted-foreground"}`} />
      </div>
      <div className="mt-3 font-display text-2xl font-bold number-tabular">{value}</div>
    </div>
  );
}

function InsightCard({ title, body, tone }: { title: string; body: string; tone: "danger" | "info" | "success" }) {
  const toneCls =
    tone === "danger"
      ? "border-destructive/30 bg-destructive/5"
      : tone === "success"
      ? "border-emerald-500/30 bg-emerald-500/5"
      : "border-accent/30 bg-accent/5";
  return (
    <div className={`rounded-xl border p-5 ${toneCls}`}>
      <div className="flex items-start gap-3">
        <Lightbulb className="mt-0.5 h-5 w-5 text-accent" />
        <div>
          <h4 className="font-semibold">{title}</h4>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
        </div>
      </div>
    </div>
  );
}
