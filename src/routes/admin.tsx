import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Database, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { XMLParser } from "fast-xml-parser";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "관리자 · 데이터 적재 · HomeDirect" }],
  }),
  component: AdminPage,
});

const BASE_URL =
  "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade";

const SEOUL_DISTRICTS = [
  { code: "11110", name: "종로구" },
  { code: "11140", name: "중구" },
  { code: "11170", name: "용산구" },
  { code: "11200", name: "성동구" },
  { code: "11215", name: "광진구" },
  { code: "11230", name: "동대문구" },
  { code: "11260", name: "중랑구" },
  { code: "11290", name: "성북구" },
  { code: "11305", name: "강북구" },
  { code: "11320", name: "도봉구" },
  { code: "11350", name: "노원구" },
  { code: "11380", name: "은평구" },
  { code: "11410", name: "서대문구" },
  { code: "11440", name: "마포구" },
  { code: "11470", name: "양천구" },
  { code: "11500", name: "강서구" },
  { code: "11530", name: "구로구" },
  { code: "11545", name: "금천구" },
  { code: "11560", name: "영등포구" },
  { code: "11590", name: "동작구" },
  { code: "11620", name: "관악구" },
  { code: "11650", name: "서초구" },
  { code: "11680", name: "강남구" },
  { code: "11710", name: "송파구" },
  { code: "11740", name: "강동구" },
];

