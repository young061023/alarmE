import {
  createYakallimClient,
  createMedicine,
  createSchedule,
  getProfile,
  getSupabaseConfigStatus,
  listDoseRecords,
  listGuardians,
  listMedicines,
  listTodaySchedules,
  recordDose,
  saveOcrUpload,
  signInWithLoginId,
  signOut,
  signUpWithProfile,
  upsertGuardian
} from "./supabase-client.js";

const localKey = "yakallim-e:fallback";

const EDRUG_CONFIG = {
  serviceKey: "b60b484dd40f7af6c84f99b149b9a3aa9a8c7d07bae894c4f5a2536263c0d247", // 여기에 e약은요 API 일반 인증키(Encoding)를 넣으세요.
  baseUrl: "https://apis.data.go.kr/1471000/DrbEasyDrugInfoService/getDrbEasyDrugList"
};

const state = {
  client: null,
  profile: null,
  medicines: [],
  schedules: [],
  records: [],
  guardians: [],
  usingSupabase: false,
  nextSchedule: null
};

const els = {
  body: document.body,
  connectionText: document.querySelector("#connectionText"),
  pageTitle: document.querySelector("#pageTitle"),
  menuToggle: document.querySelector("#menuToggle"),
  syncButton: document.querySelector("#syncButton"),
  completeDose: document.querySelector("#completeDose"),
  nextDoseTime: document.querySelector("#nextDoseTime"),
  nextDoseName: document.querySelector("#nextDoseName"),
  medicineCount: document.querySelector("#medicineCount"),
  scheduleCount: document.querySelector("#scheduleCount"),
  recordCount: document.querySelector("#recordCount"),
  scheduleList: document.querySelector("#scheduleList"),
  medicineList: document.querySelector("#medicineList"),
  recordList: document.querySelector("#recordList"),
  guardianList: document.querySelector("#guardianList"),
  signupForm: document.querySelector("#signupForm"),
  loginForm: document.querySelector("#loginForm"),
  logoutButton: document.querySelector("#logoutButton"),
  profileBox: document.querySelector("#profileBox"),
  medicineForm: document.querySelector("#medicineForm"),
  lookupEDrug: document.querySelector("#lookupEDrug"),
  guardianForm: document.querySelector("#guardianForm"),
  exportRecords: document.querySelector("#exportRecords"),
  ocrImage: document.querySelector("#ocrImage"),
  preview: document.querySelector("#preview"),
  ocrStatus: document.querySelector("#ocrStatus"),
  ocrText: document.querySelector("#ocrText"),
  saveOcr: document.querySelector("#saveOcr"),
  toast: document.querySelector("#toast")
};

boot();

async function boot() {
  bindEvents();
  initClient();
  restoreLocal();
  await syncFromDatabase();
  render();
  setInterval(updateNextDoseCountdown, 1000);
}

function initClient() {
  const config = getSupabaseConfigStatus();
  if (!config.hasAnonKey) {
    state.usingSupabase = false;
    els.connectionText.textContent = "anon key 필요 · 현재 로컬 임시 저장";
    showToast("Supabase anon key를 넣으면 DB와 바로 연동됩니다.");
    return;
  }

  try {
    state.client = createYakallimClient();
    state.usingSupabase = true;
    els.connectionText.textContent = "Supabase 연결 준비됨";
  } catch (error) {
    state.usingSupabase = false;
    els.connectionText.textContent = "Supabase 미연결 · 로컬 임시 저장";
    showToast(error.message);
  }
}

function bindEvents() {
  els.menuToggle.addEventListener("click", () => els.body.classList.toggle("menu-open"));
  document.querySelectorAll(".nav").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });

  els.syncButton.addEventListener("click", syncFromDatabase);
  els.signupForm.addEventListener("submit", handleSignup);
  els.loginForm.addEventListener("submit", handleLogin);
  els.logoutButton.addEventListener("click", handleLogout);
  els.medicineForm.addEventListener("submit", handleMedicineSubmit);
  els.lookupEDrug.addEventListener("click", handleEDrugLookup);
  els.guardianForm.addEventListener("submit", handleGuardianSubmit);
  els.completeDose.addEventListener("click", completeNextDose);
  els.exportRecords.addEventListener("click", exportRecordsCsv);
  els.ocrImage.addEventListener("change", handleOcrImage);
  els.saveOcr.addEventListener("click", handleSaveOcr);
}

