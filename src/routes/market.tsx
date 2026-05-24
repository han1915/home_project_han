import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, Legend, BarChart, Cell,
} from "recharts";
import { Activity, BarChart2, TrendingUp, TrendingDown, Minus, MapPin, Home } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/tracking";

export const Route = createFileRoute("/market")({
  head: () => ({
    meta: [
      { title: "시세 분석 · HomeDirect" },
      { name: "description", content: "서울 아파트 구별 시세 분석, 월별 이동평균, 가격대 분포, 자치구 상세 분석" },
    ],
  }),
  component: MarketPage,
});

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

function pad(n: number) { return n < 10 ? `0${n}` : `${n}`; }
function ymKey(year: number, month: number) { return `${year}-${pad(month)}`; }

function buildMonths(endYear: number, endMonth: number, periodMonths: number): string[] {
  const months: string[] = [];
  for (let i = periodMonths - 1; i >= 0; i--) {
    const d = new Date(endYear, endMonth - 1 - i, 1);
    months.push(ymKey(d.getFullYear(), d.getMonth() + 1));
  }
  return months;
}

// ─── MarketPage ──────────────────────────────────────────────────────────────

function MarketPage() {
  const now = new Date();
  const [activeTab, setActiveTab] = useState<"seoul" | "district">("seoul");
  const [endYear, setEndYear] = useState(2025);
  const [endMonth, setEndMonth] = useState(now.getMonth() + 1);
  const [periodMonths, setPeriodMonths] = useState(12);
  const [district, setDistrict] = useState("강남구");

  useEffect(() => { trackEvent("market_view"); }, []);

  // All Seoul data — high limit, sorted recent first
  const { data: rawData, isLoading: seoulLoading } = useQuery({
    queryKey: ["market_seoul_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("apartments")
        .select("id,sigun_gu,price_man_won,area_sqm,contract_year,contract_month")
        .gte("contract_year", 2022)
        .lte("contract_year", 2025)
        .order("contract_year", { ascending: false })
        .order("contract_month", { ascending: false })
        .limit(100000);
      if (error) throw error;
      return data as AptSummary[];
    },
    staleTime: 10 * 60 * 1000,
  });

  // Auto-adjust end date to latest available data month
  const latestYM = useMemo(() => {
    if (!rawData?.length) return null;
    let maxTime = 0;
    for (const p of rawData) {
      if (p.contract_year && p.contract_month) {
        const t = p.contract_year * 100 + p.contract_month;
        if (t > maxTime) maxTime = t;
      }
    }
    if (!maxTime) return null;
    return { year: Math.floor(maxTime / 100), month: maxTime % 100 };
  }, [rawData]);

  useEffect(() => {
    if (!latestYM) return;
    const curTime = endYear * 100 + endMonth;
    const latestTime = latestYM.year * 100 + latestYM.month;
    if (curTime > latestTime) {
      setEndYear(latestYM.year);
      setEndMonth(latestYM.month);
    }
  }, [latestYM]);

  // District data — separate query, per-district
  const { data: distData, isLoading: distLoading } = useQuery({
    queryKey: ["market_district", district],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("apartments")
        .select("id,apt_name,sigun_gu,price_man_won,area_sqm,floor,contract_year,contract_month")
        .eq("sigun_gu", district)
        .gte("contract_year", 2022)
        .lte("contract_year", 2025)
        .order("contract_year", { ascending: false })
        .order("contract_month", { ascending: false })
        .limit(20000);
      if (error) throw error;
      return data as AptDetail[];
    },
    enabled: activeTab === "district",
    staleTime: 5 * 60 * 1000,
  });

  const availableYears = useMemo(() => {
    if (!rawData?.length) return [2025, 2024, 2023, 2022];
    const years = [...new Set(rawData.map(p => p.contract_year).filter(Boolean) as number[])]
      .sort((a, b) => b - a);
    return years.length ? years : [2025, 2024, 2023, 2022];
  }, [rawData]);

  const isLoading = seoulLoading || (activeTab === "district" && distLoading);

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
            서울 25개 자치구 시세 비교 · 월별 추세 · 자치구별 상세 분석
          </p>
          {/* Tab switcher */}
          <div className="mt-5 inline-flex gap-1 rounded-xl bg-[#F2F4F6] p-1">
            {(["seoul", "district"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={`rounded-lg px-5 py-2 text-sm font-semibold transition ${
                  activeTab === t
                    ? "bg-white text-[#191F28] shadow-sm"
                    : "text-[#8B95A1] hover:text-[#191F28]"
                }`}
              >
                {t === "seoul" ? "서울 전체" : "자치구 분석"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeTab === "seoul" ? (
        <SeoulTab
          rawData={rawData}
          availableYears={availableYears}
          endYear={endYear} setEndYear={setEndYear}
          endMonth={endMonth} setEndMonth={setEndMonth}
          periodMonths={periodMonths} setPeriodMonths={setPeriodMonths}
          onDistrictClick={(d) => { setDistrict(d); setActiveTab("district"); }}
        />
      ) : (
        <DistrictTab
          distData={distData ?? []}
          isLoading={distLoading}
          district={district} setDistrict={setDistrict}
          availableYears={availableYears}
          endYear={endYear} setEndYear={setEndYear}
          endMonth={endMonth} setEndMonth={setEndMonth}
          periodMonths={periodMonths} setPeriodMonths={setPeriodMonths}
        />
      )}
    </div>
  );
}

// ─── Seoul Tab ───────────────────────────────────────────────────────────────

function SeoulTab({
  rawData, availableYears,
  endYear, setEndYear, endMonth, setEndMonth, periodMonths, setPeriodMonths,
  onDistrictClick,
}: {
  rawData: AptSummary[];
  availableYears: number[];
  endYear: number; setEndYear: (v: number) => void;
  endMonth: number; setEndMonth: (v: number) => void;
  periodMonths: number; setPeriodMonths: (v: number) => void;
  onDistrictClick: (district: string) => void;
}) {
  // District stats
  const districtStats = useMemo(() => {
    const grouped: Record<string, number[]> = {};
    for (const p of rawData) {
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
  }, [rawData]);

  // Monthly trend — filtered to period
  const monthlyTrend = useMemo(() => {
    const months = buildMonths(endYear, endMonth, periodMonths);
    const byMonth: Record<string, number[]> = {};
    for (const m of months) byMonth[m] = [];
    for (const p of rawData) {
      if (p.contract_year && p.contract_month && p.price_man_won) {
        const key = ymKey(p.contract_year, p.contract_month);
        if (byMonth[key] !== undefined) byMonth[key].push(p.price_man_won);
      }
    }
    const means = months.map(m => {
      const prices = byMonth[m];
      return prices.length ? Math.round(prices.reduce((s, v) => s + v, 0) / prices.length) : null;
    });
    const ma3 = movingAvg(means, 3);
    const ma6 = movingAvg(means, 6);
    return months.map((m, i) => ({
      month: m.slice(2), avgPrice: means[i], count: byMonth[m].length || null, ma3: ma3[i], ma6: ma6[i],
    }));
  }, [rawData, endYear, endMonth, periodMonths]);

  // Price distribution — filtered to period
  const priceDistribution = useMemo(() => {
    const months = new Set(buildMonths(endYear, endMonth, periodMonths));
    const prices = rawData
      .filter(p => p.contract_year && p.contract_month && months.has(ymKey(p.contract_year, p.contract_month)))
      .map(p => p.price_man_won)
      .filter((p): p is number => p !== null);
    const total = prices.length;
    if (!total) return [];
    return PRICE_BUCKETS.map(b => {
      const count = prices.filter(p => p >= b.min && p < b.max).length;
      return { label: b.label, count, pct: Math.round((count / total) * 100) };
    }).filter(b => b.count > 0);
  }, [rawData, endYear, endMonth, periodMonths]);

  // Overview KPI
  const overviewStats = useMemo(() => {
    const months = new Set(buildMonths(endYear, endMonth, periodMonths));
    const prices = rawData
      .filter(p => p.contract_year && p.contract_month && months.has(ymKey(p.contract_year, p.contract_month)))
      .map(p => p.price_man_won)
      .filter((p): p is number => p !== null);
    return calcStats(prices);
  }, [rawData, endYear, endMonth, periodMonths]);

  // Momentum
  const momentum = useMemo(() => {
    const sorted = [...rawData]
      .filter(p => p.contract_year && p.contract_month)
      .sort((a, b) => {
        const ka = ymKey(a.contract_year!, a.contract_month!);
        const kb = ymKey(b.contract_year!, b.contract_month!);
        return kb.localeCompare(ka);
      });
    const latestKey = sorted[0] ? ymKey(sorted[0].contract_year!, sorted[0].contract_month!) : null;
    if (!latestKey) return [];
    const [ly, lm] = latestKey.split("-").map(Number);
    const prevDate = new Date(ly, lm - 2, 1);
    const prevKey = ymKey(prevDate.getFullYear(), prevDate.getMonth() + 1);
    const byDistrict: Record<string, { latest: number[]; prev: number[] }> = {};
    for (const p of rawData) {
      if (!p.sigun_gu || !p.price_man_won || !p.contract_year || !p.contract_month) continue;
      const key = ymKey(p.contract_year, p.contract_month);
      if (!byDistrict[p.sigun_gu]) byDistrict[p.sigun_gu] = { latest: [], prev: [] };
      if (key === latestKey) byDistrict[p.sigun_gu].latest.push(p.price_man_won);
      if (key === prevKey) byDistrict[p.sigun_gu].prev.push(p.price_man_won);
    }
    return Object.entries(byDistrict)
      .map(([district, { latest, prev }]) => {
        if (!latest.length || !prev.length) return null;
        const latestMean = latest.reduce((s, v) => s + v, 0) / latest.length;
        const prevMean = prev.reduce((s, v) => s + v, 0) / prev.length;
        const changePct = ((latestMean - prevMean) / prevMean) * 100;
        return { district, changePct: Math.round(changePct * 10) / 10, latestMean: Math.round(latestMean) };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
      .slice(0, 6);
  }, [rawData]);

  const globalMaxUpper = districtStats[0]?.upper ?? 1;

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-5 py-8">
      {/* Controls */}
      <div className="card p-5 flex flex-wrap items-center gap-4">
        <FilterSelect label="기준 년도" value={String(endYear)} onChange={v => setEndYear(Number(v))}>
          {availableYears.map(y => <option key={y}>{y}</option>)}
        </FilterSelect>
        <FilterSelect label="기준 월" value={String(endMonth)} onChange={v => setEndMonth(Number(v))}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
            <option key={m} value={m}>{m}월</option>
          ))}
        </FilterSelect>
        <FilterSelect label="조회 기간" value={String(periodMonths)} onChange={v => setPeriodMonths(Number(v))}>
          {[6, 12, 24, 36].map(m => <option key={m} value={m}>{m}개월</option>)}
        </FilterSelect>
      </div>

      {/* KPI */}
      {overviewStats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="서울 평균 거래가" value={fmtPrice(overviewStats.mean)} sub={`${overviewStats.count.toLocaleString()}건 기준`} />
          <StatCard label="서울 중위 거래가" value={fmtPrice(overviewStats.median)} sub="이상치 영향 최소화" />
          <StatCard label="총 거래량" value={overviewStats.count.toLocaleString()} sub="서울 25개 자치구 합산" />
          <StatCard label="최고 거래가" value={fmtPrice(overviewStats.max)} sub="조회 기간 내 최고가" tone="accent" />
        </div>
      )}

      {/* Monthly Trend */}
      <Section title="서울 월별 평균 거래가" subtitle="서울 전체 · MA3(단기) · MA6(중기) 이동평균 포함" icon={<Activity className="h-5 w-5 text-[#3182F6]" />}>
        <div className="h-80">
          <ResponsiveContainer>
            <ComposedChart data={monthlyTrend} margin={{ top: 10, right: 16, bottom: 0, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E8EB" />
              <XAxis dataKey="month" stroke="#8B95A1" fontSize={11} tick={{ fill: "#8B95A1" }} />
              <YAxis yAxisId="price" orientation="left" stroke="#8B95A1" fontSize={11} tick={{ fill: "#8B95A1" }} tickFormatter={v => `${(v / 10000).toFixed(0)}억`} width={52} />
              <YAxis yAxisId="count" orientation="right" stroke="#8B95A1" fontSize={11} tick={{ fill: "#8B95A1" }} tickFormatter={v => `${v}건`} width={44} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: "1px solid #E5E8EB", fontSize: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.08)" }}
                formatter={(value: number, name: string) => {
                  if (name === "거래량") return [`${value?.toLocaleString() ?? 0}건`, name];
                  return [fmtPrice(value), name];
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
              <Bar yAxisId="count" dataKey="count" name="거래량" fill="#BFDBFE" opacity={0.7} radius={[3, 3, 0, 0]} />
              <Line yAxisId="price" type="monotone" dataKey="avgPrice" name="평균 거래가" stroke="#191F28" strokeWidth={2.5} dot={false} connectNulls />
              <Line yAxisId="price" type="monotone" dataKey="ma3" name="MA3 단기" stroke="#3182F6" strokeWidth={2} strokeDasharray="7 3" dot={false} connectNulls />
              <Line yAxisId="price" type="monotone" dataKey="ma6" name="MA6 중기" stroke="#F04452" strokeWidth={2} strokeDasharray="3 5" dot={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 rounded-xl bg-[#F2F4F6] px-4 py-3">
          <p className="text-xs leading-relaxed text-[#8B95A1]">
            <strong className="text-[#191F28]">MA3(단기)</strong>: 최근 3개월 이동평균 · <strong className="text-[#191F28]">MA6(중기)</strong>: 6개월 이동평균. 평균가가 MA6 위이면 상승 흐름, 아래이면 하락 흐름.
          </p>
        </div>
      </Section>

      {/* District Table */}
      <Section title="자치구별 시세 비교" subtitle="평균가 기준 내림차순 · 행 클릭 시 자치구 상세 분석" icon={<BarChart2 className="h-5 w-5 text-[#3182F6]" />}>
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
      <Section title="서울 가격대 분포" subtitle="조회 기간 내 실거래 가격 구간별 건수" icon={<BarChart2 className="h-5 w-5 text-[#3182F6]" />}>
        <div className="h-64">
          <ResponsiveContainer>
            <BarChart data={priceDistribution} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E8EB" vertical={false} />
              <XAxis dataKey="label" stroke="#8B95A1" fontSize={12} tick={{ fill: "#8B95A1" }} />
              <YAxis stroke="#8B95A1" fontSize={12} tick={{ fill: "#8B95A1" }} tickFormatter={v => `${v}건`} width={52} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: "1px solid #E5E8EB", fontSize: 12 }}
                formatter={(value: number, _: string, { payload }: any) => [
                  `${value.toLocaleString()}건 · 전체의 ${payload.pct}%`, "거래건수",
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
        <Section title="구별 최근 거래가 변동" subtitle="직전 월 대비 평균 거래가 등락률 · 클릭 시 자치구 분석" icon={<TrendingUp className="h-5 w-5 text-[#3182F6]" />}>
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

function DistrictTab({
  distData, isLoading, district, setDistrict,
  availableYears, endYear, setEndYear, endMonth, setEndMonth, periodMonths, setPeriodMonths,
}: {
  distData: AptDetail[];
  isLoading: boolean;
  district: string; setDistrict: (v: string) => void;
  availableYears: number[];
  endYear: number; setEndYear: (v: number) => void;
  endMonth: number; setEndMonth: (v: number) => void;
  periodMonths: number; setPeriodMonths: (v: number) => void;
}) {
  // Monthly trend
  const monthlyTrend = useMemo(() => {
    const months = buildMonths(endYear, endMonth, periodMonths);
    const byMonth: Record<string, number[]> = {};
    for (const m of months) byMonth[m] = [];
    for (const p of distData) {
      if (p.contract_year && p.contract_month && p.price_man_won) {
        const key = ymKey(p.contract_year, p.contract_month);
        if (byMonth[key] !== undefined) byMonth[key].push(p.price_man_won);
      }
    }
    const means = months.map(m => {
      const prices = byMonth[m];
      return prices.length ? Math.round(prices.reduce((s, v) => s + v, 0) / prices.length) : null;
    });
    const ma3 = movingAvg(means, 3);
    return months.map((m, i) => ({
      month: m.slice(2), avgPrice: means[i], count: byMonth[m].length || null, ma3: ma3[i],
    }));
  }, [distData, endYear, endMonth, periodMonths]);

  // Price distribution
  const priceDistribution = useMemo(() => {
    const prices = distData.map(p => p.price_man_won).filter((p): p is number => p !== null);
    const total = prices.length;
    if (!total) return [];
    return PRICE_BUCKETS.map(b => {
      const count = prices.filter(p => p >= b.min && p < b.max).length;
      return { label: b.label, count, pct: Math.round((count / total) * 100) };
    }).filter(b => b.count > 0);
  }, [distData]);

  // Floor analysis
  const floorAnalysis = useMemo(() => {
    const groups: Record<string, number[]> = {
      "저층(1-5)": [], "중저층(6-10)": [], "중층(11-15)": [], "중고층(16-20)": [], "고층(21+)": [],
    };
    for (const p of distData) {
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
  }, [distData]);

  // Top apartments
  const topApts = useMemo(() => {
    const counts: Record<string, { count: number; prices: number[] }> = {};
    for (const p of distData) {
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
  }, [distData]);

  // KPI
  const kpi = useMemo(() => {
    if (!distData.length) return null;
    const prices = distData.map(p => p.price_man_won).filter((p): p is number => p !== null);
    if (!prices.length) return null;
    const avg = Math.round(prices.reduce((s, v) => s + v, 0) / prices.length);
    const sorted = [...prices].sort((a, b) => a - b);
    const median = sorted.length % 2 === 0
      ? Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2)
      : sorted[Math.floor(sorted.length / 2)];
    return { avg, median, max: Math.max(...prices), count: prices.length };
  }, [distData]);

  const momChange = useMemo(() => {
    const recent = monthlyTrend.filter(m => m.avgPrice !== null);
    if (recent.length < 2) return null;
    const last = recent[recent.length - 1].avgPrice!;
    const prev = recent[recent.length - 2].avgPrice!;
    return Math.round(((last - prev) / prev) * 1000) / 10;
  }, [monthlyTrend]);

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-5 py-8">
      {/* Controls */}
      <div className="card p-5 flex flex-wrap items-center gap-4">
        <FilterSelect label="자치구" value={district} onChange={setDistrict}>
          {SEOUL_DISTRICTS.map(d => <option key={d}>{d}</option>)}
        </FilterSelect>
        <FilterSelect label="기준 년도" value={String(endYear)} onChange={v => setEndYear(Number(v))}>
          {availableYears.map(y => <option key={y}>{y}</option>)}
        </FilterSelect>
        <FilterSelect label="기준 월" value={String(endMonth)} onChange={v => setEndMonth(Number(v))}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
            <option key={m} value={m}>{m}월</option>
          ))}
        </FilterSelect>
        <FilterSelect label="조회 기간" value={String(periodMonths)} onChange={v => setPeriodMonths(Number(v))}>
          {[6, 12, 24, 36].map(m => <option key={m} value={m}>{m}개월</option>)}
        </FilterSelect>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24 text-[#8B95A1]">{district} 데이터 집계 중...</div>
      ) : (
        <>
          {/* KPI */}
          {kpi ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="평균 거래가" value={fmtPrice(kpi.avg)} sub={`${kpi.count.toLocaleString()}건 기준`} />
              <StatCard label="중위 거래가" value={fmtPrice(kpi.median)} sub="이상치 영향 최소화" />
              <StatCard label="거래량" value={kpi.count.toLocaleString()} sub={`${district} 전체`} />
              {momChange !== null ? (
                <StatCard
                  label="전월 대비"
                  value={`${momChange > 0 ? "+" : ""}${momChange}%`}
                  sub="최근 2개월 평균가 비교"
                  tone={momChange > 0 ? "up" : momChange < 0 ? "down" : "neutral"}
                />
              ) : (
                <StatCard label="최고 거래가" value={fmtPrice(kpi.max)} sub="데이터 내 최고가" tone="accent" />
              )}
            </div>
          ) : (
            <div className="card p-8 text-center text-[#8B95A1]">
              {district} 데이터가 없습니다. 다른 자치구를 선택해 주세요.
            </div>
          )}

          {/* Monthly Trend */}
          <Section title={`${district} 월별 평균 거래가`} subtitle="MA3 단기 이동평균 포함" icon={<Activity className="h-5 w-5 text-[#3182F6]" />}>
            <div className="h-80">
              <ResponsiveContainer>
                <ComposedChart data={monthlyTrend} margin={{ top: 10, right: 16, bottom: 0, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E8EB" />
                  <XAxis dataKey="month" stroke="#8B95A1" fontSize={11} tick={{ fill: "#8B95A1" }} />
                  <YAxis yAxisId="price" orientation="left" stroke="#8B95A1" fontSize={11} tick={{ fill: "#8B95A1" }} tickFormatter={v => `${(v / 10000).toFixed(0)}억`} width={52} />
                  <YAxis yAxisId="count" orientation="right" stroke="#8B95A1" fontSize={11} tick={{ fill: "#8B95A1" }} tickFormatter={v => `${v}건`} width={44} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: "1px solid #E5E8EB", fontSize: 12 }}
                    formatter={(value: number, name: string) => {
                      if (name === "거래량") return [`${value?.toLocaleString() ?? 0}건`, name];
                      return [fmtPrice(value), name];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                  <Bar yAxisId="count" dataKey="count" name="거래량" fill="#BFDBFE" opacity={0.7} radius={[3, 3, 0, 0]} />
                  <Line yAxisId="price" type="monotone" dataKey="avgPrice" name="평균 거래가" stroke="#191F28" strokeWidth={2.5} dot={false} connectNulls />
                  <Line yAxisId="price" type="monotone" dataKey="ma3" name="MA3 단기" stroke="#3182F6" strokeWidth={2} strokeDasharray="7 3" dot={false} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Section>

          {/* Price Dist + Floor side by side */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="가격대 분포" subtitle={`${district} 실거래 건수 비중`} icon={<BarChart2 className="h-5 w-5 text-[#3182F6]" />}>
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={priceDistribution} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E8EB" vertical={false} />
                    <XAxis dataKey="label" stroke="#8B95A1" fontSize={10} tick={{ fill: "#8B95A1" }} />
                    <YAxis stroke="#8B95A1" fontSize={11} tick={{ fill: "#8B95A1" }} tickFormatter={v => `${v}건`} width={44} />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: "1px solid #E5E8EB", fontSize: 12 }}
                      formatter={(value: number, _: string, { payload }: any) => [
                        `${value.toLocaleString()}건 · ${payload.pct}%`, "거래건수",
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

            <Section title="층별 평균 거래가" subtitle={`${district} 층 구간별 평균 실거래가`} icon={<TrendingUp className="h-5 w-5 text-[#3182F6]" />}>
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={floorAnalysis} layout="vertical" margin={{ top: 5, right: 60, bottom: 5, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E8EB" horizontal={false} />
                    <XAxis type="number" stroke="#8B95A1" fontSize={11} tick={{ fill: "#8B95A1" }} tickFormatter={v => `${(v / 10000).toFixed(0)}억`} />
                    <YAxis type="category" dataKey="label" stroke="#8B95A1" fontSize={10} tick={{ fill: "#8B95A1" }} width={84} />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: "1px solid #E5E8EB", fontSize: 12 }}
                      formatter={(value: number, _: string, { payload }: any) => [
                        `${fmtPrice(value)} · ${payload.count.toLocaleString()}건`, "평균 거래가",
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
            <Section title={`${district} 주요 거래 단지 TOP 10`} subtitle="거래 건수 기준" icon={<Home className="h-5 w-5 text-[#3182F6]" />}>
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

function FilterSelect({ label, value, onChange, children }: {
  label: string; value: string; onChange: (v: string) => void; children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="whitespace-nowrap text-xs font-semibold uppercase tracking-wider text-[#8B95A1]">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="rounded-lg border border-[#E5E8EB] bg-white px-3 py-1.5 text-sm text-[#191F28] transition focus:outline-none focus:ring-2 focus:ring-[#3182F6]/40"
      >
        {children}
      </select>
    </div>
  );
}

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
