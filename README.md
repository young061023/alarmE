# 약알림e Next.js 웹앱

정적 웹 프로토타입을 Next.js 구조로 바꾼 버전입니다.

## 실행

```bash
npm install
npm run dev
```

브라우저에서:

```txt
http://localhost:3000
```

## Build / Start Command

배포 플랫폼에는 이렇게 넣으면 됩니다.

```txt
Build command: npm install && python3 -m pip install -r requirements-pill.txt && npm run build
Start command: npm run start
```

AI 약 인식을 Render에서 함께 쓰려면 Python 패키지도 설치되어야 합니다. OpenCV는 사용자 기기에 설치하는 것이 아니라 Render 서버에 `opencv-python-headless`로 설치됩니다. 모델 파일을 GitHub에 직접 올리지 않을 경우 Render 환경변수에 `PILL_MODEL_URL`을 넣으면 서버가 `/tmp/pill-models/best_pill_model.pt`로 내려받아 사용합니다.

개발 중에는:

```txt
npm run dev
```

## 환경변수

`.env.local.example`을 `.env.local`로 복사해서 값을 넣으세요.

```txt
NEXT_PUBLIC_SUPABASE_URL=https://iatjbuglymcwrisaclop.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=Supabase anon public key
SUPABASE_SERVICE_ROLE_KEY=Supabase service role key (보호자 관리 서버 조회용)
EDRUG_SERVICE_KEY=e약은요 일반 인증키 Encoding
GEMINI_API_KEY=Google Gemini API key
GEMINI_MODEL=gemini-2.5-flash
PILL_MODEL_PATH=/opt/render/project/src/best_pill_model.pt
PILL_MODEL_URL=모델 파일 다운로드 URL
PILL_CACHE_DIR=/Users/young/Documents/GitHub/alarmE/pill_cache
PILL_DEVICE=cpu
REMBG_MODEL=isnet-general-use
```

`EDRUG_SERVICE_KEY`는 서버 API route에서만 사용됩니다. 브라우저에 직접 노출하지 않습니다.

## API 구조

- `/api/edrug?itemName=타이레놀정`
  - 서버에서 e약은요 API 호출
  - 응답에서 `efcyQesitm`만 추출
  - 약 등록 화면의 효능 칸에 자동 입력

## DB 구조

Supabase SQL은 기존 파일을 사용하면 됩니다.

- `../yakallim-e/supabase-schema.sql`
- `../yakallim-e/supabase-security-fix.sql`

## 주요 기능

- Supabase Auth 기반 회원가입/로그인
- 사용자 프로필 조회
- 약 등록 및 복용 일정 생성
- e약은요 API 서버 route 연동
- 복용 완료 기록 저장
- 보호자 정보 저장
- Tesseract OCR 등록
- 한국 시각 기준 다음 복약 카운트다운


## AI 약 인식 Python 패키지

```bash
python3 -m pip install -r requirements-pill.txt
```


## 로컬 약 정보 fallback

e약은요 API에서 약 정보를 찾지 못하면 `data/local-medicines.json`을 조회합니다.

```json
[
  {
    "itemName": "약 이름",
    "aliases": ["OCR에서 나올 수 있는 다른 이름"],
    "efcyQesitm": "효능",
    "useMethodQesitm": "복용법",
    "atpnQesitm": "주의사항"
  }
]
```