function showView(view) {
  document.querySelectorAll(".nav").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  document.querySelectorAll(".view").forEach((section) => section.classList.toggle("active", section.id === `view-${view}`));

  const titles = {
    dashboard: "오늘 복약 현황",
    auth: "로그인 / 회원가입",
    medicines: "약 관리",
    records: "복용 기록",
    guardian: "보호자 연동",
    ocr: "OCR 약 등록"
  };
  els.pageTitle.textContent = titles[view] || "약알림e";
  els.body.classList.remove("menu-open");
}

async function handleSignup(event) {
  event.preventDefault();
  if (!requireSupabase()) return;

  const payload = {
    name: document.querySelector("#signupName").value.trim(),
    loginId: document.querySelector("#signupLoginId").value.trim(),
    password: document.querySelector("#signupPassword").value,
    phone: document.querySelector("#signupPhone").value.trim()
  };

  try {
    await signUpWithProfile(state.client, payload);
    showToast("회원가입 완료. 바로 로그인해 주세요.");
    els.signupForm.reset();
  } catch (error) {
    showToast(error.message);
  }
}

async function handleLogin(event) {
  event.preventDefault();
  if (!requireSupabase()) return;

  try {
    await signInWithLoginId(state.client, {
      loginId: document.querySelector("#loginId").value.trim(),
      password: document.querySelector("#loginPassword").value
    });
    showToast("로그인되었습니다.");
    els.loginForm.reset();
    await syncFromDatabase();
    showView("dashboard");
  } catch (error) {
    showToast(error.message);
  }
}

async function handleLogout() {
  if (!requireSupabase()) return;
  await signOut(state.client);
  state.profile = null;
  state.medicines = [];
  state.schedules = [];
  state.records = [];
  state.guardians = [];
  render();
  showToast("로그아웃되었습니다.");
}

async function handleMedicineSubmit(event) {
  event.preventDefault();
  const itemName = document.querySelector("#medicineName").value.trim();
  const doseTime = document.querySelector("#medicineTime").value;
  const effect = document.querySelector("#medicineEffect").value.trim();
  const caution = document.querySelector("#medicineCaution").value.trim();
  const amount = document.querySelector("#medicineAmount").value.trim();

  try {
    if (state.usingSupabase && state.profile) {
      const medicine = await createMedicine(state.client, {
        itemName,
        efcyQesitm: effect,
        cautionNote: caution,
        source: "manual"
      });
      await createSchedule(state.client, {
        medicineId: medicine.id,
        doseTime,
        repeatType: "daily",
        amount
      });
      await syncFromDatabase();
    } else {
      state.medicines.push({ id: crypto.randomUUID(), item_name: itemName, efcy_qesitm: effect, caution_note: caution });
      state.schedules.push({ id: crypto.randomUUID(), item_name: itemName, dose_time: doseTime, amount });
      persistLocal();
      render();
    }
    els.medicineForm.reset();
    showToast(`${itemName} 등록 완료`);
  } catch (error) {
    showToast(error.message);
  }
}

async function handleEDrugLookup() {
  const itemName = document.querySelector("#medicineName").value.trim();
  if (!itemName) {
    showToast("먼저 약 이름을 입력해 주세요.");
    return;
  }

  if (!EDRUG_CONFIG.serviceKey) {
    showToast("app.js 상단 EDRUG_CONFIG.serviceKey에 e약은요 API 키를 넣어야 합니다.");
    return;
  }

  els.lookupEDrug.disabled = true;
  els.lookupEDrug.textContent = "조회 중...";

  try {
    const effect = await fetchEDrugEffect(itemName);
    document.querySelector("#medicineEffect").value = effect;
    showToast("e약은요 efcyQesitm을 불러왔습니다.");
  } catch (error) {
    showToast(error.message);
  } finally {
    els.lookupEDrug.disabled = false;
    els.lookupEDrug.innerHTML = '<i data-lucide="search"></i>e약은요 효능 조회';
    if (window.lucide) window.lucide.createIcons();
  }
}

