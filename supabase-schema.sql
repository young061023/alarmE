-- 약알림e Supabase database schema
-- 실행 위치: Supabase Dashboard > SQL Editor
-- 주의: 비밀번호는 직접 테이블에 저장하지 않습니다. Supabase Auth가 해시로 안전하게 관리합니다.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  login_id text unique not null,
  name text not null,
  phone text,
  birth_year int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.guardians (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  phone text not null,
  relationship text default '보호자',
  alert_delay_minutes int not null default 30 check (alert_delay_minutes in (15, 30, 60, 120)),
  alerts_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists guardians_user_id_unique on public.guardians(user_id);

create table if not exists public.medicines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_name text not null,
  item_seq text,
  efcy_qesitm text,
  dosage_note text,
  caution_note text,
  source text not null default 'manual' check (source in ('manual', 'ocr', 'edrug_api')),
  raw_ocr_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.medication_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  medicine_id uuid not null references public.medicines(id) on delete cascade,
  dose_time time not null,
  dose_label text default '복용',
  repeat_type text not null default 'daily' check (repeat_type in ('daily', 'morning', 'lunch', 'evening', 'as_needed')),
  amount text,
  start_date date not null default current_date,
  end_date date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dose_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  medicine_id uuid references public.medicines(id) on delete set null,
  schedule_id uuid references public.medication_schedules(id) on delete set null,
  scheduled_for timestamptz,
  taken_at timestamptz,
  status text not null default 'taken' check (status in ('scheduled', 'taken', 'missed', 'skipped', 'duplicate_warning')),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.ocr_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  file_name text,
  raw_text text not null,
  parsed_medicine_name text,
  parsed_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.duplicate_warnings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  medicine_id uuid references public.medicines(id) on delete set null,
  previous_record_id uuid references public.dose_records(id) on delete set null,
  attempted_at timestamptz not null default now(),
  message text not null default '이미 복용한 약입니다. 중복 복용에 주의하세요.',
  resolved boolean not null default false
);

create index if not exists profiles_login_id_idx on public.profiles(login_id);
create index if not exists guardians_user_id_idx on public.guardians(user_id);
create index if not exists medicines_user_id_idx on public.medicines(user_id);
create index if not exists schedules_user_id_time_idx on public.medication_schedules(user_id, dose_time);
create index if not exists dose_records_user_id_taken_at_idx on public.dose_records(user_id, taken_at desc);
create index if not exists ocr_uploads_user_id_created_at_idx on public.ocr_uploads(user_id, created_at desc);
create index if not exists duplicate_warnings_user_id_attempted_at_idx on public.duplicate_warnings(user_id, attempted_at desc);

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

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_guardians_updated_at on public.guardians;
create trigger set_guardians_updated_at
before update on public.guardians
for each row execute function public.set_updated_at();

drop trigger if exists set_medicines_updated_at on public.medicines;
create trigger set_medicines_updated_at
before update on public.medicines
for each row execute function public.set_updated_at();

drop trigger if exists set_schedules_updated_at on public.medication_schedules;
create trigger set_schedules_updated_at
before update on public.medication_schedules
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, login_id, name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'login_id', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'name', '사용자'),
    new.raw_user_meta_data ->> 'phone'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.guardians enable row level security;
alter table public.medicines enable row level security;
alter table public.medication_schedules enable row level security;
alter table public.dose_records enable row level security;
alter table public.ocr_uploads enable row level security;
alter table public.duplicate_warnings enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "guardians_all_own" on public.guardians;
create policy "guardians_all_own" on public.guardians
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "medicines_all_own" on public.medicines;
create policy "medicines_all_own" on public.medicines
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "schedules_all_own" on public.medication_schedules;
create policy "schedules_all_own" on public.medication_schedules
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "dose_records_all_own" on public.dose_records;
create policy "dose_records_all_own" on public.dose_records
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "ocr_uploads_all_own" on public.ocr_uploads;
create policy "ocr_uploads_all_own" on public.ocr_uploads
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "duplicate_warnings_all_own" on public.duplicate_warnings;
create policy "duplicate_warnings_all_own" on public.duplicate_warnings
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 오늘 복약 일정 조회용 뷰
create or replace view public.today_schedules as
select
  s.id,
  s.user_id,
  s.medicine_id,
  m.item_name,
  m.efcy_qesitm,
  s.dose_time,
  s.dose_label,
  s.repeat_type,
  s.amount,
  s.active
from public.medication_schedules s
join public.medicines m on m.id = s.medicine_id
where s.active = true
  and s.start_date <= current_date
  and (s.end_date is null or s.end_date >= current_date);

alter view public.today_schedules set (security_invoker = true);
