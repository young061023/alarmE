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

  const imagePath = path.join(tmpdir(), `pill-${Date.now()}-${file.name || "camera.jpg"}`);
  await writeFile(imagePath, bytes);

  try {
    const result = await runPython(imagePath);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message || "AI 약 인식 실패" }, { status: 500 });
  }
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
