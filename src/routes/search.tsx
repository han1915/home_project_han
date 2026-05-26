import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Ruler, Calendar, Heart, X, TrendingUp, TrendingDown, Building2, ChevronDown } from "lucide-react";
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

const YEARS = ["전체", "2025", "2024", "2023", "2022"] as const;
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const PAGE_SIZE = 50;

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
  const base = `${year}.${String(month).padStart(2, "0")}`;
  return day ? `${base}.${String(day).padStart(2, "0")}` : base;
}

function loadFavorites(): Set<string> {
  try {
    const s = localStorage.getItem("hd_favorites");
    return s ? new Set(JSON.parse(s)) : new Set();
  } catch { return new Set(); }
}
function saveFavorites(f: Set<string>) {
  localStorage.setItem("hd_favorites", JSON.stringify([...f]));
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────

function AptDetailModal({ apt, allData, favorites, onToggleFav, onClose }: {
  apt: Apt; allData: Apt[]; favorites: Set<string>;
  onToggleFav: (id: string) => void; onClose: () => void;
}) {
  const isFav = favorites.has(apt.id);
  const pricePerSqm = apt.area_sqm && apt.area_sqm > 0
    ? Math.round(apt.price_man_won / apt.area_sqm) : null;

  const history = useMemo(() =>
    allData
      .filter(p =>
        p.apt_name === apt.apt_name && p.sigun_gu === apt.sigun_gu &&
        (p.dong === apt.dong || (!p.dong && !apt.dong))
      )
      .sort((a, b) => (b.contract_year * 100 + b.contract_month) - (a.contract_year * 100 + a.contract_month))
      .slice(0, 12),
  [apt, allData]);

  const priceTrend = useMemo(() => {
    const idx = history.findIndex(h => h.id === apt.id);
    if (idx < 0 || idx >= history.length - 1) return null;
    const prev = history[idx + 1];
    const change = apt.price_man_won - prev.price_man_won;
    const pct = Math.round((change / prev.price_man_won) * 1000) / 10;
    return { change, pct };
  }, [apt, history]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 rounded-t-3xl sm:rounded-t-2xl bg-white px-5 pt-5 pb-4 border-b border-[#E5E8EB]">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-[#3182F6] bg-[#EFF6FF] px-2 py-0.5 rounded-md">{apt.sigun_gu}</span>
              {apt.dong && <span className="text-xs text-[#8B95A1]">{apt.dong}</span>}
            </div>
            <h2 className="mt-1.5 text-xl font-bold text-[#191F28] leading-snug">{apt.apt_name}</h2>
            <div className="mt-2 text-2xl font-extrabold text-[#3182F6]">{fmtPrice(apt.price_man_won)}</div>
            {priceTrend && (
              <div className={`mt-1 flex items-center gap-1 text-sm font-semibold ${priceTrend.pct > 0 ? "text-[#F04452]" : "text-emerald-600"}`}>
                {priceTrend.pct > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                직전 거래 대비 {priceTrend.pct > 0 ? "+" : ""}{priceTrend.pct}%
                <span className="text-[#8B95A1] font-normal ml-1">({priceTrend.change > 0 ? "+" : ""}{fmtPrice(Math.abs(priceTrend.change))})</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0 mt-1">
            <button onClick={() => onToggleFav(apt.id)}
              className={`rounded-full p-2 transition ${isFav ? "text-[#F04452] bg-[#F04452]/10" : "text-[#D1D6DB] hover:text-[#F04452] hover:bg-[#F04452]/10"}`}>
              <Heart className={`h-5 w-5 ${isFav ? "fill-current" : ""}`} />
            </button>
            <button onClick={onClose} className="rounded-full p-2 text-[#8B95A1] hover:bg-[#F2F4F6] transition">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="px-5 py-5 space-y-6">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "거래일", value: fmtDate(apt.contract_year, apt.contract_month, apt.contract_day) },
              { label: "전용면적", value: apt.area_sqm ? `${apt.area_sqm}㎡` : "-" },
              { label: "층수", value: apt.floor ? `${apt.floor}층` : "-" },
              { label: "건물연식", value: apt.building_year ? `${apt.building_year}년 준공` : "-" },
              ...(pricePerSqm ? [{ label: "㎡당 거래가", value: `${pricePerSqm.toLocaleString()}만원` }] : []),
              ...(apt.jibun ? [{ label: "지번", value: `${apt.dong ?? ""} ${apt.jibun}`.trim() }] : []),
            ].map(item => (
              <div key={item.label} className="rounded-xl bg-[#F2F4F6] px-4 py-3">
                <div className="text-xs text-[#8B95A1] mb-1">{item.label}</div>
                <div className="font-semibold text-[#191F28] text-sm">{item.value}</div>
              </div>
            ))}
          </div>

          {history.length > 1 && (
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-[#191F28] mb-3">
                <Building2 className="h-4 w-4 text-[#3182F6]" />
                {apt.apt_name} 거래 이력 ({history.length}건)
              </h3>
              <div className="space-y-2">
                {history.map(h => (
                  <div key={h.id}
                    className={`flex items-center justify-between rounded-xl px-4 py-3 text-sm ${h.id === apt.id ? "bg-[#EFF6FF] border border-[#3182F6]/30" : "bg-[#F2F4F6]"}`}>
                    <div className="text-[#8B95A1]">
                      {fmtDate(h.contract_year, h.contract_month, h.contract_day)}
                      {h.floor && <span className="ml-2">{h.floor}층</span>}
                      {h.area_sqm && <span className="ml-2">{h.area_sqm}㎡</span>}
                    </div>
                    <div className={`font-bold number-tabular ${h.id === apt.id ? "text-[#3182F6]" : "text-[#191F28]"}`}>
                      {fmtPrice(h.price_man_won)}
                    </div>
                  </div>
                ))}
              </div>
              {history.length >= 12 && <p className="mt-2 text-xs text-[#8B95A1] text-center">최근 12건 표시</p>}
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
  const [year, setYear] = useState<string>("전체");
  const [month, setMonth] = useState<string>("전체");
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 300000]);
  const [favorites, setFavorites] = useState<Set<string>>(loadFavorites);
  const [showFavOnly, setShowFavOnly] = useState(false);
  const [selectedApt, setSelectedApt] = useState<Apt | null>(null);
  const [page, setPage] = useState(1);

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [gu, year, month, priceRange, showFavOnly]);
  // Reset month when year cleared
  useEffect(() => { if (year === "전체") setMonth("전체"); }, [year]);

  useEffect(() => { trackEvent("search_start"); }, []);

  const toggleFavorite = (id: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        trackEvent("favorite_remove", { property_id: id });
      } else {
        next.add(id);
        const prop = data?.find(p => p.id === id);
        trackEvent("favorite_add", { property_id: id, sigun_gu: prop?.sigun_gu, apt_name: prop?.apt_name });
      }
      saveFavorites(next);
      return next;
    });
  };

  const { data, isLoading } = useQuery({
    queryKey: ["apartments", gu, year, month],
    queryFn: async () => {
      let q = supabase
        .from("apartments")
        .select("id,apt_name,sigun_gu,dong,jibun,area_sqm,floor,building_year,contract_year,contract_month,contract_day,price_man_won")
        // Always restrict to 2022-2025
        .gte("contract_year", 2022)
        .lte("contract_year", 2025)
        .order("contract_year", { ascending: false })
        .order("contract_month", { ascending: false })
        .order("contract_day", { ascending: false });

      if (gu !== "전체") q = (q as any).eq("sigun_gu", gu);
      if (year !== "전체") q = (q as any).eq("contract_year", Number(year));
      if (month !== "전체") q = (q as any).eq("contract_month", Number(month));

      // Tight limits — just enough to browse; pagination handles the rest
      const hasNarrowFilter = (gu !== "전체" && year !== "전체") || month !== "전체";
      const hasSomeFilter = gu !== "전체" || year !== "전체";
      const limit = hasNarrowFilter ? 1000 : hasSomeFilter ? 2000 : 500;
      q = (q as any).limit(limit);

      const { data, error } = await q;
      if (error) throw error;
      return data as Apt[];
    },
    staleTime: 3 * 60 * 1000,
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter(p => {
      if (showFavOnly && !favorites.has(p.id)) return false;
      if (p.price_man_won < priceRange[0] || p.price_man_won > priceRange[1]) return false;
      return true;
    });
  }, [data, priceRange, favorites, showFavOnly]);

  const shown = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = filtered.length > shown.length;

  const filterLabel = [
    gu !== "전체" ? gu : "서울 전체",
    year !== "전체" ? `${year}년` : "2022~2025",
    month !== "전체" ? `${month}월` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="min-h-screen bg-[#F2F4F6]">
      <SiteHeader />

      <div className="bg-white border-b border-[#E5E8EB] px-5 py-8">
        <div className="mx-auto max-w-7xl flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#191F28]">실거래 조회</h1>
            <p className="mt-1 text-sm text-[#8B95A1]">
              <span className="text-[#191F28] font-medium">{filterLabel}</span>
              {" · "}
              <span className="font-semibold text-[#3182F6]">{filtered.length.toLocaleString()}건</span>
              {data && filtered.length !== data.length &&
                <span className="ml-1">/ 조회 {data.length.toLocaleString()}건</span>
              }
              {" · "}<span>표시 {shown.length}건</span>
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
        <aside className="space-y-5 lg:sticky lg:top-20 lg:self-start">

          {/* District */}
          <div className="card p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8B95A1] mb-3">자치구</h3>
            <div className="flex flex-wrap gap-1.5">
              {DISTRICTS.map(d => (
                <button key={d} onClick={() => { setGu(d); if (d !== "전체") trackEvent("search_filter_apply", { sigun_gu: d, year, month }); }}
                  className={`rounded-lg border px-2.5 py-1 text-xs transition ${
                    gu === d ? "border-[#3182F6] bg-[#3182F6] text-white" : "border-[#E5E8EB] bg-white text-[#8B95A1] hover:border-[#3182F6] hover:text-[#3182F6]"
                  }`}>
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Year */}
          <div className="card p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8B95A1] mb-3">거래 연도</h3>
            <div className="flex flex-wrap gap-1.5">
              {YEARS.map(y => (
                <button key={y} onClick={() => { setYear(y); if (y !== "전체") trackEvent("search_filter_apply", { sigun_gu: gu, year: y, month }); }}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                    year === y ? "border-[#3182F6] bg-[#3182F6] text-white" : "border-[#E5E8EB] bg-white text-[#8B95A1] hover:border-[#3182F6] hover:text-[#3182F6]"
                  }`}>
                  {y === "전체" ? "전체" : `${y}년`}
                </button>
              ))}
            </div>
          </div>

          {/* Month — only when year selected */}
          {year !== "전체" && (
            <div className="card p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8B95A1] mb-3">거래 월</h3>
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => setMonth("전체")}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                    month === "전체" ? "border-[#3182F6] bg-[#3182F6] text-white" : "border-[#E5E8EB] bg-white text-[#8B95A1] hover:border-[#3182F6] hover:text-[#3182F6]"
                  }`}>전체</button>
                {MONTHS.map(m => (
                  <button key={m} onClick={() => { setMonth(String(m)); trackEvent("search_filter_apply", { sigun_gu: gu, year, month: String(m) }); }}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                      month === String(m) ? "border-[#3182F6] bg-[#3182F6] text-white" : "border-[#E5E8EB] bg-white text-[#8B95A1] hover:border-[#3182F6] hover:text-[#3182F6]"
                    }`}>
                    {m}월
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Price */}
          <div className="card p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8B95A1] mb-3">가격대 (만원)</h3>
            <Slider
              value={priceRange} min={0} max={300000} step={5000}
              onValueChange={v => setPriceRange([v[0], v[1]] as [number, number])}
              onValueCommit={v => trackEvent("search_price_filter", { price_min: v[0], price_max: v[1] })}
              className="my-4"
            />
            <div className="flex justify-between text-xs text-[#8B95A1]">
              <span>{fmtPrice(priceRange[0])}</span>
              <span>{fmtPrice(priceRange[1])}{priceRange[1] >= 300000 ? "+" : ""}</span>
            </div>
          </div>

          {(gu !== "전체" || year !== "전체" || month !== "전체" || priceRange[0] > 0 || priceRange[1] < 300000) && (
            <button
              onClick={() => { setGu("전체"); setYear("전체"); setMonth("전체"); setPriceRange([0, 300000]); trackEvent("search_filter_reset"); }}
              className="w-full rounded-xl border border-[#E5E8EB] bg-white py-2 text-xs text-[#8B95A1] hover:border-[#F04452] hover:text-[#F04452] transition"
            >
              필터 초기화
            </button>
          )}
        </aside>

        {/* Results */}
        <div>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-24 text-[#8B95A1] gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#3182F6] border-t-transparent" />
              <p className="text-sm">{filterLabel} 데이터 불러오는 중...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="card flex flex-col items-center justify-center py-24 gap-3 text-[#8B95A1]">
              {showFavOnly ? (
                <>
                  <Heart className="h-8 w-8 text-[#E5E8EB]" />
                  <p>찜한 매물이 없습니다.</p>
                  <button onClick={() => setShowFavOnly(false)} className="text-sm text-[#3182F6] underline">전체 목록 보기</button>
                </>
              ) : (
                <>
                  <Calendar className="h-8 w-8 text-[#E5E8EB]" />
                  <p>조건에 맞는 매물이 없습니다.</p>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                {shown.map(p => (
                  <div key={p.id}
                    onClick={() => { setSelectedApt(p); trackEvent("property_view", { property_id: p.id, apt_name: p.apt_name, sigun_gu: p.sigun_gu, price_man_won: p.price_man_won }); }}
                    className="card p-5 cursor-pointer hover:shadow-lg transition-all hover:-translate-y-0.5 group"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="text-xs font-semibold text-[#3182F6] bg-[#EFF6FF] px-2 py-0.5 rounded-md">{p.sigun_gu}</span>
                          {p.dong && <span className="text-xs text-[#8B95A1]">{p.dong}</span>}
                        </div>
                        <h3 className="mt-2 font-bold text-[#191F28] text-base leading-tight truncate">{p.apt_name}</h3>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); toggleFavorite(p.id); }}
                        className={`ml-2 shrink-0 rounded-full p-1.5 transition ${
                          favorites.has(p.id) ? "text-[#F04452] bg-[#F04452]/10" : "text-[#D1D6DB] hover:text-[#F04452] hover:bg-[#F04452]/10"
                        }`}
                        aria-label={favorites.has(p.id) ? "찜 취소" : "찜하기"}
                      >
                        <Heart className={`h-4 w-4 ${favorites.has(p.id) ? "fill-current" : ""}`} />
                      </button>
                    </div>

                    <div className="mt-3 font-bold text-xl text-[#3182F6]">{fmtPrice(p.price_man_won)}</div>

                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#8B95A1]">
                      {p.area_sqm != null && (
                        <span className="flex items-center gap-1"><Ruler className="h-3 w-3" />{p.area_sqm}㎡</span>
                      )}
                      {p.floor != null && <span>{p.floor}층</span>}
                      {p.building_year != null && (
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{p.building_year}년</span>
                      )}
                      <span className="ml-auto font-medium text-[#191F28]">
                        {fmtDate(p.contract_year, p.contract_month, p.contract_day)}
                      </span>
                    </div>

                    <div className="mt-2 text-xs text-[#C4C9D4] opacity-0 group-hover:opacity-100 transition-opacity">
                      클릭하여 거래 이력 보기 →
                    </div>
                  </div>
                ))}
              </div>

              {/* Load more */}
              {hasMore && (
                <div className="mt-6 text-center">
                  <button
                    onClick={() => { setPage(p => p + 1); trackEvent("search_load_more", { page: page + 1, total: filtered.length }); }}
                    className="inline-flex items-center gap-2 rounded-xl border border-[#E5E8EB] bg-white px-6 py-3 text-sm font-semibold text-[#191F28] hover:border-[#3182F6] hover:text-[#3182F6] transition"
                  >
                    <ChevronDown className="h-4 w-4" />
                    더 보기 ({filtered.length - shown.length}건 더)
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

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
