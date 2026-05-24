/**
 * 서울 아파트 매매 실거래가 적재 스크립트
 * Usage: node scripts/seed.mjs <API_KEY> [YYYYMM_START] [YYYYMM_END]
 * Example: node scripts/seed.mjs ABC123 202401 202505
 */

import { createClient } from "@supabase/supabase-js";
import { XMLParser } from "fast-xml-parser";

const API_KEY  = process.env.DATA_GO_KR_KEY  || process.argv[2];
const YM_START = process.env.YM_START        || process.argv[3] || (() => {
  const d = new Date(); d.setMonth(d.getMonth() - 3);
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}`;
})();
const YM_END   = process.env.YM_END          || process.argv[4] || (() => {
  const d = new Date(); d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}`;
})();

if (!API_KEY) {
  console.error("❌  API 키를 인수로 전달하세요: node scripts/seed.mjs <API_KEY>");
  process.exit(1);
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL        || "https://kvkvdsfkvkbbxwpoxwby.supabase.co";
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2a3Zkc2ZrdmtiYnh3cG94d2J5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTk4NTEsImV4cCI6MjA5NTEzNTg1MX0.X8pzxoG13GbP3uOjnRsLIOP_Pime3-vfCOD9w5gdHaY";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const parser   = new XMLParser({ ignoreAttributes: true });

const BASE_URL = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade";

const DISTRICTS = [
  { code:"11110", name:"종로구" }, { code:"11140", name:"중구" },
  { code:"11170", name:"용산구" }, { code:"11200", name:"성동구" },
  { code:"11215", name:"광진구" }, { code:"11230", name:"동대문구" },
  { code:"11260", name:"중랑구" }, { code:"11290", name:"성북구" },
  { code:"11305", name:"강북구" }, { code:"11320", name:"도봉구" },
  { code:"11350", name:"노원구" }, { code:"11380", name:"은평구" },
  { code:"11410", name:"서대문구"}, { code:"11440", name:"마포구" },
  { code:"11470", name:"양천구" }, { code:"11500", name:"강서구" },
  { code:"11530", name:"구로구" }, { code:"11545", name:"금천구" },
  { code:"11560", name:"영등포구"}, { code:"11590", name:"동작구" },
  { code:"11620", name:"관악구" }, { code:"11650", name:"서초구" },
  { code:"11680", name:"강남구" }, { code:"11710", name:"송파구" },
  { code:"11740", name:"강동구" },
];

function toNum(v) {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function buildMonths(start, end) {
  const months = [];
  let y = +start.slice(0,4), m = +start.slice(4);
  const ey = +end.slice(0,4),  em = +end.slice(4);
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}${String(m).padStart(2,"0")}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return months;
}

async function fetchDistrict(lawdCd, districtName, dealYmd) {
  const rows = [];
  for (let page = 1; page <= 30; page++) {
    const url = `${BASE_URL}?serviceKey=${encodeURIComponent(API_KEY)}&LAWD_CD=${lawdCd}&DEAL_YMD=${dealYmd}&numOfRows=100&pageNo=${page}`;
    const res  = await fetch(url);
    if (!res.ok) break;
    const xml  = await res.text();
    const data = parser.parse(xml);

    // XMLParser converts "000" → number 0; treat 0 or "000"/"00" as success
    const code = data?.response?.header?.resultCode;
    const codeNum = code !== undefined && code !== null ? parseInt(String(code), 10) : 0;
    if (!isNaN(codeNum) && codeNum !== 0) {
      const msg = data?.response?.header?.resultMsg ?? String(code);
      throw new Error(`API 오류 (${districtName}/${dealYmd}): ${msg}`);
    }

    const items = data?.response?.body?.items?.item;
    if (!items) break;
    const arr = Array.isArray(items) ? items : [items];

    for (const it of arr) {
      const year = toNum(it.dealYear), mon = toNum(it.dealMonth), price = toNum(it.dealAmount);
      if (!year || !mon || price === null) continue;
      rows.push({
        apt_name:       it.aptNm   ? String(it.aptNm).trim()   : null,
        sigun_gu:       districtName,
        dong:           it.umdNm   ? String(it.umdNm).trim()   : null,
        jibun:          it.jibun   ? String(it.jibun).trim()   : null,
        road_address:   it.aptDong ? String(it.aptDong).trim() : null,
        area_sqm:       toNum(it.excluUseAr),
        floor:          toNum(it.floor),
        building_year:  toNum(it.buildYear),
        contract_year:  year,
        contract_month: mon,
        contract_day:   toNum(it.dealDay),
        price_man_won:  price,
      });
    }
    if (arr.length < 100) break;
  }
  return rows;
}

async function main() {
  const months = buildMonths(YM_START, YM_END);
  const total  = months.length * DISTRICTS.length;
  let step = 0, inserted = 0, attempted = 0, errors = 0;

  console.log(`\n▶  서울 아파트 실거래가 적재 시작`);
  console.log(`   기간: ${YM_START} ~ ${YM_END}  (${months.length}개월 × ${DISTRICTS.length}구 = ${total}건 요청)\n`);

  for (const month of months) {
    for (const district of DISTRICTS) {
      step++;
      process.stdout.write(`\r[${step}/${total}] ${district.name} ${month}  `);

      try {
        const rows = await fetchDistrict(district.code, district.name, month);
        attempted += rows.length;

        for (let i = 0; i < rows.length; i += 500) {
          const chunk = rows.slice(i, i + 500);
          const { error } = await supabase.from("apartments").upsert(chunk, {
            onConflict: "sigun_gu,apt_name,dong,area_sqm,floor,contract_year,contract_month,contract_day,price_man_won",
            ignoreDuplicates: true,
          });
          if (error) throw new Error(error.message);
          inserted += chunk.length;
        }
      } catch (e) {
        errors++;
        console.log(`\n  ⚠  ${district.name}/${month}: ${e.message}`);
      }
    }
  }

  console.log(`\n\n✅  완료`);
  console.log(`   파싱: ${attempted.toLocaleString()}건`);
  console.log(`   적재: ${inserted.toLocaleString()}건`);
  console.log(`   오류: ${errors}건`);
}

main().catch(e => { console.error("\n❌ ", e.message); process.exit(1); });
