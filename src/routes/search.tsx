import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Calendar, Ruler, ArrowUpRight } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/tracking";

export const Route = createFileRoute("/search")({
  head: () => ({
    meta: [
      { title: "실거래 조회 · HomeDirect" },
      { name: "description", content: "자치구·가격·거래 유형으로 서울 아파트 실거래 내역을 빠르게 조회하세요." },
    ],
  }),
  component: SearchPage,
});

const DISTRICTS = [
  "전체", "강남구", "서초구", "송파구", "강동구", "마포구", "용산구", "성동구",
  "광진구", "동작구", "영등포구", "양천구", "강서구", "구로구", "금천구", "관악구",
  "서대문구", "은평구", "종로구", "중구", "성북구", "노원구", "도봉구", "강북구",
  "동대문구", "중랑구",
];
const TYPES = ["전체", "매매"];

type Property = {
  id: string;
  location: string;
  district: string | null;
  sigun_gu: string | null;
  area_sqm: number | null;
  price_ten_thousand: number | null;
  building_year: number | null;
  transaction_type: string | null;
  road_address: string | null;
  contract_date: string | null;
  description: string | null;
  apt_name: string | null;
  floor: number | null;
};

function fmtPrice(p: number | null) {
  if (!p) return "-";
  const eok = Math.floor(p / 10000);
  const man = p % 10000;
  return eok > 0 ? `${eok}억 ${man ? man.toLocaleString() + "만" : ""}`.trim() : `${man.toLocaleString()}만`;
}

function SearchPage() {
  const [sigunGu, setSigunGu] = useState("전체");
  const [type, setType] = useState("전체");
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 900000]);

  useEffect(() => {
    trackEvent("search_start");
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      trackEvent("search_filter_apply", { sigun_gu: sigunGu, transaction_type: type, price_min: priceRange[0], price_max: priceRange[1] });
    }, 400);
    return () => clearTimeout(t);
  }, [sigunGu, type, priceRange]);

  const { data, isLoading } = useQuery({
    queryKey: ["properties"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("*")
        .order("contract_date", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as Property[];
    },
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter((p) => {
      if (sigunGu !== "전체" && p.sigun_gu !== sigunGu) return false;
      if (type !== "전체" && p.transaction_type !== type) return false;
      const price = p.price_ten_thousand ?? 0;
      if (price < priceRange[0] || price > priceRange[1]) return false;
      return true;
    });
  }, [data, sigunGu, type, priceRange]);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="border-b border-border page-section-header">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <h1 className="font-display text-3xl font-bold">실거래 조회</h1>
          <p className="mt-2 text-muted-foreground">서울 아파트 실거래 내역 {filtered.length.toLocaleString()}건이 조건에 부합합니다.</p>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-8 px-6 py-10 lg:grid-cols-[280px_1fr]">
        {/* Filters */}
        <aside className="space-y-8 lg:sticky lg:top-24 lg:self-start">
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">자치구</h3>
            <div className="flex flex-wrap gap-2">
              {DISTRICTS.map((d) => (
                <button
                  key={d}
                  onClick={() => setSigunGu(d)}
                  className={`rounded-full border px-3 py-1.5 text-sm transition ${
                    sigunGu === d
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-accent hover:text-primary"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">거래 유형</h3>
            <div className="flex flex-wrap gap-2">
              {TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`rounded-full border px-3 py-1.5 text-sm transition ${
                    type === t
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-accent hover:text-primary"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">가격대 (만원)</h3>
            <Slider
              value={priceRange}
              min={0}
              max={900000}
              step={10000}
              onValueChange={(v) => setPriceRange([v[0], v[1]] as [number, number])}
              className="my-4"
            />
            <div className="flex justify-between text-xs text-muted-foreground number-tabular">
              <span>{fmtPrice(priceRange[0])}</span>
              <span>{fmtPrice(priceRange[1])}</span>
            </div>
          </div>
        </aside>

        {/* Results */}
        <div>
          {isLoading ? (
            <div className="grid place-items-center py-24 text-muted-foreground">불러오는 중...</div>
          ) : filtered.length === 0 ? (
            <div className="grid place-items-center rounded-2xl border border-dashed border-border py-24 text-muted-foreground">
              조건에 맞는 매물이 없습니다.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {filtered.map((p) => (
                <Link
                  key={p.id}
                  to="/properties/$id"
                  params={{ id: p.id }}
                  className="card-elevated group rounded-2xl border border-border bg-card p-5 transition hover:border-accent/50 hover:shadow-[var(--shadow-elevated)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-medium text-accent">
                        <span className="rounded-md bg-accent/10 px-2 py-0.5">{p.transaction_type}</span>
                        <span className="text-muted-foreground">{p.sigun_gu} · {p.district}</span>
                      </div>
                      <h3 className="mt-2 font-display text-lg font-semibold leading-tight">{p.apt_name ?? p.location}</h3>
                    </div>
                    <ArrowUpRight className="h-5 w-5 text-muted-foreground transition group-hover:text-accent" />
                  </div>
                  <div className="mt-4 font-display text-2xl font-bold text-primary number-tabular">
                    {fmtPrice(p.price_ten_thousand)}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {p.area_sqm != null && <span className="inline-flex items-center gap-1"><Ruler className="h-3 w-3" />{p.area_sqm}㎡</span>}
                    {p.floor != null && <span className="inline-flex items-center gap-1">{p.floor}층</span>}
                    {p.building_year != null && <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{p.building_year}년</span>}
                    {p.road_address && <span className="inline-flex items-center gap-1 truncate"><MapPin className="h-3 w-3" />{p.road_address}</span>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
