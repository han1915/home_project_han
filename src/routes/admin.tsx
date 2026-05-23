import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Database, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { ingestRealEstate } from "@/lib/ingest.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "관리자 · 실거래 데이터 적재" }],
  }),
  component: AdminPage,
});

function AdminPage() {
  const ingest = useServerFn(ingestRealEstate);
  const [monthCount, setMonthCount] = useState(3);
  const [maxRows, setMaxRows] = useState(10000);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof ingestRealEstate>> | null>(null);

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      const res = await ingest({ data: { monthCount, maxRows } });
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
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-sm font-semibold uppercase tracking-wider text-accent">관리자</p>
        <h1 className="mt-2 font-display text-4xl font-bold">실거래 데이터 적재</h1>
        <p className="mt-3 text-muted-foreground">
          국토교통부 아파트 매매 실거래가 API에서 서울 25개 자치구의 최근 데이터를 받아 매물 DB를 교체합니다.
          기존 매물·찜 데이터는 삭제됩니다.
        </p>

        <div className="card-elevated mt-8 rounded-2xl border border-border bg-card p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">최근 N개월</span>
              <input
                type="number"
                min={1}
                max={12}
                value={monthCount}
                onChange={(e) => setMonthCount(Number(e.target.value))}
                className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
              <span className="mt-1 block text-xs text-muted-foreground">기준: 2개월 전부터 역순</span>
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">최대 적재 건수</span>
              <input
                type="number"
                min={100}
                max={20000}
                step={500}
                value={maxRows}
                onChange={(e) => setMaxRows(Number(e.target.value))}
                className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
          </div>

          <Button onClick={run} disabled={running} size="lg" className="mt-6 w-full">
            {running ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 적재 중... (수십 초 소요)</>
            ) : (
              <><Database className="mr-2 h-4 w-4" /> 실데이터 가져오기</>
            )}
          </Button>
        </div>

        {result && (
          <div
            className={`mt-6 rounded-2xl border p-6 ${
              result.error ? "border-destructive/30 bg-destructive/5" : "border-emerald-500/30 bg-emerald-500/5"
            }`}
          >
            <div className="flex items-start gap-3">
              {result.error ? (
                <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
              )}
              <div className="flex-1">
                <h3 className="font-semibold">{result.error ? "적재 실패" : "적재 완료"}</h3>
                <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm number-tabular">
                  <dt className="text-muted-foreground">적재 건수</dt>
                  <dd>{result.inserted?.toLocaleString() ?? 0}</dd>
                  {"attempted" in result && (
                    <>
                      <dt className="text-muted-foreground">파싱 건수</dt>
                      <dd>{result.attempted?.toLocaleString()}</dd>
                    </>
                  )}
                  {"apiCalls" in result && (
                    <>
                      <dt className="text-muted-foreground">API 호출</dt>
                      <dd>{result.apiCalls} (오류 {result.apiErrors})</dd>
                    </>
                  )}
                  {"months" in result && result.months && (
                    <>
                      <dt className="text-muted-foreground">대상 월</dt>
                      <dd>{result.months.join(", ")}</dd>
                    </>
                  )}
                  <dt className="text-muted-foreground">소요</dt>
                  <dd>{(result.durationMs / 1000).toFixed(1)}s</dd>
                </dl>
                {result.error && (
                  <p className="mt-3 text-sm text-destructive">{result.error}</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
