---
title: alarmE Pill Recognition API
sdk: docker
app_port: 7860
---

# alarmE Pill Recognition API

Hugging Face Spaces에서 PyTorch 약 이미지 인식을 담당하는 FastAPI 서버입니다.

## Space 환경변수

필수:

```txt
PILL_MODEL_URL=https://drive.google.com/uc?export=download&id=...
PILL_DEVICE=cpu
PILL_USE_REMBG=false
```

선택:

```txt
PILL_TIMEOUT_SECONDS=240
PILL_MODEL_DOWNLOAD_DIR=/tmp/pill-models
```

## API

```txt
POST /predict
form-data: image=<file>
```

응답:

```json
{
  "predictions": [
    { "rank": 1, "label": "타이레놀정500", "rawLabel": "아세트아미노펜", "confidence": 0.7 }
  ]
}
```

## alarmE Render 환경변수

Render의 Next.js 앱에는 Space 주소를 넣습니다.

```txt
PILL_RECOGNITION_API_URL=https://YOUR_SPACE_USERNAME-YOUR_SPACE_NAME.hf.space/predict
```
