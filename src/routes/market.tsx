import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ComposedChart, Bar, Line, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, Legend, BarChart, Cell, LabelList,
} from "recharts";
import { Activity, BarChart2, TrendingUp, TrendingDown, Minus, Home, Building2 } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/tracking";

export const Route = createFileRoute("/market")({
  head: () => ({
    meta: [
      { title: "시세 분석 · HomeDirect" },
      { name: "description", content: "서울 아파트 4개년 추이, 자치구별 시세 비교, 전년 동월 비교 분석" },
    ],
  }),
  component: MarketPage,
});

const AVAILABLE_YEARS = [2025, 2024, 2023, 2022] as const;
const YEAR_COLORS: Record<number, string> = {
  2022: "#BFDBFE", 2023: "#93C5FD", 2024: "#3B82F6", 2025: "#1D4ED8",
};
const SEOUL_DISTRICTS = [
  "강남구","강동구","강북구","강서구","관악구","광진구","구로구","금천구","노원구","도봉구",
  "동대문구","동작구","마포구","서대문구","서초구","성동구","성북구","송파구","양천구","영등포구",
  "용산구","은평구","종로구","중구","중랑구",
];

type YearlyRow   = { year: number; avg_price: number; median_price: number; tx_count: number };
type MonthlyRow  = { month: number; avg_price: number; tx_count: number };
type DistrictRow = { sigun_gu: string; avg_price: number; median_price: number; tx_count: number };
type PriceRow    = { bucket: string; sort_order: number; tx_count: number };
type FloorRow    = { floor_tier: string; tier_order: number; avg_price: number; tx_count: number };
type AptTopRow   = { apt_name: string; tx_count: number; avg_price: number; max_price: number };

function fmtPrice(p: number | null | undefined) {
  if (!p) return "-";
  const eok = Math.floor(p / 10000);
  const man = p % 10000;
  if (eok > 0 && man > 0) return `${eok}억 ${man.toLocaleString()}만`;
  if (eok > 0) return `${eok}억`;
  return `${man.toLocaleString()}만`;
}

function buildMonthlyChart(cur?: MonthlyRow[], prev?: MonthlyRow[]) {
  const rows = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const c = cur?.find(r => r.month === m);
    const p = prev?.find(r => r.month === m);
    return {
      month: `${m}월`,
      avgPrice: c ? Number(c.avg_price) : null,
      prevPrice: p ? Number(p.avg_price) : null,
      count:     c ? Number(c.tx_count)  : null,
    };
  });
  // Trim trailing months with no current-year data (e.g. 2025 → show only through April)
  let lastIdx = rows.findLastIndex(r => r.avgPrice !== null);
  return lastIdx >= 0 ? rows.slice(0, lastIdx + 1) : rows;
}

// ─── MarketPage ───────────────────────────────────────────────────────────────

