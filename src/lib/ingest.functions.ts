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

const BASE_URL =
  "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade";

type ApartmentRow = {
  apt_name: string | null;
  sigun_gu: string;
  dong: string | null;
  jibun: string | null;
  road_address: string | null;
  area_sqm: number | null;
  floor: number | null;
  building_year: number | null;
  contract_year: number;
  contract_month: number;
  contract_day: number | null;
  price_man_won: number;
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

async function fetchPage(
  serviceKey: string,
  lawdCd: string,
  dealYmd: string,
  pageNo: number,
  numOfRows = 100,
): Promise<any[]> {
  const url =
    `${BASE_URL}?serviceKey=${encodeURIComponent(serviceKey)}` +
    `&LAWD_CD=${lawdCd}&DEAL_YMD=${dealYmd}` +
    `&numOfRows=${numOfRows}&pageNo=${pageNo}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const xml = await res.text();
  const parser = new XMLParser({ ignoreAttributes: true });
  const parsed: any = parser.parse(xml);
  const items = parsed?.response?.body?.items?.item;
  if (!items) return [];
  return Array.isArray(items) ? items : [items];
}

async function fetchAllPages(
  serviceKey: string,
  lawdCd: string,
  dealYmd: string,
  districtName: string,
): Promise<ApartmentRow[]> {
  const rows: ApartmentRow[] = [];
  let pageNo = 1;
  const numOfRows = 100;

  while (true) {
    const items = await fetchPage(serviceKey, lawdCd, dealYmd, pageNo, numOfRows);
    if (!items.length) break;

    for (const it of items) {
      const year = toNum(it["년"]);
      const mon = toNum(it["월"]);
      const day = toNum(it["일"]);
      const price = toNum(it["거래금액"]);

      if (!year || !mon || price === null) continue;

      rows.push({
        apt_name: it["아파트"] ? String(it["아파트"]).trim() : null,
        sigun_gu: districtName,
        dong: it["법정동"] ? String(it["법정동"]).trim() : null,
        jibun: it["지번"] ? String(it["지번"]).trim() : null,
        road_address: it["도로명"] ? String(it["도로명"]).trim() : null,
        area_sqm: toNum(it["전용면적"]),
        floor: toNum(it["층"]),
        building_year: toNum(it["건축년도"]),
        contract_year: year,
        contract_month: mon,
        contract_day: day,
        price_man_won: price,
      });
    }

    if (items.length < numOfRows) break;
    pageNo++;
    // Safety limit: 30 pages per district/month
    if (pageNo > 30) break;
  }

  return rows;
}

export const ingestRealEstate = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        apiKey: z.string().optional(),
        yearMonth: z.string().regex(/^\d{6}$/).optional(),
        yearMonthStart: z.string().regex(/^\d{6}$/).optional(),
        yearMonthEnd: z.string().regex(/^\d{6}$/).optional(),
        districts: z.array(z.string()).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const start = Date.now();
    const serviceKey = data.apiKey ?? process.env.DATA_GO_KR_SERVICE_KEY;
    if (!serviceKey) {
      return {
        error: "API 키가 없습니다. apiKey 파라미터 또는 DATA_GO_KR_SERVICE_KEY 환경변수를 설정하세요.",
        inserted: 0,
        durationMs: 0,
      };
    }

    // Build month list
    let months: string[] = [];
    if (data.yearMonth) {
      months = [data.yearMonth];
    } else if (data.yearMonthStart && data.yearMonthEnd) {
      const sy = parseInt(data.yearMonthStart.slice(0, 4));
      const sm = parseInt(data.yearMonthStart.slice(4, 6));
      const ey = parseInt(data.yearMonthEnd.slice(0, 4));
      const em = parseInt(data.yearMonthEnd.slice(4, 6));
      for (let y = sy; y <= ey; y++) {
        const startM = y === sy ? sm : 1;
        const endM = y === ey ? em : 12;
        for (let m = startM; m <= endM; m++) {
          months.push(`${y}${pad(m)}`);
        }
      }
    } else {
      // Default: last 3 months (2 months back)
      const now = new Date();
      for (let i = 2; i < 5; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push(`${d.getFullYear()}${pad(d.getMonth() + 1)}`);
      }
    }

    // Filter districts if specified
    const selectedDistricts = data.districts?.length
      ? SEOUL_DISTRICTS.filter((d) => data.districts!.includes(d.name))
      : SEOUL_DISTRICTS;

    const allRows: ApartmentRow[] = [];
    let apiErrors = 0;
    let apiCalls = 0;

    for (const month of months) {
      for (const d of selectedDistricts) {
        try {
          apiCalls++;
          const rows = await fetchAllPages(serviceKey, d.code, month, d.name);
          allRows.push(...rows);
        } catch (e) {
          apiErrors++;
          console.error(`ingest ${d.code}/${month} failed`, e);
        }
      }
    }

    // Upsert into apartments table (insert or update based on unique combo)
    let inserted = 0;
    let upsertErrors = 0;
    const CHUNK = 500;

    for (let i = 0; i < allRows.length; i += CHUNK) {
      const chunk = allRows.slice(i, i + CHUNK);
      const { error } = await supabaseAdmin.from("apartments").upsert(chunk, {
        onConflict: "apt_name,sigun_gu,dong,area_sqm,floor,contract_year,contract_month,contract_day,price_man_won",
        ignoreDuplicates: true,
      });
      if (error) {
        upsertErrors++;
        console.error("upsert chunk failed", error);
        // Try plain insert as fallback
        const { error: insertError } = await supabaseAdmin.from("apartments").insert(chunk);
        if (insertError) {
          console.error("insert chunk also failed", insertError);
        } else {
          inserted += chunk.length;
        }
      } else {
        inserted += chunk.length;
      }
    }

    return {
      error: null,
      inserted,
      attempted: allRows.length,
      apiCalls,
      apiErrors,
      upsertErrors,
      months,
      durationMs: Date.now() - start,
    };
  });
