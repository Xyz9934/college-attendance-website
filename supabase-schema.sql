create extension if not exists "pgcrypto";

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  roll_number text not null,
  mobile_number text not null,
  semester text not null,
  attendance_status text not null default 'Coming to College',
  course text not null default 'B.Sc. Zoology',
  date text not null,
  time text not null,
  timestamp timestamptz not null,
  attendance_day date not null,
  keep_forever boolean not null default false,
  ip_address text not null default '',
  user_agent text not null default '',
  latitude text not null default '',
  longitude text not null default '',
  access_token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table if not exists public.attendance_archive (
  id uuid primary key,
  original_id uuid not null,
  name text not null,
  roll_number text not null,
  mobile_number text not null,
  semester text not null,
  attendance_status text not null default 'Coming to College',
  course text not null,
  date text not null,
  time text not null,
  timestamp timestamptz not null,
  attendance_day date not null,
  keep_forever boolean not null default false,
  ip_address text not null default '',
  user_agent text not null default '',
  latitude text not null default '',
  longitude text not null default '',
  access_token uuid not null,
  archived_at timestamptz not null default now()
);

create table if not exists public.attendance_reset_state (
  id integer primary key default 1,
  last_reset_day date not null default '1970-01-01'::date,
  updated_at timestamptz not null default now()
);

insert into public.attendance_reset_state (id, last_reset_day)
values (1, '1970-01-01'::date)
on conflict (id) do nothing;

create index if not exists attendance_records_timestamp_idx
  on public.attendance_records (timestamp desc);

create index if not exists attendance_records_access_token_idx
  on public.attendance_records (access_token);

create unique index if not exists attendance_records_one_per_day_idx
  on public.attendance_records (roll_number, attendance_day);

create index if not exists attendance_records_keep_forever_idx
  on public.attendance_records (keep_forever);

alter table public.attendance_records
add column if not exists attendance_status text not null default 'Coming to College';

alter table public.attendance_archive
add column if not exists attendance_status text not null default 'Coming to College';

create index if not exists attendance_archive_timestamp_idx
  on public.attendance_archive (timestamp desc);

create index if not exists attendance_archive_day_idx
  on public.attendance_archive (attendance_day desc);

alter table public.attendance_records enable row level security;

drop policy if exists "Deny direct client access" on public.attendance_records;
create policy "Deny direct client access"
on public.attendance_records
for all
using (false)
with check (false);

alter table public.attendance_archive enable row level security;
drop policy if exists "Deny direct client access archive" on public.attendance_archive;
create policy "Deny direct client access archive"
on public.attendance_archive
for all
using (false)
with check (false);

alter table public.attendance_reset_state enable row level security;
drop policy if exists "Deny direct client access reset" on public.attendance_reset_state;
create policy "Deny direct client access reset"
on public.attendance_reset_state
for all
using (false)
with check (false);
