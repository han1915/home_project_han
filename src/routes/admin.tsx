import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Database, Loader2, CheckCircle2, AlertTriangle, ChevronDown } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { ingestRealEstate } from "@/lib/ingest.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "관리자 · 데이터 적재 · HomeDirect" }],
  }),
  component: AdminPage,
});

const DISTRICTS = [
  "종로구","중구","용산구","성동구","광진구","동대문구","중랑구","성북구","강북구","도봉구",
  "노원구","은평구","서대문구","마포구","양천구","강서구","구로구","금천구","영등포구","동작구",
  "관악구","서초구","강남구","송파구","강동구",
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR - 2005 }, (_, i) => CURRENT_YEAR - i);
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function AdminPage() {
  const ingest = useServerFn(ingestRealEstate);
  const [apiKey, setApiKey] = useState("");
  const [startYear, setStartYear] = useState(CURRENT_YEAR);
  const [startMonth, setStartMonth] = useState(new Date().getMonth() - 1 < 1 ? 12 : new Date().getMonth() - 1);
  const [endYear, setEndYear] = useState(CURRENT_YEAR);
  const [endMonth, setEndMonth] = useState(new Date().getMonth() + 1);
  const [selectedDistricts, setSelectedDistricts] = useState<string[]>([]);
  const [allDistricts, setAllDistricts] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof ingestRealEstate>> | null>(null);

  const toggleDistrict = (d: string) => {
    setSelectedDistricts((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
    );
  };

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      const res = await ingest({
        data: {
          apiKey: apiKey || undefined,
          yearMonthStart: `${startYear}${pad(startMonth)}`,
          yearMonthEnd: `${endYear}${pad(endMonth)}`,
          districts: allDistricts ? undefined : selectedDistricts,
        },
      });
      setResult(res);
    } catch (e) {
      setResult({
        error: e instanceof Error ? e.message : String(e),
        inserted: 0,
        durationMs: 0,
      } as never);
    } finally {
      setRunning(false);
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
              공공데이터 포털 API 키 (선택)
            </label>
            <input
              type="password"
              placeholder="서비스 키 (미입력 시 환경변수 DATA_GO_KR_SERVICE_KEY 사용)"
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
                    {YEARS.map((y) => <option key={y} value={y}>{y}년</option>)}
                  </select>
                  <select
                    value={startMonth}
                    onChange={(e) => setStartMonth(Number(e.target.value))}
                    className="w-20 rounded-xl border border-[#E5E8EB] bg-white px-3 py-2 text-sm text-[#191F28] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/40"
                  >
                    {MONTHS.map((m) => <option key={m} value={m}>{m}월</option>)}
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
                    {YEARS.map((y) => <option key={y} value={y}>{y}년</option>)}
                  </select>
                  <select
                    value={endMonth}
                    onChange={(e) => setEndMonth(Number(e.target.value))}
                    className="w-20 rounded-xl border border-[#E5E8EB] bg-white px-3 py-2 text-sm text-[#191F28] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/40"
                  >
                    {MONTHS.map((m) => <option key={m} value={m}>{m}월</option>)}
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
                {DISTRICTS.map((d) => (
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
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />적재 중... (수십 초 소요)</>
            ) : (
              <><Database className="mr-2 h-4 w-4" />데이터 적재 실행</>
            )}
          </Button>
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
                <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm number-tabular">
                  <dt className="text-[#8B95A1]">적재 건수</dt>
                  <dd className="font-medium text-[#191F28]">{result.inserted?.toLocaleString() ?? 0}</dd>
                  {"attempted" in result && (
                    <>
                      <dt className="text-[#8B95A1]">파싱 건수</dt>
                      <dd className="font-medium text-[#191F28]">{result.attempted?.toLocaleString()}</dd>
                    </>
                  )}
                  {"apiCalls" in result && (
                    <>
                      <dt className="text-[#8B95A1]">API 호출</dt>
                      <dd className="font-medium text-[#191F28]">{result.apiCalls} (오류 {result.apiErrors})</dd>
                    </>
                  )}
                  {"months" in result && result.months && (
                    <>
                      <dt className="text-[#8B95A1]">대상 월</dt>
                      <dd className="font-medium text-[#191F28]">{result.months.join(", ")}</dd>
                    </>
                  )}
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

        {/* Info box */}
        <div className="mt-6 rounded-2xl bg-[#EFF6FF] border border-[#3182F6]/20 p-5">
          <h4 className="font-semibold text-[#191F28] text-sm mb-2">안내</h4>
          <ul className="text-xs text-[#8B95A1] space-y-1.5 list-disc list-inside">
            <li>공공데이터 포털(data.go.kr)에서 국토교통부 아파트 매매 실거래가 서비스 키를 발급받으세요.</li>
            <li>데이터는 apartments 테이블에 upsert됩니다. 중복 거래는 자동으로 무시됩니다.</li>
            <li>기간이 길수록 소요 시간이 증가합니다 (자치구 × 월 수 만큼 API 호출).</li>
            <li>이 페이지는 내비게이션에 노출되지 않습니다. URL 직접 접근: /admin</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
