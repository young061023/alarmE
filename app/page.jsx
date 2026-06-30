"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Database,
  Download,
  ImagePlus,
  Loader2,
  Sparkles,
  Home,
  LogIn,
  LogOut,
  Menu,
  Pill,
  RefreshCw,
  RotateCcw,
  Save,
  ScanSearch,
  Search,
  ShieldCheck,
  Upload,
  UserPlus,
  UserRound,
  UserRoundCheck
} from "lucide-react";
import { createBrowserSupabaseClient, hasSupabaseConfig, loginIdToEmail } from "./lib/supabaseClient";

const emptyState = {
  profile: null,
  medicines: [],
  schedules: [],
  records: [],
  guardians: [],
  ocrText: ""
};

export default function HomePage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const pillVideoRef = useRef(null);
  const pillCanvasRef = useRef(null);
  const pillStreamRef = useRef(null);
  const [view, setView] = useState("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [data, setData] = useState(emptyState);
  const [toast, setToast] = useState("");
  const [connection, setConnection] = useState(hasSupabaseConfig() ? "Supabase 연결 준비됨" : "anon key 필요");
  const [nextDose, setNextDose] = useState(null);
  const [authForm, setAuthForm] = useState({ name: "", loginId: "", password: "", phone: "" });
  const [loginForm, setLoginForm] = useState({ loginId: "", password: "" });
  const [authMode, setAuthMode] = useState("user");
  const [guardianLoginForm, setGuardianLoginForm] = useState({ name: "", phone: "" });
  const [guardianSession, setGuardianSession] = useState(null);
  const [guardianStatus, setGuardianStatus] = useState("");
  const [medicineForm, setMedicineForm] = useState({
    itemName: "",
    efcyQesitm: "",
    doseTime: "08:00",
    amount: "1정",
    cautionNote: ""
  });
  const [guardianForm, setGuardianForm] = useState({
    name: "",
    phone: "",
    relationship: "보호자",
    alertDelayMinutes: "30",
    alertsEnabled: true
  });
  const [ocrStatus, setOcrStatus] = useState("대기 중");
  const [previewUrl, setPreviewUrl] = useState("");
  const [ocrMedicines, setOcrMedicines] = useState([]);
  const [ocrAiLoading, setOcrAiLoading] = useState(false);
  const [pillStatus, setPillStatus] = useState("카메라를 켜거나 사진을 선택해 주세요.");
  const [pillPreviewUrl, setPillPreviewUrl] = useState("");
  const [pillImageBlob, setPillImageBlob] = useState(null);
  const [pillPredictions, setPillPredictions] = useState([]);
  const [pillDetails, setPillDetails] = useState({});
  const [pillDetailLoading, setPillDetailLoading] = useState("");
  const [pillLoading, setPillLoading] = useState(false);
  const [pillCameraOn, setPillCameraOn] = useState(false);

  useEffect(() => {
    syncFromDatabase();
  }, []);

  useEffect(() => {
    updateNextDose();
    const timer = setInterval(updateNextDose, 1000);
    return () => clearInterval(timer);
  }, [data.schedules]);

  function notify(message) {
    setToast(message);
    window.clearTimeout(notify.timer);
    notify.timer = window.setTimeout(() => setToast(""), 2800);
  }

  async function syncFromDatabase() {
    if (!supabase) {
      setConnection("anon key 필요 · 로컬 화면 확인 가능");
      return;
    }

    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) {
        setConnection("Supabase 연결됨 · 로그인 필요");
        setData(emptyState);
        return;
      }

      const [profileResult, medicinesResult, schedulesResult, recordsResult, guardiansResult] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId).single(),
        supabase.from("medicines").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
        supabase.from("today_schedules").select("*").eq("user_id", userId).order("dose_time", { ascending: true }),
        supabase.from("dose_records").select("*, medicines(item_name)").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
        supabase.from("guardians").select("*").eq("user_id", userId).order("created_at", { ascending: false })
      ]);

      throwIfError(profileResult.error || medicinesResult.error || schedulesResult.error || recordsResult.error || guardiansResult.error);

      setData({
        profile: profileResult.data,
        medicines: medicinesResult.data || [],
        schedules: schedulesResult.data || [],
        records: recordsResult.data || [],
        guardians: guardiansResult.data || [],
        ocrText: data.ocrText
      });
      setConnection(`${profileResult.data.name}님 · Supabase 동기화됨`);
    } catch (error) {
      setConnection("Supabase 연결 오류");
      notify(error.message);
    }
  }

  async function handleSignUp(event) {
    event.preventDefault();
    if (!requireSupabase()) return;

    try {
      const { error } = await supabase.auth.signUp({
        email: loginIdToEmail(authForm.loginId),
        password: authForm.password,
        options: {
          data: {
            login_id: authForm.loginId,
            name: authForm.name,
            phone: authForm.phone
          }
        }
      });
      throwIfError(error);
      notify("회원가입 완료. 로그인해 주세요.");
      setAuthForm({ name: "", loginId: "", password: "", phone: "" });
    } catch (error) {
      notify(error.message);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    if (!requireSupabase()) return;

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginIdToEmail(loginForm.loginId),
        password: loginForm.password
      });
      throwIfError(error);
      setGuardianSession(null);
      setGuardianStatus("");
      notify("로그인되었습니다.");
      setLoginForm({ loginId: "", password: "" });
      await syncFromDatabase();
      setView("dashboard");
    } catch (error) {
      notify(error.message);
    }
  }

  async function handleLogout() {
    if (!requireSupabase()) return;
    await supabase.auth.signOut();
    setData(emptyState);
    setGuardianSession(null);
    setGuardianStatus("");
    setConnection("Supabase 연결됨 · 로그인 필요");
    notify("로그아웃되었습니다.");
  }

  async function handleGuardianLogin(event) {
    event.preventDefault();
    if (!guardianLoginForm.name.trim() || !guardianLoginForm.phone.trim()) {
      notify("보호자 이름과 연락처를 입력해 주세요.");
      return;
    }

    setGuardianStatus("보호자 정보 확인 중...");
    try {
      const response = await fetch("/api/guardian-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(guardianLoginForm)
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "보호자 로그인 실패");
      }
      setGuardianSession(result);
      setGuardianStatus(`${result.wards.length}명 관리 대상 연동됨`);
      setConnection(`${guardianLoginForm.name} 보호자님 · 관리 모드`);
      setView("guardianManage");
      notify("보호자 로그인되었습니다.");
    } catch (error) {
      setGuardianStatus("보호자 로그인 실패");
      notify(error.message);
    }
  }

  async function refreshGuardianManagement() {
    if (!guardianLoginForm.name.trim() || !guardianLoginForm.phone.trim()) {
      notify("보호자 로그인이 필요합니다.");
      setView("auth");
      setAuthMode("guardian");
      return;
    }

    setGuardianStatus("관리 현황 새로고침 중...");
    try {
      const response = await fetch("/api/guardian-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(guardianLoginForm)
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "관리 현황 조회 실패");
      }
      setGuardianSession(result);
      setGuardianStatus(`${result.wards.length}명 관리 대상 동기화됨`);
    } catch (error) {
      setGuardianStatus("관리 현황 조회 실패");
      notify(error.message);
    }
  }

  function handleGuardianLogout() {
    setGuardianSession(null);
    setGuardianStatus("");
    setGuardianLoginForm({ name: "", phone: "" });
    setConnection(hasSupabaseConfig() ? "Supabase 연결 준비됨" : "anon key 필요");
    notify("보호자 로그아웃되었습니다.");
  }

  async function lookupEDrug() {
    if (!medicineForm.itemName.trim()) {
      notify("약 이름을 먼저 입력해 주세요.");
      return;
    }

    try {
      const response = await fetch(`/api/edrug?itemName=${encodeURIComponent(medicineForm.itemName)}`);
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "e약은요 조회 실패");
      }
      setMedicineForm((current) => ({
        ...current,
        itemName: result.itemName || current.itemName,
        efcyQesitm: result.efcyQesitm
      }));
      notify("e약은요 efcyQesitm을 불러왔습니다.");
    } catch (error) {
      notify(error.message);
    }
  }

  async function saveMedicine(event) {
    event.preventDefault();
    if (!requireLogin()) return;

    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user.id;
      const medicineResult = await supabase
        .from("medicines")
        .insert({
          user_id: userId,
          item_name: medicineForm.itemName,
          efcy_qesitm: medicineForm.efcyQesitm || null,
          caution_note: medicineForm.cautionNote || null,
          source: medicineForm.efcyQesitm ? "edrug_api" : "manual"
        })
        .select()
        .single();
      throwIfError(medicineResult.error);

      const scheduleResult = await supabase.from("medication_schedules").insert({
        user_id: userId,
        medicine_id: medicineResult.data.id,
        dose_time: medicineForm.doseTime,
        repeat_type: "daily",
        amount: medicineForm.amount || null
      });
      throwIfError(scheduleResult.error);

      setMedicineForm({ itemName: "", efcyQesitm: "", doseTime: "08:00", amount: "1정", cautionNote: "" });
      notify("약과 복용 일정이 저장되었습니다.");
      await syncFromDatabase();
    } catch (error) {
      notify(error.message);
    }
  }

  async function saveGuardian(event) {
    event.preventDefault();
    if (!requireLogin()) return;

    try {
      const { data: userData } = await supabase.auth.getUser();
      const result = await supabase
        .from("guardians")
        .upsert({
          user_id: userData.user.id,
          name: guardianForm.name,
          phone: guardianForm.phone,
          relationship: guardianForm.relationship || "보호자",
          alert_delay_minutes: Number(guardianForm.alertDelayMinutes),
          alerts_enabled: guardianForm.alertsEnabled
        }, { onConflict: "user_id" });
      throwIfError(result.error);

      notify("보호자 정보가 저장되었습니다.");
      await syncFromDatabase();
    } catch (error) {
      notify(error.message);
    }
  }

  async function completeDose(schedule = nextDose?.schedule) {
    if (!requireLogin()) return;
    if (!schedule) {
      notify("복용할 일정이 없습니다.");
      return;
    }

    try {
      const { data: userData } = await supabase.auth.getUser();
      const result = await supabase.from("dose_records").insert({
        user_id: userData.user.id,
        medicine_id: schedule.medicine_id,
        schedule_id: schedule.id,
        taken_at: new Date().toISOString(),
        status: "taken",
        note: `${schedule.item_name} 복용 완료`
      });
      throwIfError(result.error);
      notify(`${schedule.item_name} 복용 완료`);
      await syncFromDatabase();
    } catch (error) {
      notify(error.message);
    }
  }

  async function handleOcrFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setPreviewUrl(URL.createObjectURL(file));
    setOcrStatus("OCR 분석 중...");

    try {
      const Tesseract = await import("tesseract.js");
      const result = await Tesseract.recognize(file, "kor+eng", {
        logger(message) {
          if (message.status === "recognizing text") {
            setOcrStatus(`OCR 분석 중 ${Math.round(message.progress * 100)}%`);
          }
        }
      });
      const text = result.data.text.trim();
      setData((current) => ({ ...current, ocrText: text }));
      setOcrStatus("OCR 완료");
      if (text) {
        await analyzeOcrMedicines(text);
      }
    } catch (error) {
      setOcrStatus("OCR 실패");
      notify(error.message);
    }
  }

  async function analyzeOcrMedicines(text = data.ocrText) {
    if (!text.trim()) {
      notify("분석할 OCR 결과가 없습니다.");
      return;
    }

    setOcrAiLoading(true);
    setOcrStatus("Gemini가 약명을 정리하고 e약은요를 조회 중...");

    try {
      const response = await fetch("/api/ocr-medicines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ocrText: text })
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "AI 약명 정리 실패");
      }
      setOcrMedicines(result.medicines || []);
      setOcrStatus(result.medicines?.length ? "AI 약명 정리 완료" : "약명 후보를 찾지 못했습니다.");
    } catch (error) {
      setOcrStatus("AI 약명 정리 실패");
      notify(error.message);
    } finally {
      setOcrAiLoading(false);
    }
  }

  function applyOcrMedicine(medicine) {
    setMedicineForm((current) => ({
      ...current,
      itemName: medicine.itemName || medicine.name || current.itemName,
      efcyQesitm: medicine.efcyQesitm || current.efcyQesitm
    }));
    setView("medicines");
    notify("약 관리 입력칸에 반영했습니다.");
  }

  async function saveOcrResult() {
    if (!requireLogin()) return;
    if (!data.ocrText.trim()) {
      notify("저장할 OCR 결과가 없습니다.");
      return;
    }

    const parsedMedicineName = ocrMedicines[0]?.itemName || ocrMedicines[0]?.name || guessMedicineName(data.ocrText);

    try {
      const { data: userData } = await supabase.auth.getUser();
      const uploadResult = await supabase.from("ocr_uploads").insert({
        user_id: userData.user.id,
        raw_text: data.ocrText,
        parsed_medicine_name: parsedMedicineName,
        parsed_data: { source: "tesseract_gemini_edrug", medicines: ocrMedicines }
      });
      throwIfError(uploadResult.error);

      const medicineResult = await supabase
        .from("medicines")
        .insert({
          user_id: userData.user.id,
          item_name: parsedMedicineName,
          efcy_qesitm: ocrMedicines[0]?.efcyQesitm || null,
          caution_note: ocrMedicines[0]?.atpnQesitm || ocrMedicines[0]?.atpnWarnQesitm || null,
          raw_ocr_text: data.ocrText,
          source: "ocr"
        })
        .select()
        .single();
      throwIfError(medicineResult.error);

      const scheduleResult = await supabase.from("medication_schedules").insert({
        user_id: userData.user.id,
        medicine_id: medicineResult.data.id,
        dose_time: "09:00",
        repeat_type: "daily"
      });
      throwIfError(scheduleResult.error);

      notify(`${parsedMedicineName} OCR 등록 완료`);
      await syncFromDatabase();
    } catch (error) {
      notify(error.message);
    }
  }

  async function startPillCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false
      });
      pillStreamRef.current = stream;
      pillVideoRef.current.srcObject = stream;
      setPillCameraOn(true);
      setPillPreviewUrl("");
      setPillImageBlob(null);
      setPillPredictions([]);
      setPillStatus("알약이 화면 중앙에 오게 맞춘 뒤 촬영하세요.");
    } catch (error) {
      setPillStatus(error.message || "카메라를 열 수 없습니다.");
    }
  }

  function capturePillPhoto() {
    const video = pillVideoRef.current;
    const canvas = pillCanvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 960;
    const context = canvas.getContext("2d");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      setPillImageBlob(blob);
      setPillPreviewUrl(URL.createObjectURL(blob));
      setPillPredictions([]);
      setPillStatus("사진이 준비되었습니다. AI 인식을 눌러 주세요.");
    }, "image/jpeg", 0.92);
  }

  function handlePillFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    stopPillCamera();
    setPillImageBlob(file);
    setPillPreviewUrl(URL.createObjectURL(file));
    setPillPredictions([]);
    setPillStatus("사진이 준비되었습니다. AI 인식을 눌러 주세요.");
  }

  async function predictPill() {
    if (!pillImageBlob) {
      setPillStatus("먼저 사진을 촬영하거나 선택해 주세요.");
      return;
    }

    setPillLoading(true);
    setPillStatus("누끼 제거 후 모델 추론 중입니다.");
    try {
      const formData = new FormData();
      formData.append("image", pillImageBlob, "pill.jpg");
      const response = await fetch("/api/pill-recognition", {
        method: "POST",
        body: formData
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "AI 인식 실패");
      setPillPredictions(result.predictions || []);
      setPillDetails({});
      setPillStatus("인식 완료");
    } catch (error) {
      setPillStatus(error.message);
      notify(error.message);
    } finally {
      setPillLoading(false);
    }
  }

  function resetPillRecognition() {
    setPillPreviewUrl("");
    setPillImageBlob(null);
    setPillPredictions([]);
    setPillDetails({});
    setPillStatus("카메라를 켜거나 사진을 선택해 주세요.");
  }

  function stopPillCamera() {
    pillStreamRef.current?.getTracks().forEach((track) => track.stop());
    pillStreamRef.current = null;
    setPillCameraOn(false);
  }

  async function togglePillDetail(prediction) {
    const key = prediction.label;
    const current = pillDetails[key];
    if (current?.open) {
      setPillDetails((details) => ({
        ...details,
        [key]: { ...current, open: false }
      }));
      return;
    }

    if (current?.data) {
      setPillDetails((details) => ({
        ...details,
        [key]: { ...current, open: true }
      }));
      return;
    }

    setPillDetailLoading(key);
    try {
      const response = await fetch(`/api/edrug?itemName=${encodeURIComponent(key)}`);
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "e약은요 조회 실패");
      }
      setPillDetails((details) => ({
        ...details,
        [key]: { open: true, data: result }
      }));
    } catch (error) {
      notify(error.message);
      setPillDetails((details) => ({
        ...details,
        [key]: { open: true, error: error.message }
      }));
    } finally {
      setPillDetailLoading("");
    }
  }

  function applyPillPrediction(prediction) {
    setMedicineForm((current) => ({
      ...current,
      itemName: prediction.label || current.itemName
    }));
    setView("medicines");
    notify("AI 인식 결과를 약 관리 입력칸에 반영했습니다.");
  }

  function updateNextDose() {
    const next = getNextSchedule(data.schedules);
    setNextDose(next);
  }

  function requireSupabase() {
    if (supabase) return true;
    notify(".env.local에 NEXT_PUBLIC_SUPABASE_ANON_KEY가 필요합니다.");
    return false;
  }

  function requireLogin() {
    if (!requireSupabase()) return false;
    if (data.profile) return true;
    notify("로그인이 필요합니다.");
    setView("auth");
    return false;
  }

  function exportCsv() {
    const rows = [["약", "상태", "시간", "메모"]];
    data.records.forEach((record) => rows.push([
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

  const title = {
    dashboard: "오늘 복약 현황",
    auth: "로그인 / 회원가입",
    medicines: "약 관리",
    records: "복용 기록",
    guardian: "보호자 연동",
    guardianManage: "보호자 관리",
    ocr: "OCR 약 등록",
    recognize: "AI 약 인식",
    report: "복약 리포트"
  }[view];

  return (
    <div className={`app ${menuOpen ? "menu-open" : ""}`}>
      <aside className="side">
        <div className="brand">
          <span>e</span>
          <div>
            <h1>약알림e</h1>
            <p>Next.js + Supabase</p>
          </div>
        </div>
        <nav>
          <NavButton active={view === "dashboard"} icon={<Home />} onClick={() => selectView("dashboard")}>홈</NavButton>
          <NavButton active={view === "auth"} icon={<UserRound />} onClick={() => selectView("auth")}>로그인</NavButton>
          <NavButton active={view === "medicines"} icon={<Pill />} onClick={() => selectView("medicines")}>약 관리</NavButton>
          <NavButton active={view === "records"} icon={<ClipboardCheck />} onClick={() => selectView("records")}>복용 기록</NavButton>
          <NavButton active={view === "guardian"} icon={<UserRoundCheck />} onClick={() => selectView("guardian")}>보호자</NavButton>
          {guardianSession && <NavButton active={view === "guardianManage"} icon={<ShieldCheck />} onClick={() => selectView("guardianManage")}>관리</NavButton>}
          <NavButton active={view === "ocr"} icon={<Camera />} onClick={() => selectView("ocr")}>OCR 등록</NavButton>
          <NavButton active={view === "recognize"} icon={<ScanSearch />} onClick={() => selectView("recognize")}>AI 인식</NavButton>
          <NavButton active={view === "report"} icon={<BarChart3 />} onClick={() => selectView("report")}>리포트</NavButton>
        </nav>
      </aside>

      <main>
        <header className="top">
          <button className="icon-btn" onClick={() => setMenuOpen(true)} aria-label="메뉴"><Menu /></button>
          <div>
            <p>{connection}</p>
            <h2>{title}</h2>
          </div>
          <button className="secondary" onClick={syncFromDatabase}><RefreshCw />동기화</button>
        </header>

        {view === "dashboard" && (
          <section>
            <div className="hero">
              <div>
                <p className="label">다음 복약까지</p>
                <strong>{nextDose ? formatDuration(nextDose.remainingMs) : "--:--"}</strong>
                <span>{nextDose ? `${nextDose.schedule.item_name} · ${nextDose.isTomorrow ? "내일" : "오늘"} ${trimSeconds(nextDose.schedule.dose_time)} 복용` : "약을 등록하면 일정이 표시됩니다."}</span>
              </div>
              <button className="primary" onClick={() => completeDose()}><Check />복용 완료</button>
            </div>
            <div className="metrics">
              <Metric label="등록된 약" value={data.medicines.length} />
              <Metric label="오늘 일정" value={data.schedules.length} />
              <Metric label="복용 기록" value={data.records.length} />
            </div>
            <Panel eyebrow="오늘의 일정" title="복약 체크리스트">
              <List
                empty="등록된 오늘 일정이 없습니다."
                items={data.schedules}
                render={(item) => (
                  <div className="item" key={item.id}>
                    <div>
                      <h4>{item.item_name}</h4>
                      <p>{trimSeconds(item.dose_time)} · {item.amount || "복용량 미입력"}</p>
                    </div>
                    <button className="secondary" onClick={() => completeDose(item)}>완료</button>
                  </div>
                )}
              />
            </Panel>
          </section>
        )}

        {view === "auth" && (
          <div className="grid two">
            <Panel eyebrow="회원가입" title="이름 / 아이디 / 비밀번호">
              <form className="form" onSubmit={handleSignUp}>
                <label>이름<input value={authForm.name} onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })} required /></label>
                <label>아이디<input value={authForm.loginId} onChange={(e) => setAuthForm({ ...authForm, loginId: e.target.value })} required /></label>
                <label>비밀번호<input type="password" minLength={6} value={authForm.password} onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} required /></label>
                <label>전화번호<input value={authForm.phone} onChange={(e) => setAuthForm({ ...authForm, phone: e.target.value })} /></label>
                <button className="primary"><UserPlus />가입하기</button>
              </form>
            </Panel>
            <Panel
              eyebrow="로그인"
              title={authMode === "user" ? "일반 로그인" : "보호자 로그인"}
              action={authMode === "user" ? <button className="ghost" onClick={handleLogout}><LogOut />로그아웃</button> : <button className="ghost" onClick={handleGuardianLogout}><LogOut />로그아웃</button>}
            >
              <div className="auth-tabs">
                <button className={authMode === "user" ? "active" : ""} type="button" onClick={() => setAuthMode("user")}>일반 로그인</button>
                <button className={authMode === "guardian" ? "active" : ""} type="button" onClick={() => setAuthMode("guardian")}>보호자 로그인</button>
              </div>

              {authMode === "user" ? (
                <>
                  <form className="form" onSubmit={handleLogin}>
                    <label>아이디<input value={loginForm.loginId} onChange={(e) => setLoginForm({ ...loginForm, loginId: e.target.value })} required /></label>
                    <label>비밀번호<input type="password" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} required /></label>
                    <button className="primary"><LogIn />로그인</button>
                  </form>
                  <div className="notice">{data.profile ? `${data.profile.name} / 아이디: ${data.profile.login_id}` : "아직 로그인하지 않았습니다."}</div>
                </>
              ) : (
                <>
                  <form className="form" onSubmit={handleGuardianLogin}>
                    <label>보호자 이름<input value={guardianLoginForm.name} onChange={(e) => setGuardianLoginForm({ ...guardianLoginForm, name: e.target.value })} required /></label>
                    <label>보호자 연락처<input value={guardianLoginForm.phone} onChange={(e) => setGuardianLoginForm({ ...guardianLoginForm, phone: e.target.value })} placeholder="01012345678" required /></label>
                    <button className="primary"><ShieldCheck />보호자 로그인</button>
                  </form>
                  <div className="notice">{guardianSession ? `${guardianLoginForm.name} 보호자 / 관리 대상 ${guardianSession.wards.length}명` : guardianStatus || "환자가 등록한 보호자 이름과 연락처로 로그인합니다."}</div>
                </>
              )}
            </Panel>
          </div>
        )}

        {view === "medicines" && (
          <div className="grid two">
            <Panel eyebrow="약 등록" title="e약은요 API + Supabase 저장">
              <form className="form" onSubmit={saveMedicine}>
                <label>약 이름<input value={medicineForm.itemName} onChange={(e) => setMedicineForm({ ...medicineForm, itemName: e.target.value })} required /></label>
                <button className="secondary" type="button" onClick={lookupEDrug}><Search />e약은요 효능 조회</button>
                <label>효능 efcyQesitm<textarea value={medicineForm.efcyQesitm} onChange={(e) => setMedicineForm({ ...medicineForm, efcyQesitm: e.target.value })} /></label>
                <label>복용 시간<input type="time" value={medicineForm.doseTime} onChange={(e) => setMedicineForm({ ...medicineForm, doseTime: e.target.value })} required /></label>
                <label>복용량<input value={medicineForm.amount} onChange={(e) => setMedicineForm({ ...medicineForm, amount: e.target.value })} /></label>
                <label>주의사항<textarea value={medicineForm.cautionNote} onChange={(e) => setMedicineForm({ ...medicineForm, cautionNote: e.target.value })} /></label>
                <button className="primary"><Save />약 등록</button>
              </form>
            </Panel>
            <Panel eyebrow="약 목록" title="Supabase medicines">
              <List
                empty="등록된 약이 없습니다."
                items={data.medicines}
                render={(item) => (
                  <div className="item" key={item.id}>
                    <div>
                      <h4>{item.item_name}</h4>
                      <p>{item.efcy_qesitm || item.caution_note || "효능/주의사항 미입력"}</p>
                    </div>
                    <span className="label">{item.source}</span>
                  </div>
                )}
              />
            </Panel>
          </div>
        )}

        {view === "records" && (
          <Panel eyebrow="복용 기록" title="Supabase dose_records" action={<button className="secondary" onClick={exportCsv}><Download />CSV</button>}>
            <List
              empty="복용 기록이 없습니다."
              items={data.records}
              render={(record) => (
                <div className="item" key={record.id}>
                  <div>
                    <h4>{record.medicines?.item_name || record.note || "복용 기록"}</h4>
                    <p>{formatDateTime(record.taken_at || record.created_at)} · {record.status}</p>
                  </div>
                  <span className="label">완료</span>
                </div>
              )}
            />
          </Panel>
        )}

        {view === "guardian" && (
          <div className="grid two">
            <Panel eyebrow="보호자 연동" title="guardians 테이블 저장">
              <form className="form" onSubmit={saveGuardian}>
                <label>보호자 이름<input value={guardianForm.name} onChange={(e) => setGuardianForm({ ...guardianForm, name: e.target.value })} required /></label>
                <label>연락처<input value={guardianForm.phone} onChange={(e) => setGuardianForm({ ...guardianForm, phone: e.target.value })} required /></label>
                <label>관계<input value={guardianForm.relationship} onChange={(e) => setGuardianForm({ ...guardianForm, relationship: e.target.value })} /></label>
                <label>미복용 알림 대기 시간<select value={guardianForm.alertDelayMinutes} onChange={(e) => setGuardianForm({ ...guardianForm, alertDelayMinutes: e.target.value })}><option value="15">15분</option><option value="30">30분</option><option value="60">60분</option><option value="120">120분</option></select></label>
                <label className="check"><input type="checkbox" checked={guardianForm.alertsEnabled} onChange={(e) => setGuardianForm({ ...guardianForm, alertsEnabled: e.target.checked })} /> 보호자 알림 사용</label>
                <button className="primary"><ShieldCheck />보호자 저장</button>
              </form>
            </Panel>
            <Panel eyebrow="등록된 보호자" title="미복용 알림 대상">
              <List
                empty="등록된 보호자가 없습니다."
                items={data.guardians}
                render={(item) => (
                  <div className="item" key={item.id}>
                    <div>
                      <h4>{item.name}</h4>
                      <p>{item.phone} · {item.relationship} · {item.alert_delay_minutes}분 후 알림</p>
                    </div>
                    <span className="label">{item.alerts_enabled ? "사용" : "꺼짐"}</span>
                  </div>
                )}
              />
            </Panel>
          </div>
        )}

        {view === "guardianManage" && (
          <div className="grid two">
            <Panel
              eyebrow="보호자 관리"
              title="관리 대상 복약 현황"
              action={<button className="secondary" onClick={refreshGuardianManagement}><RefreshCw />새로고침</button>}
            >
              {guardianSession?.wards?.length ? (
                <div className="ward-list">
                  {guardianSession.wards.map((ward) => (
                    <article className="ward-card" key={ward.guardian.id || ward.guardian.user_id}>
                      <div className="ward-head">
                        <div>
                          <p className="label">{ward.guardian.relationship || "보호 대상"}</p>
                          <h4>{ward.profile?.name || "이름 미등록"}</h4>
                          <p>{ward.profile?.phone || "연락처 미등록"}</p>
                        </div>
                        <strong>{ward.schedules.filter((schedule) => isScheduleTaken(schedule, ward.records)).length}/{ward.schedules.length}</strong>
                      </div>
                      <div className="list">
                        {ward.schedules.length ? ward.schedules.map((schedule) => {
                          const taken = isScheduleTaken(schedule, ward.records);
                          return (
                            <div className="item" key={schedule.id}>
                              <div>
                                <h4>{schedule.item_name}</h4>
                                <p>{trimSeconds(schedule.dose_time)} · {schedule.amount || "복용량 미입력"}</p>
                              </div>
                              <span className={`status-pill ${taken ? "done" : ""}`}>{taken ? "복용 완료" : "미복용"}</span>
                            </div>
                          );
                        }) : (
                          <div className="notice">오늘 등록된 복약 일정이 없습니다.</div>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="notice">보호자 로그인이 필요합니다. 로그인 화면에서 보호자 이름과 연락처로 로그인하세요.</div>
              )}
            </Panel>
            <Panel eyebrow="상태" title="연동 정보">
              <div className="notice">{guardianStatus || "보호자 로그인 후 관리 대상자의 오늘 복약 여부를 확인할 수 있습니다."}</div>
            </Panel>
          </div>
        )}

        {view === "ocr" && (
          <Panel eyebrow="AI 기반 간편 등록" title="Tesseract OCR 결과를 DB에 저장">
            <div className="ocr-actions">
              <label className="secondary file-btn"><Camera />사진 선택<input type="file" accept="image/*" onChange={handleOcrFile} /></label>
              <button className="secondary" onClick={() => analyzeOcrMedicines()} disabled={ocrAiLoading}><Sparkles />AI 약명 정리</button>
              <button className="primary" onClick={saveOcrResult}><Database />OCR 결과 저장</button>
            </div>
            <div className="ocr-grid">
              <div className="preview">{previewUrl ? <img src={previewUrl} alt="OCR 이미지" /> : "처방전 또는 약 봉투 사진"}</div>
              <div className="form">
                <div className="notice">{ocrStatus}</div>
                <textarea value={data.ocrText} onChange={(e) => setData({ ...data, ocrText: e.target.value })} placeholder="OCR 결과" />
                <div className="ocr-results">
                  {ocrMedicines.length ? ocrMedicines.map((medicine, index) => (
                    <article className="ocr-result" key={`${medicine.name}-${index}`}>
                      <div>
                        <p className="label">{medicine.matchStatus || "e약은요 조회"}</p>
                        <h4>{medicine.itemName || medicine.name}</h4>
                        <p>{medicine.efcyQesitm || medicine.reason || "효능 정보를 찾지 못했습니다."}</p>
                      </div>
                      <button className="secondary" type="button" onClick={() => applyOcrMedicine(medicine)}>반영</button>
                    </article>
                  )) : (
                    <div className="notice">OCR 후 Gemini가 약명을 정리하면 e약은요 설명이 표시됩니다.</div>
                  )}
                </div>
              </div>
            </div>
          </Panel>
        )}


        {view === "recognize" && (
          <div className="grid two">
            <Panel eyebrow="U2-Net + PyTorch" title="웹캠 촬영 또는 이미지 업로드">
              <div className="pill-camera">
                <div className="pill-preview">
                  {pillPreviewUrl ? (
                    <img src={pillPreviewUrl} alt="촬영한 알약" />
                  ) : (
                    <>
                      <video ref={pillVideoRef} autoPlay playsInline muted />
                      {!pillCameraOn && "알약 사진 미리보기"}
                    </>
                  )}
                  <canvas ref={pillCanvasRef} />
                </div>
                <div className="ocr-actions">
                  <button className="secondary" type="button" onClick={startPillCamera}><Camera />카메라</button>
                  <button className="primary" type="button" onClick={capturePillPhoto} disabled={!pillCameraOn}><ScanSearch />촬영</button>
                  <label className="secondary file-btn"><ImagePlus />사진 선택<input type="file" accept="image/*" onChange={handlePillFile} /></label>
                  <button className="primary" type="button" onClick={predictPill} disabled={pillLoading || !pillImageBlob}>{pillLoading ? <Loader2 /> : <Upload />}AI 인식</button>
                  <button className="ghost" type="button" onClick={resetPillRecognition}><RotateCcw />초기화</button>
                </div>
                <div className="notice">{pillStatus}</div>
              </div>
            </Panel>

            <Panel eyebrow="Top 3" title="모델 예측 결과">
              {pillPredictions.length ? (
                <div className="pill-results">
                  {pillPredictions.map((prediction) => {
                    const detail = pillDetails[prediction.label];
                    return (
                      <article className="pill-result" key={`${prediction.rank}-${prediction.label}`}>
                        <span className="rank">{prediction.rank}</span>
                        <div>
                          <h4>{prediction.label}</h4>
                          <div className="bar"><span style={{ width: `${Math.round(prediction.confidence * 100)}%` }} /></div>
                        </div>
                        <strong>{Math.round(prediction.confidence * 1000) / 10}%</strong>
                        <div className="pill-result-actions">
                          <button className="secondary" type="button" onClick={() => togglePillDetail(prediction)} aria-label={`${prediction.label} 상세 보기`}>
                            {pillDetailLoading === prediction.label ? <Loader2 /> : detail?.open ? <ChevronUp /> : <ChevronDown />}
                          </button>
                          <button className="secondary" type="button" onClick={() => applyPillPrediction(prediction)}>반영</button>
                        </div>
                        {detail?.open && (
                          <div className="pill-detail">
                            {detail.error ? (
                              <p>{detail.error}</p>
                            ) : detail.data ? (
                              <>
                                <p className="label">e약은요</p>
                                <h5>{detail.data.itemName || prediction.label}</h5>
                                <p>{detail.data.efcyQesitm || "효능 정보를 찾지 못했습니다."}</p>
                              </>
                            ) : (
                              <p>e약은요 정보를 불러오는 중입니다.</p>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="notice">인식 결과가 여기에 1, 2, 3위로 표시됩니다.</div>
              )}
            </Panel>
          </div>
        )}

        {view === "report" && (
          <div className="grid two">
            <Panel eyebrow="복약 리포트" title="이번 주 순응도">
              <div className="report-score">{calculateAdherence(data.records, data.schedules)}%</div>
              <p className="muted">복용 기록과 오늘 일정 기준으로 계산한 간단 리포트입니다.</p>
            </Panel>
            <Panel eyebrow="AI 코멘트" title="습관 분석">
              <div className="notice">
                {data.records.length ? "복용 기록이 쌓이고 있습니다. 저녁 시간대 누락이 생기면 보호자 알림 시간을 짧게 설정해 보세요." : "아직 복용 기록이 없습니다. 복용 완료 버튼을 눌러 기록을 시작하세요."}
              </div>
            </Panel>
          </div>
        )}
      </main>

      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </div>
  );

  function selectView(nextView) {
    setView(nextView);
    setMenuOpen(false);
  }
}

function NavButton({ active, icon, onClick, children }) {
  return (
    <button className={`nav ${active ? "active" : ""}`} onClick={onClick}>
      {icon}
      {children}
    </button>
  );
}

function Panel({ eyebrow, title, action, children }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <p className="label">{eyebrow}</p>
          <h3>{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Metric({ label, value }) {
  return (
    <article>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function List({ empty, items, render }) {
  if (!items.length) {
    return <div className="notice">{empty}</div>;
  }

  return <div className="list">{items.map(render)}</div>;
}

function throwIfError(error) {
  if (error) throw error;
}

function getNextSchedule(schedules) {
  if (!schedules.length) return null;
  const now = new Date();
  return schedules
    .map((schedule) => {
      const target = getKoreanDoseDate(schedule.dose_time, now);
      return {
        schedule,
        target,
        remainingMs: target.getTime() - now.getTime(),
        isTomorrow: target.getDate() !== now.getDate()
      };
    })
    .sort((a, b) => a.remainingMs - b.remainingMs)[0];
}

function getKoreanDoseDate(doseTime, now = new Date()) {
  const [hours, minutes] = String(doseTime || "00:00").split(":").map(Number);
  const koreanNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const target = new Date(koreanNow);
  target.setHours(hours || 0, minutes || 0, 0, 0);
  if (target.getTime() <= koreanNow.getTime()) target.setDate(target.getDate() + 1);
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

function trimSeconds(value) {
  return value ? String(value).slice(0, 5) : "--:--";
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

function isScheduleTaken(schedule, records) {
  const today = new Date().toDateString();
  return records.some((record) => {
    const recordDate = new Date(record.taken_at || record.created_at).toDateString();
    return recordDate === today && (
      record.schedule_id === schedule.id ||
      record.medicine_id === schedule.medicine_id
    );
  });
}

function guessMedicineName(text) {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  return lines.find((line) => /정|캡슐|시럽|mg|밀리그램/i.test(line)) || lines[0] || "OCR 등록 약";
}

function calculateAdherence(records, schedules) {
  if (!schedules.length) return 0;
  return Math.min(100, Math.round((records.length / schedules.length) * 100));
}
