import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ComposedChart, Bar, Line, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, Legend, BarChart, Cell,
} from "recharts";
import { Activity, BarChart2, TrendingUp, TrendingDown, Minus, Home } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/tracking";

export const Route = createFileRoute("/market")({
  head: () => ({
    meta: [
      { title: "시세 분석 · HomeDirect" },
      { name: "description", content: "서울 아파트 구별 시세 분석, 전년 동월 비교, 월별 추세, 자치구 상세 분석" },
    ],
  }),
  component: MarketPage,
});

const AVAILABLE_YEARS = [2025, 2024, 2023, 2022];

const SEOUL_DISTRICTS = [
  "강남구","강동구","강북구","강서구","관악구",
  "광진구","구로구","금천구","노원구","도봉구",
  "동대문구","동작구","마포구","서대문구","서초구",
  "성동구","성북구","송파구","양천구","영등포구",
  "용산구","은평구","종로구","중구","중랑구",
];

const PRICE_BUCKETS = [
  { label: "~3억", min: 0, max: 30000 },
  { label: "3~5억", min: 30000, max: 50000 },
  { label: "5~10억", min: 50000, max: 100000 },
  { label: "10~15억", min: 100000, max: 150000 },
  { label: "15~20억", min: 150000, max: 200000 },
  { label: "20~30억", min: 200000, max: 300000 },
  { label: "30억~", min: 300000, max: Infinity },
];

const BAR_COLORS = ["#BFDBFE","#93C5FD","#60A5FA","#3B82F6","#2563EB","#1D4ED8","#1E40AF"];

type AptSummary = {
  id: string;
  sigun_gu: string | null;
  price_man_won: number | null;
  area_sqm: number | null;
  contract_year: number | null;
  contract_month: number | null;
};

type AptDetail = AptSummary & {
  apt_name: string | null;
  floor: number | null;
};

function fmtPrice(p: number | null | undefined) {
  if (!p) return "-";
  const eok = Math.floor(p / 10000);
  const man = p % 10000;
  if (eok > 0 && man > 0) return `${eok}억 ${man.toLocaleString()}만`;
  if (eok > 0) return `${eok}억`;
  return `${man.toLocaleString()}만`;
}

function calcStats(prices: number[]) {
  if (!prices.length) return null;
  const n = prices.length;
  const mean = prices.reduce((s, v) => s + v, 0) / n;
  const variance = prices.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  const sorted = [...prices].sort((a, b) => a - b);
  const median = n % 2 === 0
    ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
    : sorted[Math.floor(n / 2)];
  return {
    mean: Math.round(mean), median: Math.round(median), std: Math.round(std),
    lower: Math.round(Math.max(0, mean - std)), upper: Math.round(mean + std),
    min: sorted[0], max: sorted[n - 1], count: n,
  };
}

function movingAvg(values: (number | null)[], period: number): (number | null)[] {
  return values.map((_, i) => {
    const window = values.slice(Math.max(0, i - period + 1), i + 1)
      .filter((v): v is number => v !== null);
    if (window.length < period) return null;
    return Math.round(window.reduce((s, v) => s + v, 0) / window.length);
  });
}

// ─── MarketPage ──────────────────────────────────────────────────────────────

