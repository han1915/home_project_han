import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, Legend, BarChart, Cell,
} from "recharts";
import { Activity, BarChart2, TrendingUp, TrendingDown, Minus, Info } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/tracking";

export const Route = createFileRoute("/market")({
  head: () => ({
    meta: [
      { title: "시세 분석 · HomeDirect" },
      { name: "description", content: "서울 아파트 구별 시세 예측, 월별 이동평균, 가격대 분포 분석" },
    ],
  }),
  component: MarketPage,
});

type Property = {
  id: string;
  sigun_gu: string | null;
  price_ten_thousand: number | null;
  area_sqm: number | null;
  contract_date: string | null;
  contract_month: string | null;
};

function fmtPrice(p: number | null | undefined) {
  if (!p) return "-";
  const eok = Math.floor(p / 10000);
  const man = p % 10000;
  return eok > 0 ? `${eok}억 ${man ? man.toLocaleString() + "만" : ""}`.trim() : `${man.toLocaleString()}만`;
}

function calcStats(prices: number[]) {
  if (!prices.length) return null;
  const n = prices.length;
  const mean = prices.reduce((s, v) => s + v, 0) / n;
  const variance = prices.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  const sorted = [...prices].sort((a, b) => a - b);
  const median =
    n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
  return {
    mean: Math.round(mean),
    median: Math.round(median),
    std: Math.round(std),
    lower: Math.round(Math.max(0, mean - std)),
    upper: Math.round(mean + std),
    min: sorted[0],
    max: sorted[n - 1],
    count: n,
  };
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

const PRICE_BUCKETS = [
  { label: "~3억", min: 0, max: 30000 },
  { label: "3~5억", min: 30000, max: 50000 },
  { label: "5~10억", min: 50000, max: 100000 },
  { label: "10~15억", min: 100000, max: 150000 },
  { label: "15~20억", min: 150000, max: 200000 },
  { label: "20~30억", min: 200000, max: 300000 },
  { label: "30억~", min: 300000, max: Infinity },
];

const BAR_COLORS = [
  "oklch(0.72 0.10 230)",
  "oklch(0.62 0.11 240)",
  "oklch(0.55 0.12 248)",
  "oklch(0.44 0.10 255)",
  "oklch(0.34 0.08 258)",
  "oklch(0.28 0.08 260)",
  "oklch(0.22 0.07 260)",
];

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function MarketPage() {
  const now = new Date();
  const [selectedDistrict, setSelectedDistrict] = useState("전체");
  const [endYear, setEndYear] = useState(now.getFullYear());
  const [endMonth, setEndMonth] = useState(now.getMonth() + 1);
  const [periodMonths, setPeriodMonths] = useState(12);

  useEffect(() => {
    trackEvent("market_view");
  }, []);

  const { data: rawData, isLoading } = useQuery({
    queryKey: ["market_properties"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, sigun_gu, price_ten_thousand, area_sqm, contract_date, contract_month")
        .limit(10000);
      if (error) throw error;
      return data as Property[];
    },
  });

  const districts = useMemo(() => {
    if (!rawData) return ["전체"];
    const set = [...new Set(rawData.map((p) => p.sigun_gu).filter(Boolean) as string[])].sort(
      (a, b) => a.localeCompare(b, "ko"),
    );
    return ["전체", ...set];
  }, [rawData]);

  const availableYears = useMemo(() => {
    if (!rawData) return [now.getFullYear()];
    const years = [
      ...new Set(
        rawData
          .map((p) => p.contract_month?.slice(0, 4))
          .filter(Boolean) as string[],
      ),
    ]
      .map(Number)
      .sort((a, b) => b - a);
    return years.length ? years : [now.getFullYear()];
  }, [rawData]);

  // ── 자치구별 시세 통계 (시세 예측 테이블) ──────────────────────────
  const districtStats = useMemo(() => {
    if (!rawData) return [];
    const grouped: Record<string, number[]> = {};
    for (const p of rawData) {
      const k = p.sigun_gu ?? "기타";
      if (!grouped[k]) grouped[k] = [];
      if (p.price_ten_thousand) grouped[k].push(p.price_ten_thousand);
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

  // ── 월별 추이 (선택 구 + 기간) ──────────────────────────────────────
  const monthlyTrend = useMemo(() => {
    if (!rawData) return [];

    const months: string[] = [];
    for (let i = periodMonths - 1; i >= 0; i--) {
      const d = new Date(endYear, endMonth - 1 - i, 1);
      months.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
    }

    const filtered = rawData.filter(
      (p) => selectedDistrict === "전체" || p.sigun_gu === selectedDistrict,
    );

    const byMonth: Record<string, number[]> = {};
    for (const m of months) byMonth[m] = [];
    for (const p of filtered) {
      if (p.contract_month && byMonth[p.contract_month] !== undefined && p.price_ten_thousand) {
        byMonth[p.contract_month].push(p.price_ten_thousand);
      }
    }

    const means = months.map((m) => {
      const prices = byMonth[m];
      return prices.length ? Math.round(prices.reduce((s, v) => s + v, 0) / prices.length) : null;
    });

    const ma3 = movingAvg(means, 3);
    const ma6 = movingAvg(means, 6);

    return months.map((m, i) => ({
      month: m.slice(2),
      avgPrice: means[i],
      count: byMonth[m].length || null,
      ma3: ma3[i],
      ma6: ma6[i],
    }));
  }, [rawData, selectedDistrict, endYear, endMonth, periodMonths]);

  // ── 가격대 분포 ──────────────────────────────────────────────────────
  const priceDistribution = useMemo(() => {
    if (!rawData) return [];
    const prices = rawData
      .filter((p) => selectedDistrict === "전체" || p.sigun_gu === selectedDistrict)
      .map((p) => p.price_ten_thousand)
      .filter((p): p is number => p !== null);
    const total = prices.length;
    if (!total) return [];
    return PRICE_BUCKETS.map((b) => {
      const count = prices.filter((p) => p >= b.min && p < b.max).length;
      return { label: b.label, count, pct: Math.round((count / total) * 100) };
    }).filter((b) => b.count > 0);
  }, [rawData, selectedDistrict]);

  // ── 선택 구 전체 통계 ────────────────────────────────────────────────
  const overviewStats = useMemo(() => {
    if (!rawData) return null;
    const prices = rawData
      .filter((p) => selectedDistrict === "전체" || p.sigun_gu === selectedDistrict)
      .map((p) => p.price_ten_thousand)
      .filter((p): p is number => p !== null);
    return calcStats(prices);
  }, [rawData, selectedDistrict]);

  // ── 최근 거래 급등/급락 구 ───────────────────────────────────────────
  const momentum = useMemo(() => {
    if (!rawData || districtStats.length === 0) return [];
    const sorted = [...rawData]
      .filter((p) => p.contract_month)
      .sort((a, b) => (b.contract_month ?? "").localeCompare(a.contract_month ?? ""));

    const latestMonth = sorted[0]?.contract_month;
    if (!latestMonth) return [];

    const prevMonthDate = new Date(
      Number(latestMonth.slice(0, 4)),
      Number(latestMonth.slice(5, 7)) - 2,
      1,
    );
    const prevMonth = `${prevMonthDate.getFullYear()}-${pad(prevMonthDate.getMonth() + 1)}`;

    const byDistrict: Record<string, { latest: number[]; prev: number[] }> = {};
    for (const p of rawData) {
      if (!p.sigun_gu || !p.price_ten_thousand || !p.contract_month) continue;
      if (!byDistrict[p.sigun_gu]) byDistrict[p.sigun_gu] = { latest: [], prev: [] };
      if (p.contract_month === latestMonth) byDistrict[p.sigun_gu].latest.push(p.price_ten_thousand);
      if (p.contract_month === prevMonth) byDistrict[p.sigun_gu].prev.push(p.price_ten_thousand);
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
  }, [rawData, districtStats]);

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="grid place-items-center py-24 text-muted-foreground">
          시세 데이터 집계 중...
        </div>
      </div>
    );
  }

  if (!rawData?.length) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="mx-auto max-w-3xl px-6 py-24 text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-accent">데이터 없음</p>
          <h1 className="mt-3 font-display text-3xl font-bold">
            실거래 데이터를 먼저 적재해 주세요
          </h1>
          <p className="mt-3 text-muted-foreground">
            데이터 적재 페이지에서 국토부 실거래가 데이터를 가져오면 시세 분석이 자동으로
            시작됩니다.
          </p>
        </div>
      </div>
    );
  }

  const globalMaxUpper = districtStats[0]?.upper ?? 1;

  return (
    <div className="min-h-screen">
      <SiteHeader />

      {/* ─── 페이지 헤더 ─── */}
      <div className="market-page-header border-b border-border">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <p className="text-sm font-semibold uppercase tracking-wider text-accent">
            서울 아파트 실거래
          </p>
          <h1 className="mt-2 font-display text-4xl font-bold">시세 분석</h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            구별 평균·표준편차 기반 시세 범위, 월별 이동평균(MA), 가격대 분포를 한눈에 확인하세요.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-10 px-6 py-10">

        {/* ─── 컨트롤 바 ─── */}
        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-5 card-elevated">
          <FilterSelect label="자치구" value={selectedDistrict} onChange={setSelectedDistrict}>
            {districts.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </FilterSelect>
          <FilterSelect label="기준 년도" value={String(endYear)} onChange={(v) => setEndYear(Number(v))}>
            {availableYears.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </FilterSelect>
          <FilterSelect label="기준 월" value={String(endMonth)} onChange={(v) => setEndMonth(Number(v))}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}월
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            label="조회 기간"
            value={String(periodMonths)}
            onChange={(v) => setPeriodMonths(Number(v))}
          >
            {[6, 12, 24].map((m) => (
              <option key={m} value={m}>
                {m}개월
              </option>
            ))}
          </FilterSelect>
        </div>

        {/* ─── KPI 카드 ─── */}
        {overviewStats && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="평균 거래가"
              value={fmtPrice(overviewStats.mean)}
              sub={`${overviewStats.count.toLocaleString()}건 기준`}
            />
            <StatCard
              label="중위 거래가"
              value={fmtPrice(overviewStats.median)}
              sub="상·하위 이상치 영향 최소화"
            />
            <StatCard
              label="시세 하한"
              value={fmtPrice(overviewStats.lower)}
              sub="평균 − 1σ (표준편차)"
              tone="neutral"
            />
            <StatCard
              label="시세 상한"
              value={fmtPrice(overviewStats.upper)}
              sub="평균 + 1σ (표준편차)"
              tone="accent"
            />
          </div>
        )}

        {/* ─── 월별 평균 거래가 (이동평균 포함) ─── */}
        <Section
          title="월별 평균 거래가"
          subtitle={`${selectedDistrict} · MA3(단기) · MA6(중기) 보조 지표 포함`}
          icon={<Activity className="h-5 w-5 text-accent" />}
        >
          <div className="h-80">
            <ResponsiveContainer>
              <ComposedChart data={monthlyTrend} margin={{ top: 10, right: 16, bottom: 0, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.91 0.012 250)" />
                <XAxis dataKey="month" stroke="oklch(0.48 0.03 255)" fontSize={11} tick={{ fill: "oklch(0.48 0.03 255)" }} />
                <YAxis
                  yAxisId="price"
                  orientation="left"
                  stroke="oklch(0.48 0.03 255)"
                  fontSize={11}
                  tick={{ fill: "oklch(0.48 0.03 255)" }}
                  tickFormatter={(v) => `${(v / 10000).toFixed(0)}억`}
                  width={52}
                />
                <YAxis
                  yAxisId="count"
                  orientation="right"
                  stroke="oklch(0.72 0.10 230)"
                  fontSize={11}
                  tick={{ fill: "oklch(0.72 0.10 230)" }}
                  tickFormatter={(v) => `${v}건`}
                  width={44}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid oklch(0.91 0.012 250)",
                    fontSize: 12,
                    boxShadow: "0 8px 24px oklch(0.22 0.07 260 / 0.10)",
                  }}
                  formatter={(value: number, name: string) => {
                    if (name === "거래량") return [`${value?.toLocaleString() ?? 0}건`, name];
                    return [fmtPrice(value), name];
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
                />
                <Bar
                  yAxisId="count"
                  dataKey="count"
                  name="거래량"
                  fill="oklch(0.85 0.06 230)"
                  opacity={0.45}
                  radius={[3, 3, 0, 0]}
                />
                <Line
                  yAxisId="price"
                  type="monotone"
                  dataKey="avgPrice"
                  name="평균 거래가"
                  stroke="oklch(0.22 0.07 260)"
                  strokeWidth={2.5}
                  dot={false}
                  connectNulls
                />
                <Line
                  yAxisId="price"
                  type="monotone"
                  dataKey="ma3"
                  name="MA3 단기"
                  stroke="oklch(0.55 0.12 248)"
                  strokeWidth={2}
                  strokeDasharray="7 3"
                  dot={false}
                  connectNulls
                />
                <Line
                  yAxisId="price"
                  type="monotone"
                  dataKey="ma6"
                  name="MA6 중기"
                  stroke="oklch(0.58 0.22 25)"
                  strokeWidth={2}
                  strokeDasharray="3 5"
                  dot={false}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 rounded-xl bg-secondary/50 px-4 py-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">MA3(단기)</span>는 최근 3개월 이동평균으로 단기 추세 반전을,{" "}
              <span className="font-semibold text-foreground">MA6(중기)</span>는 6개월 이동평균으로 중기 시장 방향을 나타냅니다.
              평균가가 MA6 위에 있으면 상승 흐름, 아래면 하락 흐름으로 해석합니다.
            </p>
          </div>
        </Section>

        {/* ─── 자치구별 시세 예측 ─── */}
        <Section
          title="자치구별 시세 예측"
          subtitle="평균가 ± 표준편차(1σ) 기반 정상 거래 범위 · 행 클릭 시 해당 구로 전환"
          icon={<BarChart2 className="h-5 w-5 text-accent" />}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="pb-3 text-left font-medium">자치구</th>
                  <th className="pb-3 text-right font-medium">거래건수</th>
                  <th className="pb-3 text-right font-medium">중위가</th>
                  <th className="pb-3 text-right font-medium">평균가</th>
                  <th className="pb-3 text-right font-medium">시세 하한</th>
                  <th className="pb-3 text-right font-medium">시세 상한</th>
                  <th className="pb-3 pl-6 font-medium">범위 시각화</th>
                </tr>
              </thead>
              <tbody>
                {districtStats.map((s) => {
                  const lowerPct = Math.min(95, (s.lower / globalMaxUpper) * 100);
                  const meanPct = Math.min(97, (s.mean / globalMaxUpper) * 100);
                  const upperPct = Math.min(100, (s.upper / globalMaxUpper) * 100);
                  const isSelected = selectedDistrict === s.district;
                  return (
                    <tr
                      key={s.district}
                      onClick={() => setSelectedDistrict(s.district)}
                      className={`cursor-pointer border-b border-border/50 transition hover:bg-secondary/40 ${
                        isSelected ? "bg-accent/8" : ""
                      }`}
                    >
                      <td className={`py-3 font-medium ${isSelected ? "text-accent" : ""}`}>
                        {s.district}
                      </td>
                      <td className="py-3 text-right text-muted-foreground number-tabular">
                        {s.count.toLocaleString()}
                      </td>
                      <td className="py-3 text-right number-tabular">{fmtPrice(s.median)}</td>
                      <td className="py-3 text-right font-semibold number-tabular">
                        {fmtPrice(s.mean)}
                      </td>
                      <td className="py-3 text-right text-muted-foreground number-tabular">
                        {fmtPrice(s.lower)}
                      </td>
                      <td className="py-3 text-right text-muted-foreground number-tabular">
                        {fmtPrice(s.upper)}
                      </td>
                      <td className="py-3 pl-6">
                        <div className="relative h-3 w-36 overflow-hidden rounded-full bg-muted">
                          <div
                            className="absolute h-full rounded-full bg-accent/25"
                            style={{
                              left: `${lowerPct}%`,
                              width: `${Math.max(0, upperPct - lowerPct)}%`,
                            }}
                          />
                          <div
                            className="absolute top-0.5 h-2 w-1 rounded-sm bg-accent"
                            style={{ left: `${meanPct}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-secondary/50 px-4 py-3">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              시세 하한/상한 = 평균 ± 표준편차(1σ). 정규분포 가정 시 전체 거래의 약 <strong className="text-foreground">68%</strong>가 이 구간 내에 분포합니다.
              중위가는 상·하위 이상 거래의 영향을 받지 않아 실제 시장 체감가에 더 가깝습니다.
            </p>
          </div>
        </Section>

        {/* ─── 가격대 분포 ─── */}
        <Section
          title="가격대 분포"
          subtitle={`${selectedDistrict} 실거래 건수 비중`}
          icon={<BarChart2 className="h-5 w-5 text-accent" />}
        >
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={priceDistribution} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.91 0.012 250)" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="oklch(0.48 0.03 255)"
                  fontSize={12}
                  tick={{ fill: "oklch(0.48 0.03 255)" }}
                />
                <YAxis
                  stroke="oklch(0.48 0.03 255)"
                  fontSize={12}
                  tick={{ fill: "oklch(0.48 0.03 255)" }}
                  tickFormatter={(v) => `${v}건`}
                  width={48}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid oklch(0.91 0.012 250)",
                    fontSize: 12,
                    boxShadow: "0 8px 24px oklch(0.22 0.07 260 / 0.10)",
                  }}
                  formatter={(value: number, _: string, { payload }: any) => [
                    `${value.toLocaleString()}건 · 전체의 ${payload.pct}%`,
                    "거래건수",
                  ]}
                />
                <Bar dataKey="count" name="거래건수" radius={[6, 6, 0, 0]}>
                  {priceDistribution.map((_, idx) => (
                    <Cell
                      key={idx}
                      fill={BAR_COLORS[Math.min(idx, BAR_COLORS.length - 1)]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {priceDistribution.map((b, idx) => (
              <span
                key={b.label}
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs"
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: BAR_COLORS[Math.min(idx, BAR_COLORS.length - 1)] }}
                />
                {b.label} · {b.pct}%
              </span>
            ))}
          </div>
        </Section>

        {/* ─── 구별 거래가 변동 현황 ─── */}
        {momentum.length > 0 && (
          <Section
            title="구별 최근 거래가 변동"
            subtitle="직전 월 대비 평균 거래가 등락률 (데이터 충분한 구 기준)"
            icon={<TrendingUp className="h-5 w-5 text-accent" />}
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {momentum.map((m) => {
                const up = m.changePct > 0;
                const flat = Math.abs(m.changePct) < 0.5;
                return (
                  <button
                    key={m.district}
                    onClick={() => setSelectedDistrict(m.district)}
                    className="flex items-center justify-between rounded-xl border border-border bg-background px-4 py-3 text-left transition hover:border-accent/50 hover:bg-secondary/30"
                  >
                    <div>
                      <div className="font-medium">{m.district}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground number-tabular">
                        {fmtPrice(m.latestMean)}
                      </div>
                    </div>
                    <div
                      className={`flex items-center gap-1 text-sm font-bold number-tabular ${
                        flat
                          ? "text-muted-foreground"
                          : up
                          ? "text-emerald-600"
                          : "text-destructive"
                      }`}
                    >
                      {flat ? (
                        <Minus className="h-4 w-4" />
                      ) : up ? (
                        <TrendingUp className="h-4 w-4" />
                      ) : (
                        <TrendingDown className="h-4 w-4" />
                      )}
                      {up ? "+" : ""}
                      {m.changePct}%
                    </div>
                  </button>
                );
              })}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

// ── 공통 컴포넌트 ──────────────────────────────────────────────────────

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="whitespace-nowrap text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm transition focus:outline-none focus:ring-2 focus:ring-accent/40"
      >
        {children}
      </select>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "accent" | "neutral";
}) {
  return (
    <div className="card-elevated rounded-2xl border border-border bg-card p-5">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={`mt-2 font-display text-2xl font-bold number-tabular ${
          tone === "accent"
            ? "text-accent"
            : tone === "neutral"
            ? "text-muted-foreground"
            : "text-primary"
        }`}
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Section({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-5 flex items-center gap-3">
        {icon && (
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-secondary">
            {icon}
          </div>
        )}
        <div>
          <h2 className="font-display text-xl font-bold">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      <div className="card-elevated rounded-2xl border border-border bg-card p-6">{children}</div>
    </section>
  );
}
