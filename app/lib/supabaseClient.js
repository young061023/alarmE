"use client";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://iatjbuglymcwrisaclop.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_5SIlCInLH42WzR6ucHhBOQ_Dx9iV9_k";

export function hasSupabaseConfig() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export function createBrowserSupabaseClient() {
  if (!hasSupabaseConfig()) {
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}

export function loginIdToEmail(loginId) {
  return `${loginId}@yakallim.local`;
}
