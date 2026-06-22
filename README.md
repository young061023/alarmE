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
Build command: npm run build
Start command: npm run start
```

개발 중에는:

```txt
npm run dev
```

## 환경변수

`.env.local.example`을 `.env.local`로 복사해서 값을 넣으세요.

```txt
NEXT_PUBLIC_SUPABASE_URL=https://iatjbuglymcwrisaclop.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=Supabase anon public key
EDRUG_SERVICE_KEY=e약은요 일반 인증키 Encoding
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
