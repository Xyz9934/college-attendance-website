create extension if not exists "pgcrypto";

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  roll_number text not null,
  mobile_number text not null,
  semester text not null,
  course text not null default 'B.Sc. Zoology',
  date text not null,
  time text not null,
  timestamp timestamptz not null,
  ip_address text not null default '',
  user_agent text not null default '',
  latitude text not null default '',
  longitude text not null default '',
  access_token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create index if not exists attendance_records_timestamp_idx
  on public.attendance_records (timestamp desc);

create index if not exists attendance_records_access_token_idx
  on public.attendance_records (access_token);
