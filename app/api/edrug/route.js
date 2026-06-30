import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

const EDRUG_BASE_URL = "https://apis.data.go.kr/1471000/DrbEasyDrugInfoService/getDrbEasyDrugList";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const itemName = searchParams.get("itemName")?.trim();
  const serviceKey = process.env.EDRUG_SERVICE_KEY;

  if (!itemName) {
    return NextResponse.json({ error: "약 이름이 필요합니다." }, { status: 400 });
  }

  if (!serviceKey) {
    const local = await lookupLocalMedicine(itemName);
    if (local) {
      return NextResponse.json({ ...local, source: "local_json" });
    }
    return NextResponse.json({ error: "EDRUG_SERVICE_KEY 환경변수가 필요합니다." }, { status: 500 });
  }

  const url = new URL(EDRUG_BASE_URL);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("type", "json");
  url.searchParams.set("itemName", itemName);
  url.searchParams.set("numOfRows", "1");

  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      return NextResponse.json({ error: "e약은요 API 응답 오류입니다." }, { status: response.status });
    }

    const data = await response.json();
    const items = data?.body?.items || data?.response?.body?.items || [];
    const first = Array.isArray(items) ? items[0] : items;
    const effect = first?.efcyQesitm;

    if (!effect) {
      const local = await lookupLocalMedicine(itemName);
      if (local) {
        return NextResponse.json({ ...local, source: "local_json" });
      }
      return NextResponse.json({ error: "efcyQesitm 값을 찾지 못했습니다." }, { status: 404 });
    }

    return NextResponse.json({
      itemName: cleanText(first?.itemName || itemName),
      itemSeq: first?.itemSeq || null,
      efcyQesitm: cleanText(effect),
      useMethodQesitm: cleanText(first?.useMethodQesitm),
      atpnWarnQesitm: cleanText(first?.atpnWarnQesitm),
      atpnQesitm: cleanText(first?.atpnQesitm),
      intrcQesitm: cleanText(first?.intrcQesitm),
      seQesitm: cleanText(first?.seQesitm),
      depositMethodQesitm: cleanText(first?.depositMethodQesitm),
      source: "edrug_api"
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || "e약은요 API 조회 실패" }, { status: 500 });
  }
}


function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}


async function lookupLocalMedicine(itemName) {
  try {
    const filePath = path.join(process.cwd(), "data", "local-medicines.json");
    const raw = await readFile(filePath, "utf8");
    const medicines = JSON.parse(raw);
    const query = normalizeName(itemName);
    const found = medicines.find((medicine) => {
      const names = [medicine.itemName, medicine.name, ...(medicine.aliases || [])];
      return names.some((name) => {
        const normalized = normalizeName(name);
        return normalized && (normalized.includes(query) || query.includes(normalized));
      });
    });
    if (!found) return null;
    return {
      itemName: cleanText(found.itemName || found.name || itemName),
      itemSeq: found.itemSeq || null,
      efcyQesitm: cleanText(found.efcyQesitm || found.effect),
      useMethodQesitm: cleanText(found.useMethodQesitm || found.usage),
      atpnWarnQesitm: cleanText(found.atpnWarnQesitm),
      atpnQesitm: cleanText(found.atpnQesitm || found.caution),
      intrcQesitm: cleanText(found.intrcQesitm),
      seQesitm: cleanText(found.seQesitm),
      depositMethodQesitm: cleanText(found.depositMethodQesitm)
    };
  } catch {
    return null;
  }
}

function normalizeName(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()\\[\\]{}·ㆍ。.,_-]/g, "");
}