function MarketPage() {
  const [activeTab, setActiveTab] = useState<"seoul" | "district">("seoul");
  const [selectedYear, setSelectedYear] = useState(2025);
  const [district, setDistrict] = useState("강남구");

  useEffect(() => { trackEvent("market_view"); }, []);

  // Seoul: fetch current year + prev year for YoY comparison
  const { data: rawData, isLoading: seoulLoading } = useQuery({
    queryKey: ["market_seoul", selectedYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("apartments")
        .select("id,sigun_gu,price_man_won,area_sqm,contract_year,contract_month")
        .gte("contract_year", selectedYear - 1)
        .lte("contract_year", selectedYear)
        .order("contract_year", { ascending: false })
        .order("contract_month", { ascending: false })
        .limit(100000);
      if (error) throw error;
      return data as AptSummary[];
    },
    staleTime: 10 * 60 * 1000,
  });

  // District: fetch current year + prev year
  const { data: distData, isLoading: distLoading } = useQuery({
    queryKey: ["market_district", district, selectedYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("apartments")
        .select("id,apt_name,sigun_gu,price_man_won,area_sqm,floor,contract_year,contract_month")
        .eq("sigun_gu", district)
        .gte("contract_year", selectedYear - 1)
        .lte("contract_year", selectedYear)
        .order("contract_year", { ascending: false })
        .order("contract_month", { ascending: false })
        .limit(20000);
      if (error) throw error;
      return data as AptDetail[];
    },
    enabled: activeTab === "district",
    staleTime: 5 * 60 * 1000,
  });

  if (seoulLoading) {
    return (
      <div className="min-h-screen bg-[#F2F4F6]">
        <SiteHeader />
        <div className="flex items-center justify-center py-24 text-[#8B95A1]">시세 데이터 집계 중...</div>
      </div>
    );
  }

  if (!rawData?.length) {
    return (
      <div className="min-h-screen bg-[#F2F4F6]">
        <SiteHeader />
        <div className="mx-auto max-w-3xl px-5 py-24 text-center">
          <h1 className="mt-5 text-3xl font-bold text-[#191F28]">실거래 데이터를 먼저 적재해 주세요</h1>
          <p className="mt-3 text-[#8B95A1]">scripts/seed.mjs 로 국토부 실거래가 데이터를 가져오면 시세 분석이 시작됩니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F2F4F6]">
      <SiteHeader />

      {/* Page Header */}
      <div className="bg-white border-b border-[#E5E8EB]">
        <div className="mx-auto max-w-7xl px-5 py-6">
          <h1 className="text-2xl font-bold text-[#191F28]">시세 분석</h1>
          <p className="mt-1 text-sm text-[#8B95A1]">
            서울 25개 자치구 시세 비교 · 전년 동월 비교 · 자치구별 상세 분석
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-5">
            {/* Tab switcher */}
            <div className="inline-flex gap-1 rounded-xl bg-[#F2F4F6] p-1">
              {(["seoul", "district"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setActiveTab(t)}
                  className={`rounded-lg px-5 py-2 text-sm font-semibold transition ${
                    activeTab === t ? "bg-white text-[#191F28] shadow-sm" : "text-[#8B95A1] hover:text-[#191F28]"
                  }`}
                >
                  {t === "seoul" ? "서울 전체" : "자치구 분석"}
                </button>
              ))}
            </div>
            {/* Year selector — shared between both tabs */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#8B95A1]">기준 년도</span>
              <div className="flex gap-1.5">
                {AVAILABLE_YEARS.map(y => (
                  <button
                    key={y}
                    onClick={() => setSelectedYear(y)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                      selectedYear === y
                        ? "border-[#3182F6] bg-[#3182F6] text-white"
                        : "border-[#E5E8EB] bg-white text-[#8B95A1] hover:border-[#3182F6] hover:text-[#3182F6]"
                    }`}
                  >
                    {y}년
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {activeTab === "seoul" ? (
        <SeoulTab
          rawData={rawData}
          selectedYear={selectedYear}
          onDistrictClick={(d) => { setDistrict(d); setActiveTab("district"); }}
        />
      ) : (
        <DistrictTab
          distData={distData ?? []}
          isLoading={distLoading}
          district={district}
          setDistrict={setDistrict}
          selectedYear={selectedYear}
        />
      )}
    </div>
  );
}

// ─── Seoul Tab ───────────────────────────────────────────────────────────────

function SeoulTab({ rawData, selectedYear, onDistrictClick }: {
  rawData: AptSummary[];
  selectedYear: number;
  onDistrictClick: (district: string) => void;
}) {
  const curData = useMemo(() => rawData.filter(p => p.contract_year === selectedYear), [rawData, selectedYear]);
  const prevData = useMemo(() => rawData.filter(p => p.contract_year === selectedYear - 1), [rawData, selectedYear]);
  const prevYearLabel = selectedYear - 1;

  // 12-month chart data with YoY and MA3
  const chartData = useMemo(() => {
    const rows = Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const cur = curData.filter(p => p.contract_month === month && p.price_man_won).map(p => p.price_man_won!);
      const prev = prevData.filter(p => p.contract_month === month && p.price_man_won).map(p => p.price_man_won!);
      const avg = cur.length ? Math.round(cur.reduce((s, v) => s + v, 0) / cur.length) : null;
      const prevAvg = prev.length ? Math.round(prev.reduce((s, v) => s + v, 0) / prev.length) : null;
      return { month: `${month}월`, avgPrice: avg, prevYearPrice: prevAvg, count: cur.length || null };
    });
    const ma3 = movingAvg(rows.map(r => r.avgPrice), 3);
    return rows.map((r, i) => ({ ...r, ma3: ma3[i] }));
  }, [curData, prevData]);

  // District stats (current year)
  const districtStats = useMemo(() => {
    const grouped: Record<string, number[]> = {};
    for (const p of curData) {
      const k = p.sigun_gu ?? "기타";
      if (!grouped[k]) grouped[k] = [];
      if (p.price_man_won) grouped[k].push(p.price_man_won);
    }
    return Object.entries(grouped)
      .map(([district, prices]) => {
        const s = calcStats(prices);
        if (!s) return null;
        return { district, ...s };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.mean - a.mean);
  }, [curData]);

  // Price distribution (current year)
  const priceDistribution = useMemo(() => {
    const prices = curData.map(p => p.price_man_won).filter((p): p is number => p !== null);
    const total = prices.length;
    if (!total) return [];
    return PRICE_BUCKETS.map(b => {
      const count = prices.filter(p => p >= b.min && p < b.max).length;
      return { label: b.label, count, pct: Math.round((count / total) * 100) };
    }).filter(b => b.count > 0);
  }, [curData]);

  // KPI
  const stats = useMemo(() =>
    calcStats(curData.map(p => p.price_man_won).filter((p): p is number => p !== null)),
  [curData]);

  // YoY change
  const yoyChange = useMemo(() => {
    const prevPrices = prevData.map(p => p.price_man_won).filter((p): p is number => p !== null);
    if (!stats || !prevPrices.length) return null;
    const prevMean = prevPrices.reduce((s, v) => s + v, 0) / prevPrices.length;
    return Math.round(((stats.mean - prevMean) / prevMean) * 1000) / 10;
  }, [stats, prevData]);

  // Momentum: last 2 months with data in current year, MoM by district
  const momentum = useMemo(() => {
    const withData: { month: number; byDist: Record<string, number> }[] = [];
    for (let m = 12; m >= 1 && withData.length < 2; m--) {
      const mData = curData.filter(p => p.contract_month === m && p.sigun_gu && p.price_man_won);
      if (mData.length > 0) {
        const byDist: Record<string, number[]> = {};
        for (const p of mData) {
          if (!byDist[p.sigun_gu!]) byDist[p.sigun_gu!] = [];
          byDist[p.sigun_gu!].push(p.price_man_won!);
        }
        withData.push({
          month: m,
          byDist: Object.fromEntries(
            Object.entries(byDist).map(([d, ps]) => [d, Math.round(ps.reduce((s, v) => s + v, 0) / ps.length)])
          ),
        });
      }
    }
    if (withData.length < 2) return [];
    const [latest, prev] = withData;
    return Object.keys(latest.byDist)
      .filter(d => prev.byDist[d])
      .map(d => ({
        district: d,
        changePct: Math.round(((latest.byDist[d] - prev.byDist[d]) / prev.byDist[d]) * 1000) / 10,
        latestMean: latest.byDist[d],
      }))
      .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
      .slice(0, 6);
  }, [curData]);

  const globalMaxUpper = districtStats[0]?.upper ?? 1;

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-5 py-8">
      {/* KPI */}
      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={`${selectedYear}년 평균 거래가`} value={fmtPrice(stats.mean)} sub={`${stats.count.toLocaleString()}건 기준`} />
          <StatCard label="중위 거래가" value={fmtPrice(stats.median)} sub="이상치 영향 최소화" />
          <StatCard label="총 거래량" value={stats.count.toLocaleString()} sub="서울 25개 자치구 합산" />
          {yoyChange !== null ? (
            <StatCard
              label={`전년(${prevYearLabel}년) 대비`}
              value={`${yoyChange > 0 ? "+" : ""}${yoyChange}%`}
              sub={`${prevYearLabel}년 평균가 대비`}
              tone={yoyChange > 0 ? "up" : yoyChange < 0 ? "down" : "neutral"}
            />
          ) : (
            <StatCard label="최고 거래가" value={fmtPrice(stats.max)} sub="데이터 내 최고가" tone="accent" />
          )}
        </div>
      )}

      {/* Monthly Trend */}
      <Section
        title={`${selectedYear}년 서울 월별 평균 거래가`}
        subtitle={`${prevYearLabel}년 동월 비교 · MA3 단기 추세선 포함`}
        icon={<Activity className="h-5 w-5 text-[#3182F6]" />}
      >
        <div className="h-80">
          <ResponsiveContainer>
            <ComposedChart data={chartData} margin={{ top: 10, right: 16, bottom: 0, left: 10 }}>
              <defs>
                <linearGradient id="seoulGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3182F6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#3182F6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E8EB" />
              <XAxis dataKey="month" stroke="#8B95A1" fontSize={11} tick={{ fill: "#8B95A1" }} />
              <YAxis yAxisId="price" orientation="left" stroke="#8B95A1" fontSize={11} tick={{ fill: "#8B95A1" }} tickFormatter={v => `${(v / 10000).toFixed(0)}억`} width={52} />
              <YAxis yAxisId="count" orientation="right" stroke="#8B95A1" fontSize={11} tick={{ fill: "#8B95A1" }} tickFormatter={v => `${v}건`} width={48} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: "1px solid #E5E8EB", fontSize: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.08)" }}
                formatter={(value: number, name: string, props: any) => {
                  if (name === "거래량") return [`${(value ?? 0).toLocaleString()}건`, name];
                  if (name === `${selectedYear}년 평균가` && props.payload?.prevYearPrice) {
                    const yoy = ((value - props.payload.prevYearPrice) / props.payload.prevYearPrice * 100).toFixed(1);
                    return [`${fmtPrice(value)}  (전년비 ${Number(yoy) > 0 ? "+" : ""}${yoy}%)`, name];
                  }
                  return [fmtPrice(value), name];
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
              <Bar yAxisId="count" dataKey="count" name="거래량" fill="#DBEAFE" radius={[3, 3, 0, 0]} />
              <Area yAxisId="price" type="monotone" dataKey="avgPrice" name={`${selectedYear}년 평균가`} stroke="#3182F6" fill="url(#seoulGrad)" strokeWidth={2.5} dot={false} connectNulls />
              <Line yAxisId="price" type="monotone" dataKey="prevYearPrice" name={`${prevYearLabel}년 평균가`} stroke="#9CA3AF" strokeWidth={1.5} strokeDasharray="5 4" dot={false} connectNulls />
              <Line yAxisId="price" type="monotone" dataKey="ma3" name="MA3(3개월)" stroke="#F59E0B" strokeWidth={2} strokeDasharray="4 3" dot={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 rounded-xl bg-[#F8FAFC] border border-[#E5E8EB] px-4 py-3 text-xs text-[#8B95A1] leading-relaxed">
          <strong className="text-[#191F28]">MA3(3개월 이동평균)</strong>: 최근 3개월 평균가의 평균 — 노이즈를 제거한 단기 추세선. 실제 평균가가 MA3 위면 상승, 아래면 하락 흐름.
          &nbsp;|&nbsp; <strong className="text-[#191F28]">전년 동월 비교</strong>: {prevYearLabel}년 같은 달 평균가와 직접 비교.
        </div>
      </Section>

      {/* District Table */}
      <Section
        title={`${selectedYear}년 자치구별 시세 비교`}
        subtitle="평균가 기준 내림차순 · 행 클릭 시 자치구 상세 분석"
        icon={<BarChart2 className="h-5 w-5 text-[#3182F6]" />}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E5E8EB] text-xs text-[#8B95A1]">
                <th className="pb-3 text-left font-medium w-8">순위</th>
                <th className="pb-3 text-left font-medium">자치구</th>
                <th className="pb-3 text-right font-medium">거래건수</th>
                <th className="pb-3 text-right font-medium">중위가</th>
                <th className="pb-3 text-right font-medium">평균가</th>
                <th className="pb-3 text-right font-medium">시세 하한</th>
                <th className="pb-3 text-right font-medium">시세 상한</th>
                <th className="pb-3 pl-6 font-medium">범위</th>
              </tr>
            </thead>
            <tbody>
              {districtStats.map((s, idx) => {
                const lowerPct = Math.min(95, (s.lower / globalMaxUpper) * 100);
                const meanPct = Math.min(97, (s.mean / globalMaxUpper) * 100);
                const upperPct = Math.min(100, (s.upper / globalMaxUpper) * 100);
                return (
                  <tr
                    key={s.district}
                    onClick={() => onDistrictClick(s.district)}
                    className="cursor-pointer border-b border-[#E5E8EB]/50 transition hover:bg-[#EFF6FF]"
                  >
                    <td className="py-3 text-[#8B95A1] text-xs">{idx + 1}</td>
                    <td className="py-3 font-medium text-[#3182F6]">{s.district}</td>
                    <td className="py-3 text-right text-[#8B95A1] number-tabular">{s.count.toLocaleString()}</td>
                    <td className="py-3 text-right number-tabular">{fmtPrice(s.median)}</td>
                    <td className="py-3 text-right font-semibold number-tabular">{fmtPrice(s.mean)}</td>
                    <td className="py-3 text-right text-[#8B95A1] number-tabular">{fmtPrice(s.lower)}</td>
                    <td className="py-3 text-right text-[#8B95A1] number-tabular">{fmtPrice(s.upper)}</td>
                    <td className="py-3 pl-6">
                      <div className="relative h-3 w-32 overflow-hidden rounded-full bg-[#F2F4F6]">
                        <div className="absolute h-full rounded-full bg-[#3182F6]/20" style={{ left: `${lowerPct}%`, width: `${Math.max(0, upperPct - lowerPct)}%` }} />
                        <div className="absolute top-0.5 h-2 w-1 rounded-sm bg-[#3182F6]" style={{ left: `${meanPct}%` }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-[#8B95A1]">시세 하한/상한 = 평균 ± 표준편차(1σ) · 행 클릭 시 해당 구 상세 분석으로 이동</p>
      </Section>

      {/* Price Distribution */}
      <Section
        title={`${selectedYear}년 서울 가격대 분포`}
        subtitle="실거래 가격 구간별 건수"
        icon={<BarChart2 className="h-5 w-5 text-[#3182F6]" />}
      >
        <div className="h-64">
          <ResponsiveContainer>
            <BarChart data={priceDistribution} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E8EB" vertical={false} />
              <XAxis dataKey="label" stroke="#8B95A1" fontSize={12} tick={{ fill: "#8B95A1" }} />
              <YAxis stroke="#8B95A1" fontSize={12} tick={{ fill: "#8B95A1" }} tickFormatter={v => `${v}건`} width={52} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: "1px solid #E5E8EB", fontSize: 12 }}
                formatter={(value: number, _: string, props: any) => [
                  `${value.toLocaleString()}건 · 전체의 ${props.payload?.pct}%`, "거래건수",
                ]}
              />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {priceDistribution.map((_, idx) => (
                  <Cell key={idx} fill={BAR_COLORS[Math.min(idx, BAR_COLORS.length - 1)]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {priceDistribution.map((b, idx) => (
            <span key={b.label} className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E8EB] px-3 py-1 text-xs">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: BAR_COLORS[Math.min(idx, BAR_COLORS.length - 1)] }} />
              {b.label} · {b.pct}%
            </span>
          ))}
        </div>
      </Section>

      {/* Momentum */}
      {momentum.length > 0 && (
        <Section
          title="구별 전월 대비 변동"
          subtitle={`${selectedYear}년 최근 두 달 평균가 등락 · 클릭 시 자치구 분석`}
          icon={<TrendingUp className="h-5 w-5 text-[#3182F6]" />}
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {momentum.map((m) => {
              const up = m.changePct > 0;
              const flat = Math.abs(m.changePct) < 0.5;
              return (
                <button key={m.district} onClick={() => onDistrictClick(m.district)}
                  className="flex items-center justify-between rounded-xl border border-[#E5E8EB] bg-white px-4 py-3 text-left transition hover:border-[#3182F6]/50 hover:bg-[#F2F4F6]">
                  <div>
                    <div className="font-medium text-[#191F28]">{m.district}</div>
                    <div className="mt-0.5 text-xs text-[#8B95A1] number-tabular">{fmtPrice(m.latestMean)}</div>
                  </div>
                  <div className={`flex items-center gap-1 text-sm font-bold number-tabular ${flat ? "text-[#8B95A1]" : up ? "text-emerald-600" : "text-[#F04452]"}`}>
                    {flat ? <Minus className="h-4 w-4" /> : up ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                    {up ? "+" : ""}{m.changePct}%
                  </div>
                </button>
              );
            })}
          </div>
        </Section>
      )}
    </div>
  );
}

// ─── District Tab ─────────────────────────────────────────────────────────────

function DistrictTab({ distData, isLoading, district, setDistrict, selectedYear }: {
  distData: AptDetail[];
  isLoading: boolean;
  district: string;
  setDistrict: (v: string) => void;
  selectedYear: number;
}) {
  const curData = useMemo(() => distData.filter(p => p.contract_year === selectedYear), [distData, selectedYear]);
  const prevData = useMemo(() => distData.filter(p => p.contract_year === selectedYear - 1), [distData, selectedYear]);
  const prevYearLabel = selectedYear - 1;

  // 12-month chart data with YoY and MA3
  const chartData = useMemo(() => {
    const rows = Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const cur = curData.filter(p => p.contract_month === month && p.price_man_won).map(p => p.price_man_won!);
      const prev = prevData.filter(p => p.contract_month === month && p.price_man_won).map(p => p.price_man_won!);
      const avg = cur.length ? Math.round(cur.reduce((s, v) => s + v, 0) / cur.length) : null;
      const prevAvg = prev.length ? Math.round(prev.reduce((s, v) => s + v, 0) / prev.length) : null;
      return { month: `${month}월`, avgPrice: avg, prevYearPrice: prevAvg, count: cur.length || null };
    });
    const ma3 = movingAvg(rows.map(r => r.avgPrice), 3);
    return rows.map((r, i) => ({ ...r, ma3: ma3[i] }));
  }, [curData, prevData]);

  // Price distribution
  const priceDistribution = useMemo(() => {
    const prices = curData.map(p => p.price_man_won).filter((p): p is number => p !== null);
    const total = prices.length;
    if (!total) return [];
    return PRICE_BUCKETS.map(b => {
      const count = prices.filter(p => p >= b.min && p < b.max).length;
      return { label: b.label, count, pct: Math.round((count / total) * 100) };
    }).filter(b => b.count > 0);
  }, [curData]);

  // Floor analysis
  const floorAnalysis = useMemo(() => {
    const groups: Record<string, number[]> = {
      "저층(1-5)": [], "중저층(6-10)": [], "중층(11-15)": [], "중고층(16-20)": [], "고층(21+)": [],
    };
    for (const p of curData) {
      if (!p.floor || !p.price_man_won) continue;
      const f = p.floor;
      if (f <= 5) groups["저층(1-5)"].push(p.price_man_won);
      else if (f <= 10) groups["중저층(6-10)"].push(p.price_man_won);
      else if (f <= 15) groups["중층(11-15)"].push(p.price_man_won);
      else if (f <= 20) groups["중고층(16-20)"].push(p.price_man_won);
      else groups["고층(21+)"].push(p.price_man_won);
    }
    return Object.entries(groups)
      .map(([label, prices]) => {
        if (!prices.length) return null;
        return { label, avg: Math.round(prices.reduce((s, v) => s + v, 0) / prices.length), count: prices.length };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [curData]);

  // Top apartments
  const topApts = useMemo(() => {
    const counts: Record<string, { count: number; prices: number[] }> = {};
    for (const p of curData) {
      const name = p.apt_name ?? "미상";
      if (!counts[name]) counts[name] = { count: 0, prices: [] };
      counts[name].count++;
      if (p.price_man_won) counts[name].prices.push(p.price_man_won);
    }
    return Object.entries(counts)
      .map(([name, { count, prices }]) => ({
        name, count,
        avg: prices.length ? Math.round(prices.reduce((s, v) => s + v, 0) / prices.length) : null,
        max: prices.length ? Math.max(...prices) : null,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [curData]);

  // KPI
  const kpi = useMemo(() => {
    const prices = curData.map(p => p.price_man_won).filter((p): p is number => p !== null);
    if (!prices.length) return null;
    const avg = Math.round(prices.reduce((s, v) => s + v, 0) / prices.length);
    const sorted = [...prices].sort((a, b) => a - b);
    const median = sorted.length % 2 === 0
      ? Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2)
      : sorted[Math.floor(sorted.length / 2)];
    return { avg, median, max: Math.max(...prices), count: prices.length };
  }, [curData]);

  // YoY change
  const yoyChange = useMemo(() => {
    const prevPrices = prevData.map(p => p.price_man_won).filter((p): p is number => p !== null);
    if (!kpi || !prevPrices.length) return null;
    const prevMean = prevPrices.reduce((s, v) => s + v, 0) / prevPrices.length;
    return Math.round(((kpi.avg - prevMean) / prevMean) * 1000) / 10;
  }, [kpi, prevData]);

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-5 py-8">
      {/* District selector */}
      <div className="card p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8B95A1] mb-3">자치구</h3>
        <div className="flex flex-wrap gap-1.5">
          {SEOUL_DISTRICTS.map(d => (
            <button key={d} onClick={() => setDistrict(d)}
              className={`rounded-lg border px-2.5 py-1 text-xs transition ${
                district === d
                  ? "border-[#3182F6] bg-[#3182F6] text-white"
                  : "border-[#E5E8EB] bg-white text-[#8B95A1] hover:border-[#3182F6] hover:text-[#3182F6]"
              }`}>
              {d}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24 text-[#8B95A1]">{district} 데이터 집계 중...</div>
      ) : (
        <>
          {/* KPI */}
          {kpi ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label={`${selectedYear}년 평균 거래가`} value={fmtPrice(kpi.avg)} sub={`${kpi.count.toLocaleString()}건 기준`} />
              <StatCard label="중위 거래가" value={fmtPrice(kpi.median)} sub="이상치 영향 최소화" />
              <StatCard label="거래량" value={kpi.count.toLocaleString()} sub={`${district} ${selectedYear}년`} />
              {yoyChange !== null ? (
                <StatCard
                  label={`전년(${prevYearLabel}년) 대비`}
                  value={`${yoyChange > 0 ? "+" : ""}${yoyChange}%`}
                  sub={`${prevYearLabel}년 평균가 대비`}
                  tone={yoyChange > 0 ? "up" : yoyChange < 0 ? "down" : "neutral"}
                />
              ) : (
                <StatCard label="최고 거래가" value={fmtPrice(kpi.max)} sub="데이터 내 최고가" tone="accent" />
              )}
            </div>
          ) : (
            <div className="card p-8 text-center text-[#8B95A1]">
              {district} {selectedYear}년 데이터가 없습니다.
            </div>
          )}

          {/* Monthly Trend */}
          <Section
            title={`${district} ${selectedYear}년 월별 평균 거래가`}
            subtitle={`${prevYearLabel}년 동월 비교 · MA3 단기 추세선`}
            icon={<Activity className="h-5 w-5 text-[#3182F6]" />}
          >
            <div className="h-80">
              <ResponsiveContainer>
                <ComposedChart data={chartData} margin={{ top: 10, right: 16, bottom: 0, left: 10 }}>
                  <defs>
                    <linearGradient id="distGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3182F6" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#3182F6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E8EB" />
                  <XAxis dataKey="month" stroke="#8B95A1" fontSize={11} tick={{ fill: "#8B95A1" }} />
                  <YAxis yAxisId="price" orientation="left" stroke="#8B95A1" fontSize={11} tick={{ fill: "#8B95A1" }} tickFormatter={v => `${(v / 10000).toFixed(0)}억`} width={52} />
                  <YAxis yAxisId="count" orientation="right" stroke="#8B95A1" fontSize={11} tick={{ fill: "#8B95A1" }} tickFormatter={v => `${v}건`} width={48} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: "1px solid #E5E8EB", fontSize: 12 }}
                    formatter={(value: number, name: string, props: any) => {
                      if (name === "거래량") return [`${(value ?? 0).toLocaleString()}건`, name];
                      if (name === `${selectedYear}년 평균가` && props.payload?.prevYearPrice) {
                        const yoy = ((value - props.payload.prevYearPrice) / props.payload.prevYearPrice * 100).toFixed(1);
                        return [`${fmtPrice(value)}  (전년비 ${Number(yoy) > 0 ? "+" : ""}${yoy}%)`, name];
                      }
                      return [fmtPrice(value), name];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                  <Bar yAxisId="count" dataKey="count" name="거래량" fill="#DBEAFE" radius={[3, 3, 0, 0]} />
                  <Area yAxisId="price" type="monotone" dataKey="avgPrice" name={`${selectedYear}년 평균가`} stroke="#3182F6" fill="url(#distGrad)" strokeWidth={2.5} dot={false} connectNulls />
                  <Line yAxisId="price" type="monotone" dataKey="prevYearPrice" name={`${prevYearLabel}년 평균가`} stroke="#9CA3AF" strokeWidth={1.5} strokeDasharray="5 4" dot={false} connectNulls />
                  <Line yAxisId="price" type="monotone" dataKey="ma3" name="MA3(3개월)" stroke="#F59E0B" strokeWidth={2} strokeDasharray="4 3" dot={false} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 rounded-xl bg-[#F8FAFC] border border-[#E5E8EB] px-4 py-3 text-xs text-[#8B95A1] leading-relaxed">
              <strong className="text-[#191F28]">MA3(3개월 이동평균)</strong>: 단기 추세선 — 평균가가 MA3 위면 상승, 아래면 하락 흐름.
              &nbsp;|&nbsp; <strong className="text-[#191F28]">전년 동월 비교</strong>: {prevYearLabel}년 동월 평균가와 직접 비교.
            </div>
          </Section>

          {/* Price Dist + Floor */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="가격대 분포" subtitle={`${district} ${selectedYear}년 실거래 건수 비중`} icon={<BarChart2 className="h-5 w-5 text-[#3182F6]" />}>
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={priceDistribution} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E8EB" vertical={false} />
                    <XAxis dataKey="label" stroke="#8B95A1" fontSize={10} tick={{ fill: "#8B95A1" }} />
                    <YAxis stroke="#8B95A1" fontSize={11} tick={{ fill: "#8B95A1" }} tickFormatter={v => `${v}건`} width={44} />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: "1px solid #E5E8EB", fontSize: 12 }}
                      formatter={(value: number, _: string, props: any) => [
                        `${value.toLocaleString()}건 · ${props.payload?.pct}%`, "거래건수",
                      ]}
                    />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                      {priceDistribution.map((_, idx) => (
                        <Cell key={idx} fill={BAR_COLORS[Math.min(idx, BAR_COLORS.length - 1)]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Section>

            <Section title="층별 평균 거래가" subtitle={`${district} ${selectedYear}년 층 구간별`} icon={<TrendingUp className="h-5 w-5 text-[#3182F6]" />}>
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={floorAnalysis} layout="vertical" margin={{ top: 5, right: 60, bottom: 5, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E8EB" horizontal={false} />
                    <XAxis type="number" stroke="#8B95A1" fontSize={11} tick={{ fill: "#8B95A1" }} tickFormatter={v => `${(v / 10000).toFixed(0)}억`} />
                    <YAxis type="category" dataKey="label" stroke="#8B95A1" fontSize={10} tick={{ fill: "#8B95A1" }} width={84} />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: "1px solid #E5E8EB", fontSize: 12 }}
                      formatter={(value: number, _: string, props: any) => [
                        `${fmtPrice(value)} · ${props.payload?.count?.toLocaleString()}건`, "평균 거래가",
                      ]}
                    />
                    <Bar dataKey="avg" radius={[0, 6, 6, 0]} fill="#3182F6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Section>
          </div>

          {/* Top Apartments */}
          {topApts.length > 0 && (
            <Section title={`${district} ${selectedYear}년 주요 거래 단지 TOP 10`} subtitle="거래 건수 기준" icon={<Home className="h-5 w-5 text-[#3182F6]" />}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#E5E8EB] text-xs text-[#8B95A1]">
                      <th className="pb-3 text-left font-medium w-8">순위</th>
                      <th className="pb-3 text-left font-medium">단지명</th>
                      <th className="pb-3 text-right font-medium">거래건수</th>
                      <th className="pb-3 text-right font-medium">평균 거래가</th>
                      <th className="pb-3 text-right font-medium">최고 거래가</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topApts.map((apt, idx) => (
                      <tr key={apt.name} className="border-b border-[#E5E8EB]/50 hover:bg-[#F2F4F6]">
                        <td className="py-3 text-[#8B95A1] text-xs">{idx + 1}</td>
                        <td className="py-3 font-medium text-[#191F28]">{apt.name}</td>
                        <td className="py-3 text-right text-[#8B95A1] number-tabular">{apt.count.toLocaleString()}건</td>
                        <td className="py-3 text-right font-semibold number-tabular">{fmtPrice(apt.avg)}</td>
                        <td className="py-3 text-right text-[#3182F6] number-tabular">{fmtPrice(apt.max)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}
        </>
      )}
    </div>
  );
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, tone }: {
  label: string; value: string; sub?: string; tone?: "accent" | "up" | "down" | "neutral";
}) {
  const color = tone === "accent" ? "text-[#3182F6]" : tone === "up" ? "text-emerald-600" : tone === "down" ? "text-[#F04452]" : "text-[#191F28]";
  return (
    <div className="card p-5">
      <div className="text-xs font-medium uppercase tracking-wider text-[#8B95A1]">{label}</div>
      <div className={`mt-2 text-2xl font-bold number-tabular ${color}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-[#8B95A1]">{sub}</div>}
    </div>
  );
}

function Section({ title, subtitle, icon, children }: {
  title: string; subtitle?: string; icon?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-5 flex items-center gap-3">
        {icon && <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#EFF6FF]">{icon}</div>}
        <div>
          <h2 className="text-xl font-bold text-[#191F28]">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-[#8B95A1]">{subtitle}</p>}
        </div>
      </div>
      <div className="card p-6">{children}</div>
    </section>
  );
}