const DISTRICT_NAMES = SEOUL_DISTRICTS.map((d) => d.name);
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR - 2005 }, (_, i) => CURRENT_YEAR - i);
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function toNum(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

type IngestResult = {
  error: string | null;
  inserted: number;
  attempted: number;
  apiCalls: number;
  apiErrors: number;
  months: string[];
  durationMs: number;
};

function AdminPage() {
  const [apiKey, setApiKey] = useState("");
  const [startYear, setStartYear] = useState(CURRENT_YEAR);
  const [startMonth, setStartMonth] = useState(
    new Date().getMonth() < 1 ? 12 : new Date().getMonth(),
  );
  const [endYear, setEndYear] = useState(CURRENT_YEAR);
  const [endMonth, setEndMonth] = useState(new Date().getMonth() + 1);
  const [selectedDistricts, setSelectedDistricts] = useState<string[]>([]);
  const [allDistricts, setAllDistricts] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<IngestResult | null>(null);

  const toggleDistrict = (d: string) => {
    setSelectedDistricts((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
    );
  };

  const run = async () => {
    if (!apiKey.trim()) {
      alert("공공데이터 포털 API 키를 입력해 주세요.");
      return;
    }

    setRunning(true);
    setResult(null);
    setProgress("");

    const start = Date.now();
    const parser = new XMLParser({ ignoreAttributes: true });

    // Build month list
    const sy = startYear, sm = startMonth;
    const ey = endYear, em = endMonth;
    const months: string[] = [];
    for (let y = sy; y <= ey; y++) {
      const s = y === sy ? sm : 1;
      const e = y === ey ? em : 12;
      for (let m = s; m <= e; m++) months.push(`${y}${pad(m)}`);
    }

    const targets = allDistricts
      ? SEOUL_DISTRICTS
      : SEOUL_DISTRICTS.filter((d) => selectedDistricts.includes(d.name));

    const totalSteps = months.length * targets.length;
    let step = 0;
    let apiCalls = 0;
    let apiErrors = 0;
    let attempted = 0;
    let inserted = 0;

    try {
      for (const month of months) {
        for (const district of targets) {
          step++;
          setProgress(
            `[${step}/${totalSteps}] ${district.name} ${month.slice(0, 4)}-${month.slice(4)} 조회 중...`,
          );

          const rows: object[] = [];
          let pageNo = 1;

          while (true) {
            const url =
              `${BASE_URL}?serviceKey=${encodeURIComponent(apiKey.trim())}` +
              `&LAWD_CD=${district.code}&DEAL_YMD=${month}` +
              `&numOfRows=100&pageNo=${pageNo}`;

            try {
              apiCalls++;
              const res = await fetch(url);
              if (!res.ok) break;
              const xml = await res.text();
              const parsed: any = parser.parse(xml);

              // Check for API error response
              const resultCode = parsed?.response?.header?.resultCode ?? parsed?.OpenAPI_ServiceResponse?.cmmMsgHeader?.returnReasonCode;
              if (resultCode && String(resultCode) !== "000" && String(resultCode) !== "00") break;

              const items = parsed?.response?.body?.items?.item;
              if (!items) break;
              const arr = Array.isArray(items) ? items : [items];

              for (const it of arr) {
                const year = toNum(it.dealYear);
                const mon = toNum(it.dealMonth);
                const price = toNum(it.dealAmount);
                if (!year || !mon || price === null) continue;

                rows.push({
                  apt_name: it.aptNm ? String(it.aptNm).trim() : null,
                  sigun_gu: district.name,
                  dong: it.umdNm ? String(it.umdNm).trim() : null,
                  jibun: it.jibun ? String(it.jibun).trim() : null,
                  road_address: it.aptDong ? String(it.aptDong).trim() : null,
                  area_sqm: toNum(it.excluUseAr),
                  floor: toNum(it.floor),
                  building_year: toNum(it.buildYear),
                  contract_year: year,
                  contract_month: mon,
                  contract_day: toNum(it.dealDay),
                  price_man_won: price,
                });
              }

              if (arr.length < 100) break;
              pageNo++;
              if (pageNo > 30) break;
            } catch {
              apiErrors++;
              break;
            }
          }

          attempted += rows.length;

          // Upsert in chunks of 500 — onConflict matches the apartments_unique_tx constraint
          for (let i = 0; i < rows.length; i += 500) {
            const chunk = rows.slice(i, i + 500);
            const { error: upsertErr } = await supabase.from("apartments").upsert(chunk as any, {
              onConflict:
                "sigun_gu,apt_name,dong,area_sqm,floor,contract_year,contract_month,contract_day,price_man_won",
              ignoreDuplicates: true,
            });
            if (upsertErr) {
              console.error("Upsert chunk failed:", upsertErr.message, upsertErr.details);
              throw new Error(`DB 오류: ${upsertErr.message}`);
            }
            inserted += chunk.length;
          }
        }
      }

      setResult({
        error: null,
        inserted,
        attempted,
        apiCalls,
        apiErrors,
        months,
        durationMs: Date.now() - start,
      });
    } catch (e) {
      setResult({
        error: e instanceof Error ? e.message : String(e),
        inserted,
        attempted,
        apiCalls,
        apiErrors,
        months,
        durationMs: Date.now() - start,
      });
    } finally {
      setRunning(false);
      setProgress("");
    }
  };

  return (
    <div className="min-h-screen bg-[#F2F4F6]">
      <SiteHeader />
      <div className="mx-auto max-w-3xl px-5 py-12">
        <div className="bg-white border-b border-[#E5E8EB] -mx-5 px-5 py-6 mb-8">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EFF6FF] px-3 py-1 text-xs font-semibold text-[#3182F6]">
            관리자
          </span>
          <h1 className="mt-3 text-3xl font-bold text-[#191F28]">실거래 데이터 적재</h1>
          <p className="mt-2 text-sm text-[#8B95A1]">
            국토교통부 아파트 매매 실거래가 API에서 서울 25개 자치구의 데이터를 apartments 테이블에 적재합니다.
          </p>
        </div>

        <div className="card p-6 space-y-6">
          {/* API Key */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#8B95A1] mb-2">
              공공데이터 포털 API 키 (필수)
            </label>
            <input
              type="password"
              placeholder="data.go.kr 서비스 키 입력"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full rounded-xl border border-[#E5E8EB] bg-[#F2F4F6] px-4 py-2.5 text-sm text-[#191F28] placeholder:text-[#8B95A1] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/40"
            />
          </div>

          {/* Date range */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#8B95A1] mb-3">
              조회 기간
            </label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-[#8B95A1] mb-1.5">시작 연월</p>
                <div className="flex gap-2">
                  <select
                    value={startYear}
                    onChange={(e) => setStartYear(Number(e.target.value))}
                    className="flex-1 rounded-xl border border-[#E5E8EB] bg-white px-3 py-2 text-sm text-[#191F28] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/40"
                  >
                    {YEARS.map((y) => (
                      <option key={y} value={y}>{y}년</option>
                    ))}
                  </select>
                  <select
                    value={startMonth}
                    onChange={(e) => setStartMonth(Number(e.target.value))}
                    className="w-20 rounded-xl border border-[#E5E8EB] bg-white px-3 py-2 text-sm text-[#191F28] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/40"
                  >
                    {MONTHS.map((m) => (
                      <option key={m} value={m}>{m}월</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <p className="text-xs text-[#8B95A1] mb-1.5">종료 연월</p>
                <div className="flex gap-2">
                  <select
                    value={endYear}
                    onChange={(e) => setEndYear(Number(e.target.value))}
                    className="flex-1 rounded-xl border border-[#E5E8EB] bg-white px-3 py-2 text-sm text-[#191F28] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/40"
                  >
                    {YEARS.map((y) => (
                      <option key={y} value={y}>{y}년</option>
                    ))}
                  </select>
                  <select
                    value={endMonth}
                    onChange={(e) => setEndMonth(Number(e.target.value))}
                    className="w-20 rounded-xl border border-[#E5E8EB] bg-white px-3 py-2 text-sm text-[#191F28] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/40"
                  >
                    {MONTHS.map((m) => (
                      <option key={m} value={m}>{m}월</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Districts */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-semibold uppercase tracking-wider text-[#8B95A1]">
                자치구 선택
              </label>
              <button
                onClick={() => {
                  setAllDistricts((v) => !v);
                  setSelectedDistricts([]);
                }}
                className={`text-xs font-semibold px-3 py-1 rounded-lg border transition ${
                  allDistricts
                    ? "border-[#3182F6] bg-[#3182F6] text-white"
                    : "border-[#E5E8EB] bg-white text-[#8B95A1]"
                }`}
              >
                전체 25개 구
              </button>
            </div>
            {!allDistricts && (
              <div className="flex flex-wrap gap-1.5">
                {DISTRICT_NAMES.map((d) => (
                  <button
                    key={d}
                    onClick={() => toggleDistrict(d)}
                    className={`rounded-lg border px-2.5 py-1 text-xs transition ${
                      selectedDistricts.includes(d)
                        ? "border-[#3182F6] bg-[#3182F6] text-white"
                        : "border-[#E5E8EB] bg-white text-[#8B95A1] hover:border-[#3182F6] hover:text-[#3182F6]"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            )}
            {!allDistricts && (
              <p className="mt-2 text-xs text-[#8B95A1]">
                {selectedDistricts.length === 0
                  ? "자치구를 선택하세요"
                  : `${selectedDistricts.length}개 구 선택됨: ${selectedDistricts.join(", ")}`}
              </p>
            )}
          </div>

          {/* Submit */}
          <Button
            onClick={run}
            disabled={running || (!allDistricts && selectedDistricts.length === 0)}
            size="lg"
            className="w-full bg-[#3182F6] hover:bg-[#1b6ef3] text-white rounded-xl"
          >
            {running ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />적재 중... 브라우저를 닫지 마세요</>
            ) : (
              <><Database className="mr-2 h-4 w-4" />데이터 적재 실행</>
            )}
          </Button>

          {/* Progress */}
          {running && progress && (
            <div className="rounded-xl bg-[#F2F4F6] border border-[#E5E8EB] px-4 py-3 text-xs text-[#8B95A1] font-mono">
              {progress}
            </div>
          )}
        </div>

        {/* Result */}
        {result && (
          <div
            className={`mt-6 rounded-2xl border p-6 ${
              result.error
                ? "border-[#F04452]/30 bg-[#F04452]/5"
                : "border-emerald-500/30 bg-emerald-500/5"
            }`}
          >
            <div className="flex items-start gap-3">
              {result.error ? (
                <AlertTriangle className="mt-0.5 h-5 w-5 text-[#F04452]" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
              )}
              <div className="flex-1">
                <h3 className="font-semibold text-[#191F28]">
                  {result.error ? "적재 실패" : "적재 완료"}
                </h3>
                <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                  <dt className="text-[#8B95A1]">적재 건수</dt>
                  <dd className="font-medium text-[#191F28]">{result.inserted.toLocaleString()}</dd>
                  <dt className="text-[#8B95A1]">파싱 건수</dt>
                  <dd className="font-medium text-[#191F28]">{result.attempted.toLocaleString()}</dd>
                  <dt className="text-[#8B95A1]">API 호출</dt>
                  <dd className="font-medium text-[#191F28]">{result.apiCalls} (오류 {result.apiErrors})</dd>
                  <dt className="text-[#8B95A1]">대상 월</dt>
                  <dd className="font-medium text-[#191F28]">
                    {result.months.length > 6
                      ? `${result.months[0]} ~ ${result.months[result.months.length - 1]} (${result.months.length}개월)`
                      : result.months.join(", ")}
                  </dd>
                  <dt className="text-[#8B95A1]">소요 시간</dt>
                  <dd className="font-medium text-[#191F28]">{(result.durationMs / 1000).toFixed(1)}s</dd>
                </dl>
                {result.error && (
                  <p className="mt-3 text-sm text-[#F04452]">{result.error}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Info */}
        <div className="mt-6 rounded-2xl bg-[#EFF6FF] border border-[#3182F6]/20 p-5">
          <h4 className="font-semibold text-[#191F28] text-sm mb-2">안내</h4>
          <ul className="text-xs text-[#8B95A1] space-y-1.5 list-disc list-inside">
            <li>공공데이터 포털(data.go.kr)에서 <strong>국토교통부 아파트 매매 실거래가</strong> 서비스 키를 발급받으세요.</li>
            <li>데이터는 apartments 테이블에 upsert 됩니다. 중복 거래는 자동 무시됩니다.</li>
            <li>기간이 길수록 시간이 오래 걸립니다 (자치구 수 × 월 수 만큼 API 호출).</li>
            <li>전체 기간(2006~현재) 적재 시 수십 분이 소요될 수 있습니다. 탭을 닫지 마세요.</li>
            <li>이 페이지는 내비게이션에 노출되지 않습니다. URL 직접 접근: /admin</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