async function fetchEDrugEffect(itemName) {
  const url = new URL(EDRUG_CONFIG.baseUrl);
  url.searchParams.set("serviceKey", EDRUG_CONFIG.serviceKey);
  url.searchParams.set("type", "json");
  url.searchParams.set("itemName", itemName);
  url.searchParams.set("numOfRows", "1");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("e약은요 API 응답 오류입니다.");
  }

  const data = await response.json();
  const items = data?.body?.items || data?.response?.body?.items || [];
  const first = Array.isArray(items) ? items[0] : items;
  const effect = first?.efcyQesitm;

  if (!effect) {
    throw new Error("해당 약의 efcyQesitm 값을 찾지 못했습니다.");
  }

  return String(effect).replace(/\s+/g, " ").trim();
}

async function handleGuardianSubmit(event) {
  event.preventDefault();
  const guardian = {
    name: document.querySelector("#guardianName").value.trim(),
    phone: document.querySelector("#guardianPhone").value.trim(),
    relationship: document.querySelector("#guardianRelation").value.trim() || "보호자",
    alertDelayMinutes: document.querySelector("#guardianDelay").value,
    alertsEnabled: document.querySelector("#guardianEnabled").checked
  };

  try {
    if (state.usingSupabase && state.profile) {
      await upsertGuardian(state.client, guardian);
      await syncFromDatabase();
    } else {
      state.guardians = [{
        id: crypto.randomUUID(),
        name: guardian.name,
        phone: guardian.phone,
        relationship: guardian.relationship,
        alert_delay_minutes: Number(guardian.alertDelayMinutes),
        alerts_enabled: guardian.alertsEnabled
      }];
      persistLocal();
      render();
    }
    showToast("보호자 정보 저장 완료");
  } catch (error) {
    showToast(error.message);
  }
}

async function completeNextDose() {
  const next = state.nextSchedule || getNextSchedule(state.schedules)?.schedule;
  if (!next) {
    showToast("복용할 일정이 없습니다.");
    return;
  }

  try {
    if (state.usingSupabase && state.profile) {
      await recordDose(state.client, {
        medicineId: next.medicine_id,
        scheduleId: next.id,
        status: "taken",
        note: `${next.item_name || "약"} 복용 완료`
      });
      await syncFromDatabase();
    } else {
      state.records.unshift({
        id: crypto.randomUUID(),
        medicines: { item_name: next.item_name },
        taken_at: new Date().toISOString(),
        status: "taken",
        note: "로컬 복용 완료"
      });
      persistLocal();
      render();
    }
    showToast(`${next.item_name || "약"} 복용 완료`);
  } catch (error) {
    showToast(error.message);
  }
}

async function syncFromDatabase() {
  if (!state.usingSupabase || !state.client) {
    render();
    return;
  }

  try {
    state.profile = await getProfile(state.client);
    if (!state.profile) {
      els.connectionText.textContent = "Supabase 연결됨 · 로그인 필요";
      render();
      return;
    }

    const [medicines, schedules, records, guardians] = await Promise.all([
      listMedicines(state.client),
      listTodaySchedules(state.client),
      listDoseRecords(state.client),
      listGuardians(state.client)
    ]);

    state.medicines = medicines;
    state.schedules = schedules;
    state.records = records;
    state.guardians = guardians;
    els.connectionText.textContent = `${state.profile.name}님 · Supabase 동기화됨`;
    render();
  } catch (error) {
    els.connectionText.textContent = "Supabase 연결 오류";
    showToast(error.message);
    render();
  }
}

async function handleOcrImage(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  els.preview.innerHTML = `<img src="${url}" alt="OCR 이미지" />`;
  els.ocrStatus.textContent = "OCR 분석 중...";
  els.ocrText.value = "";

  try {
    const result = await window.Tesseract.recognize(file, "kor+eng", {
      logger: (message) => {
        if (message.status === "recognizing text") {
          els.ocrStatus.textContent = `OCR 분석 중 ${Math.round(message.progress * 100)}%`;
        }
      }
    });
    els.ocrText.value = result.data.text.trim();
    els.ocrStatus.textContent = "OCR 완료";
  } catch (error) {
    els.ocrStatus.textContent = "OCR 실패";
    showToast(error.message);
  }
}

