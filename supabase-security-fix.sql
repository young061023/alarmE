-- Supabase Security Advisor 경고 보정용 패치
-- 이미 supabase-schema.sql을 실행한 뒤 경고가 보일 때 이 파일만 추가 실행하세요.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
