import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Users, Target, AlertTriangle,
  Home, Search, Building2, Heart, ArrowDown,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/tracking";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "퍼널 분석 · HomeDirect" },
      { name: "description", content: "사용자 전환 퍼널 분석 대시보드" },
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

const PAGE_MAP: Record<string, string> = {
  home_view:              "홈",
  search_start:           "검색/매물",
  search_filter_apply:    "검색/매물",
  search_price_filter:    "검색/매물",
  search_filter_reset:    "검색/매물",
  search_load_more:       "검색/매물",
  property_view:          "검색/매물",
  favorite_add:           "검색/매물",
  favorite_remove:        "검색/매물",
  market_view:            "시장분석",
  market_tab_change:      "시장분석",
  market_district_select: "시장분석",
  analytics_view:         "분석대시보드",
};

type EventRow = {
  event_type: string;
  session_id: string;
  event_data: Record<string, unknown> | null;
  created_at: string;
};

// ── 헬퍼 ──────────────────────────────────────────────────────────────────────

function convColor(pct: number) {
  if (pct >= 50) return "text-emerald-600";
  if (pct >= 25) return "text-amber-500";
  return "text-[#F04452]";
}

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

    const sessionsBy: Record<string, Set<string>> = {};
    const countBy: Record<string, number> = {};
    for (const e of events) {
      if (!sessionsBy[e.event_type]) { sessionsBy[e.event_type] = new Set(); countBy[e.event_type] = 0; }
      sessionsBy[e.event_type].add(e.session_id);
      countBy[e.event_type]++;
    }

    const totalSessions = new Set(events.map((e) => e.session_id)).size;
    const totalEvents   = events.length;

    // ── ② 퍼널 ────────────────────────────────────────────────────────────────
    const funnel = FUNNEL.map((step, i) => {
      const count     = sessionsBy[step.key]?.size ?? 0;
      const prevCount = i === 0 ? count : (sessionsBy[FUNNEL[i - 1].key]?.size ?? 0);
      const conv      = i === 0 ? 100 : prevCount > 0 ? (count / prevCount) * 100 : 0;
      return { ...step, count, conv, dropoff: i === 0 ? 0 : 100 - conv };
    });

    const homeCount   = funnel[0].count;
    const favCount    = funnel[3].count;
    const overallConv = homeCount > 0 ? (favCount / homeCount) * 100 : 0;

    let bottleneckIdx = 1;
    for (let i = 2; i < funnel.length; i++) {
      if (funnel[i].dropoff > funnel[bottleneckIdx].dropoff) bottleneckIdx = i;
    }

    // ── ③ 이탈 구간 ───────────────────────────────────────────────────────────
    const stepFlags: Record<string, { s1: number; s2: number; s3: number; s4: number }> = {};
    for (const e of events) {
      if (!stepFlags[e.session_id]) stepFlags[e.session_id] = { s1: 0, s2: 0, s3: 0, s4: 0 };
      if (e.event_type === "home_view")     stepFlags[e.session_id].s1 = 1;
      if (e.event_type === "search_start")  stepFlags[e.session_id].s2 = 1;
      if (e.event_type === "property_view") stepFlags[e.session_id].s3 = 1;
      if (e.event_type === "favorite_add")  stepFlags[e.session_id].s4 = 1;
    }
    const sf = Object.values(stepFlags);
    const searchCount = sessionsBy["search_start"]?.size ?? 0;
    const propCount   = sessionsBy["property_view"]?.size ?? 0;

    const dropoffs = [
      {
        label: "홈에서 이탈",
        sub:   "검색 페이지 미진입",
        count: sf.filter((s) => s.s1 && !s.s2).length,
        base:  homeCount,
      },
      {
        label: "검색 후 이탈",
        sub:   "매물 카드 미클릭",
        count: sf.filter((s) => s.s2 && !s.s3).length,
        base:  searchCount,
      },
      {
        label: "매물 보고 이탈",
        sub:   "찜하기 미완료",
        count: sf.filter((s) => s.s3 && !s.s4).length,
        base:  propCount,
      },
    ].map((d) => ({ ...d, pct: d.base > 0 ? (d.count / d.base) * 100 : 0 }));

    // 최대 이탈 구간
    const maxDropoff = dropoffs.reduce((mx, d) => (d.pct > mx.pct ? d : mx), dropoffs[0]);

    // ── ① 이벤트 분포 ─────────────────────────────────────────────────────────
    const eventDist = Object.keys(countBy)
      .map((type) => ({
        type,
        label:    EVENT_LABELS[type] ?? type,
        count:    countBy[type],
        sessions: sessionsBy[type].size,
        pct:      totalEvents > 0 ? (countBy[type] / totalEvents) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // ── ④ 페이지별 성과 ───────────────────────────────────────────────────────
    const pageMap: Record<string, { sessions: Set<string>; events: number; fav: Set<string> }> = {};
    for (const e of events) {
      const page = PAGE_MAP[e.event_type] ?? "기타";
      if (!pageMap[page]) pageMap[page] = { sessions: new Set(), events: 0, fav: new Set() };
      pageMap[page].sessions.add(e.session_id);
      pageMap[page].events++;
      if (e.event_type === "favorite_add") pageMap[page].fav.add(e.session_id);
    }
    const pagePerf = Object.entries(pageMap)
      .map(([page, { sessions, events: ev, fav }]) => ({
        page,
        sessions: sessions.size,
        events:   ev,
        fav:      fav.size,
        cvr:      sessions.size > 0 ? (fav.size / sessions.size) * 100 : 0,
      }))
      .sort((a, b) => b.sessions - a.sessions);

    return {
      totalSessions, overallConv,
      funnel, bottleneckIdx,
      dropoffs, maxDropoff,
      eventDist,
      pagePerf,
    };
  }, [events]);

  // ── 로딩 / 빈 상태 ──────────────────────────────────────────────────────────

  if (isLoading || !stats) {
    return (
      <div className="min-h-screen bg-[#F2F4F6]">
        <SiteHeader />
        <div className="flex items-center justify-center py-24 text-[#8B95A1]">
          집계 중...
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
            사용자가 방문하면 자동으로 집계됩니다.
          </p>
        </div>
      </div>
    );
  }

  const bottleneck    = stats.funnel[stats.bottleneckIdx];
  const maxFunnelCount = stats.funnel[0].count || 1;

  return (
    <div className="min-h-screen bg-[#F2F4F6]">
      <SiteHeader />

      {/* 헤더 */}
      <div className="bg-white border-b border-[#E5E8EB]">
        <div className="mx-auto max-w-5xl px-5 py-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#191F28]">퍼널 분석</h1>
            <p className="mt-1 text-sm text-[#8B95A1]">홈 방문 → 찜하기 4단계 전환 분석</p>
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

      <div className="mx-auto max-w-5xl space-y-8 px-5 py-8">

        {/* KPI */}
        <div className="grid grid-cols-3 gap-4">
          <KPI icon={Users}         label="총 세션"    value={stats.totalSessions.toLocaleString()} />
          <KPI icon={Target}        label="전체 CVR"   value={`${stats.overallConv.toFixed(1)}%`}
               highlight={stats.overallConv >= 10} />
          <KPI icon={AlertTriangle} label="최대 병목"  value={bottleneck.label}
               sub={`이탈 ${bottleneck.dropoff.toFixed(1)}%`} accent />
        </div>

        {/* ② 전환 퍼널 */}
        <Section label="②" title="전환 퍼널" subtitle="각 단계별 세션 수와 다음 단계 전환율">
          <div className="space-y-1">
            {stats.funnel.map((step, i) => {
              const isBottleneck = i === stats.bottleneckIdx && i > 0;
              const barWidth     = (step.count / maxFunnelCount) * 100;
              const nextConv     = i < stats.funnel.length - 1 ? stats.funnel[i + 1].conv : null;
              const dropCount    = i < stats.funnel.length - 1
                ? step.count - stats.funnel[i + 1].count
                : 0;

              return (
                <div key={step.key}>
                  <div className={`rounded-xl border p-4 transition ${
                    isBottleneck
                      ? "border-[#F04452]/40 bg-[#F04452]/5"
                      : "border-[#E5E8EB] bg-white"
                  }`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-[#191F28]">
                        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs text-white ${
                          isBottleneck ? "bg-[#F04452]" : "bg-[#3182F6]"
                        }`}>
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
                      <div className="text-right">
                        <span className="text-2xl font-bold number-tabular text-[#191F28]">
                          {step.count.toLocaleString()}
                        </span>
                        <span className="ml-1 text-sm text-[#8B95A1]">세션</span>
                        {i > 0 && (
                          <div className="text-xs text-[#8B95A1]">
                            전체의 {((step.count / maxFunnelCount) * 100).toFixed(0)}%
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="h-4 overflow-hidden rounded-full bg-[#F2F4F6]">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${
                          isBottleneck ? "bg-[#F04452]" : "bg-[#3182F6]"
                        }`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>

                  {/* 단계 사이 전환율 화살표 */}
                  {nextConv !== null && (
                    <div className="flex items-center justify-start gap-3 py-2 pl-7">
                      <ArrowDown className={`h-4 w-4 ${convColor(nextConv)}`} />
                      <span className={`text-sm font-bold ${convColor(nextConv)}`}>
                        전환 {nextConv.toFixed(1)}%
                      </span>
                      <span className="text-xs text-[#C9CDD2]">
                        · {dropCount.toLocaleString()}명 이탈
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <Insight
            tone={stats.overallConv >= 10 ? "success" : "info"}
            text={
              stats.overallConv >= 10
                ? `전체 CVR ${stats.overallConv.toFixed(1)}% — 목표(10%) 달성! 재방문 유도를 강화하세요.`
                : `전체 CVR ${stats.overallConv.toFixed(1)}% — 목표(10%)까지 ${(10 - stats.overallConv).toFixed(1)}%p. 홈 → 검색 진입 유도가 핵심입니다.`
            }
          />
        </Section>

        {/* ③ 이탈 구간 + ① 이벤트 분포 */}
        <div className="grid gap-6 lg:grid-cols-2">

          <Section label="③" title="이탈 구간" subtitle="각 단계에서 이탈한 세션 수와 비율">
            <div className="space-y-3">
              {stats.dropoffs.map((d) => {
                const isMax = d.label === stats.maxDropoff.label;
                return (
                  <div
                    key={d.label}
                    className={`flex items-center justify-between rounded-xl border p-4 ${
                      isMax
                        ? "border-[#F04452]/40 bg-[#F04452]/5"
                        : "border-[#E5E8EB] bg-white"
                    }`}
                  >
                    <div>
                      <div className="text-sm font-semibold text-[#191F28] flex items-center gap-2">
                        {d.label}
                        {isMax && (
                          <span className="rounded-md bg-[#F04452]/15 px-2 py-0.5 text-xs font-semibold text-[#F04452]">
                            최다
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[#8B95A1] mt-0.5">{d.sub}</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-2xl font-bold number-tabular ${
                        isMax ? "text-[#F04452]" : "text-[#191F28]"
                      }`}>
                        {d.count}명
                      </div>
                      <div className="text-xs text-[#8B95A1]">{d.pct.toFixed(0)}% 이탈</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <Insight
              tone="danger"
              text={`${stats.maxDropoff.label}이 가장 많습니다. ${
                stats.maxDropoff.label === "홈에서 이탈"
                  ? "홈 CTA 버튼 가시성과 서비스 가치 전달을 점검하세요."
                  : stats.maxDropoff.label === "검색 후 이탈"
                  ? "검색 결과 카드 정보 밀도와 정렬 방식을 개선해보세요."
                  : "매물 상세 정보와 찜 버튼 접근성을 개선해보세요."
              }`}
            />
          </Section>

          <Section label="①" title="이벤트 분포" subtitle="이벤트 유형별 발생 건수">
            <div className="space-y-2.5">
              {stats.eventDist.map((ev, i) => (
                <div key={ev.type} className="flex items-center gap-3">
                  <div className="w-5 shrink-0 text-right text-xs text-[#C9CDD2] font-mono">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <div className="min-w-0">
                        <span className="text-xs font-medium text-[#191F28] truncate block">
                          {ev.label}
                        </span>
                        <span className="text-[10px] font-mono text-[#C9CDD2]">{ev.type}</span>
                      </div>
                      <span className="text-xs font-semibold text-[#191F28] ml-2 shrink-0 number-tabular">
                        {ev.count.toLocaleString()}건
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[#F2F4F6]">
                      <div
                        className="h-full rounded-full bg-[#3182F6] transition-all duration-500"
                        style={{ width: `${ev.pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </div>

        {/* ④ 페이지별 성과 */}
        <Section label="④" title="페이지별 성과" subtitle="페이지 진입 세션 수와 찜하기 전환율">
          <div className="space-y-3">
            {stats.pagePerf.map((p) => (
              <div
                key={p.page}
                className="flex items-center gap-4 rounded-xl border border-[#E5E8EB] bg-white px-5 py-4"
              >
                <div className="w-28 shrink-0">
                  <div className="text-sm font-semibold text-[#191F28]">{p.page}</div>
                  <div className="text-xs text-[#8B95A1] mt-0.5 number-tabular">
                    {p.sessions.toLocaleString()} 세션 · {p.events.toLocaleString()} 이벤트
                  </div>
                </div>
                <div className="flex-1">
                  <div className="h-3 overflow-hidden rounded-full bg-[#F2F4F6]">
                    <div
                      className="h-full rounded-full bg-[#3182F6] transition-all duration-500"
                      style={{
                        width: `${(p.sessions / stats.totalSessions) * 100}%`,
                      }}
                    />
                  </div>
                </div>
                <div className="w-24 text-right shrink-0">
                  {p.cvr > 0 ? (
                    <span
                      className={`text-base font-bold number-tabular ${
                        p.cvr >= 10 ? "text-emerald-600" : "text-amber-500"
                      }`}
                    >
                      찜 {p.cvr.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-xs text-[#C9CDD2]">찜 없음</span>
                  )}
                  <div className="text-[10px] text-[#C9CDD2] mt-0.5 number-tabular">
                    CVR
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Insight
            tone="info"
            text={
              stats.pagePerf.find((p) => p.cvr > 0)
                ? `검색/매물 페이지 CVR ${
                    (stats.pagePerf.find((p) => p.page === "검색/매물")?.cvr ?? 0).toFixed(1)
                  }%로 양호. 홈에서 검색으로 더 많이 유입시키는 것이 핵심 전략입니다.`
                : "아직 찜하기 전환이 발생하지 않았습니다. 데이터가 쌓이면 분석됩니다."
            }
          />
        </Section>

      </div>
    </div>
  );
}

// ── 공유 컴포넌트 ──────────────────────────────────────────────────────────────

function Section({
  label,
  title,
  subtitle,
  children,
}: {
  label: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-4 flex items-baseline gap-2">
        <span className="text-sm font-bold text-[#3182F6]">{label}</span>
        <h2 className="text-lg font-bold text-[#191F28]">{title}</h2>
        {subtitle && <p className="text-sm text-[#8B95A1]">{subtitle}</p>}
      </div>
      <div className="card p-6">{children}</div>
    </section>
  );
}

function KPI({
  icon: Icon,
  label,
  value,
  sub,
  accent,
  highlight,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className={`card p-5 ${accent ? "border border-[#F04452]/30" : ""}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-[#8B95A1]">
          {label}
        </span>
        <Icon
          className={`h-4 w-4 ${accent ? "text-[#F04452]" : "text-[#8B95A1]"}`}
        />
      </div>
      <div
        className={`mt-3 text-2xl font-bold number-tabular ${
          accent
            ? "text-[#F04452]"
            : highlight
            ? "text-emerald-600"
            : "text-[#191F28]"
        }`}
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-[#8B95A1]">{sub}</div>}
    </div>
  );
}

function Insight({ text, tone }: { text: string; tone: "danger" | "info" | "success" }) {
  const cls =
    tone === "danger"
      ? "bg-[#FFF5F5] border-[#F04452]/20 text-[#F04452]"
      : tone === "success"
      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
      : "bg-[#EFF6FF] border-[#3182F6]/20 text-[#1a56db]";
  return (
    <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${cls}`}>
      💡 {text}
    </div>
  );
}
