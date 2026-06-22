// 약알림e Supabase client helper
// index.html에서 @supabase/supabase-js CDN을 먼저 불러온 뒤 사용하세요.

const SUPABASE_CONFIG = {
  url: "https://iatjbuglymcwrisaclop.supabase.co",
  anonKey: "sb_publishable_5SIlCInLH42WzR6ucHhBOQ_Dx9iV9_k" // 여기에 Supabase Project Settings > API > anon public key 입력
};

export function getSupabaseConfigStatus() {
  return {
    url: SUPABASE_CONFIG.url,
    hasAnonKey: Boolean(SUPABASE_CONFIG.anonKey)
  };
}

export function createYakallimClient() {
  if (!window.supabase) {
    throw new Error("Supabase CDN이 로드되지 않았습니다.");
  }
  if (!SUPABASE_CONFIG.anonKey) {
    throw new Error("SUPABASE_CONFIG.anonKey가 필요합니다.");
  }
  return window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
}

export async function signUpWithProfile(client, { loginId, password, name, phone }) {
  // Supabase Auth는 email/password 기반이라 아이디를 내부 전용 이메일로 변환합니다.
  // 실제 이메일 로그인이 필요하면 loginEmail 값을 별도로 받으면 됩니다.
  const email = `${loginId}@yakallim.local`;
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      data: {
        login_id: loginId,
        name,
        phone
      }
    }
  });

  if (error) throw error;
  return data;
}

export async function signInWithLoginId(client, { loginId, password }) {
  const email = `${loginId}@yakallim.local`;
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut(client) {
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function getCurrentUserId(client) {
  const { data, error } = await client.auth.getUser();
  if (error) {
    const message = String(error.message || "");
    if (message.toLowerCase().includes("session") || message.toLowerCase().includes("missing")) {
      return null;
    }
    throw error;
  }
  return data.user?.id || null;
}

export async function getProfile(client) {
  const userId = await getCurrentUserId(client);
  if (!userId) return null;

  const { data, error } = await client
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) throw error;
  return data;
}

export async function upsertGuardian(client, guardian) {
  const userId = await getCurrentUserId(client);
  if (!userId) throw new Error("로그인이 필요합니다.");

  const { data, error } = await client
    .from("guardians")
    .upsert({
      user_id: userId,
      name: guardian.name,
      phone: guardian.phone,
      relationship: guardian.relationship || "보호자",
      alert_delay_minutes: Number(guardian.alertDelayMinutes || 30),
      alerts_enabled: Boolean(guardian.alertsEnabled)
    }, { onConflict: "user_id" })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function listGuardians(client) {
  const userId = await getCurrentUserId(client);
  if (!userId) return [];

  const { data, error } = await client
    .from("guardians")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function createMedicine(client, medicine) {
  const userId = await getCurrentUserId(client);
  if (!userId) throw new Error("로그인이 필요합니다.");

  const { data, error } = await client
    .from("medicines")
    .insert({
      user_id: userId,
      item_name: medicine.itemName,
      item_seq: medicine.itemSeq || null,
      efcy_qesitm: medicine.efcyQesitm || null,
      dosage_note: medicine.dosageNote || null,
      caution_note: medicine.cautionNote || null,
      source: medicine.source || "manual",
      raw_ocr_text: medicine.rawOcrText || null
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function listMedicines(client) {
  const userId = await getCurrentUserId(client);
  if (!userId) return [];

  const { data, error } = await client
    .from("medicines")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function createSchedule(client, schedule) {
  const userId = await getCurrentUserId(client);
  if (!userId) throw new Error("로그인이 필요합니다.");

  const { data, error } = await client
    .from("medication_schedules")
    .insert({
      user_id: userId,
      medicine_id: schedule.medicineId,
      dose_time: schedule.doseTime,
      dose_label: schedule.doseLabel || "복용",
      repeat_type: schedule.repeatType || "daily",
      amount: schedule.amount || null,
      start_date: schedule.startDate || new Date().toISOString().slice(0, 10),
      end_date: schedule.endDate || null,
      active: schedule.active ?? true
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function listTodaySchedules(client) {
  const userId = await getCurrentUserId(client);
  if (!userId) return [];

  const { data, error } = await client
    .from("today_schedules")
    .select("*")
    .eq("user_id", userId)
    .order("dose_time", { ascending: true });

  if (error) throw error;
  return data;
}

export async function recordDose(client, dose) {
  const userId = await getCurrentUserId(client);
  if (!userId) throw new Error("로그인이 필요합니다.");

  const { data, error } = await client
    .from("dose_records")
    .insert({
      user_id: userId,
      medicine_id: dose.medicineId || null,
      schedule_id: dose.scheduleId || null,
      scheduled_for: dose.scheduledFor || null,
      taken_at: dose.takenAt || new Date().toISOString(),
      status: dose.status || "taken",
      note: dose.note || null
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function listDoseRecords(client, { limit = 50 } = {}) {
  const userId = await getCurrentUserId(client);
  if (!userId) return [];

  const { data, error } = await client
    .from("dose_records")
    .select("*, medicines(item_name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data;
}

export async function saveOcrUpload(client, upload) {
  const userId = await getCurrentUserId(client);
  if (!userId) throw new Error("로그인이 필요합니다.");

  const { data, error } = await client
    .from("ocr_uploads")
    .insert({
      user_id: userId,
      file_name: upload.fileName || null,
      raw_text: upload.rawText,
      parsed_medicine_name: upload.parsedMedicineName || null,
      parsed_data: upload.parsedData || {}
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function createDuplicateWarning(client, warning) {
  const userId = await getCurrentUserId(client);
  if (!userId) throw new Error("로그인이 필요합니다.");

  const { data, error } = await client
    .from("duplicate_warnings")
    .insert({
      user_id: userId,
      medicine_id: warning.medicineId || null,
      previous_record_id: warning.previousRecordId || null,
      message: warning.message || "이미 복용한 약입니다. 중복 복용에 주의하세요."
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}