function MarketPage() {
  const [activeTab, setActiveTab] = useState<"seoul" | "district">("seoul");
  const [selectedYear, setSelectedYear] = useState(2025);
  const [district, setDistrict] = useState("강남구");

  useEffect(() => { trackEvent("market_view"); }, []);

  const prevYear = selectedYear > 2022 ? selectedYear - 1 : null;
  const inDistrict = activeTab === "district";

  const q = <T,>(key: unknown[], fn: () => Promise<T>, enabled = true) =>
    useQuery<T>({ queryKey: key, queryFn: fn, staleTime: 15 * 60 * 1000, enabled });

  // ── Seoul queries ──────────────────────────────────────────────────────────
  const { data: yearlySeoul, isLoading: loadYearly } =
    q(["mkt_yearly_seoul"], async () => {
      const { data, error } = await supabase.rpc("market_yearly_seoul");
      if (error) throw error;
      return data as YearlyRow[];
    });

  const { data: monthlySeoulCur, isLoading: loadMonthly } =
    q(["mkt_monthly_seoul", selectedYear], async () => {
      const { data, error } = await supabase.rpc("market_monthly_seoul", { p_year: selectedYear });
      if (error) throw error;
      return data as MonthlyRow[];
    });

  const { data: monthlySeoulPrev } =
    q(["mkt_monthly_seoul", prevYear], async () => {
      const { data, error } = await supabase.rpc("market_monthly_seoul", { p_year: prevYear! });
      if (error) throw error;
      return data as MonthlyRow[];
    }, !!prevYear);

  const { data: districtStats } =
    q(["mkt_district_stats", selectedYear], async () => {
      const { data, error } = await supabase.rpc("market_district_stats", { p_year: selectedYear });
      if (error) throw error;
      return data as DistrictRow[];
    });

  const { data: priceDistSeoul } =
    q(["mkt_price_dist_seoul", selectedYear], async () => {
      const { data, error } = await supabase.rpc("market_price_dist", { p_year: selectedYear });
      if (error) throw error;
      return data as PriceRow[];
    });

  // ── District queries ───────────────────────────────────────────────────────
  const { data: yearlyDistrict, isLoading: loadDistYearly } =
    q(["mkt_yearly_dist", district], async () => {
      const { data, error } = await supabase.rpc("market_yearly_district", { p_district: district });
      if (error) throw error;
      return data as YearlyRow[];
    }, inDistrict);

  const { data: monthlyDistCur, isLoading: loadDistMonthly } =
    q(["mkt_monthly_dist", district, selectedYear], async () => {
      const { data, error } = await supabase.rpc("market_monthly_district", { p_year: selectedYear, p_district: district });
      if (error) throw error;
      return data as MonthlyRow[];
    }, inDistrict);

  const { data: monthlyDistPrev } =
    q(["mkt_monthly_dist", district, prevYear], async () => {
      const { data, error } = await supabase.rpc("market_monthly_district", { p_year: prevYear!, p_district: district });
      if (error) throw error;
      return data as MonthlyRow[];
    }, inDistrict && !!prevYear);

  const { data: priceDistDistrict } =
    q(["mkt_price_dist_dist", district, selectedYear], async () => {
      const { data, error } = await supabase.rpc("market_price_dist", { p_year: selectedYear, p_district: district });
      if (error) throw error;
      return data as PriceRow[];
    }, inDistrict);

  const { data: floorStats } =
    q(["mkt_floor", district, selectedYear], async () => {
      const { data, error } = await supabase.rpc("market_floor_stats", { p_year: selectedYear, p_district: district });
      if (error) throw error;
      return data as FloorRow[];
    }, inDistrict);

  const { data: topApts } =
    q(["mkt_top_apts", district, selectedYear], async () => {
      const { data, error } = await supabase.rpc("market_top_apts", { p_year: selectedYear, p_district: district });
      if (error) throw error;
      return data as AptTopRow[];
    }, inDistrict);

  const isLoading = loadYearly || loadMonthly;
  const distLoading = loadDistYearly || loadDistMonthly;

  if (isLoading) return (
    <div className="min-h-screen bg-[#F2F4F6]">
      <SiteHeader />
      <div className="flex items-center justify-center py-24 text-[#8B95A1]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#3182F6] border-t-transparent" />
          <span className="text-sm">시세 데이터 집계 중...</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F2F4F6]">
      <SiteHeader />

      {/* Header */}
      <div className="bg-white border-b border-[#E5E8EB]">
        <div className="mx-auto max-w-7xl px-5 py-6">
          <h1 className="text-2xl font-bold text-[#191F28]">시세 분석</h1>
          <p className="mt-1 text-sm text-[#8B95A1]">서울 25개 자치구 · 4개년 추이 · 전년 동월 비교</p>
          <div className="mt-5 flex flex-wrap items-center gap-5">
            <div className="inline-flex gap-1 rounded-xl bg-[#F2F4F6] p-1">
              {(["seoul", "district"] as const).map(t => (
                <button key={t} onClick={() => setActiveTab(t)}
                  className={`rounded-lg px-5 py-2 text-sm font-semibold transition ${
                    activeTab === t ? "bg-white text-[#191F28] shadow-sm" : "text-[#8B95A1] hover:text-[#191F28]"
                  }`}>
                  {t === "seoul" ? "서울 전체" : "자치구 분석"}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#8B95A1]">기준 년도</span>
              <div className="flex gap-1.5">
                {AVAILABLE_YEARS.map(y => (
                  <button key={y} onClick={() => setSelectedYear(y)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                      selectedYear === y
                        ? "border-[#3182F6] bg-[#3182F6] text-white"
                        : "border-[#E5E8EB] bg-white text-[#8B95A1] hover:border-[#3182F6] hover:text-[#3182F6]"
                    }`}>
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
          selectedYear={selectedYear}
          yearlySeoul={yearlySeoul ?? []}
          monthlySeoulCur={monthlySeoulCur}
          monthlySeoulPrev={monthlySeoulPrev}
          districtStats={districtStats ?? []}
          priceDist={priceDistSeoul ?? []}
          onDistrictClick={d => { setDistrict(d); setActiveTab("district"); }}
        />
      ) : (
        <DistrictTab
          selectedYear={selectedYear}
          district={district}
          setDistrict={setDistrict}
          yearlyDistrict={yearlyDistrict ?? []}
          yearlySeoul={yearlySeoul ?? []}
          monthlyDistCur={monthlyDistCur}
          monthlyDistPrev={monthlyDistPrev}
          priceDist={priceDistDistrict ?? []}
          floorStats={floorStats ?? []}
          topApts={topApts ?? []}
          isLoading={distLoading}
        />
      )}
    </div>
  );
}

// ─── Seoul Tab ────────────────────────────────────────────────────────────────

function SeoulTab({ selectedYear, yearlySeoul, monthlySeoulCur, monthlySeoulPrev,
  districtStats, priceDist, onDistrictClick }: {
  selectedYear: number;
  yearlySeoul: YearlyRow[];
  monthlySeoulCur?: MonthlyRow[];
  monthlySeoulPrev?: MonthlyRow[];
  districtStats: DistrictRow[];
  priceDist: PriceRow[];
  onDistrictClick: (d: string) => void;
}) {
  const prevYearLabel = selectedYear - 1;
  const curRow = yearlySeoul.find(r => r.year === selectedYear);
  const prevRow = yearlySeoul.find(r => r.year === selectedYear - 1);

  // 4-year trend bar chart data (chronological)
  const yearlyChart = useMemo(() =>
    ([...AVAILABLE_YEARS].reverse() as number[]).map((year, i, arr) => {
      const row  = yearlySeoul.find(r => r.year === year);
      const pRow = i > 0 ? yearlySeoul.find(r => r.year === arr[i - 1]) : null;
      const yoyPct = row && pRow
        ? Math.round(((Number(row.avg_price) - Number(pRow.avg_price)) / Number(pRow.avg_price)) * 1000) / 10
        : null;
      return { year: `${year}년`, avgPrice: row ? Number(row.avg_price) : null,
               txCount: row ? Number(row.tx_count) : null, yoyPct, color: YEAR_COLORS[year] };
    }), [yearlySeoul]);

  // Monthly chart data
  const monthlyChart = useMemo(
    () => buildMonthlyChart(monthlySeoulCur, monthlySeoulPrev),
    [monthlySeoulCur, monthlySeoulPrev]);

  // KPI
  const yoyChange = curRow && prevRow
    ? Math.round(((Number(curRow.avg_price) - Number(prevRow.avg_price)) / Number(prevRow.avg_price)) * 1000) / 10
    : null;

  // Price dist with pct
  const totalTx = priceDist.reduce((s, r) => s + Number(r.tx_count), 0);
  const priceDistWithPct = priceDist.map(r => ({ ...r, pct: totalTx ? Math.round(Number(r.tx_count) / totalTx * 100) : 0 }));

  // Custom bar label for 4-year chart
  const renderYearLabel = ({ x, y, width, index }: any) => {
    const d = yearlyChart[index];
    if (!d?.avgPrice) return null;
    return (
      <g>
        {d.yoyPct !== null && (
          <text x={x + width / 2} y={y - 24} textAnchor="middle" fontSize={11}
            fill={d.yoyPct > 0 ? "#10B981" : d.yoyPct < 0 ? "#F04452" : "#8B95A1"}>
            {d.yoyPct > 0 ? `▲${d.yoyPct}%` : d.yoyPct < 0 ? `▼${Math.abs(d.yoyPct)}%` : "-"}
          </text>
        )}
        <text x={x + width / 2} y={y - 8} textAnchor="middle" fontSize={12}
          fill="#191F28" fontWeight="600">
          {fmtPrice(d.avgPrice)}
        </text>
      </g>
    );
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-5 py-8">

      {/* KPI */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={`${selectedYear}년 평균 거래가`} value={fmtPrice(curRow?.avg_price)} sub={`${Number(curRow?.tx_count ?? 0).toLocaleString()}건 기준`} />
        <StatCard label="중위 거래가" value={fmtPrice(curRow?.median_price)} sub="이상치 영향 최소화" />
        <StatCard label="총 거래량" value={Number(curRow?.tx_count ?? 0).toLocaleString()} sub="서울 25개 자치구 합산" />
        {yoyChange !== null ? (
          <StatCard label={`전년(${prevYearLabel}년) 대비`} value={`${yoyChange > 0 ? "+" : ""}${yoyChange}%`}
            sub={`${prevYearLabel}년 평균가 대비`} tone={yoyChange > 0 ? "up" : yoyChange < 0 ? "down" : "neutral"} />
        ) : (
          <StatCard label="서울 전체 거래" value={`${yearlySeoul.reduce((s, r) => s + Number(r.tx_count), 0).toLocaleString()}건`} sub="2022~2025년 합산" />
        )}
      </div>

      {/* 4-year trend */}
      <Section title="서울 4개년 평균 거래가 추이" subtitle="2022 → 2025 연도별 평균 거래가 및 전년 대비 등락률"
        icon={<TrendingUp className="h-5 w-5 text-[#3182F6]" />}>
        <div className="h-72">
          <ResponsiveContainer>
            <BarChart data={yearlyChart} margin={{ top: 48, right: 20, bottom: 8, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E8EB" vertical={false} />
              <XAxis dataKey="year" stroke="#8B95A1" fontSize={13} tick={{ fill: "#191F28", fontWeight: 600 }} />
              <YAxis stroke="#8B95A1" fontSize={11} tick={{ fill: "#8B95A1" }} tickFormatter={v => `${(v / 10000).toFixed(0)}억`} width={52} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: "1px solid #E5E8EB", fontSize: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.08)" }}
                formatter={(value: number, _: string, props: any) => [
                  `${fmtPrice(value)}  ${props.payload?.yoyPct !== null && props.payload?.yoyPct !== undefined ? `(전년비 ${props.payload.yoyPct > 0 ? "+" : ""}${props.payload.yoyPct}%)` : ""}`, "평균 거래가"
                ]}
              />
              <Bar dataKey="avgPrice" label={renderYearLabel} radius={[6, 6, 0, 0]}>
                {yearlyChart.map((e, i) => (
                  <Cell key={i} fill={e.color ?? "#3B82F6"}
                    stroke={e.year === `${selectedYear}년` ? "#1D4ED8" : "none"}
                    strokeWidth={e.year === `${selectedYear}년` ? 2 : 0} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        {/* Legend for year colors */}
        <div className="mt-4 flex flex-wrap justify-center gap-4">
          {([...AVAILABLE_YEARS].reverse() as number[]).map(y => (
            <span key={y} className="flex items-center gap-1.5 text-xs text-[#8B95A1]">
              <span className="inline-block h-3 w-5 rounded-sm" style={{ background: YEAR_COLORS[y] }} />
              {y}년{y === selectedYear && <span className="text-[#3182F6] font-semibold"> (선택)</span>}
            </span>
          ))}
        </div>
      </Section>

      {/* Monthly trend */}
      <Section title={`${selectedYear}년 서울 월별 거래가 추이`} subtitle={`${prevYearLabel}년 동월 비교`}
        icon={<Activity className="h-5 w-5 text-[#3182F6]" />}>
        <div className="h-80">
          <ResponsiveContainer>
            <ComposedChart data={monthlyChart} margin={{ top: 10, right: 16, bottom: 0, left: 10 }}>
              <defs>
                <linearGradient id="seoulGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3182F6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#3182F6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E8EB" />
              <XAxis dataKey="month" stroke="#8B95A1" fontSize={11} tick={{ fill: "#8B95A1" }} />
              <YAxis yAxisId="price" orientation="left" stroke="#8B95A1" fontSize={11} tick={{ fill: "#8B95A1" }} tickFormatter={v => `${(v / 10000).toFixed(0)}억`} width={52} />
              <YAxis yAxisId="count" orientation="right" stroke="#8B95A1" fontSize={11} tick={{ fill: "#8B95A1" }} tickFormatter={v => `${v}건`} width={52} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: "1px solid #E5E8EB", fontSize: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.08)" }}
                formatter={(value: number, name: string, props: any) => {
                  if (name === "거래량") return [`${(value ?? 0).toLocaleString()}건`, name];
                  if (name === `${selectedYear}년 평균가` && props.payload?.prevPrice) {
                    const d = ((value - props.payload.prevPrice) / props.payload.prevPrice * 100).toFixed(1);
                    return [`${fmtPrice(value)}  (전년비 ${Number(d) > 0 ? "+" : ""}${d}%)`, name];
                  }
                  return [fmtPrice(value), name];
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
              <Bar yAxisId="count" dataKey="count" name="거래량" fill="#DBEAFE" radius={[3, 3, 0, 0]} />
              <Area yAxisId="price" type="monotone" dataKey="avgPrice" name={`${selectedYear}년 평균가`} stroke="#3182F6" fill="url(#seoulGrad)" strokeWidth={2.5} dot={{ r: 3, fill: "#3182F6" }} connectNulls />
              <Line yAxisId="price" type="monotone" dataKey="prevPrice" name={`${prevYearLabel}년 평균가`} stroke="#9CA3AF" strokeWidth={1.5} strokeDasharray="5 4" dot={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Section>

      {/* District horizontal bar chart */}
      <Section title={`${selectedYear}년 자치구별 평균 거래가`} subtitle="평균가 기준 내림차순 · 클릭 시 자치구 상세 분석"
        icon={<BarChart2 className="h-5 w-5 text-[#3182F6]" />}>
        <div style={{ height: Math.max(420, districtStats.length * 26) }}>
          <ResponsiveContainer>
            <BarChart data={districtStats} layout="vertical" margin={{ top: 0, right: 110, bottom: 0, left: 8 }}
              onClick={e => e?.activePayload?.[0] && onDistrictClick((e.activePayload[0].payload as DistrictRow).sigun_gu)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E8EB" horizontal={false} />
              <XAxis type="number" stroke="#8B95A1" fontSize={11} tick={{ fill: "#8B95A1" }} tickFormatter={v => `${(v / 10000).toFixed(0)}억`} />
              <YAxis type="category" dataKey="sigun_gu" stroke="#8B95A1" fontSize={12} tick={{ fill: "#374151", fontWeight: 500 }} width={64} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: "1px solid #E5E8EB", fontSize: 12 }}
                formatter={(value: number, _: string, props: any) => [
                  `평균 ${fmtPrice(value)} · 중위 ${fmtPrice(props.payload?.median_price)} · ${Number(props.payload?.tx_count ?? 0).toLocaleString()}건`, props.payload?.sigun_gu,
                ]}
              />
              <Bar dataKey="avg_price" radius={[0, 4, 4, 0]} cursor="pointer">
                {districtStats.map((_, idx) => (
                  <Cell key={idx} fill="#3182F6" fillOpacity={1 - (idx / Math.max(districtStats.length - 1, 1)) * 0.55} />
                ))}
                <LabelList dataKey="avg_price" position="right"
                  formatter={(v: number) => fmtPrice(v)}
                  style={{ fontSize: 11, fill: "#374151", fontWeight: 500 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-3 text-xs text-[#8B95A1]">막대 클릭 시 해당 자치구 상세 분석으로 이동 · 색상 농도: 진할수록 고가</p>
      </Section>

      {/* Price distribution */}
      <Section title={`${selectedYear}년 서울 가격대 분포`} subtitle="실거래 구간별 비중"
        icon={<BarChart2 className="h-5 w-5 text-[#3182F6]" />}>
        <div className="h-64">
          <ResponsiveContainer>
            <BarChart data={priceDistWithPct} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E8EB" vertical={false} />
              <XAxis dataKey="bucket" stroke="#8B95A1" fontSize={12} tick={{ fill: "#8B95A1" }} />
              <YAxis stroke="#8B95A1" fontSize={12} tick={{ fill: "#8B95A1" }} tickFormatter={v => `${v}건`} width={56} />
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #E5E8EB", fontSize: 12 }}
                formatter={(value: number, _: string, props: any) => [
                  `${Number(value).toLocaleString()}건 · 전체의 ${props.payload?.pct}%`, "거래건수",
                ]} />
              <Bar dataKey="tx_count" radius={[6, 6, 0, 0]}>
                {priceDistWithPct.map((_, i) => (
                  <Cell key={i} fill={["#BFDBFE","#93C5FD","#60A5FA","#3B82F6","#2563EB","#1D4ED8","#1E40AF"][Math.min(i, 6)]} />
                ))}
                <LabelList dataKey="pct" position="top" formatter={(v: number) => `${v}%`}
                  style={{ fontSize: 11, fill: "#374151" }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>
    </div>
  );
}

// ─── District Tab ─────────────────────────────────────────────────────────────

function DistrictTab({ selectedYear, district, setDistrict, yearlyDistrict, yearlySeoul,
  monthlyDistCur, monthlyDistPrev, priceDist, floorStats, topApts, isLoading }: {
  selectedYear: number;
  district: string; setDistrict: (d: string) => void;
  yearlyDistrict: YearlyRow[]; yearlySeoul: YearlyRow[];
  monthlyDistCur?: MonthlyRow[]; monthlyDistPrev?: MonthlyRow[];
  priceDist: PriceRow[]; floorStats: FloorRow[]; topApts: AptTopRow[];
  isLoading: boolean;
}) {
  const prevYearLabel = selectedYear - 1;
  const curRow  = yearlyDistrict.find(r => r.year === selectedYear);
  const prevRow = yearlyDistrict.find(r => r.year === selectedYear - 1);
  const seoulRow = yearlySeoul.find(r => r.year === selectedYear);

  const yoyChange = curRow && prevRow
    ? Math.round(((Number(curRow.avg_price) - Number(prevRow.avg_price)) / Number(prevRow.avg_price)) * 1000) / 10
    : null;
  const vsSeoul = curRow && seoulRow
    ? Math.round(((Number(curRow.avg_price) - Number(seoulRow.avg_price)) / Number(seoulRow.avg_price)) * 1000) / 10
    : null;

  // 4-year: District vs Seoul grouped bars
  const distVsSeoulChart = useMemo(() =>
    ([...AVAILABLE_YEARS].reverse() as number[]).map(year => ({
      year: `${year}년`,
      district: yearlyDistrict.find(r => r.year === year)?.avg_price
        ? Number(yearlyDistrict.find(r => r.year === year)!.avg_price) : null,
      seoul: yearlySeoul.find(r => r.year === year)?.avg_price
        ? Number(yearlySeoul.find(r => r.year === year)!.avg_price) : null,
    })), [yearlyDistrict, yearlySeoul]);

  // Monthly chart
  const monthlyChart = useMemo(
    () => buildMonthlyChart(monthlyDistCur, monthlyDistPrev),
    [monthlyDistCur, monthlyDistPrev]);

  // Price dist pct
  const totalTx = priceDist.reduce((s, r) => s + Number(r.tx_count), 0);
  const priceDistWithPct = priceDist.map(r => ({ ...r, pct: totalTx ? Math.round(Number(r.tx_count) / totalTx * 100) : 0 }));

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-5 py-8">
      {/* District selector */}
      <div className="card p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8B95A1] mb-3">자치구</h3>
        <div className="flex flex-wrap gap-1.5">
          {SEOUL_DISTRICTS.map(d => (
            <button key={d} onClick={() => setDistrict(d)}
              className={`rounded-lg border px-2.5 py-1 text-xs transition ${
                district === d ? "border-[#3182F6] bg-[#3182F6] text-white"
                  : "border-[#E5E8EB] bg-white text-[#8B95A1] hover:border-[#3182F6] hover:text-[#3182F6]"
              }`}>{d}</button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-[#8B95A1]">
          <div className="flex flex-col items-center gap-3">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#3182F6] border-t-transparent" />
            <span className="text-sm">{district} 집계 중...</span>
          </div>
        </div>
      ) : (
        <>
          {/* KPI */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label={`${selectedYear}년 평균 거래가`} value={fmtPrice(curRow?.avg_price)} sub={`${Number(curRow?.tx_count ?? 0).toLocaleString()}건 기준`} />
            <StatCard label="중위 거래가" value={fmtPrice(curRow?.median_price)} sub="이상치 영향 최소화" />
            {yoyChange !== null ? (
              <StatCard label={`전년(${prevYearLabel}년) 대비`} value={`${yoyChange > 0 ? "+" : ""}${yoyChange}%`}
                sub={`${prevYearLabel}년 평균 대비`} tone={yoyChange > 0 ? "up" : yoyChange < 0 ? "down" : "neutral"} />
            ) : (
              <StatCard label="거래량" value={Number(curRow?.tx_count ?? 0).toLocaleString()} sub={`${district} ${selectedYear}년`} />
            )}
            {vsSeoul !== null ? (
              <StatCard label="서울 평균 대비" value={`${vsSeoul > 0 ? "+" : ""}${vsSeoul}%`}
                sub={`서울 평균가 ${fmtPrice(seoulRow?.avg_price)}`} tone={vsSeoul > 0 ? "up" : "down"} />
            ) : (
              <StatCard label="최고 거래가" value={fmtPrice(yearlyDistrict.reduce((max, r) => Math.max(max, Number(r.avg_price)), 0) || null)} sub="4개년 연평균 최고" tone="accent" />
            )}
          </div>

          {/* District vs Seoul 4-year */}
          <Section title={`${district} 4개년 평균 거래가 추이`} subtitle="서울 전체 평균과 비교"
            icon={<TrendingUp className="h-5 w-5 text-[#3182F6]" />}>
            <div className="h-72">
              <ResponsiveContainer>
                <BarChart data={distVsSeoulChart} margin={{ top: 20, right: 20, bottom: 8, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E8EB" vertical={false} />
                  <XAxis dataKey="year" stroke="#8B95A1" fontSize={13} tick={{ fill: "#191F28", fontWeight: 600 }} />
                  <YAxis stroke="#8B95A1" fontSize={11} tick={{ fill: "#8B95A1" }} tickFormatter={v => `${(v / 10000).toFixed(0)}억`} width={52} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #E5E8EB", fontSize: 12 }}
                    formatter={(value: number, name: string) => [fmtPrice(value), name]} />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Bar dataKey="district" name={district} fill="#3182F6" radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="district" position="top" formatter={(v: number) => fmtPrice(v)}
                      style={{ fontSize: 11, fill: "#1D4ED8", fontWeight: 600 }} />
                  </Bar>
                  <Bar dataKey="seoul" name="서울 평균" fill="#E5E7EB" radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="seoul" position="top" formatter={(v: number) => fmtPrice(v)}
                      style={{ fontSize: 11, fill: "#9CA3AF" }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-3 text-xs text-[#8B95A1]">파란 막대({district}) vs 회색 막대(서울 평균) — 격차 변화로 해당 구의 상대적 가격 추세를 파악하세요.</p>
          </Section>

          {/* Monthly trend */}
          <Section title={`${district} ${selectedYear}년 월별 거래가 추이`} subtitle={`${prevYearLabel}년 동월 비교`}
            icon={<Activity className="h-5 w-5 text-[#3182F6]" />}>
            <div className="h-72">
              <ResponsiveContainer>
                <ComposedChart data={monthlyChart} margin={{ top: 10, right: 16, bottom: 0, left: 10 }}>
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
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #E5E8EB", fontSize: 12 }}
                    formatter={(value: number, name: string, props: any) => {
                      if (name === "거래량") return [`${(value ?? 0).toLocaleString()}건`, name];
                      if (name === `${selectedYear}년 평균가` && props.payload?.prevPrice) {
                        const d = ((value - props.payload.prevPrice) / props.payload.prevPrice * 100).toFixed(1);
                        return [`${fmtPrice(value)}  (전년비 ${Number(d) > 0 ? "+" : ""}${d}%)`, name];
                      }
                      return [fmtPrice(value), name];
                    }} />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                  <Bar yAxisId="count" dataKey="count" name="거래량" fill="#DBEAFE" radius={[3, 3, 0, 0]} />
                  <Area yAxisId="price" type="monotone" dataKey="avgPrice" name={`${selectedYear}년 평균가`} stroke="#3182F6" fill="url(#distGrad)" strokeWidth={2.5} dot={{ r: 3, fill: "#3182F6" }} connectNulls />
                  <Line yAxisId="price" type="monotone" dataKey="prevPrice" name={`${prevYearLabel}년 평균가`} stroke="#9CA3AF" strokeWidth={1.5} strokeDasharray="5 4" dot={false} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Section>

          {/* Price dist + Floor */}
          {(priceDistWithPct.length > 0 || floorStats.length > 0) && (
            <div className="grid gap-6 lg:grid-cols-2">
              {priceDistWithPct.length > 0 && (
                <Section title="가격대 분포" subtitle={`${district} ${selectedYear}년`} icon={<BarChart2 className="h-5 w-5 text-[#3182F6]" />}>
                  <div className="h-56">
                    <ResponsiveContainer>
                      <BarChart data={priceDistWithPct} margin={{ top: 16, right: 10, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E8EB" vertical={false} />
                        <XAxis dataKey="bucket" stroke="#8B95A1" fontSize={10} tick={{ fill: "#8B95A1" }} />
                        <YAxis stroke="#8B95A1" fontSize={11} tick={{ fill: "#8B95A1" }} tickFormatter={v => `${v}건`} width={44} />
                        <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #E5E8EB", fontSize: 12 }}
                          formatter={(value: number, _: string, props: any) => [
                            `${Number(value).toLocaleString()}건 · ${props.payload?.pct}%`, "거래건수"]} />
                        <Bar dataKey="tx_count" radius={[4, 4, 0, 0]}>
                          {priceDistWithPct.map((_, i) => (
                            <Cell key={i} fill={["#BFDBFE","#93C5FD","#60A5FA","#3B82F6","#2563EB","#1D4ED8","#1E40AF"][Math.min(i, 6)]} />
                          ))}
                          <LabelList dataKey="pct" position="top" formatter={(v: number) => `${v}%`} style={{ fontSize: 10, fill: "#374151" }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Section>
              )}
              {floorStats.length > 0 && (
                <Section title="층별 평균 거래가" subtitle={`${district} ${selectedYear}년`} icon={<Building2 className="h-5 w-5 text-[#3182F6]" />}>
                  <div className="h-56">
                    <ResponsiveContainer>
                      <BarChart data={floorStats} layout="vertical" margin={{ top: 5, right: 80, bottom: 5, left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E8EB" horizontal={false} />
                        <XAxis type="number" stroke="#8B95A1" fontSize={11} tick={{ fill: "#8B95A1" }} tickFormatter={v => `${(v / 10000).toFixed(0)}억`} />
                        <YAxis type="category" dataKey="floor_tier" stroke="#8B95A1" fontSize={11} tick={{ fill: "#8B95A1" }} width={84} />
                        <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #E5E8EB", fontSize: 12 }}
                          formatter={(value: number, _: string, props: any) => [
                            `${fmtPrice(value)} · ${Number(props.payload?.tx_count ?? 0).toLocaleString()}건`, "평균 거래가"]} />
                        <Bar dataKey="avg_price" radius={[0, 4, 4, 0]} fill="#3182F6">
                          <LabelList dataKey="avg_price" position="right" formatter={(v: number) => fmtPrice(v)} style={{ fontSize: 11, fill: "#374151" }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Section>
              )}
            </div>
          )}

          {/* Top apartments */}
          {topApts.length > 0 && (
            <Section title={`${district} ${selectedYear}년 주요 거래 단지 TOP 10`} subtitle="거래 건수 기준"
              icon={<Home className="h-5 w-5 text-[#3182F6]" />}>
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
                      <tr key={apt.apt_name} className="border-b border-[#E5E8EB]/50 hover:bg-[#F2F4F6]">
                        <td className="py-3 text-[#8B95A1] text-xs">{idx + 1}</td>
                        <td className="py-3 font-medium text-[#191F28]">{apt.apt_name}</td>
                        <td className="py-3 text-right text-[#8B95A1] number-tabular">{Number(apt.tx_count).toLocaleString()}건</td>
                        <td className="py-3 text-right font-semibold number-tabular">{fmtPrice(apt.avg_price)}</td>
                        <td className="py-3 text-right text-[#3182F6] number-tabular">{fmtPrice(apt.max_price)}</td>
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
