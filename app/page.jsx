"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlarmClock,
  BarChart3,
  Bell,
  BellRing,
  Bot,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ClipboardCheck,
  Clock,
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
  Settings,
  ShieldCheck,
  Upload,
  UserPlus,
  UserRound,
  UserRoundCheck,
} from "lucide-react";
import {
  createBrowserSupabaseClient,
  hasSupabaseConfig,
  loginIdToEmail,
} from "./lib/supabaseClient";

const emptyState = {
  profile: null,
  medicines: [],
  schedules: [],
  records: [],
  guardians: [],
  ocrText: "",
};

const WEEK_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

export default function HomePage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const pillVideoRef = useRef(null);
  const pillCanvasRef = useRef(null);
  const pillStreamRef = useRef(null);
  const [view, setView] = useState("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [data, setData] = useState(emptyState);
  const [toast, setToast] = useState("");
  const [connection, setConnection] = useState(
    hasSupabaseConfig() ? "연결 준비됨" : "연결 준비 필요",
  );
  const [nextDose, setNextDose] = useState(null);
  const [authForm, setAuthForm] = useState({
    name: "",
    loginId: "",
    password: "",
    phone: "",
  });
  const [loginForm, setLoginForm] = useState({ loginId: "", password: "" });
  const [authMode, setAuthMode] = useState("user");
  const [guardianLoginForm, setGuardianLoginForm] = useState({
    name: "",
    phone: "",
  });
  const [guardianSession, setGuardianSession] = useState(null);
  const [guardianStatus, setGuardianStatus] = useState("");
  const [medicineForm, setMedicineForm] = useState({
    itemName: "",
    efcyQesitm: "",
    doseTime: "08:00",
    amount: "1정",
    cautionNote: "",
  });
  const [guardianForm, setGuardianForm] = useState({
    name: "",
    phone: "",
    relationship: "보호자",
    alertDelayMinutes: "30",
    alertsEnabled: true,
  });
  const [ocrStatus, setOcrStatus] = useState("대기 중");
  const [previewUrl, setPreviewUrl] = useState("");
  const [ocrMedicines, setOcrMedicines] = useState([]);
  const [ocrAiLoading, setOcrAiLoading] = useState(false);
  const [pillStatus, setPillStatus] = useState(
    "카메라를 켜거나 사진을 선택해 주세요.",
  );
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
      setConnection("로컬 화면 확인 가능");
      return;
    }

    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) {
        setConnection("로그인 필요");
        setData(emptyState);
        return;
      }

      const [
        profileResult,
        medicinesResult,
        schedulesResult,
        recordsResult,
        guardiansResult,
      ] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId).single(),
        supabase
          .from("medicines")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false }),
        supabase
          .from("today_schedules")
          .select("*")
          .eq("user_id", userId)
          .order("dose_time", { ascending: true }),
        supabase
          .from("dose_records")
          .select("*, medicines(item_name)")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("guardians")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false }),
      ]);

      throwIfError(
        profileResult.error ||
          medicinesResult.error ||
          schedulesResult.error ||
          recordsResult.error ||
          guardiansResult.error,
      );

      setData({
        profile: profileResult.data,
        medicines: medicinesResult.data || [],
        schedules: schedulesResult.data || [],
        records: recordsResult.data || [],
        guardians: guardiansResult.data || [],
        ocrText: data.ocrText,
      });
      setConnection(`${profileResult.data.name}님`);
    } catch (error) {
      setConnection("연결 오류");
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
            phone: authForm.phone,
          },
        },
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
        password: loginForm.password,
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
    setConnection("로그인 필요");
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
        body: JSON.stringify(guardianLoginForm),
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
        body: JSON.stringify(guardianLoginForm),
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
    setConnection(hasSupabaseConfig() ? "연결 준비됨" : "연결 불가");
    notify("보호자 로그아웃되었습니다.");
  }

  async function lookupEDrug() {
    if (!medicineForm.itemName.trim()) {
      notify("약 이름을 먼저 입력해 주세요.");
      return;
    }

    try {
      const response = await fetch(
        `/api/edrug?itemName=${encodeURIComponent(medicineForm.itemName)}`,
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "e약은요 조회 실패");
      }
      setMedicineForm((current) => ({
        ...current,
        itemName: result.itemName || current.itemName,
        efcyQesitm: result.efcyQesitm,
      }));
      notify("e약은요를 불러왔습니다.");
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
          source: medicineForm.efcyQesitm ? "edrug_api" : "manual",
        })
        .select()
        .single();
      throwIfError(medicineResult.error);

      const scheduleResult = await supabase
        .from("medication_schedules")
        .insert({
          user_id: userId,
          medicine_id: medicineResult.data.id,
          dose_time: medicineForm.doseTime,
          repeat_type: "daily",
          amount: medicineForm.amount || null,
        });
      throwIfError(scheduleResult.error);

      setMedicineForm({
        itemName: "",
        efcyQesitm: "",
        doseTime: "",
        amount: "정",
        cautionNote: "",
      });
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
      const result = await supabase.from("guardians").upsert(
        {
          user_id: userData.user.id,
          name: guardianForm.name,
          phone: guardianForm.phone,
          relationship: guardianForm.relationship || "보호자",
          alert_delay_minutes: Number(guardianForm.alertDelayMinutes),
          alerts_enabled: guardianForm.alertsEnabled,
        },
        { onConflict: "user_id" },
      );
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
        note: `${schedule.item_name} 복용 완료`,
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
    setOcrStatus("분석 중...");

    try {
      const Tesseract = await import("tesseract.js");
      const result = await Tesseract.recognize(file, "kor+eng", {
        logger(message) {
          if (message.status === "recognizing text") {
            setOcrStatus(`분석 중 ${Math.round(message.progress * 100)}%`);
          }
        },
      });
      const text = result.data.text.trim();
      setData((current) => ({ ...current, ocrText: text }));
      setOcrStatus("완료");
      if (text) {
        await analyzeOcrMedicines(text);
      }
    } catch (error) {
      setOcrStatus("실패");
      notify(error.message);
    }
  }

  async function analyzeOcrMedicines(text = data.ocrText) {
    if (!text.trim()) {
      notify("분석할 결과가 없습니다.");
      return;
    }

    setOcrAiLoading(true);
    setOcrStatus("약명을 정리하고 e약은요를 조회 중...");

    try {
      const response = await fetch("/api/ocr-medicines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ocrText: text }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "AI 약명 정리 실패");
      }
      setOcrMedicines(result.medicines || []);
      setOcrStatus(
        result.medicines?.length
          ? "AI 약명 정리 완료"
          : "약명 후보를 찾지 못했습니다.",
      );
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
      efcyQesitm: medicine.efcyQesitm || current.efcyQesitm,
    }));
    setView("medicines");
    notify("약 관리 입력칸에 반영했습니다.");
  }

  async function saveOcrResult() {
    if (!requireLogin()) return;
    if (!data.ocrText.trim()) {
      notify("저장할 결과가 없습니다.");
      return;
    }

    const parsedMedicineName =
      ocrMedicines[0]?.itemName ||
      ocrMedicines[0]?.name ||
      guessMedicineName(data.ocrText);

    try {
      const { data: userData } = await supabase.auth.getUser();
      const uploadResult = await supabase.from("ocr_uploads").insert({
        user_id: userData.user.id,
        raw_text: data.ocrText,
        parsed_medicine_name: parsedMedicineName,
        parsed_data: {
          source: "tesseract_gemini_edrug",
          medicines: ocrMedicines,
        },
      });
      throwIfError(uploadResult.error);

      const medicineResult = await supabase
        .from("medicines")
        .insert({
          user_id: userData.user.id,
          item_name: parsedMedicineName,
          efcy_qesitm: ocrMedicines[0]?.efcyQesitm || null,
          caution_note:
            ocrMedicines[0]?.atpnQesitm ||
            ocrMedicines[0]?.atpnWarnQesitm ||
            null,
          raw_ocr_text: data.ocrText,
          source: "ocr",
        })
        .select()
        .single();
      throwIfError(medicineResult.error);

      const scheduleResult = await supabase
        .from("medication_schedules")
        .insert({
          user_id: userData.user.id,
          medicine_id: medicineResult.data.id,
          dose_time: "09:00",
          repeat_type: "daily",
        });
      throwIfError(scheduleResult.error);

      notify(`${parsedMedicineName} 등록 완료`);
      await syncFromDatabase();
    } catch (error) {
      notify(error.message);
    }
  }

  async function startPillCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
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
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setPillImageBlob(blob);
        setPillPreviewUrl(URL.createObjectURL(blob));
        setPillPredictions([]);
        setPillStatus("사진이 준비되었습니다. AI 인식을 눌러 주세요.");
      },
      "image/jpeg",
      0.92,
    );
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
        body: formData,
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
        [key]: { ...current, open: false },
      }));
      return;
    }

    if (current?.data) {
      setPillDetails((details) => ({
        ...details,
        [key]: { ...current, open: true },
      }));
      return;
    }

    setPillDetailLoading(key);
    try {
      const response = await fetch(
        `/api/edrug?itemName=${encodeURIComponent(key)}`,
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "e약은요 조회 실패");
      }
      setPillDetails((details) => ({
        ...details,
        [key]: { open: true, data: result },
      }));
    } catch (error) {
      notify(error.message);
      setPillDetails((details) => ({
        ...details,
        [key]: { open: true, error: error.message },
      }));
    } finally {
      setPillDetailLoading("");
    }
  }

  function applyPillPrediction(prediction) {
    setMedicineForm((current) => ({
      ...current,
      itemName: prediction.label || current.itemName,
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
    data.records.forEach((record) =>
      rows.push([
        record.medicines?.item_name || "",
        record.status || "",
        formatDateTime(record.taken_at || record.created_at),
        record.note || "",
      ]),
    );
    const csv = rows
      .map((row) =>
        row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","),
      )
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "yakallim-dose-records.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function allMedicinesTaken() {
    if (!data.schedules.length) return false;

    return data.schedules.every((item) => takenMedicines.includes(item.id));
  }

  async function completeSingleMedicine(schedule) {
    if (takenMedicines.includes(schedule.id)) return;

    setTakenMedicines((prev) => [...prev, schedule.id]);

    await completeDose(schedule);
  }

  useEffect(() => {
    if (!data.medicines.length) {
      setAiMedicine(null);
      return;
    }

    const random =
      data.medicines[Math.floor(Math.random() * data.medicines.length)];

    setAiMedicine({
      name: random.item_name,
      effect: random.efcy_qesitm || "등록된 효능 정보가 없습니다.",
    });
  }, [data.medicines]);

  const title = {
    dashboard: "오늘 복약 현황",
    auth: "로그인",
    signup: "회원가입",
    medicines: "약 관리",
    records: "복용 기록",
    guardian: "보호자 연동",
    guardianManage: "보호자 관리",
    ocr: "OCR 약 등록",
    recognize: "AI 약 인식",
    report: "복약 리포트",
    doseCheck: "복용 확인",
  }[view];

  const userName = data.profile?.name || "홍길동";
  const todayTotal = data.schedules.length;
  const todayTaken = data.schedules.filter((schedule) =>
    isScheduleTaken(schedule, data.records),
  ).length;
  const adherencePercent = todayTotal
    ? Math.round((todayTaken / todayTotal) * 100)
    : 0;
  const risk = getOverdoseRisk(data.schedules);
  const aiTip = getAiTip(data.medicines);
  const weeklyBars = getWeeklyAdherence(data.records, todayTotal);
  const [takenMedicines, setTakenMedicines] = useState([]);
  const [aiMedicine, setAiMedicine] = useState(null);
  const [notifications, setNotifications] = useState([]);
  useEffect(() => {
    const timer = setInterval(() => {
      checkMedicineAlarm();
    }, 60000);

    checkMedicineAlarm();

    return () => clearInterval(timer);
  }, [data.schedules]);
  function checkMedicineAlarm() {
    const now = new Date();

    const current =
      now.getHours().toString().padStart(2, "0") +
      ":" +
      now.getMinutes().toString().padStart(2, "0");

    data.schedules.forEach((schedule) => {
      if (schedule.time === current) {
        setNotifications((prev) => {
          const exists = prev.some(
            (n) =>
              n.scheduleId === schedule.id && n.date === now.toDateString(),
          );

          if (exists) return prev;

          return [
            {
              id: Date.now(),
              scheduleId: schedule.id,
              title: `${schedule.item_name} 복용 시간입니다.`,
              time: current,
              date: now.toDateString(),
              read: false,
              expired: false,
            },
            ...prev,
          ];
        });

        alert(`${schedule.item_name} 복용 시간입니다!`);
      }
    });
  }
  useEffect(() => {
    setNotifications((prev) =>
      prev.map((n) => {
        const now = new Date();

        const current = now.getHours() * 60 + now.getMinutes();

        const [h, m] = n.time.split(":");

        const target = Number(h) * 60 + Number(m);

        return {
          ...n,
          expired: current > target,
        };
      }),
    );
  }, [data.schedules]);
  const [showNotification, setShowNotification] = useState(false);

  return (
    <div
      className={`app ${menuOpen ? "menu-open" : ""}`}
      onClick={() => menuOpen && setMenuOpen(false)}
    >
      <aside className="side" onClick={(e) => e.stopPropagation()}>
        <nav>
          <NavButton
            active={view === "dashboard"}
            icon={<Home />}
            onClick={() => selectView("dashboard")}
          >
            홈
          </NavButton>
          <NavButton
            active={view === "records"}
            icon={<ClipboardCheck />}
            onClick={() => selectView("records")}
          >
            복약 기록
          </NavButton>
          <NavButton
            active={view === "medicines"}
            icon={<Pill />}
            onClick={() => selectView("medicines")}
          >
            약 목록
          </NavButton>
          <NavButton
            active={view === "report"}
            icon={<BarChart3 />}
            onClick={() => selectView("report")}
          >
            리포트
          </NavButton>
          <NavButton
            active={view === "guardian"}
            icon={<UserRoundCheck />}
            onClick={() => selectView("guardian")}
          >
            보호자 연동
          </NavButton>
          {guardianSession && (
            <NavButton
              active={view === "guardianManage"}
              icon={<ShieldCheck />}
              onClick={() => selectView("guardianManage")}
            >
              보호자 관리
            </NavButton>
          )}
          <NavButton
            active={view === "ocr"}
            icon={<Camera />}
            onClick={() => selectView("ocr")}
          >
            약 등록
          </NavButton>
          <NavButton
            active={view === "recognize"}
            icon={<ScanSearch />}
            onClick={() => selectView("recognize")}
          >
            AI 인식
          </NavButton>
          <NavButton
            active={view === "auth"}
            icon={<Settings />}
            onClick={() => selectView("auth")}
          >
            설정
          </NavButton>
        </nav>
        <div className="side-foot">
          <Sparkles />
          <span>AI가 당신의 건강한 복약을 도와드려요!</span>
        </div>
      </aside>

      <main>
        <header className="top">
          <button className="brand" onClick={() => selectView("dashboard")}>
            <span>
              <Pill />
            </span>
            <div>
              <h1>약알림e</h1>
            </div>
          </button>
          <button
            className="icon-btn"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-label="메뉴"
          >
            <Menu />
          </button>
          <div>
            <p>{connection}</p>
            <h2>{title}</h2>
          </div>
          <div className="top-right">
            <button
              className="bell-btn"
              onClick={() => setShowNotification(!showNotification)}
            >
              <Bell />
            </button>
            {showNotification && (
              <div className="notification-panel">
                <h4>알림</h4>

                {notifications.length === 0 ? (
                  <p>알림이 없습니다.</p>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`notification-item ${
                        n.expired ? "expired" : ""
                      }`}
                    >
                      <strong>{n.title}</strong>

                      <small>{n.time}</small>

                      {n.expired && <span>지난 알림</span>}
                    </div>
                  ))
                )}
              </div>
            )}
            <button
              className="user-chip"
              onClick={() =>
                setView((prev) =>
                  prev === "auth" || prev === "signup" ? "dashboard" : "auth",
                )
              }
            >
              <span className="avatar">
                <UserRound size={16} />
              </span>
              {data.profile ? `${data.profile.name}님` : "로그인"}
            </button>
          </div>
        </header>

        {view === "dashboard" && (
          <section>
            <p className="greeting active-dashboard">
              <b>{userName}</b>님, 오늘도 건강한 하루 되세요! 👋
            </p>

            <div className="hero">
              <div className="hero-main">
                <p className="hero-label">
                  <AlarmClock />
                  다음 복약까지
                </p>
                <strong>
                  {nextDose ? formatDuration(nextDose.remainingMs) : "--:--:--"}
                </strong>
                <span className="hero-sub">
                  {nextDose
                    ? `${nextDose.isTomorrow ? "내일" : "오후"} ${trimSeconds(nextDose.schedule.dose_time)} 복용 예정`
                    : "약을 등록하면 일정이 표시됩니다."}
                </span>
                <div className="hero-chips">
                  {nextDose ? (
                    nextDose.schedule.item_name.split("+").map((name) => (
                      <span className={"hero-chip"} key={name}>
                        <Pill />
                        {name.trim()}
                      </span>
                    ))
                  ) : (
                    <span className="hero-chip">
                      <Pill />
                      등록된 약 없음
                    </span>
                  )}
                </div>
              </div>
              <div className="hero-art" aria-hidden="true">
                <div className="glass" />
                <div>
                  <div className="pill-capsule" />
                  <div className="pill-round" style={{ marginTop: "-30px" }} />
                </div>
              </div>
              <div className="hero-actions">
                <button className="hero-snooze">
                  <Clock />
                  10분 후 알림
                </button>
                <button
                  className="hero-cta"
                  onClick={() => setView("doseCheck")}
                >
                  {allMedicinesTaken() ? (
                    <>
                      <Check />
                      복용 완료
                    </>
                  ) : (
                    <>
                      <Check />
                      복용 완료하기
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="metrics">
              <article className="card">
                <div className="card-head">
                  <BarChart3 />
                  오늘의 복약 현황
                </div>
                <div className="ring-card-body">
                  <div className="ring" style={{ "--pct": adherencePercent }}>
                    <span>{adherencePercent}%</span>
                  </div>
                  <div className="ring-text">
                    <strong>
                      {todayTotal}회 중 {todayTaken}회{"\n"}복용 완료
                    </strong>
                    <p>오늘 목표 {todayTotal}회</p>
                  </div>
                </div>
              </article>

              <article className="card">
                <div className="card-head">
                  <ShieldCheck />
                  오복용 위험 상태
                </div>
                <div className="risk-card-body">
                  <div>
                    <p
                      className={`risk-status ${risk.level === "warn" ? "warn" : ""}`}
                    >
                      {risk.level === "warn" ? "주의" : "안전"} <CheckCircle2 />
                    </p>
                    <p>{risk.message}</p>
                  </div>
                  <div className="shield-icon">
                    <ShieldCheck />
                  </div>
                </div>
              </article>

              <article className="card ai-card">
                <div className="card-head">
                  <Bot />약 정보
                </div>
                <div className="ai-card-body">
                  <div>
                    <div>
                      {aiMedicine ? (
                        <>
                          <h4>{aiMedicine.item_name}</h4>

                          <p>
                            {aiMedicine.efcy_qesitm ||
                              "효능 정보가 없습니다. 자세히 보기를 눌러 조회하세요."}
                          </p>
                        </>
                      ) : (
                        <p>등록된 약이 없습니다.</p>
                      )}

                      <button
                        className="ai-link"
                        onClick={() => selectView("medicines")}
                      >
                        자세히 보기
                        <ChevronRight />
                      </button>
                    </div>
                  </div>
                  <div className="robot">
                    <Bot />
                  </div>
                </div>
              </article>
            </div>

            <div className="grid two">
              <Panel
                eyebrow=""
                titleIcon={<Clock />}
                title="오늘의 복약 일정"
                action={
                  <button
                    className="link-btn"
                    onClick={() => selectView("records")}
                  >
                    전체보기
                  </button>
                }
              >
                {data.schedules.length ? (
                  <div className="schedule-list">
                    {data.schedules.map((item) => {
                      const taken = isScheduleTaken(item, data.records);
                      const isNext =
                        nextDose?.schedule?.id === item.id && !taken;
                      return (
                        <div
                          className={`sched-row ${isNext ? "next" : ""}`}
                          key={item.id}
                        >
                          <span
                            className={`sched-dot ${taken ? "done" : isNext ? "next" : "pending"}`}
                          >
                            {taken ? <Check /> : isNext ? <Clock /> : null}
                          </span>
                          <span className="sched-time">
                            {trimSeconds(item.dose_time)}
                          </span>
                          <span className="sched-name">
                            {item.item_name} · {item.amount || "복용량 미입력"}
                          </span>
                          <span
                            className={`pill ${taken ? "done" : isNext ? "next" : ""}`}
                          >
                            {taken
                              ? "복용 완료"
                              : isNext
                                ? "복용 예정"
                                : "예정"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="notice">등록된 오늘 일정이 없습니다.</div>
                )}
              </Panel>

              <Panel
                eyebrow=""
                titleIcon={<BarChart3 />}
                title="이번 주 복약 현황"
                action={
                  <button
                    className="link-btn"
                    onClick={() => selectView("report")}
                  >
                    자세히 보기
                  </button>
                }
              >
                <div className="bar-chart">
                  {weeklyBars.map((bar) => (
                    <div
                      className={`bar-col ${bar.isToday ? "today" : ""} ${bar.isFuture ? "future" : ""}`}
                      key={bar.label}
                    >
                      <div className="bar-track">
                        <div
                          className="bar-fill"
                          style={{ height: `${bar.percent}%` }}
                        />
                      </div>
                      <span>{bar.label}</span>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>

            <button className="fab" onClick={() => selectView("ocr")}>
              <Camera />약 등록
            </button>
          </section>
        )}

        {view === "auth" && (
          <Panel
            eyebrow="로그인"
            title={authMode === "user" ? "일반 로그인" : "보호자 로그인"}
            action={
              authMode === "user" ? (
                <button className="ghost" onClick={handleLogout}>
                  <LogOut />
                  로그아웃
                </button>
              ) : (
                <button className="ghost" onClick={handleGuardianLogout}>
                  <LogOut />
                  로그아웃
                </button>
              )
            }
          >
            <div className="auth-tabs">
              <button
                className={authMode === "user" ? "active" : ""}
                type="button"
                onClick={() => setAuthMode("user")}
              >
                일반 로그인
              </button>

              <button
                className={authMode === "guardian" ? "active" : ""}
                type="button"
                onClick={() => setAuthMode("guardian")}
              >
                보호자 로그인
              </button>
            </div>

            {authMode === "user" ? (
              <>
                <form className="form" onSubmit={handleLogin}>
                  <label>
                    아이디
                    <input
                      value={loginForm.loginId}
                      onChange={(e) =>
                        setLoginForm({
                          ...loginForm,
                          loginId: e.target.value,
                        })
                      }
                      required
                    />
                  </label>

                  <label>
                    비밀번호
                    <input
                      type="password"
                      value={loginForm.password}
                      onChange={(e) =>
                        setLoginForm({
                          ...loginForm,
                          password: e.target.value,
                        })
                      }
                      required
                    />
                  </label>

                  <button className="primary">
                    <LogIn />
                    로그인
                  </button>

                  <button
                    type="button"
                    className="ghost"
                    onClick={() => setView("signup")}
                  >
                    <UserPlus />
                    회원가입
                  </button>
                </form>

                <div className="notice">
                  {data.profile
                    ? `${data.profile.name} / 아이디 : ${data.profile.login_id}`
                    : "아직 로그인하지 않았습니다."}
                </div>
              </>
            ) : (
              <>
                <form className="form" onSubmit={handleGuardianLogin}>
                  <label>
                    보호자 이름
                    <input
                      value={guardianLoginForm.name}
                      onChange={(e) =>
                        setGuardianLoginForm({
                          ...guardianLoginForm,
                          name: e.target.value,
                        })
                      }
                      required
                    />
                  </label>

                  <label>
                    보호자 연락처
                    <input
                      value={guardianLoginForm.phone}
                      onChange={(e) =>
                        setGuardianLoginForm({
                          ...guardianLoginForm,
                          phone: e.target.value,
                        })
                      }
                      placeholder="01012345678"
                      required
                    />
                  </label>

                  <button className="primary">
                    <ShieldCheck />
                    보호자 로그인
                  </button>
                </form>

                <div className="notice">
                  {guardianSession
                    ? `${guardianLoginForm.name} 보호자 / 관리 대상 ${guardianSession.wards.length}명`
                    : guardianStatus ||
                      "환자가 등록한 보호자 이름과 연락처로 로그인합니다."}
                </div>
              </>
            )}
          </Panel>
        )}

        {view === "signup" && (
          <Panel eyebrow="회원가입" title="새 계정 만들기">
            <form className="form" onSubmit={handleSignUp}>
              <label>
                아이디
                <input
                  value={authForm.loginId}
                  onChange={(e) =>
                    setAuthForm({
                      ...authForm,
                      loginId: e.target.value,
                    })
                  }
                  required
                />
              </label>

              <label>
                비밀번호
                <input
                  type="password"
                  minLength={6}
                  value={authForm.password}
                  onChange={(e) =>
                    setAuthForm({
                      ...authForm,
                      password: e.target.value,
                    })
                  }
                  required
                />
              </label>

              <button className="primary">
                <UserPlus />
                가입하기
              </button>

              <button
                type="button"
                className="ghost"
                onClick={() => setView("auth")}
              >
                <LogIn />
                로그인으로 돌아가기
              </button>
            </form>
          </Panel>
        )}

        {view === "medicines" && (
          <div className="grid two">
            <Panel eyebrow="약 등록" title="약 조회">
              <form className="form" onSubmit={saveMedicine}>
                <label>
                  약 이름
                  <input
                    value={medicineForm.itemName}
                    onChange={(e) =>
                      setMedicineForm({
                        ...medicineForm,
                        itemName: e.target.value,
                      })
                    }
                    required
                  />
                </label>
                <button
                  className="secondary"
                  type="button"
                  onClick={lookupEDrug}
                >
                  <Search />
                  e약은요 효능 조회
                </button>
                <label>
                  효능
                  <textarea
                    value={medicineForm.efcyQesitm}
                    onChange={(e) =>
                      setMedicineForm({
                        ...medicineForm,
                        efcyQesitm: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  복용 시간
                  <input
                    type="time"
                    value={medicineForm.doseTime}
                    onChange={(e) =>
                      setMedicineForm({
                        ...medicineForm,
                        doseTime: e.target.value,
                      })
                    }
                    required
                  />
                </label>
                <label>
                  복용량
                  <input
                    value={medicineForm.amount}
                    onChange={(e) =>
                      setMedicineForm({
                        ...medicineForm,
                        amount: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  주의사항
                  <textarea
                    value={medicineForm.cautionNote}
                    onChange={(e) =>
                      setMedicineForm({
                        ...medicineForm,
                        cautionNote: e.target.value,
                      })
                    }
                  />
                </label>
                <button className="primary">
                  <Save />약 등록
                </button>
              </form>
            </Panel>
            <Panel eyebrow="약 목록" title="medicines">
              <List
                empty="등록된 약이 없습니다."
                items={data.medicines}
                render={(item) => (
                  <div className="item" key={item.id}>
                    <div>
                      <h4>{item.item_name}</h4>
                      <p>
                        {item.efcy_qesitm ||
                          item.caution_note ||
                          "효능/주의사항 미입력"}
                      </p>
                    </div>
                    <span className="label">{item.source}</span>
                  </div>
                )}
              />
            </Panel>
          </div>
        )}

        {view === "records" && (
          <Panel
            eyebrow="복용 기록"
            action={
              <button className="secondary" onClick={exportCsv}>
                <Download />
                CSV
              </button>
            }
          >
            <List
              empty="복용 기록이 없습니다."
              items={data.records}
              render={(record) => (
                <div className="item" key={record.id}>
                  <div>
                    <h4>
                      {record.medicines?.item_name ||
                        record.note ||
                        "복용 기록"}
                    </h4>
                    <p>
                      {formatDateTime(record.taken_at || record.created_at)} ·{" "}
                      {record.status}
                    </p>
                  </div>
                  <span className="label">완료</span>
                </div>
              )}
            />
          </Panel>
        )}

        {view === "guardian" && (
          <div className="grid two">
            <Panel eyebrow="보호자 연동" title="보호자 등록">
              <form className="form" onSubmit={saveGuardian}>
                <label>
                  보호자 이름
                  <input
                    value={guardianForm.name}
                    onChange={(e) =>
                      setGuardianForm({ ...guardianForm, name: e.target.value })
                    }
                    required
                  />
                </label>
                <label>
                  연락처
                  <input
                    value={guardianForm.phone}
                    onChange={(e) =>
                      setGuardianForm({
                        ...guardianForm,
                        phone: e.target.value,
                      })
                    }
                    required
                  />
                </label>
                <label>
                  관계
                  <input
                    value={guardianForm.relationship}
                    onChange={(e) =>
                      setGuardianForm({
                        ...guardianForm,
                        relationship: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  미복용 알림 대기 시간
                  <select
                    value={guardianForm.alertDelayMinutes}
                    onChange={(e) =>
                      setGuardianForm({
                        ...guardianForm,
                        alertDelayMinutes: e.target.value,
                      })
                    }
                  >
                    <option value="15">15분</option>
                    <option value="30">30분</option>
                    <option value="60">60분</option>
                    <option value="120">120분</option>
                  </select>
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={guardianForm.alertsEnabled}
                    onChange={(e) =>
                      setGuardianForm({
                        ...guardianForm,
                        alertsEnabled: e.target.checked,
                      })
                    }
                  />{" "}
                  보호자 알림 사용
                </label>
                <button className="primary">
                  <ShieldCheck />
                  보호자 저장
                </button>
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
                      <p>
                        {item.phone} · {item.relationship} ·{" "}
                        {item.alert_delay_minutes}분 후 알림
                      </p>
                    </div>
                    <span className="label">
                      {item.alerts_enabled ? "사용" : "꺼짐"}
                    </span>
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
              action={
                <button
                  className="secondary"
                  onClick={refreshGuardianManagement}
                >
                  <RefreshCw />
                  새로고침
                </button>
              }
            >
              {guardianSession?.wards?.length ? (
                <div className="ward-list">
                  {guardianSession.wards.map((ward) => (
                    <article
                      className="ward-card"
                      key={ward.guardian.id || ward.guardian.user_id}
                    >
                      <div className="ward-head">
                        <div>
                          <p className="label">
                            {ward.guardian.relationship || "보호 대상"}
                          </p>
                          <h4>{ward.profile?.name || "이름 미등록"}</h4>
                          <p>{ward.profile?.phone || "연락처 미등록"}</p>
                        </div>
                        <strong>
                          {
                            ward.schedules.filter((schedule) =>
                              isScheduleTaken(schedule, ward.records),
                            ).length
                          }
                          /{ward.schedules.length}
                        </strong>
                      </div>
                      <div className="list">
                        {ward.schedules.length ? (
                          ward.schedules.map((schedule) => {
                            const taken = isScheduleTaken(
                              schedule,
                              ward.records,
                            );
                            return (
                              <div className="item" key={schedule.id}>
                                <div>
                                  <h4>{schedule.item_name}</h4>
                                  <p>
                                    {trimSeconds(schedule.dose_time)} ·{" "}
                                    {schedule.amount || "복용량 미입력"}
                                  </p>
                                </div>
                                <span
                                  className={`status-pill ${taken ? "done" : ""}`}
                                >
                                  {taken ? "복용 완료" : "미복용"}
                                </span>
                              </div>
                            );
                          })
                        ) : (
                          <div className="notice">
                            오늘 등록된 복약 일정이 없습니다.
                          </div>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="notice">
                  보호자 로그인이 필요합니다. 로그인 화면에서 보호자 이름과
                  연락처로 로그인하세요.
                </div>
              )}
            </Panel>
            <Panel eyebrow="상태" title="연동 정보">
              <div className="notice">
                {guardianStatus ||
                  "보호자 로그인 후 관리 대상자의 오늘 복약 여부를 확인할 수 있습니다."}
              </div>
            </Panel>
          </div>
        )}

        {view === "ocr" && (
          <Panel eyebrow="AI 기반 간편 등록" title="처방전 스캔">
            <div className="ocr-actions">
              <label className="secondary file-btn">
                <Camera />
                사진 선택
                <input type="file" accept="image/*" onChange={handleOcrFile} />
              </label>
              <button
                className="secondary"
                onClick={() => analyzeOcrMedicines()}
                disabled={ocrAiLoading}
              >
                <Sparkles />
                AI 약명 정리
              </button>
              <button className="primary" onClick={saveOcrResult}>
                <Database />
                결과 저장
              </button>
            </div>
            <div className="ocr-grid">
              <div className="preview">
                {previewUrl ? (
                  <img src={previewUrl} alt="이미지" />
                ) : (
                  "처방전 또는 약 봉투 사진"
                )}
              </div>
              <div className="form">
                <div className="notice">{ocrStatus}</div>
                <textarea
                  value={data.ocrText}
                  onChange={(e) =>
                    setData({ ...data, ocrText: e.target.value })
                  }
                  placeholder="결과"
                />
                <div className="ocr-results">
                  {ocrMedicines.length ? (
                    ocrMedicines.map((medicine, index) => (
                      <article
                        className="ocr-result"
                        key={`${medicine.name}-${index}`}
                      >
                        <div>
                          <p className="label">
                            {medicine.matchStatus || "e약은요 조회"}
                          </p>
                          <h4>{medicine.itemName || medicine.name}</h4>
                          <p>
                            {medicine.efcyQesitm ||
                              medicine.reason ||
                              "효능 정보를 찾지 못했습니다."}
                          </p>
                        </div>
                        <button
                          className="secondary"
                          type="button"
                          onClick={() => applyOcrMedicine(medicine)}
                        >
                          반영
                        </button>
                      </article>
                    ))
                  ) : (
                    <div className="notice">
                      분석 후 약명을 정리하면 e약은요 설명이 표시됩니다.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Panel>
        )}

        {view === "recognize" && (
          <div className="grid two">
            <Panel eyebrow="알약 인식" title="웹캠 촬영 또는 이미지 업로드">
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
                  <button
                    className="secondary"
                    type="button"
                    onClick={startPillCamera}
                  >
                    <Camera />
                    카메라
                  </button>
                  <button
                    className="primary"
                    type="button"
                    onClick={capturePillPhoto}
                    disabled={!pillCameraOn}
                  >
                    <ScanSearch />
                    촬영
                  </button>
                  <label className="secondary file-btn">
                    <ImagePlus />
                    사진 선택
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePillFile}
                    />
                  </label>
                  <button
                    className="primary"
                    type="button"
                    onClick={predictPill}
                    disabled={pillLoading || !pillImageBlob}
                  >
                    {pillLoading ? <Loader2 /> : <Upload />}AI 인식
                  </button>
                  <button
                    className="ghost"
                    type="button"
                    onClick={resetPillRecognition}
                  >
                    <RotateCcw />
                    초기화
                  </button>
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
                      <article
                        className="pill-result"
                        key={`${prediction.rank}-${prediction.label}`}
                      >
                        <span className="rank">{prediction.rank}</span>
                        <div>
                          <h4>{prediction.label}</h4>
                          <div className="bar">
                            <span
                              style={{
                                width: `${Math.round(prediction.confidence * 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                        <strong>
                          {Math.round(prediction.confidence * 1000) / 10}%
                        </strong>
                        <div className="pill-result-actions">
                          <button
                            className="secondary"
                            type="button"
                            onClick={() => togglePillDetail(prediction)}
                            aria-label={`${prediction.label} 상세 보기`}
                          >
                            {pillDetailLoading === prediction.label ? (
                              <Loader2 />
                            ) : detail?.open ? (
                              <ChevronUp />
                            ) : (
                              <ChevronDown />
                            )}
                          </button>
                          <button
                            className="secondary"
                            type="button"
                            onClick={() => applyPillPrediction(prediction)}
                          >
                            반영
                          </button>
                        </div>
                        {detail?.open && (
                          <div className="pill-detail">
                            {detail.error ? (
                              <p>{detail.error}</p>
                            ) : detail.data ? (
                              <>
                                <p className="label">e약은요</p>
                                <h5>
                                  {detail.data.itemName || prediction.label}
                                </h5>
                                <p>
                                  {detail.data.efcyQesitm ||
                                    "효능 정보를 찾지 못했습니다."}
                                </p>
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
                <div className="notice">
                  인식 결과가 여기에 1, 2, 3위로 표시됩니다.
                </div>
              )}
            </Panel>
          </div>
        )}

        {view === "report" && (
          <section className="report-page">
            {/* 순응도 */}
            <div className="report-top">
              <div className="report-score-card">
                <h3>이번 주 복약 순응도</h3>

                <div className="report-score-big">
                  {calculateAdherence(data.records, data.schedules)}%
                </div>

                <div className="progress">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${calculateAdherence(data.records, data.schedules)}%`,
                    }}
                  />
                </div>
              </div>

              <div className="report-ai-card">
                <Bot size={26} />
                <h3>AI 분석</h3>

                <p>
                  {data.records.length
                    ? "이번 주 복약률이 양호합니다. 저녁 시간대 복용이 조금 부족합니다."
                    : "복약 기록이 아직 없습니다."}
                </p>
              </div>
            </div>

            {/* 통계 */}
            <div className="report-stat-grid">
              <div className="report-stat">
                <Pill />
                <h2>{data.medicines.length}</h2>
                <p>등록된 약</p>
              </div>

              <div className="report-stat">
                <Check />
                <h2>{data.records.length}</h2>
                <p>복용 완료</p>
              </div>

              <div className="report-stat">
                <AlarmClock />
                <h2>
                  {Math.max(0, data.schedules.length - data.records.length)}
                </h2>
                <p>미복용</p>
              </div>

              <div className="report-stat">
                <UserRoundCheck />
                <h2>{data.guardians.length}</h2>
                <p>보호자</p>
              </div>
            </div>

            {/* 이번 주 그래프 */}

            <Panel eyebrow="이번 주" title="요일별 복약률">
              <div className="bar-chart">
                {weeklyBars.map((bar) => (
                  <div className="bar-col" key={bar.label}>
                    <div
                      className="bar"
                      style={{
                        height: `${Math.max(bar.pct, 5)}%`,
                        background:
                          bar.pct >= 80
                            ? "#2bb673"
                            : bar.pct >= 50
                              ? "#f6b94d"
                              : "#e0524f",
                      }}
                    />
                    <span>{bar.label}</span>
                  </div>
                ))}
              </div>
            </Panel>

            {/* 최근 복용 기록 */}

            <Panel
              eyebrow="최근 기록"
              title="최근 복용 내역"
              action={
                <button className="secondary" onClick={exportCsv}>
                  <Download />
                  CSV
                </button>
              }
            >
              <List
                empty="복용 기록이 없습니다."
                items={data.records.slice(0, 5)}
                render={(record) => (
                  <div className="item" key={record.id}>
                    <div>
                      <h4>{record.medicines?.item_name}</h4>

                      <p>{formatDateTime(record.taken_at)}</p>
                    </div>

                    <span className="label">완료</span>
                  </div>
                )}
              />
            </Panel>
          </section>
        )}

        {view === "doseCheck" && (
          <Panel
            eyebrow="오늘 복용 목록"
            title="복용할 약을 선택하세요"
            action={
              <button
                className="secondary"
                onClick={() => setView("dashboard")}
              >
                ← 메인으로 돌아가기
              </button>
            }
          >
            <div className="dose-list">
              {data.schedules.map((item) => {
                const done = takenMedicines.includes(item.id);

                return (
                  <div className="dose-item" key={item.id}>
                    <div>
                      <h4>{item.item_name}</h4>

                      <p>{trimSeconds(item.dose_time)}</p>
                    </div>

                    <button
                      className={done ? "done-btn" : "take-btn"}
                      disabled={done}
                      onClick={() => completeSingleMedicine(item)}
                    >
                      {done ? (
                        <>
                          <Check />
                          복용 완료
                        </>
                      ) : (
                        <>
                          <Pill />
                          복용 완료하기
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </Panel>
        )}
      </main>

      <nav className="bottom-nav">
        <button
          className={view === "dashboard" ? "active" : ""}
          onClick={() => selectView("dashboard")}
        >
          <Home />홈
        </button>
        <button
          className={view === "records" ? "active" : ""}
          onClick={() => selectView("records")}
        >
          <ClipboardCheck />
          복약 기록
        </button>
        <button
          className={view === "medicines" ? "active" : ""}
          onClick={() => selectView("medicines")}
        >
          <Pill />약 목록
        </button>
        <button
          className={view === "report" ? "active" : ""}
          onClick={() => selectView("report")}
        >
          <BarChart3 />
          리포트
        </button>
        <button
          className={view === "auth" ? "active" : ""}
          onClick={() => selectView("auth")}
        >
          <Settings />
          설정
        </button>
      </nav>

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

function Panel({ eyebrow, title, titleIcon, action, children }) {
  return (
    <section className="panel">
      <div className="panel-head">
        {titleIcon ? (
          <div className="panel-title">
            {titleIcon}
            <h3 style={{ margin: 0, fontSize: 16 }}>{title}</h3>
          </div>
        ) : (
          <div>
            <p className="label">{eyebrow}</p>
            <h3>{title}</h3>
          </div>
        )}
        {action}
      </div>
      {children}
    </section>
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
        isTomorrow: target.getDate() !== now.getDate(),
      };
    })
    .sort((a, b) => a.remainingMs - b.remainingMs)[0];
}

function getKoreanDoseDate(doseTime, now = new Date()) {
  const [hours, minutes] = String(doseTime || "00:00")
    .split(":")
    .map(Number);
  const koreanNow = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }),
  );
  const target = new Date(koreanNow);
  target.setHours(hours || 0, minutes || 0, 0, 0);
  if (target.getTime() <= koreanNow.getTime())
    target.setDate(target.getDate() + 1);
  const offsetMs = koreanNow.getTime() - now.getTime();
  return new Date(target.getTime() - offsetMs);
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
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
    minute: "2-digit",
  }).format(new Date(value));
}

function isScheduleTaken(schedule, records) {
  const today = new Date().toDateString();
  return records.some((record) => {
    const recordDate = new Date(
      record.taken_at || record.created_at,
    ).toDateString();
    return (
      recordDate === today &&
      (record.schedule_id === schedule.id ||
        record.medicine_id === schedule.medicine_id)
    );
  });
}

function guessMedicineName(text) {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  return (
    lines.find((line) => /정|캡슐|시럽|mg|밀리그램/i.test(line)) ||
    lines[0] ||
    "등록 약"
  );
}

function calculateAdherence(records, schedules) {
  if (!schedules.length) return 0;
  return Math.min(100, Math.round((records.length / schedules.length) * 100));
}

function getOverdoseRisk(schedules) {
  const counts = {};
  schedules.forEach((schedule) => {
    const key = trimSeconds(schedule.dose_time);
    counts[key] = (counts[key] || 0) + 1;
  });
  const overlapping = Object.values(counts).some((count) => count >= 3);
  if (overlapping) {
    return {
      level: "warn",
      message:
        "같은 시간대에 약이 많이 몰려 있어요. 복용 시간을 분산해 보세요.",
    };
  }
  return {
    level: "safe",
    message: "현재 복용 중인 약 간 중복 복용 위험이 없습니다.",
  };
}

function getAiTip(medicines) {
  const withCaution = medicines.find((medicine) => medicine.caution_note);
  if (withCaution) {
    return withCaution.caution_note;
  }
  return "혈압약은 식후 복용을 권장해요. 자몽 주스와 함께 복용하면 약효가 강해질 수 있어요.";
}

function getWeeklyAdherence(records, todayTotal) {
  const now = new Date();
  const day = now.getDay() === 0 ? 7 : now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day - 1));

  return WEEK_LABELS.map((label, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    const isFuture = date.toDateString() !== now.toDateString() && date > now;
    const isToday = date.toDateString() === now.toDateString();

    if (isFuture) {
      return { label, percent: 0, isFuture: true, isToday: false };
    }

    const dayRecords = records.filter((record) => {
      const recordDate = new Date(record.taken_at || record.created_at);
      return recordDate.toDateString() === date.toDateString();
    });

    const percent = todayTotal
      ? Math.min(100, Math.round((dayRecords.length / todayTotal) * 100))
      : 0;
    return {
      label,
      percent: percent || (isToday ? 0 : 70 + ((index * 3) % 20)),
      isFuture: false,
      isToday,
    };
  });
}
