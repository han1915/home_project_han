import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Ruler, Calendar, Heart, X, TrendingUp, TrendingDown, Building2 } from "lucide-react";
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
  jibun: string | null;
  area_sqm: number | null;
  floor: number | null;
  building_year: number | null;
  contract_year: number;
  contract_month: number;
  contract_day: number | null;
  price_man_won: number;
};

function fmtPrice(p: number) {
  const eok = Math.floor(p / 10000);
  const man = p % 10000;
  if (eok > 0 && man > 0) return `${eok}억 ${man.toLocaleString()}만`;
  if (eok > 0) return `${eok}억`;
  return `${man.toLocaleString()}만`;
}

function fmtDate(year: number, month: number, day?: number | null) {
  if (day) return `${year}.${String(month).padStart(2, "0")}.${String(day).padStart(2, "0")}`;
  return `${year}.${String(month).padStart(2, "0")}`;
}

function loadFavorites(): Set<string> {
  try {
    const stored = localStorage.getItem("hd_favorites");
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch { return new Set(); }
}

function saveFavorites(fav: Set<string>) {
  localStorage.setItem("hd_favorites", JSON.stringify([...fav]));
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────

function AptDetailModal({
  apt,
  allData,
  favorites,
  onToggleFav,
  onClose,
}: {
  apt: Apt;
  allData: Apt[];
  favorites: Set<string>;
  onToggleFav: (id: string) => void;
  onClose: () => void;
}) {
  const isFav = favorites.has(apt.id);

  // Price per sqm
  const pricePerSqm = apt.area_sqm && apt.area_sqm > 0
    ? Math.round(apt.price_man_won / apt.area_sqm)
    : null;

  // Same apartment transaction history (same name + dong)
  const history = useMemo(() => {
    return allData
      .filter(
        (p) =>
          p.apt_name === apt.apt_name &&
          p.sigun_gu === apt.sigun_gu &&
          (p.dong === apt.dong || (!p.dong && !apt.dong))
      )
      .sort((a, b) => {
        const ka = a.contract_year * 100 + a.contract_month;
        const kb = b.contract_year * 100 + b.contract_month;
        return kb - ka;
      })
      .slice(0, 12);
  }, [apt, allData]);

  // Price trend vs previous transaction
  const priceTrend = useMemo(() => {
    const idx = history.findIndex((h) => h.id === apt.id);
    if (idx === -1 || idx >= history.length - 1) return null;
    const prev = history[idx + 1];
    const change = apt.price_man_won - prev.price_man_won;
    const pct = Math.round((change / prev.price_man_won) * 1000) / 10;
    return { change, pct };
  }, [apt, history]);

  // Close on backdrop click or Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 rounded-t-3xl sm:rounded-t-2xl bg-white px-5 pt-5 pb-4 border-b border-[#E5E8EB]">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-[#3182F6] bg-[#EFF6FF] px-2 py-0.5 rounded-md">
                {apt.sigun_gu}
              </span>
              {apt.dong && <span className="text-xs text-[#8B95A1]">{apt.dong}</span>}
            </div>
            <h2 className="mt-1.5 text-xl font-bold text-[#191F28] leading-snug">{apt.apt_name}</h2>
            <div className="mt-2 text-2xl font-extrabold text-[#3182F6]">{fmtPrice(apt.price_man_won)}</div>
            {priceTrend && (
              <div className={`mt-1 flex items-center gap-1 text-sm font-semibold ${priceTrend.pct > 0 ? "text-[#F04452]" : "text-emerald-600"}`}>
                {priceTrend.pct > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                직전 거래 대비 {priceTrend.pct > 0 ? "+" : ""}{priceTrend.pct}%
                <span className="text-[#8B95A1] font-normal">
                  ({priceTrend.change > 0 ? "+" : ""}{fmtPrice(Math.abs(priceTrend.change))})
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0 mt-1">
            <button
              onClick={() => onToggleFav(apt.id)}
              className={`rounded-full p-2 transition ${
                isFav ? "text-[#F04452] bg-[#F04452]/10" : "text-[#D1D6DB] hover:text-[#F04452] hover:bg-[#F04452]/10"
              }`}
              aria-label={isFav ? "찜 취소" : "찜하기"}
            >
              <Heart className={`h-5 w-5 ${isFav ? "fill-current" : ""}`} />
            </button>
            <button
              onClick={onClose}
              className="rounded-full p-2 text-[#8B95A1] hover:bg-[#F2F4F6] transition"
              aria-label="닫기"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="px-5 py-5 space-y-6">
          {/* Detail Grid */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "거래일", value: fmtDate(apt.contract_year, apt.contract_month, apt.contract_day) },
              { label: "전용면적", value: apt.area_sqm ? `${apt.area_sqm}㎡` : "-" },
              { label: "층수", value: apt.floor ? `${apt.floor}층` : "-" },
              { label: "건물연식", value: apt.building_year ? `${apt.building_year}년 준공` : "-" },
              ...(pricePerSqm ? [{ label: "㎡당 거래가", value: `${pricePerSqm.toLocaleString()}만원` }] : []),
              ...(apt.jibun ? [{ label: "지번", value: `${apt.dong ?? ""} ${apt.jibun}`.trim() }] : []),
            ].map((item) => (
              <div key={item.label} className="rounded-xl bg-[#F2F4F6] px-4 py-3">
                <div className="text-xs text-[#8B95A1] mb-1">{item.label}</div>
                <div className="font-semibold text-[#191F28] text-sm">{item.value}</div>
              </div>
            ))}
          </div>

          {/* Transaction History */}
          {history.length > 1 && (
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-[#191F28] mb-3">
                <Building2 className="h-4 w-4 text-[#3182F6]" />
                {apt.apt_name} 거래 이력 ({history.length}건)
              </h3>
              <div className="space-y-2">
                {history.map((h) => {
                  const isThis = h.id === apt.id;
                  return (
                    <div
                      key={h.id}
                      className={`flex items-center justify-between rounded-xl px-4 py-3 text-sm ${
                        isThis
                          ? "bg-[#EFF6FF] border border-[#3182F6]/30"
                          : "bg-[#F2F4F6]"
                      }`}
                    >
                      <div className="text-[#8B95A1]">
                        {fmtDate(h.contract_year, h.contract_month, h.contract_day)}
                        {h.floor && <span className="ml-2">{h.floor}층</span>}
                        {h.area_sqm && <span className="ml-2">{h.area_sqm}㎡</span>}
                      </div>
                      <div className={`font-bold number-tabular ${isThis ? "text-[#3182F6]" : "text-[#191F28]"}`}>
                        {fmtPrice(h.price_man_won)}
                      </div>
                    </div>
                  );
                })}
              </div>
              {history.length >= 12 && (
                <p className="mt-2 text-xs text-[#8B95A1] text-center">최근 12건 표시</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Search Page ──────────────────────────────────────────────────────────────

function SearchPage() {
  const [gu, setGu] = useState("전체");
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 300000]);
  const [favorites, setFavorites] = useState<Set<string>>(loadFavorites);
  const [showFavOnly, setShowFavOnly] = useState(false);
  const [selectedApt, setSelectedApt] = useState<Apt | null>(null);

  useEffect(() => { trackEvent("search_start"); }, []);
  useEffect(() => {
    const t = setTimeout(
      () => trackEvent("search_filter_apply", { sigun_gu: gu, price_min: priceRange[0], price_max: priceRange[1] }),
      400,
    );
    return () => clearTimeout(t);
  }, [gu, priceRange]);

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); trackEvent("favorite_add"); }
      saveFavorites(next);
      return next;
    });
  };

  const { data, isLoading } = useQuery({
    queryKey: ["apartments", gu],
    queryFn: async () => {
      let q = supabase
        .from("apartments")
        .select("id,apt_name,sigun_gu,dong,jibun,area_sqm,floor,building_year,contract_year,contract_month,contract_day,price_man_won")
        .order("contract_year", { ascending: false })
        .order("contract_month", { ascending: false });

      if (gu !== "전체") {
        q = (q as any).eq("sigun_gu", gu).limit(10000);
      } else {
        q = (q as any).limit(5000);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data as Apt[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter((p) => {
      if (showFavOnly && !favorites.has(p.id)) return false;
      if (gu !== "전체" && p.sigun_gu !== gu) return false;
      if (p.price_man_won < priceRange[0] || p.price_man_won > priceRange[1]) return false;
      return true;
    });
  }, [data, gu, priceRange, favorites, showFavOnly]);

  return (
    <div className="min-h-screen bg-[#F2F4F6]">
      <SiteHeader />

      {/* Page Header */}
      <div className="bg-white border-b border-[#E5E8EB] px-5 py-8">
        <div className="mx-auto max-w-7xl flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#191F28]">실거래 조회</h1>
            <p className="mt-1 text-sm text-[#8B95A1]">
              조건에 맞는 실거래{" "}
              <span className="font-semibold text-[#3182F6]">{filtered.length.toLocaleString()}건</span>
              {data && <span className="ml-1 text-[#8B95A1]">/ 조회 {data.length.toLocaleString()}건</span>}
            </p>
          </div>
          <button
            onClick={() => setShowFavOnly(v => !v)}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition ${
              showFavOnly
                ? "border-[#F04452] bg-[#F04452]/10 text-[#F04452]"
                : "border-[#E5E8EB] bg-white text-[#8B95A1] hover:border-[#F04452]/50 hover:text-[#F04452]"
            }`}
          >
            <Heart className={`h-4 w-4 ${showFavOnly ? "fill-current" : ""}`} />
            찜 목록 {favorites.size > 0 && `(${favorites.size})`}
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-5 py-8 grid gap-8 lg:grid-cols-[260px_1fr]">
        {/* Filters */}
        <aside className="space-y-6 lg:sticky lg:top-20 lg:self-start">
          {/* District */}
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

          {/* Price */}
          <div className="card p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8B95A1] mb-3">가격대 (만원)</h3>
            <Slider
              value={priceRange}
              min={0} max={300000} step={5000}
              onValueChange={v => setPriceRange([v[0], v[1]] as [number, number])}
              className="my-4"
            />
            <div className="flex justify-between text-xs text-[#8B95A1]">
              <span>{fmtPrice(priceRange[0])}</span>
              <span>{fmtPrice(priceRange[1])}{priceRange[1] >= 300000 ? "+" : ""}</span>
            </div>
          </div>
        </aside>

        {/* Results */}
        <div>
          {isLoading ? (
            <div className="flex items-center justify-center py-24 text-[#8B95A1]">
              <div className="text-center">
                <div className="mb-2 text-base font-medium">{gu !== "전체" ? `${gu} 데이터` : "실거래 데이터"} 불러오는 중...</div>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="card flex flex-col items-center justify-center py-24 gap-3 text-[#8B95A1]">
              {showFavOnly ? (
                <>
                  <Heart className="h-8 w-8 text-[#E5E8EB]" />
                  <p>찜한 매물이 없습니다.</p>
                  <button onClick={() => setShowFavOnly(false)} className="text-sm text-[#3182F6] underline">
                    전체 목록 보기
                  </button>
                </>
              ) : (
                <p>조건에 맞는 매물이 없습니다.</p>
              )}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {filtered.map((p) => (
                <div
                  key={p.id}
                  onClick={() => { setSelectedApt(p); trackEvent("property_view"); }}
                  className="card p-5 cursor-pointer hover:shadow-lg transition-all hover:-translate-y-0.5 group"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-xs font-semibold text-[#3182F6] bg-[#EFF6FF] px-2 py-0.5 rounded-md">
                          {p.sigun_gu}
                        </span>
                        {p.dong && <span className="text-xs text-[#8B95A1]">{p.dong}</span>}
                      </div>
                      <h3 className="mt-2 font-bold text-[#191F28] text-base leading-tight truncate">
                        {p.apt_name}
                      </h3>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleFavorite(p.id); }}
                      className={`ml-2 shrink-0 rounded-full p-1.5 transition ${
                        favorites.has(p.id)
                          ? "text-[#F04452] bg-[#F04452]/10"
                          : "text-[#D1D6DB] hover:text-[#F04452] hover:bg-[#F04452]/10"
                      }`}
                      aria-label={favorites.has(p.id) ? "찜 취소" : "찜하기"}
                    >
                      <Heart className={`h-4 w-4 ${favorites.has(p.id) ? "fill-current" : ""}`} />
                    </button>
                  </div>

                  <div className="mt-3 font-bold text-xl text-[#3182F6]">
                    {fmtPrice(p.price_man_won)}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#8B95A1]">
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
                    <span className="ml-auto font-medium text-[#191F28]">
                      {fmtDate(p.contract_year, p.contract_month, p.contract_day)}
                    </span>
                  </div>

                  {/* Hover hint */}
                  <div className="mt-3 text-xs text-[#8B95A1] opacity-0 group-hover:opacity-100 transition-opacity">
                    클릭하여 거래 이력 보기 →
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedApt && (
        <AptDetailModal
          apt={selectedApt}
          allData={data ?? []}
          favorites={favorites}
          onToggleFav={toggleFavorite}
          onClose={() => setSelectedApt(null)}
        />
      )}
    </div>
  );
}
