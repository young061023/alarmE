import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function POST(request) {
  const { name, phone } = await request.json();
  const guardianName = String(name || "").trim();
  const normalizedGuardianName = normalizeName(guardianName);
  const guardianPhone = normalizePhone(phone);

  if (!guardianName || !guardianPhone) {
    return NextResponse.json({ error: "보호자 이름과 연락처가 필요합니다." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://iatjbuglymcwrisaclop.supabase.co";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_5SIlCInLH42WzR6ucHhBOQ_Dx9iV9_k";
  const key = serviceKey || anonKey;
  const hasServiceRoleKey = Boolean(serviceKey && serviceKey !== anonKey && !serviceKey.startsWith("sb_publishable_"));

  if (!supabaseUrl || !key) {
    return NextResponse.json({ error: "Supabase 환경변수가 필요합니다." }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  try {
    const guardiansResult = await supabase
      .from("guardians")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);
    throwIfError(guardiansResult.error);

    const guardians = (guardiansResult.data || []).filter((guardian) => (
      normalizeName(guardian.name) === normalizedGuardianName &&
      normalizePhone(guardian.phone) === guardianPhone
    ));
    if (!guardians.length) {
      const hint = hasServiceRoleKey ? "" : " SUPABASE_SERVICE_ROLE_KEY에 anon/publishable key가 아니라 service_role secret key를 넣어야 합니다.";
      return NextResponse.json({ error: `일치하는 보호자 정보를 찾지 못했습니다.${hint}` }, { status: 404 });
    }

    const userIds = [...new Set(guardians.map((guardian) => guardian.user_id).filter(Boolean))];
    if (!userIds.length) {
      return NextResponse.json({ error: "연동된 사용자 정보가 없습니다." }, { status: 404 });
    }

    const [profilesResult, schedulesResult, recordsResult] = await Promise.all([
      supabase.from("profiles").select("*").in("id", userIds),
      supabase.from("today_schedules").select("*").in("user_id", userIds).order("dose_time", { ascending: true }),
      supabase
        .from("dose_records")
        .select("*, medicines(item_name)")
        .in("user_id", userIds)
        .order("created_at", { ascending: false })
        .limit(200)
    ]);

    throwIfError(profilesResult.error || schedulesResult.error || recordsResult.error);

    const profiles = profilesResult.data || [];
    const schedules = schedulesResult.data || [];
    const records = recordsResult.data || [];
    const wards = guardians.map((guardian) => {
      const profile = profiles.find((item) => item.id === guardian.user_id) || null;
      return {
        guardian,
        profile,
        schedules: schedules.filter((item) => item.user_id === guardian.user_id),
        records: records.filter((item) => item.user_id === guardian.user_id)
      };
    });

    return NextResponse.json({
      guardian: { name: guardianName, phone: guardianPhone },
      wards,
      needsServiceRole: !hasServiceRoleKey
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || "보호자 조회 실패" }, { status: 500 });
  }
}

function throwIfError(error) {
  if (error) throw error;
}

function normalizePhone(value) {
  return String(value || "").replace(/[^0-9]/g, "");
}

function normalizeName(value) {
  return String(value || "").replace(/\s+/g, "").toLowerCase();
}