async function handleSaveOcr() {
  const rawText = els.ocrText.value.trim();
  if (!rawText) {
    showToast("저장할 OCR 결과가 없습니다.");
    return;
  }

  const parsedMedicineName = guessMedicineName(rawText);
  try {
    if (state.usingSupabase && state.profile) {
      await saveOcrUpload(state.client, {
        fileName: els.ocrImage.files?.[0]?.name,
        rawText,
        parsedMedicineName,
        parsedData: { source: "tesseract" }
      });
      const medicine = await createMedicine(state.client, {
        itemName: parsedMedicineName,
        rawOcrText: rawText,
        source: "ocr"
      });
      await createSchedule(state.client, {
        medicineId: medicine.id,
        doseTime: "09:00",
        repeatType: "daily"
      });
      await syncFromDatabase();
    } else {
      state.medicines.push({ id: crypto.randomUUID(), item_name: parsedMedicineName, raw_ocr_text: rawText });
      state.schedules.push({ id: crypto.randomUUID(), item_name: parsedMedicineName, dose_time: "09:00" });
      persistLocal();
      render();
    }
    showToast(`${parsedMedicineName} OCR 등록 완료`);
  } catch (error) {
    showToast(error.message);
  }
}

function render() {
  renderProfile();
  renderSchedules();
  renderMedicines();
  renderRecords();
  renderGuardians();
  renderSummary();
  if (window.lucide) window.lucide.createIcons();
}

function renderProfile() {
  if (state.profile) {
    els.profileBox.textContent = `${state.profile.name} / 아이디: ${state.profile.login_id}`;
  } else {
    els.profileBox.textContent = state.usingSupabase ? "Supabase에 연결되었습니다. 로그인해 주세요." : "anon key가 없어 로컬 임시 저장 모드입니다.";
  }
}

function renderSchedules() {
  if (!state.schedules.length) {
    els.scheduleList.innerHTML = `<div class="notice">등록된 오늘 일정이 없습니다.</div>`;
    els.nextDoseTime.textContent = "--:--";
    els.nextDoseName.textContent = "약을 등록하면 일정이 표시됩니다.";
    return;
  }

  const sorted = state.schedules.slice().sort((a, b) => String(a.dose_time).localeCompare(String(b.dose_time)));
  updateNextDoseCountdown();
  els.scheduleList.innerHTML = sorted.map((item) => `
    <div class="item">
      <div>
        <h4>${escapeHtml(item.item_name || "약")}</h4>
        <p>${escapeHtml(trimSeconds(item.dose_time))} · ${escapeHtml(item.amount || "복용량 미입력")}</p>
      </div>
      <button class="secondary" data-record-schedule="${escapeHtml(item.id)}">완료</button>
    </div>
  `).join("");

  els.scheduleList.querySelectorAll("[data-record-schedule]").forEach((button) => {
    button.addEventListener("click", () => {
      const schedule = state.schedules.find((item) => item.id === button.dataset.recordSchedule);
      if (schedule) completeSchedule(schedule);
    });
  });
}

function updateNextDoseCountdown() {
  if (!state.schedules.length) return;

  const next = getNextSchedule(state.schedules);
  if (!next) return;

  state.nextSchedule = next.schedule;
  els.nextDoseTime.textContent = formatDuration(next.remainingMs);
  els.nextDoseName.textContent = `${next.schedule.item_name || "등록된 약"} · ${next.isTomorrow ? "내일 " : "오늘 "}${trimSeconds(next.schedule.dose_time)} 복용`;
}

function getNextSchedule(schedules) {
  const now = new Date();
  const candidates = schedules
    .map((schedule) => {
      const target = getKoreanDoseDate(schedule.dose_time, now);
      return {
        schedule,
        target,
        remainingMs: target.getTime() - now.getTime(),
        isTomorrow: target.getDate() !== now.getDate()
      };
    })
    .sort((a, b) => a.remainingMs - b.remainingMs);

  return candidates[0] || null;
}

