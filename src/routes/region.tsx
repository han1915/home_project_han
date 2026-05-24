import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, Legend, BarChart, Cell, ScatterChart, Scatter, ZAxis,
} from "recharts";
import { Activity, BarChart2, TrendingUp, TrendingDown, Minus, MapPin, Home } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/tracking";

export const Route = createFileRoute("/region")({
  head: () => ({
    meta: [
      { title: "지역 분석 · HomeDirect" },
      { name: "description", content: "서울 자치구별 상세 부동산 분석, 월별 추세, 가격 분포, 층별 분석" },
    ],
  }),
  component: RegionPage,
});

const SEOUL_DISTRICTS = [
  "강남구", "강동구", "강북구", "강서구", "관악구",
  "광진구", "구로구", "금천구", "노원구", "도봉구",
  "동대문구", "동작구", "마포구", "서대문구", "서초구",
  "성동구", "성북구", "송파구", "양천구", "영등포구",
  "용산구", "은평구", "종로구", "중구", "중랑구",
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

const BAR_COLORS = ["#BFDBFE", "#93C5FD", "#60A5FA", "#3B82F6", "#2563EB", "#1D4ED8", "#1E40AF"];

type Apt = {
  id: string;
  apt_name: string | null;
  sigun_gu: string | null;
  price_man_won: number | null;
  area_sqm: number | null;
  floor: number | null;
  contract_year: number | null;
  contract_month: number | null;
};

function fmtPrice(p: number | null | undefined) {
  if (p == null) return "-";
  const eok = Math.floor(p / 10000);
  const man = p % 10000;
  if (eok > 0 && man > 0) return `${eok}억 ${man.toLocaleString()}만`;
  if (eok > 0) return `${eok}억`;
  return `${man.toLocaleString()}만`;
}

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function ymKey(year: number, month: number) {
  return `${year}-${pad(month)}`;
}

function movingAvg(values: (number | null)[], period: number): (number | null)[] {
  return values.map((_, i) => {
    const window = values
      .slice(Math.max(0, i - period + 1), i + 1)
      .filter((v): v is number => v !== null);
    if (window.length < period) return null;
    return Math.round(window.reduce((s, v) => s + v, 0) / window.length);
  });
}

function RegionPage() {
  const now = new Date();
  const [district, setDistrict] = useState("강남구");
  const [endYear, setEndYear] = useState(now.getFullYear());
  const [endMonth, setEndMonth] = useState(now.getMonth() + 1);
  const [periodMonths, setPeriodMonths] = useState(12);

  useEffect(() => { trackEvent("region_view", { district }); }, [district]);

  const { data: rawData, isLoading } = useQuery({
    queryKey: ["region_apartments", district],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("apartments")
        .select("id,apt_name,sigun_gu,price_man_won,area_sqm,floor,contract_year,contract_month")
        .eq("sigun_gu", district)
        .limit(20000);
      if (error) throw error;
      return data as Apt[];
    },
  });

  const availableYears = useMemo(() => {
    if (!rawData) return [now.getFullYear()];
    const years = [...new Set(rawData.map((p) => p.contract_year).filter(Boolean) as number[])].sort((a, b) => b - a);
    return years.length ? years : [now.getFullYear()];
  }, [rawData]);

  // Monthly trend
  const monthlyTrend = useMemo(() => {
    if (!rawData) return [];
    const months: string[] = [];
    for (let i = periodMonths - 1; i >= 0; i--) {
      const d = new Date(endYear, endMonth - 1 - i, 1);
      months.push(ymKey(d.getFullYear(), d.getMonth() + 1));
    }
    const byMonth: Record<string, number[]> = {};
    for (const m of months) byMonth[m] = [];
    for (const p of rawData) {
      if (p.contract_year && p.contract_month && p.price_man_won) {
        const key = ymKey(p.contract_year, p.contract_month);
        if (byMonth[key] !== undefined) byMonth[key].push(p.price_man_won);
      }
    }
    const means = months.map((m) => {
      const prices = byMonth[m];
      return prices.length ? Math.round(prices.reduce((s, v) => s + v, 0) / prices.length) : null;
    });
    const ma3 = movingAvg(means, 3);
    return months.map((m, i) => ({
      month: m.slice(2),
      avgPrice: means[i],
      count: byMonth[m].length || null,
      ma3: ma3[i],
    }));
  }, [rawData, endYear, endMonth, periodMonths]);

  // Price distribution
  const priceDistribution = useMemo(() => {
    if (!rawData) return [];
    const prices = rawData.map((p) => p.price_man_won).filter((p): p is number => p !== null);
    const total = prices.length;
    if (!total) return [];
    return PRICE_BUCKETS.map((b) => {
      const count = prices.filter((p) => p >= b.min && p < b.max).length;
      return { label: b.label, count, pct: Math.round((count / total) * 100) };
    }).filter((b) => b.count > 0);
  }, [rawData]);

  // Floor analysis
  const floorAnalysis = useMemo(() => {
    if (!rawData) return [];
    const groups: Record<string, number[]> = {
      "저층(1-5)": [], "중저층(6-10)": [], "중층(11-15)": [], "중고층(16-20)": [], "고층(21+)": [],
    };
    for (const p of rawData) {
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
        const avg = Math.round(prices.reduce((s, v) => s + v, 0) / prices.length);
        return { label, avg, count: prices.length };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [rawData]);

  // Top apartments by transaction count
  const topApts = useMemo(() => {
    if (!rawData) return [];
    const counts: Record<string, { count: number; prices: number[] }> = {};
    for (const p of rawData) {
      const name = p.apt_name ?? "미상";
      if (!counts[name]) counts[name] = { count: 0, prices: [] };
      counts[name].count++;
      if (p.price_man_won) counts[name].prices.push(p.price_man_won);
    }
    return Object.entries(counts)
      .map(([name, { count, prices }]) => {
        const avg = prices.length ? Math.round(prices.reduce((s, v) => s + v, 0) / prices.length) : null;
        const max = prices.length ? Math.max(...prices) : null;
        return { name, count, avg, max };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [rawData]);

  // Area vs price scatter (sample)
  const areaScatter = useMemo(() => {
    if (!rawData) return [];
    return rawData
      .filter((p) => p.area_sqm && p.price_man_won && p.area_sqm > 10 && p.area_sqm < 500)
      .slice(0, 500)
      .map((p) => ({ area: Math.round(p.area_sqm!), price: p.price_man_won! }));
  }, [rawData]);

  // KPI
  const kpi = useMemo(() => {
    if (!rawData || !rawData.length) return null;
    const prices = rawData.map((p) => p.price_man_won).filter((p): p is number => p !== null);
    if (!prices.length) return null;
    const avg = Math.round(prices.reduce((s, v) => s + v, 0) / prices.length);
    const max = Math.max(...prices);
    const sorted = [...prices].sort((a, b) => a - b);
    const median = sorted.length % 2 === 0
      ? Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2)
      : sorted[Math.floor(sorted.length / 2)];

    // month-over-month from trend data (computed after monthlyTrend)
    return { avg, median, max, count: prices.length };
  }, [rawData]);

  const momChange = useMemo(() => {
    const recent = monthlyTrend.filter((m) => m.avgPrice !== null);
    if (recent.length < 2) return null;
    const last = recent[recent.length - 1].avgPrice!;
    const prev = recent[recent.length - 2].avgPrice!;
    return Math.round(((last - prev) / prev) * 1000) / 10;
  }, [monthlyTrend]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F2F4F6]">
        <SiteHeader />
        <div className="flex items-center justify-center py-24 text-[#8B95A1]">
          {district} 데이터 집계 중...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F2F4F6]">
      <SiteHeader />

      {/* Page Header */}
      <div className="bg-white border-b border-[#E5E8EB]">
        <div className="mx-auto max-w-7xl px-5 py-8">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-[#3182F6]" />
            <h1 className="text-2xl font-bold text-[#191F28]">지역 분석</h1>
          </div>
          <p className="mt-1 text-sm text-[#8B95A1]">
            자치구별 상세 분석 · 월별 추세 · 가격 분포 · 층별 분석 · 주요 단지
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-8 px-5 py-8">

        {/* Controls */}
        <div className="card p-5 flex flex-wrap items-center gap-4">
          <FilterSelect label="자치구" value={district} onChange={setDistrict}>
            {SEOUL_DISTRICTS.map((d) => <option key={d}>{d}</option>)}
          </FilterSelect>
          <FilterSelect label="기준 년도" value={String(endYear)} onChange={(v) => setEndYear(Number(v))}>
            {availableYears.map((y) => <option key={y}>{y}</option>)}
          </FilterSelect>
          <FilterSelect label="기준 월" value={String(endMonth)} onChange={(v) => setEndMonth(Number(v))}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>{m}월</option>
            ))}
          </FilterSelect>
          <FilterSelect label="조회 기간" value={String(periodMonths)} onChange={(v) => setPeriodMonths(Number(v))}>
            {[6, 12, 24, 36].map((m) => (
              <option key={m} value={m}>{m}개월</option>
            ))}
          </FilterSelect>
        </div>

        {/* KPI Cards */}
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
        ) : !isLoading && (
          <div className="card p-8 text-center text-[#8B95A1]">
            {district} 데이터가 없습니다. 다른 자치구를 선택해 주세요.
          </div>
        )}

        {/* Monthly Trend */}
        <Section
          title="월별 평균 거래가 추이"
          subtitle={`${district} · MA3 단기 이동평균 포함`}
          icon={<Activity className="h-5 w-5 text-[#3182F6]" />}
        >
          <div className="h-80">
            <ResponsiveContainer>
              <ComposedChart data={monthlyTrend} margin={{ top: 10, right: 16, bottom: 0, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E8EB" />
                <XAxis dataKey="month" stroke="#8B95A1" fontSize={11} tick={{ fill: "#8B95A1" }} />
                <YAxis
                  yAxisId="price"
                  orientation="left"
                  stroke="#8B95A1"
                  fontSize={11}
                  tick={{ fill: "#8B95A1" }}
                  tickFormatter={(v) => `${(v / 10000).toFixed(0)}억`}
                  width={52}
                />
                <YAxis
                  yAxisId="count"
                  orientation="right"
                  stroke="#8B95A1"
                  fontSize={11}
                  tick={{ fill: "#8B95A1" }}
                  tickFormatter={(v) => `${v}건`}
                  width={44}
                />
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
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Section>

        {/* Price Distribution + Floor Analysis side by side */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Section
            title="가격대 분포"
            subtitle={`${district} 실거래 가격 구간별 건수`}
            icon={<BarChart2 className="h-5 w-5 text-[#3182F6]" />}
          >
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={priceDistribution} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E8EB" vertical={false} />
                  <XAxis dataKey="label" stroke="#8B95A1" fontSize={10} tick={{ fill: "#8B95A1" }} />
                  <YAxis stroke="#8B95A1" fontSize={11} tick={{ fill: "#8B95A1" }} tickFormatter={(v) => `${v}건`} width={44} />
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

          <Section
            title="층별 평균 거래가"
            subtitle={`${district} 층 구간별 평균 실거래가`}
            icon={<TrendingUp className="h-5 w-5 text-[#3182F6]" />}
          >
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={floorAnalysis} layout="vertical" margin={{ top: 5, right: 60, bottom: 5, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E8EB" horizontal={false} />
                  <XAxis
                    type="number"
                    stroke="#8B95A1"
                    fontSize={11}
                    tick={{ fill: "#8B95A1" }}
                    tickFormatter={(v) => `${(v / 10000).toFixed(0)}억`}
                  />
                  <YAxis type="category" dataKey="label" stroke="#8B95A1" fontSize={10} tick={{ fill: "#8B95A1" }} width={80} />
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

        {/* Area vs Price Scatter */}
        {areaScatter.length > 0 && (
          <Section
            title="면적 대비 거래가"
            subtitle={`${district} 전용면적(㎡) vs 거래가 산포도 (최대 500건 샘플)`}
            icon={<BarChart2 className="h-5 w-5 text-[#3182F6]" />}
          >
            <div className="h-72">
              <ResponsiveContainer>
                <ScatterChart margin={{ top: 10, right: 16, bottom: 10, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E8EB" />
                  <XAxis
                    type="number"
                    dataKey="area"
                    name="전용면적"
                    stroke="#8B95A1"
                    fontSize={11}
                    tick={{ fill: "#8B95A1" }}
                    tickFormatter={(v) => `${v}㎡`}
                    label={{ value: "전용면적 (㎡)", position: "insideBottom", offset: -5, fill: "#8B95A1", fontSize: 11 }}
                  />
                  <YAxis
                    type="number"
                    dataKey="price"
                    name="거래가"
                    stroke="#8B95A1"
                    fontSize={11}
                    tick={{ fill: "#8B95A1" }}
                    tickFormatter={(v) => `${(v / 10000).toFixed(0)}억`}
                    width={52}
                  />
                  <ZAxis range={[20, 20]} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: "1px solid #E5E8EB", fontSize: 12 }}
                    formatter={(value: number, name: string) => {
                      if (name === "전용면적") return [`${value}㎡`, name];
                      return [fmtPrice(value), "거래가"];
                    }}
                  />
                  <Scatter data={areaScatter} fill="#3182F6" fillOpacity={0.35} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </Section>
        )}

        {/* Top Apartments */}
        {topApts.length > 0 && (
          <Section
            title="주요 거래 단지 TOP 10"
            subtitle={`${district} 거래 건수 기준 상위 단지`}
            icon={<Home className="h-5 w-5 text-[#3182F6]" />}
          >
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
      </div>
    </div>
  );
}

function FilterSelect({
  label, value, onChange, children,
}: {
  label: string; value: string; onChange: (v: string) => void; children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="whitespace-nowrap text-xs font-semibold uppercase tracking-wider text-[#8B95A1]">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
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
  const color =
    tone === "accent" ? "text-[#3182F6]" :
    tone === "up" ? "text-emerald-600" :
    tone === "down" ? "text-[#F04452]" :
    "text-[#191F28]";
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
        {icon && (
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#EFF6FF]">
            {icon}
          </div>
        )}
        <div>
          <h2 className="text-xl font-bold text-[#191F28]">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-[#8B95A1]">{subtitle}</p>}
        </div>
      </div>
      <div className="card p-6">{children}</div>
    </section>
  );
}
