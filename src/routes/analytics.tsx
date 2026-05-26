import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
  LineChart, Line, Legend,
} from "recharts";
import {
  Users, Calendar, Activity, Target, TrendingDown, AlertTriangle,
  Home, Search, Building2, Heart, Lightbulb,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/tracking";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "분석 대시보드 · HomeDirect" },
      { name: "description", content: "사용자 행동 퍼널 · 전환율 · 검색 트렌드 분석" },
    ],
  }),
  component: AnalyticsPage,
});

// ── 상수 ──────────────────────────────────────────────────────────────────────

const DAY_OPTIONS = [7, 14, 30] as const;
type DayRange = (typeof DAY_OPTIONS)[number];

const FUNNEL = [
  { key: "home_view",     label: "홈 방문",   Icon: Home      },
  { key: "search_start",  label: "검색 시작",  Icon: Search    },
  { key: "property_view", label: "매물 조회",  Icon: Building2 },
  { key: "favorite_add",  label: "찜하기",    Icon: Heart     },
] as const;

const EVENT_LABELS: Record<string, string> = {
  home_view:              "홈 방문",
  search_start:           "검색 시작",
  search_filter_apply:    "필터 적용",
  search_price_filter:    "가격 필터",
  search_filter_reset:    "필터 초기화",
  search_load_more:       "더 보기",
  property_view:          "매물 조회",
  favorite_add:           "찜 추가",
  favorite_remove:        "찜 취소",
  market_view:            "시장분석 방문",
  market_tab_change:      "시장분석 탭 전환",
  market_district_select: "시장분석 자치구",
  analytics_view:         "분석 대시보드",
};

const PRICE_BUCKETS: { label: string; test: (max: number) => boolean }[] = [
  { label: "5억↓",   test: (m) => m <= 50000 },
  { label: "5~10억",  test: (m) => m > 50000  && m <= 100000 },
  { label: "10~15억", test: (m) => m > 100000 && m <= 150000 },
  { label: "15~20억", test: (m) => m > 150000 && m <= 200000 },
  { label: "20~25억", test: (m) => m > 200000 && m <= 250000 },
  { label: "25억+",   test: (m) => m > 250000 && m < 300000  },
  { label: "제한없음", test: (m) => m >= 300000 },
];

// ── 타입 ──────────────────────────────────────────────────────────────────────

type EventRow = {
  event_type: string;
  session_id: string;
  event_data: Record<string, unknown> | null;
  created_at: string;
};

// ── 페이지 ────────────────────────────────────────────────────────────────────

