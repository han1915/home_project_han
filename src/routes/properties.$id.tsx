import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Heart, MapPin, Phone, Calendar, Ruler, Building } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { trackEvent, getSessionId } from "@/lib/tracking";
import { toast } from "sonner";

export const Route = createFileRoute("/properties/$id")({
  component: PropertyDetail,
});

function fmtPrice(p: number | null) {
  if (!p) return "-";
  const eok = Math.floor(p / 10000);
  const man = p % 10000;
  return eok > 0 ? `${eok}억 ${man ? man.toLocaleString() + "만" : ""}`.trim() : `${man.toLocaleString()}만`;
}

function PropertyDetail() {
  const { id } = Route.useParams();
  const [faved, setFaved] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["property", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("properties").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (data) trackEvent("property_view", { property_id: id, sigun_gu: data.sigun_gu });
  }, [data, id]);

  const onFavorite = async () => {
    setFaved(true);
    await supabase.from("favorites").insert({ session_id: getSessionId(), property_id: id });
    trackEvent("favorite_add", { property_id: id });
    toast.success("찜 목록에 추가되었습니다");
  };

  const onContact = () => {
    trackEvent("contact_click", { property_id: id });
    toast.success("문의가 접수되었습니다 (데모)");
  };

  if (isLoading) return <div className="min-h-screen"><SiteHeader /><div className="grid place-items-center py-24 text-muted-foreground">불러오는 중...</div></div>;
  if (!data) return <div className="min-h-screen"><SiteHeader /><div className="grid place-items-center py-24 text-muted-foreground">매물을 찾을 수 없습니다.</div></div>;

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-5xl px-6 py-10">
        <Link to="/search" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
          <ArrowLeft className="h-4 w-4" /> 검색으로 돌아가기
        </Link>

        <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_320px]">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-accent">
              <span className="rounded-md bg-accent/10 px-2 py-0.5">{data.transaction_type}</span>
              <span className="text-muted-foreground">{data.sigun_gu} · {data.district}</span>
            </div>
            <h1 className="mt-3 font-display text-4xl font-bold leading-tight">{(data as any).apt_name ?? data.location}</h1>
            <p className="mt-3 inline-flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" />{data.road_address ?? data.jibun_address}
            </p>

            <div className="mt-8 rounded-2xl border border-border bg-card p-6 card-elevated">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">실거래가</div>
              <div className="mt-1 font-display text-5xl font-extrabold text-primary number-tabular">
                {fmtPrice(data.price_ten_thousand)}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">계약일 {data.contract_date}</div>
            </div>

            <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
              {[
                data.area_sqm != null && { i: Ruler, l: "전용면적", v: `${data.area_sqm}㎡` },
                (data as any).floor != null && { i: Building, l: "층", v: `${(data as any).floor}층` },
                data.building_year != null && { i: Building, l: "건축년도", v: `${data.building_year}년` },
                data.contract_month && { i: Calendar, l: "계약월", v: data.contract_month },
              ].filter(Boolean).map((s: any) => (
                <div key={s.l} className="rounded-xl border border-border bg-card p-4">
                  <s.i className="h-4 w-4 text-accent" />
                  <div className="mt-2 text-xs text-muted-foreground">{s.l}</div>
                  <div className="mt-1 font-semibold number-tabular">{s.v}</div>
                </div>
              ))}
            </dl>

            {data.description && (
              <div className="mt-8 rounded-2xl border border-border bg-secondary/40 p-6">
                <h3 className="font-display text-lg font-semibold">매물 설명</h3>
                <p className="mt-2 text-muted-foreground">{data.description}</p>
              </div>
            )}
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="card-elevated space-y-3 rounded-2xl border border-border bg-card p-6">
              <Button onClick={onContact} size="lg" className="w-full">
                <Phone className="mr-2 h-4 w-4" /> 문의하기
              </Button>
              <Button onClick={onFavorite} variant="outline" size="lg" className="w-full" disabled={faved}>
                <Heart className={`mr-2 h-4 w-4 ${faved ? "fill-destructive text-destructive" : ""}`} />
                {faved ? "찜 완료" : "찜하기"}
              </Button>
              <p className="pt-2 text-center text-xs text-muted-foreground">중개수수료 없음 · 직거래 매물</p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
