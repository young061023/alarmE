import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCRIPT_PATH = path.join(process.cwd(), "scripts", "pill_predict.py");

export async function POST(request) {
  const formData = await request.formData();
  const file = formData.get("image");

  if (!file || typeof file.arrayBuffer !== "function") {
    return NextResponse.json({ error: "이미지 파일이 필요합니다." }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!bytes.length) {
    return NextResponse.json({ error: "빈 이미지입니다." }, { status: 400 });
  }

  if (process.env.PILL_RECOGNITION_API_URL) {
    try {
      const result = await runRemoteRecognition(bytes);
      return NextResponse.json(result);
    } catch (error) {
      return NextResponse.json({ error: error.message || "AI 약 인식 서버 호출 실패" }, { status: 500 });
    }
  }

  const imagePath = path.join(tmpdir(), `pill-${Date.now()}.jpg`);
  await writeFile(imagePath, bytes);

  try {
    const result = await runPython(imagePath);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message || "AI 약 인식 실패" }, { status: 500 });
  }
}

async function runRemoteRecognition(bytes) {
  const formData = new FormData();
  formData.append("image", new Blob([bytes], { type: "image/jpeg" }), "pill.jpg");

  const response = await fetch(process.env.PILL_RECOGNITION_API_URL, {
    method: "POST",
    body: formData
  });
  const text = await response.text();
  let result;
  try {
    result = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 240) || "AI 서버가 JSON이 아닌 응답을 보냈습니다.");
  }

  if (!response.ok) {
    throw new Error(result.error || result.detail || "AI 약 인식 서버 오류");
  }
  return result;
}

function runPython(imagePath) {
  const python = process.env.PILL_PYTHON || "python3";
  const env = { ...process.env };

  return new Promise((resolve, reject) => {
    const child = spawn(python, [SCRIPT_PATH, imagePath], { env });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Python process exited with ${code}`));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`추론 결과 JSON 파싱 실패: ${error.message}`));
      }
    });
  });
}
