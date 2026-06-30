import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware


ROOT = Path(__file__).resolve().parent
SCRIPT_PATH = ROOT / "scripts" / "pill_predict.py"

app = FastAPI(title="alarmE Pill Recognition API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def health():
    return {"ok": True, "service": "alarmE pill recognition"}


@app.post("/predict")
async def predict(image: UploadFile = File(...)):
    content = await image.read()
    if not content:
        raise HTTPException(status_code=400, detail="이미지 파일이 필요합니다.")

    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as temp:
        temp.write(content)
        image_path = temp.name

    env = {
        **os.environ,
        "PILL_CACHE_DIR": os.environ.get("PILL_CACHE_DIR", str(ROOT / "pill_cache")),
        "PILL_MODEL_DOWNLOAD_DIR": os.environ.get("PILL_MODEL_DOWNLOAD_DIR", "/tmp/pill-models"),
        "PILL_DEVICE": os.environ.get("PILL_DEVICE", "cpu"),
        "PILL_USE_REMBG": os.environ.get("PILL_USE_REMBG", "false"),
    }

    try:
        completed = subprocess.run(
            [sys.executable, str(SCRIPT_PATH), image_path],
            env=env,
            capture_output=True,
            text=True,
            timeout=int(os.environ.get("PILL_TIMEOUT_SECONDS", "240")),
            check=False,
        )
    finally:
        Path(image_path).unlink(missing_ok=True)

    if completed.returncode != 0:
        message = completed.stderr.strip() or completed.stdout.strip() or "AI 약 인식 실패"
        raise HTTPException(status_code=500, detail=message[-1200:])

    try:
        return json.loads(completed.stdout)
    except json.JSONDecodeError as error:
        raise HTTPException(status_code=500, detail=f"추론 결과 JSON 파싱 실패: {error}") from error