function AnalyticsPage() {
  const [days, setDays] = useState<DayRange>(14);
  useEffect(() => { trackEvent("analytics_view"); }, []);

  const { data: events, isLoading } = useQuery({
    queryKey: ["events_all", days],
    queryFn: async () => {
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
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

    // 이벤트 타입별 세션 집합 & 발생 횟수
    const sessionsBy: Record<string, Set<string>> = {};
    const countBy: Record<string, number> = {};
    for (const e of events) {
      if (!sessionsBy[e.event_type]) {
        sessionsBy[e.event_type] = new Set();
        countBy[e.event_type] = 0;
      }
      sessionsBy[e.event_type].add(e.session_id);
      countBy[e.event_type]++;
    }

    const allSessions = new Set(events.map((e) => e.session_id));
    const totalSessions = allSessions.size;
    const today = new Date().toISOString().slice(0, 10);
    const todaySessions = new Set(
      events.filter((e) => e.created_at.startsWith(today)).map((e) => e.session_id)
    ).size;
    const totalEvents = events.length;
    const avgEvents = totalSessions > 0 ? totalEvents / totalSessions : 0;

    // 4단계 퍼널
    const funnel = FUNNEL.map((step, i) => {
      const count = sessionsBy[step.key]?.size ?? 0;
      const prevCount =
        i === 0 ? count : (sessionsBy[FUNNEL[i - 1].key]?.size ?? 0);
      const conv = i === 0 ? 100 : prevCount > 0 ? (count / prevCount) * 100 : 0;
      return { ...step, count, conv, dropoff: i === 0 ? 0 : 100 - conv };
    });

    const homeCount = funnel[0].count;
    const favCount  = funnel[3].count;
    const overallConv = homeCount > 0 ? (favCount / homeCount) * 100 : 0;

    let bottleneckIdx = 1;
    for (let i = 2; i < funnel.length; i++) {
      if (funnel[i].dropoff > funnel[bottleneckIdx].dropoff) bottleneckIdx = i;
    }

    // 일별 트렌드
    const dayMap: Record<string, Record<string, Set<string>>> = {};
    for (const e of events) {
      const d = e.created_at.slice(0, 10);
      if (!dayMap[d]) dayMap[d] = {};
      if (!dayMap[d][e.event_type]) dayMap[d][e.event_type] = new Set();
      dayMap[d][e.event_type].add(e.session_id);
    }
    const daily = Object.keys(dayMap)
      .sort()
      .map((d) => ({
        date:     d.slice(5),
        home:     dayMap[d]["home_view"]?.size     ?? 0,
        search:   dayMap[d]["search_start"]?.size  ?? 0,
        property: dayMap[d]["property_view"]?.size ?? 0,
        favorite: dayMap[d]["favorite_add"]?.size  ?? 0,
        market:   dayMap[d]["market_view"]?.size   ?? 0,
      }));

    // 이벤트 분포
    const eventDist = Object.keys(countBy)
      .map((type) => ({
        type,
        label:    EVENT_LABELS[type] ?? type,
        count:    countBy[type],
        sessions: sessionsBy[type].size,
        pct:      totalEvents > 0 ? (countBy[type] / totalEvents) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // 검색 인기 자치구 (search_filter_apply.sigun_gu)
    const searchDistMap: Record<string, number> = {};
    for (const e of events) {
      if (e.event_type === "search_filter_apply") {
        const k = e.event_data?.sigun_gu as string | undefined;
        if (k && k !== "전체") searchDistMap[k] = (searchDistMap[k] || 0) + 1;
      }
    }
    const searchDistChart = Object.entries(searchDistMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // 시장분석 관심 자치구 (market_district_select.district)
    const marketDistMap: Record<string, number> = {};
    for (const e of events) {
      if (e.event_type === "market_district_select") {
        const k = e.event_data?.district as string | undefined;
        if (k) marketDistMap[k] = (marketDistMap[k] || 0) + 1;
      }
    }
    const marketDistChart = Object.entries(marketDistMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // 가격 선호도 (search_price_filter.price_max)
    const priceCounts: Record<string, number> = {};
    for (const e of events) {
      if (e.event_type === "search_price_filter") {
        const max = e.event_data?.price_max as number | undefined;
        if (max != null) {
          const bucket = PRICE_BUCKETS.find((b) => b.test(max));
          if (bucket) priceCounts[bucket.label] = (priceCounts[bucket.label] || 0) + 1;
        }
      }
    }
    const priceChart = PRICE_BUCKETS.map((b) => ({
      name:  b.label,
      count: priceCounts[b.label] || 0,
    })).filter((b) => b.count > 0);

    return {
      totalSessions, todaySessions, avgEvents, overallConv,
      funnel, bottleneckIdx,
      daily, eventDist,
      searchDistChart, marketDistChart, priceChart,
    };
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
        <div className="mx-auto max-w-2xl px-5 py-24 text-center">
          <h1 className="text-2xl font-bold text-[#191F28]">아직 데이터가 없습니다</h1>
          <p className="mt-3 text-sm text-[#8B95A1]">
            사용자가 사이트를 방문하면 자동으로 이벤트가 수집되어 분석됩니다.
          </p>
        </div>
      </div>
    );
  }

  const bottleneck = stats.funnel[stats.bottleneckIdx];

  return (
    <div className="min-h-screen bg-[#F2F4F6]">
      <SiteHeader />

      {/* 헤더 */}
      <div className="bg-white border-b border-[#E5E8EB]">
        <div className="mx-auto max-w-7xl px-5 py-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#191F28]">분석 대시보드</h1>
            <p className="mt-1 text-sm text-[#8B95A1]">
              사용자 행동 · 전환 퍼널 · 검색 트렌드
            </p>
          </div>
          <div className="flex gap-2">
            {DAY_OPTIONS.map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                  days === d
                    ? "bg-[#3182F6] text-white"
                    : "bg-[#F2F4F6] text-[#8B95A1] hover:bg-[#E5E8EB]"
                }`}
              >
                최근 {d}일
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-8 px-5 py-8">

        {/* KPI */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <KPI icon={Users}         label="총 세션"       value={stats.totalSessions.toLocaleString()} />
          <KPI icon={Calendar}      label="오늘 방문"      value={stats.todaySessions.toLocaleString()} />
          <KPI icon={Activity}      label="세션당 이벤트"  value={stats.avgEvents.toFixed(1)} />
          <KPI icon={Target}        label="홈→찜 전환율"  value={`${stats.overallConv.toFixed(1)}%`} />
          <KPI icon={AlertTriangle} label="최대 병목"      value={bottleneck.label} accent />
          <KPI icon={TrendingDown}  label="병목 이탈률"    value={`${bottleneck.dropoff.toFixed(1)}%`} accent />
        </div>

        {/* 전환 퍼널 */}
        <Section title="전환 퍼널" subtitle="홈 방문 → 찜하기 4단계 전환율">
          <div className="space-y-2">
            {stats.funnel.map((step, i) => {
              const max = stats.funnel[0].count || 1;
              const isBottleneck = i === stats.bottleneckIdx && i > 0;
              return (
                <div key={step.key}>
                  <div
                    className={`rounded-xl border p-4 ${
                      isBottleneck
                        ? "border-[#F04452]/40 bg-[#F04452]/5"
                        : "border-[#E5E8EB] bg-white"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-[#191F28]">
                        <span
                          className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs text-white ${
                            isBottleneck ? "bg-[#F04452]" : "bg-[#3182F6]"
                          }`}
                        >
                          {i + 1}
                        </span>
                        <step.Icon className="h-4 w-4 text-[#8B95A1]" />
                        {step.label}
                        {isBottleneck && (
                          <span className="rounded-md bg-[#F04452]/15 px-2 py-0.5 text-xs font-semibold text-[#F04452]">
                            병목
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-[#8B95A1] number-tabular">
                        <span className="font-semibold text-[#191F28]">
                          {step.count.toLocaleString()} 세션
                        </span>
                        {i > 0 && (
                          <span className={isBottleneck ? "font-semibold text-[#F04452]" : ""}>
                            전환 {step.conv.toFixed(1)}% · 이탈 {step.dropoff.toFixed(1)}%
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#F2F4F6]">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isBottleneck ? "bg-[#F04452]" : "bg-[#3182F6]"
                        }`}
                        style={{ width: `${(step.count / max) * 100}%` }}
                      />
                    </div>
                  </div>
                  {i < stats.funnel.length - 1 && (
                    <div className="ml-[18px] h-3 w-px border-l-2 border-dashed border-[#E5E8EB]" />
                  )}
                </div>
              );
            })}
          </div>
        </Section>

        {/* 일별 트렌드 + 이벤트 분포 */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="일별 트래픽 추이" subtitle={`최근 ${days}일 · 이벤트 유형별 고유 세션`}>
            <div className="h-72">
              <ResponsiveContainer>
                <LineChart data={stats.daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E8EB" />
                  <XAxis dataKey="date" stroke="#8B95A1" fontSize={12} tick={{ fill: "#8B95A1" }} />
                  <YAxis stroke="#8B95A1" fontSize={12} tick={{ fill: "#8B95A1" }} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: "1px solid #E5E8EB", fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="home"     stroke="#191F28" strokeWidth={2} name="홈"      dot={false} />
                  <Line type="monotone" dataKey="search"   stroke="#4D9BF8" strokeWidth={2} name="검색"    dot={false} />
                  <Line type="monotone" dataKey="property" stroke="#3182F6" strokeWidth={2} name="매물조회" dot={false} />
                  <Line type="monotone" dataKey="favorite" stroke="#F04452" strokeWidth={2} name="찜"      dot={false} />
                  <Line type="monotone" dataKey="market"   stroke="#10B981" strokeWidth={2} name="시장분석" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Section>

          <Section title="이벤트 분포" subtitle="이벤트 유형별 발생 건수 및 세션 수">
            <div className="overflow-y-auto" style={{ maxHeight: 288 }}>
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-[#E5E8EB]">
                    <th className="pb-2 text-left text-xs font-medium text-[#8B95A1]">이벤트</th>
                    <th className="pb-2 text-right text-xs font-medium text-[#8B95A1]">횟수</th>
                    <th className="pb-2 text-right text-xs font-medium text-[#8B95A1]">세션</th>
                    <th className="pb-2 pl-4 w-24"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F2F4F6]">
                  {stats.eventDist.map((ev) => (
                    <tr key={ev.type} className="hover:bg-[#F8F9FA]">
                      <td className="py-2">
                        <div className="font-medium text-[#191F28]">{ev.label}</div>
                        <div className="text-xs font-mono text-[#C9CDD2]">{ev.type}</div>
                      </td>
                      <td className="py-2 text-right number-tabular text-[#191F28]">
                        {ev.count.toLocaleString()}
                      </td>
                      <td className="py-2 text-right number-tabular text-[#8B95A1]">
                        {ev.sessions.toLocaleString()}
                      </td>
                      <td className="py-2 pl-4">
                        <div className="h-1.5 overflow-hidden rounded-full bg-[#F2F4F6]">
                          <div
                            className="h-full rounded-full bg-[#3182F6]"
                            style={{ width: `${ev.pct}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </div>

        {/* 자치구 분석 */}
        {(stats.searchDistChart.length > 0 || stats.marketDistChart.length > 0) && (
          <div className="grid gap-6 lg:grid-cols-2">
            {stats.searchDistChart.length > 0 && (
              <Section title="검색 인기 자치구" subtitle="필터 적용 횟수 기준 상위 10개">
                <div className="h-64">
                  <ResponsiveContainer>
                    <BarChart data={stats.searchDistChart} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E8EB" vertical={false} />
                      <XAxis dataKey="name" stroke="#8B95A1" fontSize={11} tick={{ fill: "#8B95A1" }} />
                      <YAxis stroke="#8B95A1" fontSize={11} tick={{ fill: "#8B95A1" }} />
                      <Tooltip
                        contentStyle={{ borderRadius: 12, border: "1px solid #E5E8EB", fontSize: 12 }}
                        formatter={(v: number) => [v, "검색 횟수"]}
                      />
                      <Bar dataKey="count" name="검색 횟수" radius={[4, 4, 0, 0]}>
                        {stats.searchDistChart.map((_, idx) => (
                          <Cell
                            key={idx}
                            fill="#3182F6"
                            fillOpacity={1 - (idx / Math.max(stats.searchDistChart.length - 1, 1)) * 0.5}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Section>
            )}

            {stats.marketDistChart.length > 0 ? (
              <Section title="시장분석 관심 자치구" subtitle="시장분석 탭에서 선택된 자치구 기준">
                <div className="h-64">
                  <ResponsiveContainer>
                    <BarChart data={stats.marketDistChart} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E8EB" vertical={false} />
                      <XAxis dataKey="name" stroke="#8B95A1" fontSize={11} tick={{ fill: "#8B95A1" }} />
                      <YAxis stroke="#8B95A1" fontSize={11} tick={{ fill: "#8B95A1" }} />
                      <Tooltip
                        contentStyle={{ borderRadius: 12, border: "1px solid #E5E8EB", fontSize: 12 }}
                        formatter={(v: number) => [v, "선택 횟수"]}
                      />
                      <Bar dataKey="count" fill="#10B981" name="선택 횟수" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Section>
            ) : (
              stats.searchDistChart.length > 0 && (
                <Section title="시장분석 관심 자치구" subtitle="시장분석 탭에서 선택된 자치구 기준">
                  <div className="flex h-64 items-center justify-center text-sm text-[#8B95A1]">
                    아직 수집된 데이터가 없습니다
                  </div>
                </Section>
              )
            )}
          </div>
        )}

        {/* 가격 선호도 */}
        {stats.priceChart.length > 0 && (
          <Section title="가격 선호도" subtitle="가격 슬라이더 상한가 설정 분포">
            <div className="h-52">
              <ResponsiveContainer>
                <BarChart data={stats.priceChart} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E8EB" vertical={false} />
                  <XAxis dataKey="name" stroke="#8B95A1" fontSize={12} tick={{ fill: "#8B95A1" }} />
                  <YAxis stroke="#8B95A1" fontSize={12} tick={{ fill: "#8B95A1" }} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: "1px solid #E5E8EB", fontSize: 12 }}
                    formatter={(v: number) => [v, "설정 횟수"]}
                  />
                  <Bar dataKey="count" fill="#93C5FD" radius={[4, 4, 0, 0]} name="설정 횟수" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Section>
        )}

        {/* 인사이트 */}
        <Section title="인사이트" subtitle="수집 데이터 기반 자동 진단">
          <div className="grid gap-4 md:grid-cols-2">
            <Insight
              title={`병목: ${bottleneck.label} (이탈 ${bottleneck.dropoff.toFixed(1)}%)`}
              body={`이전 단계 대비 ${bottleneck.dropoff.toFixed(1)}%가 다음 단계로 진행하지 않습니다. 해당 화면의 UX와 정보 접근성을 점검하세요.`}
              tone="danger"
            />
            <Insight
              title={`전체 전환율 ${stats.overallConv.toFixed(1)}% (목표 10%)`}
              body={
                stats.overallConv >= 10
                  ? `목표 달성! ${stats.totalSessions.toLocaleString()}개 세션 기준 양호합니다. 재방문 유도를 강화하세요.`
                  : `목표까지 ${(10 - stats.overallConv).toFixed(1)}%p 남았습니다. 매물 카드 노출 방식과 찜 버튼 접근성을 개선하세요.`
              }
              tone={stats.overallConv >= 10 ? "success" : "info"}
            />
            {stats.searchDistChart[0] && (
              <Insight
                title={`검색 1위 자치구: ${stats.searchDistChart[0].name}`}
                body={`${stats.searchDistChart[0].name} 검색이 가장 활발합니다. 해당 지역 매물을 우선 노출하면 전환율 개선에 효과적입니다.`}
                tone="info"
              />
            )}
            {stats.priceChart.length > 0 ? (
              <Insight
                title={`선호 가격대: ${stats.priceChart.sort((a, b) => b.count - a.count)[0]?.name ?? "-"}`}
                body={`가격 슬라이더 설정 기준으로 ${stats.priceChart.sort((a, b) => b.count - a.count)[0]?.name} 구간이 가장 많이 설정됩니다. 해당 가격대 매물 노출을 강화하세요.`}
                tone="info"
              />
            ) : (
              <Insight
                title="가격 선호도 데이터 수집 중"
                body="검색 페이지 가격 슬라이더 사용 데이터가 쌓이면 선호 가격대 인사이트가 표시됩니다."
                tone="info"
              />
            )}
          </div>
        </Section>

      </div>
    </div>
  );
}

// ── 공유 컴포넌트 ──────────────────────────────────────────────────────────────

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-5">
        <h2 className="text-xl font-bold text-[#191F28]">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-[#8B95A1]">{subtitle}</p>}
      </div>
      <div className="card p-6">{children}</div>
    </section>
  );
}

function KPI({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className={`card p-5 ${accent ? "border border-[#F04452]/30" : ""}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-[#8B95A1]">
          {label}
        </span>
        <Icon className={`h-4 w-4 ${accent ? "text-[#F04452]" : "text-[#8B95A1]"}`} />
      </div>
      <div className="mt-3 text-2xl font-bold text-[#191F28] number-tabular">{value}</div>
    </div>
  );
}

function Insight({
  title,
  body,
  tone,
}: {
  title: string;
  body: string;
  tone: "danger" | "info" | "success";
}) {
  const cls =
    tone === "danger"
      ? "border-[#F04452]/30 bg-[#F04452]/5"
      : tone === "success"
      ? "border-emerald-500/30 bg-emerald-500/5"
      : "border-[#3182F6]/30 bg-[#EFF6FF]";
  return (
    <div className={`rounded-xl border p-5 ${cls}`}>
      <div className="flex gap-3">
        <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-[#3182F6]" />
        <div>
          <h4 className="font-semibold text-[#191F28]">{title}</h4>
          <p className="mt-1 text-sm leading-relaxed text-[#8B95A1]">{body}</p>
        </div>
      </div>
    </div>
  );
}
