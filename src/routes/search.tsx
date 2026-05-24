import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Ruler, Calendar, ArrowUpRight } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/tracking";

export const Route = createFileRoute("/search")({
  head: () => ({ meta: [{ title: "실거래 조회 · HomeDirect" }] }),
  component: SearchPage,
});

const DISTRICTS = [
  "전체","강남구","서초구","송파구","강동구","마포구","용산구","성동구","광진구","동작구",
  "영등포구","양천구","강서구","구로구","금천구","관악구","서대문구","은평구","종로구","중구",
  "성북구","노원구","도봉구","강북구","동대문구","중랑구",
];

type Apt = {
  id: string;
  apt_name: string;
  sigun_gu: string;
  dong: string | null;
  area_sqm: number | null;
  floor: number | null;
  building_year: number | null;
  contract_year: number;
  contract_month: number;
  price_man_won: number;
};

function fmtPrice(p: number) {
  const eok = Math.floor(p / 10000);
  const man = p % 10000;
  if (eok > 0 && man > 0) return `${eok}억 ${man.toLocaleString()}만`;
  if (eok > 0) return `${eok}억`;
  return `${man.toLocaleString()}만`;
}

function SearchPage() {
  const [gu, setGu] = useState("전체");
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 300000]);
  const [areaRange, setAreaRange] = useState<[number, number]>([0, 300]);

  useEffect(() => { trackEvent("search_start"); }, []);
  useEffect(() => {
    const t = setTimeout(() => trackEvent("search_filter_apply", { sigun_gu: gu, price_min: priceRange[0], price_max: priceRange[1] }), 400);
    return () => clearTimeout(t);
  }, [gu, priceRange, areaRange]);

  const { data, isLoading } = useQuery({
    queryKey: ["apartments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("apartments")
        .select("id,apt_name,sigun_gu,dong,area_sqm,floor,building_year,contract_year,contract_month,price_man_won")
        .order("contract_year", { ascending: false })
        .order("contract_month", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data as Apt[];
    },
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter((p) => {
      if (gu !== "전체" && p.sigun_gu !== gu) return false;
      if (p.price_man_won < priceRange[0] || p.price_man_won > priceRange[1]) return false;
      if (p.area_sqm != null && (p.area_sqm < areaRange[0] || p.area_sqm > areaRange[1])) return false;
      return true;
    });
  }, [data, gu, priceRange, areaRange]);

  return (
    <div className="min-h-screen bg-[#F2F4F6]">
      <SiteHeader />
      <div className="bg-white border-b border-[#E5E8EB] px-5 py-8">
        <div className="mx-auto max-w-7xl">
          <h1 className="text-2xl font-bold text-[#191F28]">실거래 조회</h1>
          <p className="mt-1 text-sm text-[#8B95A1]">
            조건에 맞는 실거래{" "}
            <span className="font-semibold text-[#3182F6]">{filtered.length.toLocaleString()}건</span>
          </p>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-5 py-8 grid gap-8 lg:grid-cols-[260px_1fr]">
        {/* Filters */}
        <aside className="space-y-6 lg:sticky lg:top-20 lg:self-start">
          <div className="card p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8B95A1] mb-3">자치구</h3>
            <div className="flex flex-wrap gap-1.5">
              {DISTRICTS.map((d) => (
                <button
                  key={d}
                  onClick={() => setGu(d)}
                  className={`rounded-lg border px-2.5 py-1 text-xs transition ${
                    gu === d
                      ? "border-[#3182F6] bg-[#3182F6] text-white"
                      : "border-[#E5E8EB] bg-white text-[#8B95A1] hover:border-[#3182F6] hover:text-[#3182F6]"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div className="card p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8B95A1] mb-3">가격대 (만원)</h3>
            <Slider
              value={priceRange}
              min={0}
              max={300000}
              step={5000}
              onValueChange={(v) => setPriceRange([v[0], v[1]] as [number, number])}
              className="my-4"
            />
            <div className="flex justify-between text-xs text-[#8B95A1] number-tabular">
              <span>{fmtPrice(priceRange[0])}</span>
              <span>{fmtPrice(priceRange[1])}{priceRange[1] >= 300000 ? "+" : ""}</span>
            </div>
          </div>
          <div className="card p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8B95A1] mb-3">전용면적 (㎡)</h3>
            <Slider
              value={areaRange}
              min={0}
              max={300}
              step={5}
              onValueChange={(v) => setAreaRange([v[0], v[1]] as [number, number])}
              className="my-4"
            />
            <div className="flex justify-between text-xs text-[#8B95A1] number-tabular">
              <span>{areaRange[0]}㎡</span>
              <span>{areaRange[1]}{areaRange[1] >= 300 ? "+" : ""}㎡</span>
            </div>
          </div>
        </aside>
        {/* Results */}
        <div>
          {isLoading ? (
            <div className="flex items-center justify-center py-24 text-[#8B95A1]">불러오는 중...</div>
          ) : filtered.length === 0 ? (
            <div className="card flex items-center justify-center py-24 text-[#8B95A1]">
              조건에 맞는 매물이 없습니다.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {filtered.map((p) => (
                <div
                  key={p.id}
                  onClick={() => trackEvent("property_view")}
                  className="card p-5 cursor-pointer hover:shadow-lg transition-shadow group"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-xs font-semibold text-[#3182F6] bg-[#EFF6FF] px-2 py-0.5 rounded-md">
                        {p.sigun_gu}
                      </span>
                      {p.dong && <span className="ml-1 text-xs text-[#8B95A1]">{p.dong}</span>}
                      <h3 className="mt-2 font-bold text-[#191F28] text-base leading-tight">{p.apt_name}</h3>
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-[#8B95A1] group-hover:text-[#3182F6] transition-colors" />
                  </div>
                  <div className="mt-3 font-bold text-xl text-[#3182F6] number-tabular">
                    {fmtPrice(p.price_man_won)}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-[#8B95A1]">
                    {p.area_sqm != null && (
                      <span className="flex items-center gap-1">
                        <Ruler className="h-3 w-3" />{p.area_sqm}㎡
                      </span>
                    )}
                    {p.floor != null && <span>{p.floor}층</span>}
                    {p.building_year != null && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />{p.building_year}년
                      </span>
                    )}
                    <span className="flex items-center gap-1 ml-auto font-medium text-[#191F28]">
                      {p.contract_year}.{String(p.contract_month).padStart(2, "0")} 거래
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
