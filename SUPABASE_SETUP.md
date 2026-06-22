# 약알림e Supabase 설정

Supabase URL:

```txt
https://iatjbuglymcwrisaclop.supabase.co
```

## 1. 테이블 만들기

Supabase Dashboard에서 아래 순서로 실행하세요.

1. 프로젝트 접속
2. 왼쪽 메뉴 `SQL Editor`
3. [supabase-schema.sql](./supabase-schema.sql) 내용 전체 붙여넣기
4. `Run`

## 2. 필요한 키

정적 웹앱에서 필요한 키는 `anon public key`입니다.

위치:

```txt
Project Settings > API > Project API keys > anon public
```

이 키를 [supabase-client.js](./supabase-client.js)의 `anonKey`에 넣으면 됩니다.

```js
const SUPABASE_CONFIG = {
  url: "https://iatjbuglymcwrisaclop.supabase.co",
  anonKey: "여기에 anon public key"
};
```

`service_role key`는 절대 정적 웹 코드에 넣으면 안 됩니다.

## 2-1. 정적 웹앱과 연결

이 폴더의 웹앱은 이미 Supabase 연동 코드가 들어가 있습니다.

- [index.html](./index.html): 화면
- [app.js](./app.js): 로그인, 약 등록, 보호자 저장, 복용 기록 연동
- [supabase-client.js](./supabase-client.js): Supabase 호출 함수

`supabase-client.js`에 anon public key를 넣은 뒤 `index.html`을 열면 됩니다.

```js
const SUPABASE_CONFIG = {
  url: "https://iatjbuglymcwrisaclop.supabase.co",
  anonKey: "여기에 anon public key"
};
```

## 2-2. Auth 설정

현재 앱은 “아이디/비밀번호” UX를 위해 내부적으로 아래 이메일 형식을 사용합니다.

```txt
아이디@yakallim.local
```

Supabase에서 이메일 확인이 켜져 있으면 가짜 이메일이라 가입 직후 로그인이 안 될 수 있습니다. 테스트 단계에서는:

```txt
Authentication > Providers > Email > Confirm email
```

이 설정을 꺼두면 편합니다.

## 3. 비밀번호 저장 방식

비밀번호는 `profiles` 테이블에 저장하지 않습니다.

회원가입 시 Supabase Auth에 저장되고, Supabase가 내부적으로 해시 처리합니다. 앱에서 쓰는 `아이디`는 `profiles.login_id`에 저장됩니다.

## 4. 만들어지는 데이터 구조

- `profiles`: 사용자 이름, 아이디, 전화번호
- `guardians`: 보호자 이름, 연락처, 미복용 알림 대기 시간
- `medicines`: 약 이름, e약은요 `efcy_qesitm`, OCR 원문, 주의사항
- `medication_schedules`: 복용 시간, 반복 규칙, 복용량
- `dose_records`: 실제 복용 여부, 복용 시간, 미복용/중복 경고 상태
- `ocr_uploads`: 처방전/약 봉투 OCR 결과
- `duplicate_warnings`: 중복 복용 경고 기록
- `today_schedules`: 오늘 복약 일정 조회용 뷰

## 5. 정적 웹에서 사용하는 예시

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script type="module">
  import {
    createYakallimClient,
    signUpWithProfile,
    signInWithLoginId,
    createMedicine,
    createSchedule,
    recordDose
  } from "./supabase-client.js";

  const client = createYakallimClient();

  await signUpWithProfile(client, {
    loginId: "hong",
    password: "test-password",
    name: "홍길동",
    phone: "010-1234-5678"
  });

  await signInWithLoginId(client, {
    loginId: "hong",
    password: "test-password"
  });

  const medicine = await createMedicine(client, {
    itemName: "타이레놀정",
    efcyQesitm: "감기로 인한 발열 및 통증 완화에 도움을 줄 수 있습니다.",
    source: "edrug_api"
  });

  const schedule = await createSchedule(client, {
    medicineId: medicine.id,
    doseTime: "08:00",
    repeatType: "daily",
    amount: "1정"
  });

  await recordDose(client, {
    medicineId: medicine.id,
    scheduleId: schedule.id,
    status: "taken"
  });
</script>
```
