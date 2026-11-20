-- My Bus — Supabase PostgreSQL & Realtime Schema
-- Run this script in your Supabase Dashboard -> SQL Editor

-- 1. Bus Timings Table
create table if not exists public.bus_timings (
  id text primary key,
  bus_no text not null,
  route text not null,
  start_point text not null,
  end_point text not null,
  stops text[] not null default '{}',
  departure_time text not null,
  arrival_time text not null,
  frequency text not null default 'Every 20 min',
  status text not null default 'On Time',
  updated_at timestamptz not null default now()
);

-- 2. Live Buses Table (Updated by Driver Mobile & Stopped by Driver or Admin)
create table if not exists public.live_buses (
  driver_id text primary key,
  driver_name text not null,
  bus_no text not null,
  start_point text not null,
  end_point text not null,
  route_stops text[] not null default '{}',
  lat double precision not null,
  lng double precision not null,
  heading double precision,
  speed_kmh double precision not null default 0,
  direction_text text not null default 'Stationary',
  bus_status text not null default 'Normal',
  status_note text not null default '',
  route_coordinates jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

-- 3. Drivers Directory Table
create table if not exists public.drivers (
  driver_id text primary key,
  name text not null,
  bus_no text not null,
  pin text not null,
  created_at timestamptz not null default now()
);

-- Grant schema & table permissions to Supabase API roles (anon / authenticated)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.bus_timings to anon, authenticated;
grant select, insert, update, delete on table public.live_buses to anon, authenticated;
grant select, insert, update, delete on table public.drivers to anon, authenticated;

-- Enable Row Level Security
alter table public.bus_timings enable row level security;
alter table public.live_buses enable row level security;
alter table public.drivers enable row level security;

-- Public Read Policies (Users can view timings & active live buses)
drop policy if exists "Public read bus timings" on public.bus_timings;
create policy "Public read bus timings"
  on public.bus_timings for select
  using (true);

drop policy if exists "Public read live buses" on public.live_buses;
create policy "Public read live buses"
  on public.live_buses for select
  using (true);

-- Driver Upsert Policy for Live Location Sharing
drop policy if exists "Drivers upsert live location" on public.live_buses;
create policy "Drivers upsert live location"
  on public.live_buses for all
  using (true)
  with check (true);

-- Admin Manage Policies (In production, restrict via auth.jwt() role claims)
drop policy if exists "Manage bus timings" on public.bus_timings;
create policy "Manage bus timings"
  on public.bus_timings for all
  using (true)
  with check (true);

drop policy if exists "Drivers directory access" on public.drivers;
create policy "Drivers directory access"
  on public.drivers for all
  using (true)
  with check (true);

-- Enable Supabase Realtime for live_buses & bus_timings (safe to re-run)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'live_buses'
  ) then
    alter publication supabase_realtime add table public.live_buses;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bus_timings'
  ) then
    alter publication supabase_realtime add table public.bus_timings;
  end if;
end $$;
