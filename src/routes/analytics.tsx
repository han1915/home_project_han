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
      { name: "description", content: "방문 → 검색 → 매물 조회 → 찜하기로 이어지는 사용자 퍼널과 병목 구간." },
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

    let bottleneckIdx = 1;
    for (let i = 2; i < funnel.length; i++) {
      if (funnel[i].dropoff > funnel[bottleneckIdx].dropoff) bottleneckIdx = i;
    }

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
      favorite: dayMap[d].favorite_add?.size ?? 0,
    }));

    const dist: Record<string, number> = {};
    for (const e of events) {
      if (e.event_type === "search_filter_apply" && e.event_data?.sigun_gu) {
        const k = e.event_data.sigun_gu;
        if (k !== "전체") dist[k] = (dist[k] || 0) + 1;
      }
    }
    const districtChart = Object.entries(dist)
      .map(([k, v]) => ({ name: k, count: v }))
      .sort((a, b) => b.count - a.count);

    const totalSessions = new Set(events.map((e) => e.session_id)).size;
    const overallConv = funnel[0].count > 0 ? (funnel[funnel.length - 1].count / funnel[0].count) * 100 : 0;

    return { funnel, bottleneckIdx, daily, districtChart, totalSessions, overallConv };
  }, [events]);

  if (isLoading || !stats) {
    return (
      <div className="min-h-screen bg-[#F2F4F6]">
        <SiteHeader />
        <div className="flex items-center justify-center py-24 text-[#8B95A1]">
          분석 데이터 집계 중...
        </div>
      </div>
    );
  }

  if (stats.totalSessions === 0) {
    return (
      <div className="min-h-screen bg-[#F2F4F6]">
        <SiteHeader />
        <div className="mx-auto max-w-3xl px-5 py-24 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EFF6FF] px-3 py-1 text-xs font-semibold text-[#3182F6]">
            아직 데이터가 없습니다
          </span>
          <h1 className="mt-5 text-3xl font-bold text-[#191F28]">
            사용자 행동 이벤트가 누적되면 자동으로 분석됩니다
          </h1>
          <p className="mt-3 text-[#8B95A1]">
            홈 방문 → 검색 → 매물 조회 → 찜하기로 이어지는 실제 클릭이 쌓이면 단계별 퍼널, 병목 구간, 인사이트가 이 화면에 나타납니다.
          </p>
        </div>
      </div>
    );
  }

  const bottleneck = stats.funnel[stats.bottleneckIdx];

  return (
    <div className="min-h-screen bg-[#F2F4F6]">
      <SiteHeader />

      {/* Header */}
      <div className="bg-white border-b border-[#E5E8EB]">
        <div className="mx-auto max-w-7xl px-5 py-8">
          <h1 className="text-2xl font-bold text-[#191F28]">분석 대시보드</h1>
          <p className="mt-1 text-sm text-[#8B95A1]">
            최근 14일간 사용자 여정을 단계별로 분해하고, 가장 큰 이탈이 발생하는 구간을 자동으로 식별합니다.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-8 px-5 py-8">
        {/* KPI Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KPI label="총 세션" value={stats.totalSessions.toLocaleString()} icon={Users} />
          <KPI label="홈 → 찜 전환율" value={`${stats.overallConv.toFixed(1)}%`} icon={TrendingDown} />
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
                <div
                  key={f.step}
                  className={`rounded-xl border p-4 transition ${
                    isBottleneck
                      ? "border-[#F04452]/40 bg-[#F04452]/5"
                      : "border-[#E5E8EB] bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 font-medium text-[#191F28]">
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-[#3182F6] text-xs text-white">
                        {i + 1}
                      </span>
                      {f.step}
                      {isBottleneck && (
                        <span className="rounded-md bg-[#F04452]/15 px-2 py-0.5 text-xs font-semibold text-[#F04452]">
                          병목
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-[#8B95A1] number-tabular">
                      <span>{f.count.toLocaleString()} 세션</span>
                      {i > 0 && (
                        <span className={isBottleneck ? "font-semibold text-[#F04452]" : ""}>
                          전환 {f.conv.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#F2F4F6]">
                    <div
                      className={`h-full rounded-full transition-all ${
                        isBottleneck ? "bg-[#F04452]" : "bg-[#3182F6]"
                      }`}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        {/* Charts row */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="일별 트래픽 추이" subtitle="홈 방문, 매물 조회, 찜하기">
            <div className="h-72">
              <ResponsiveContainer>
                <LineChart data={stats.daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E8EB" />
                  <XAxis dataKey="date" stroke="#8B95A1" fontSize={12} tick={{ fill: "#8B95A1" }} />
                  <YAxis stroke="#8B95A1" fontSize={12} tick={{ fill: "#8B95A1" }} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid #E5E8EB",
                      fontSize: 12,
                      boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="home" stroke="#191F28" strokeWidth={2} name="홈 방문" dot={false} />
                  <Line type="monotone" dataKey="view" stroke="#3182F6" strokeWidth={2} name="매물 조회" dot={false} />
                  <Line type="monotone" dataKey="favorite" stroke="#F04452" strokeWidth={2} name="찜하기" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Section>

          <Section title="인기 검색 자치구" subtitle="필터 적용 횟수 기준">
            <div className="h-72">
              <ResponsiveContainer>
                <BarChart data={stats.districtChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E8EB" />
                  <XAxis dataKey="name" stroke="#8B95A1" fontSize={12} tick={{ fill: "#8B95A1" }} />
                  <YAxis stroke="#8B95A1" fontSize={12} tick={{ fill: "#8B95A1" }} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid #E5E8EB",
                      fontSize: 12,
                      boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
                    }}
                  />
                  <Bar dataKey="count" fill="#3182F6" radius={[6, 6, 0, 0]} name="검색 횟수" />
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
              title={`전체 찜 전환 ${stats.overallConv.toFixed(1)}%`}
              body={`${stats.totalSessions.toLocaleString()}개 세션 중 찜하기까지 도달한 비율입니다. 매물 카드 노출 및 찜 버튼 접근성을 점검하세요.`}
              tone="info"
            />
            <InsightCard
              title={`상위 자치구: ${stats.districtChart[0]?.name ?? "-"}`}
              body="해당 지역 매물 노출을 우선순위로 두고, 추천 모듈에 가중치를 부여하는 것을 고려하세요."
              tone="info"
            />
            <InsightCard
              title={`찜하기 ${stats.funnel[4].count}건 달성`}
              body="찜한 매물에 대한 가격 변동 알림이나 유사 매물 추천 기능을 추가하면 재방문율을 끌어올릴 수 있습니다."
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
        <h2 className="text-xl font-bold text-[#191F28]">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-[#8B95A1]">{subtitle}</p>}
      </div>
      <div className="card p-6">{children}</div>
    </section>
  );
}

function KPI({ label, value, icon: Icon, accent }: { label: string; value: string; icon: any; accent?: boolean }) {
  return (
    <div className={`card p-5 ${accent ? "border border-[#F04452]/30" : ""}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-[#8B95A1]">{label}</span>
        <Icon className={`h-4 w-4 ${accent ? "text-[#F04452]" : "text-[#8B95A1]"}`} />
      </div>
      <div className="mt-3 text-2xl font-bold text-[#191F28] number-tabular">{value}</div>
    </div>
  );
}

function InsightCard({ title, body, tone }: { title: string; body: string; tone: "danger" | "info" | "success" }) {
  const toneCls =
    tone === "danger"
      ? "border-[#F04452]/30 bg-[#F04452]/5"
      : tone === "success"
      ? "border-emerald-500/30 bg-emerald-500/5"
      : "border-[#3182F6]/30 bg-[#EFF6FF]";
  return (
    <div className={`rounded-xl border p-5 ${toneCls}`}>
      <div className="flex items-start gap-3">
        <Lightbulb className="mt-0.5 h-5 w-5 text-[#3182F6]" />
        <div>
          <h4 className="font-semibold text-[#191F28]">{title}</h4>
          <p className="mt-1 text-sm leading-relaxed text-[#8B95A1]">{body}</p>
        </div>
      </div>
    </div>
  );
}
