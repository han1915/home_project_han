import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { XMLParser } from "fast-xml-parser";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// 서울 25개 자치구 LAWD_CD (5자리)
const SEOUL_DISTRICTS: { code: string; name: string }[] = [
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

const MAX_ROWS = 10000;
const PER_CALL = 1000;

type Row = {
  location: string;
  district: string | null;
  sigun_gu: string | null;
  road_address: string | null;
  jibun_address: string | null;
  apt_name: string | null;
  area_sqm: number | null;
  price_ten_thousand: number | null;
  building_year: number | null;
  floor: number | null;
  transaction_type: string;
  contract_date: string | null;
  contract_month: string | null;
  lawd_cd: string;
};

function toNum(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const s = String(v).replace(/,/g, "").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function recentMonths(count: number): string[] {
  // 공공 API는 보통 익월에 데이터가 갱신됨 → 2달 전부터 역순으로
  const out: string[] = [];
  const now = new Date();
  for (let i = 2; i < 2 + count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}${pad(d.getMonth() + 1)}`);
  }
  return out;
}

export const ingestRealEstate = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        monthCount: z.number().int().min(1).max(12).default(3),
        maxRows: z.number().int().min(100).max(20000).default(MAX_ROWS),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const start = Date.now();
    const serviceKey = process.env.DATA_GO_KR_SERVICE_KEY;
    if (!serviceKey) {
      return { error: "DATA_GO_KR_SERVICE_KEY missing", inserted: 0, durationMs: 0 };
    }

    const months = recentMonths(data.monthCount);
    const parser = new XMLParser({ ignoreAttributes: true });
    const rows: Row[] = [];
    let apiCalls = 0;
    let apiErrors = 0;

    outer: for (const month of months) {
      for (const d of SEOUL_DISTRICTS) {
        if (rows.length >= data.maxRows) break outer;
        const url =
          `https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeAPI/getRTMSDataSvcAptTrade` +
          `?serviceKey=${encodeURIComponent(serviceKey)}` +
          `&LAWD_CD=${d.code}&DEAL_YMD=${month}&numOfRows=${PER_CALL}&pageNo=1`;

        try {
          apiCalls++;
          const res = await fetch(url);
          if (!res.ok) {
            apiErrors++;
            continue;
          }
          const xml = await res.text();
          const parsed: any = parser.parse(xml);
          const items = parsed?.response?.body?.items?.item;
          if (!items) continue;
          const arr: any[] = Array.isArray(items) ? items : [items];

          for (const it of arr) {
            const year = toNum(it["년"]);
            const mon = toNum(it["월"]);
            const day = toNum(it["일"]);
            const contractDate =
              year && mon && day ? `${year}-${pad(mon)}-${pad(day)}` : null;
            const aptName = it["아파트"] ? String(it["아파트"]).trim() : null;
            const dong = it["법정동"] ? String(it["법정동"]).trim() : null;
            const jibun = it["지번"] ? String(it["지번"]).trim() : null;
            const road = it["도로명"] ? String(it["도로명"]).trim() : null;

            rows.push({
              location: aptName ?? `${d.name} ${dong ?? ""}`.trim(),
              apt_name: aptName,
              district: dong,
              sigun_gu: d.name,
              road_address: road,
              jibun_address: dong && jibun ? `${dong} ${jibun}` : dong,
              area_sqm: toNum(it["전용면적"]),
              price_ten_thousand: toNum(it["거래금액"]),
              building_year: toNum(it["건축년도"]),
              floor: toNum(it["층"]),
              transaction_type: "매매",
              contract_date: contractDate,
              contract_month: year && mon ? `${year}-${pad(mon)}` : null,
              lawd_cd: d.code,
            });
            if (rows.length >= data.maxRows) break outer;
          }
        } catch (e) {
          apiErrors++;
          console.error(`ingest ${d.code}/${month} failed`, e);
        }
      }
    }

    // Clear existing properties (idempotent re-ingest)
    await supabaseAdmin.from("favorites").delete().neq("session_id", "__never__");
    await supabaseAdmin.from("properties").delete().neq("location", "__never__");

    // Batch insert
    let inserted = 0;
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error } = await supabaseAdmin.from("properties").insert(chunk);
      if (error) {
        console.error("insert chunk failed", error);
        return {
          error: error.message,
          inserted,
          attempted: rows.length,
          apiCalls,
          apiErrors,
          durationMs: Date.now() - start,
        };
      }
      inserted += chunk.length;
    }

    return {
      error: null,
      inserted,
      attempted: rows.length,
      apiCalls,
      apiErrors,
      months,
      durationMs: Date.now() - start,
    };
  });
