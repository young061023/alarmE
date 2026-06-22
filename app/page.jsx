"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Camera,
  Check,
  ClipboardCheck,
  Database,
  Download,
  Home,
  LogIn,
  LogOut,
  Menu,
  Pill,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
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
  const [view, setView] = useState("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [data, setData] = useState(emptyState);
  const [toast, setToast] = useState("");
  const [connection, setConnection] = useState(hasSupabaseConfig() ? "Supabase 연결 준비됨" : "anon key 필요");
  const [nextDose, setNextDose] = useState(null);
  const [authForm, setAuthForm] = useState({ name: "", loginId: "", password: "", phone: "" });
  const [loginForm, setLoginForm] = useState({ loginId: "", password: "" });
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
    setConnection("Supabase 연결됨 · 로그인 필요");
    notify("로그아웃되었습니다.");
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
      setData((current) => ({ ...current, ocrText: result.data.text.trim() }));
      setOcrStatus("OCR 완료");
    } catch (error) {
      setOcrStatus("OCR 실패");
      notify(error.message);
    }
  }

  async function saveOcrResult() {
    if (!requireLogin()) return;
    if (!data.ocrText.trim()) {
      notify("저장할 OCR 결과가 없습니다.");
      return;
    }

    const parsedMedicineName = guessMedicineName(data.ocrText);

    try {
      const { data: userData } = await supabase.auth.getUser();
      const uploadResult = await supabase.from("ocr_uploads").insert({
        user_id: userData.user.id,
        raw_text: data.ocrText,
        parsed_medicine_name: parsedMedicineName,
        parsed_data: { source: "tesseract" }
      });
      throwIfError(uploadResult.error);

      const medicineResult = await supabase
        .from("medicines")
        .insert({
          user_id: userData.user.id,
          item_name: parsedMedicineName,
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
    ocr: "OCR 약 등록",
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
          <NavButton active={view === "ocr"} icon={<Camera />} onClick={() => selectView("ocr")}>OCR 등록</NavButton>
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
              title="Supabase Auth"
              action={<button className="ghost" onClick={handleLogout}><LogOut />로그아웃</button>}
            >
              <form className="form" onSubmit={handleLogin}>
                <label>아이디<input value={loginForm.loginId} onChange={(e) => setLoginForm({ ...loginForm, loginId: e.target.value })} required /></label>
                <label>비밀번호<input type="password" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} required /></label>
                <button className="primary"><LogIn />로그인</button>
              </form>
              <div className="notice">{data.profile ? `${data.profile.name} / 아이디: ${data.profile.login_id}` : "아직 로그인하지 않았습니다."}</div>
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

        {view === "ocr" && (
          <Panel eyebrow="AI 기반 간편 등록" title="Tesseract OCR 결과를 DB에 저장">
            <div className="ocr-actions">
              <label className="secondary file-btn"><Camera />사진 선택<input type="file" accept="image/*" onChange={handleOcrFile} /></label>
              <button className="primary" onClick={saveOcrResult}><Database />OCR 결과 저장</button>
            </div>
            <div className="ocr-grid">
              <div className="preview">{previewUrl ? <img src={previewUrl} alt="OCR 이미지" /> : "처방전 또는 약 봉투 사진"}</div>
              <div className="form">
                <div className="notice">{ocrStatus}</div>
                <textarea value={data.ocrText} onChange={(e) => setData({ ...data, ocrText: e.target.value })} placeholder="OCR 결과" />
              </div>
            </div>
          </Panel>
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

function guessMedicineName(text) {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  return lines.find((line) => /정|캡슐|시럽|mg|밀리그램/i.test(line)) || lines[0] || "OCR 등록 약";
}

function calculateAdherence(records, schedules) {
  if (!schedules.length) return 0;
  return Math.min(100, Math.round((records.length / schedules.length) * 100));
}
