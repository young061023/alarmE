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
      return NextResponse.json({ error: "efcyQesitm 값을 찾지 못했습니다." }, { status: 404 });
    }

    return NextResponse.json({
      itemName: first?.itemName || itemName,
      itemSeq: first?.itemSeq || null,
      efcyQesitm: String(effect).replace(/\s+/g, " ").trim()
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || "e약은요 API 조회 실패" }, { status: 500 });
  }
}
