import { createClient } from "@supabase/supabase-js";
import { XMLParser } from "fast-xml-parser";

const BASE_URL =
  "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade";

function toNum(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

export default async function handler(req: any, res: any) {
  // CORS headers — allow the Vercel frontend to call this
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { apiKey, lawdCd, districtName, dealYmd } = req.body ?? {};

  if (!apiKey || !lawdCd || !districtName || !dealYmd) {
    return res.status(400).json({ error: "apiKey, lawdCd, districtName, dealYmd 모두 필요합니다." });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: "Supabase 환경변수가 설정되지 않았습니다." });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const parser = new XMLParser({ ignoreAttributes: true });

  const rows: object[] = [];
  let pageNo = 1;
  let apiCalls = 0;

  try {
    while (true) {
      const url =
        `${BASE_URL}?serviceKey=${encodeURIComponent(apiKey)}` +
        `&LAWD_CD=${lawdCd}&DEAL_YMD=${dealYmd}&numOfRows=100&pageNo=${pageNo}`;

      apiCalls++;
      const fetchRes = await fetch(url);
      if (!fetchRes.ok) break;

      const xml = await fetchRes.text();
      const parsed: any = parser.parse(xml);

      // API error check
      const resultCode =
        parsed?.response?.header?.resultCode ??
        parsed?.OpenAPI_ServiceResponse?.cmmMsgHeader?.returnReasonCode;
      if (resultCode !== undefined && String(resultCode) !== "000" && String(resultCode) !== "00") {
        const msg = parsed?.response?.header?.resultMsg ?? String(resultCode);
        return res.status(400).json({ error: `API 오류: ${msg}` });
      }

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
          sigun_gu: districtName,
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
    }

    let inserted = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error: upsertErr } = await supabase.from("apartments").upsert(chunk as any, {
        onConflict:
          "sigun_gu,apt_name,dong,area_sqm,floor,contract_year,contract_month,contract_day,price_man_won",
        ignoreDuplicates: true,
      });
      if (!upsertErr) inserted += chunk.length;
    }

    return res.status(200).json({ inserted, attempted: rows.length, apiCalls });
  } catch (e: any) {
    return res.status(500).json({ error: e.message ?? String(e) });
  }
}
