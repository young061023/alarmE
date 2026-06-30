import { NextResponse } from "next/server";

const EDRUG_BASE_URL = "https://apis.data.go.kr/1471000/DrbEasyDrugInfoService/getDrbEasyDrugList";

export async function POST(request) {
  const { ocrText } = await request.json();
  const text = String(ocrText || "").trim();

  if (!text) {
    return NextResponse.json({ error: "OCR 결과가 필요합니다." }, { status: 400 });
  }

  try {
    const candidates = await extractMedicineNames(text);
    const medicines = await Promise.all(candidates.map((candidate) => lookupEDrug(candidate)));
    return NextResponse.json({ medicines });
  } catch (error) {
    return NextResponse.json({ error: error.message || "OCR 약명 분석 실패" }, { status: 500 });
  }
}

async function extractMedicineNames(ocrText) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY 환경변수가 필요합니다.");
  }

  const prompt = `다음은 한국어 의약품 사진/문서 OCR 결과입니다. OCR 오타를 보정해서 실제 의약품명 후보만 최대 5개 추출하세요.

규칙:
- 설명, 질환명, 보호자 같은 비약품 단어는 제외
- mg, 정, 캡슐, 서방정, 필름코팅정 같은 단서를 활용
- 출력은 JSON만 반환
- 형식: {"medicines":[{"name":"약품명","confidence":0.0,"reason":"OCR 근거"}]}

OCR:
${ocrText}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json"
        }
      }),
      cache: "no-store"
    }
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Gemini API 오류: ${detail}`);
  }

  const data = await response.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  const parsed = parseJson(raw);
  const medicines = Array.isArray(parsed.medicines) ? parsed.medicines : [];

  return medicines
    .map((item) => ({
      name: normalizeMedicineName(item.name),
      confidence: Number(item.confidence || 0),
      reason: String(item.reason || "").trim()
    }))
    .filter((item) => item.name)
    .slice(0, 5);
}

async function lookupEDrug(candidate) {
  const serviceKey = process.env.EDRUG_SERVICE_KEY;
  if (!serviceKey) {
    return { ...candidate, matchStatus: "EDRUG_SERVICE_KEY 필요" };
  }

  const url = new URL(EDRUG_BASE_URL);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("type", "json");
  url.searchParams.set("itemName", candidate.name);
  url.searchParams.set("numOfRows", "3");

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    return { ...candidate, matchStatus: "e약은요 응답 오류" };
  }

  const data = await response.json();
  const items = data?.body?.items || data?.response?.body?.items || [];
  const list = Array.isArray(items) ? items : [items].filter(Boolean);
  const first = list[0];

  if (!first) {
    return { ...candidate, matchStatus: "e약은요 결과 없음" };
  }

  return {
    ...candidate,
    matchStatus: "e약은요 확인",
    itemName: cleanText(first.itemName || candidate.name),
    itemSeq: first.itemSeq || null,
    efcyQesitm: cleanText(first.efcyQesitm),
    useMethodQesitm: cleanText(first.useMethodQesitm),
    atpnWarnQesitm: cleanText(first.atpnWarnQesitm),
    atpnQesitm: cleanText(first.atpnQesitm),
    intrcQesitm: cleanText(first.intrcQesitm),
    seQesitm: cleanText(first.seQesitm),
    depositMethodQesitm: cleanText(first.depositMethodQesitm)
  };
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return {};
    return JSON.parse(match[0]);
  }
}

function normalizeMedicineName(value) {
  return cleanText(value)
    .replace(/[。•·]/g, "")
    .replace(/(\d+)0{1,2}g$/i, "$1mg")
    .replace(/\s+/g, "")
    .trim();
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}