function getKoreanDoseDate(doseTime, now = new Date()) {
  const [hours, minutes] = String(doseTime || "00:00").split(":").map(Number);
  const koreanNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const target = new Date(koreanNow);
  target.setHours(hours || 0, minutes || 0, 0, 0);

  if (target.getTime() <= koreanNow.getTime()) {
    target.setDate(target.getDate() + 1);
  }

  const offsetMs = koreanNow.getTime() - now.getTime();
  return new Date(target.getTime() - offsetMs);
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

async function completeSchedule(schedule) {
  try {
    if (state.usingSupabase && state.profile) {
      await recordDose(state.client, {
        medicineId: schedule.medicine_id,
        scheduleId: schedule.id,
        status: "taken",
        note: `${schedule.item_name} 복용 완료`
      });
      await syncFromDatabase();
    } else {
      state.records.unshift({
        id: crypto.randomUUID(),
        medicines: { item_name: schedule.item_name },
        taken_at: new Date().toISOString(),
        status: "taken",
        note: "로컬 복용 완료"
      });
      persistLocal();
      render();
    }
    showToast(`${schedule.item_name} 복용 기록 완료`);
  } catch (error) {
    showToast(error.message);
  }
}

function renderMedicines() {
  if (!state.medicines.length) {
    els.medicineList.innerHTML = `<div class="notice">등록된 약이 없습니다.</div>`;
    return;
  }

  els.medicineList.innerHTML = state.medicines.map((item) => `
    <div class="item">
      <div>
        <h4>${escapeHtml(item.item_name)}</h4>
        <p>${escapeHtml(item.efcy_qesitm || item.caution_note || "효능/주의사항 미입력")}</p>
      </div>
      <span class="label">${escapeHtml(item.source || "manual")}</span>
    </div>
  `).join("");
}

function renderRecords() {
  if (!state.records.length) {
    els.recordList.innerHTML = `<div class="notice">복용 기록이 없습니다.</div>`;
    return;
  }

  els.recordList.innerHTML = state.records.map((record) => `
    <div class="item">
      <div>
        <h4>${escapeHtml(record.medicines?.item_name || record.note || "복용 기록")}</h4>
        <p>${escapeHtml(formatDateTime(record.taken_at || record.created_at))} · ${escapeHtml(record.status)}</p>
      </div>
      <span class="label">완료</span>
    </div>
  `).join("");
}

function renderGuardians() {
  if (!state.guardians.length) {
    els.guardianList.innerHTML = `<div class="notice">등록된 보호자가 없습니다.</div>`;
    return;
  }

  els.guardianList.innerHTML = state.guardians.map((item) => `
    <div class="item">
      <div>
        <h4>${escapeHtml(item.name)}</h4>
        <p>${escapeHtml(item.phone)} · ${escapeHtml(item.relationship || "보호자")} · ${item.alert_delay_minutes}분 후 알림</p>
      </div>
      <span class="label">${item.alerts_enabled ? "사용" : "꺼짐"}</span>
    </div>
  `).join("");
}

function renderSummary() {
  els.medicineCount.textContent = state.medicines.length;
  els.scheduleCount.textContent = state.schedules.length;
  els.recordCount.textContent = state.records.length;
}

function requireSupabase() {
  if (state.usingSupabase && state.client) return true;
  showToast("Supabase anon public key를 먼저 넣어야 합니다.");
  showView("auth");
  return false;
}

function restoreLocal() {
  try {
    const data = JSON.parse(localStorage.getItem(localKey) || "{}");
    state.medicines = data.medicines || [];
    state.schedules = data.schedules || [];
    state.records = data.records || [];
    state.guardians = data.guardians || [];
  } catch {
    localStorage.removeItem(localKey);
  }
}

function persistLocal() {
  localStorage.setItem(localKey, JSON.stringify({
    medicines: state.medicines,
    schedules: state.schedules,
    records: state.records,
    guardians: state.guardians
  }));
}

function exportRecordsCsv() {
  const rows = [["약", "상태", "시간", "메모"]];
  state.records.forEach((record) => rows.push([
    record.medicines?.item_name || "",
    record.status || "",
    formatDateTime(record.taken_at || record.created_at),
    record.note || ""
  ]));
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "yakallim-dose-records.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function guessMedicineName(text) {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  return lines.find((line) => /정|캡슐|시럽|mg|밀리그램/i.test(line)) || lines[0] || "OCR 등록 약";
}

function trimSeconds(value) {
  if (!value) return "--:--";
  return String(value).slice(0, 5);
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 3000);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
