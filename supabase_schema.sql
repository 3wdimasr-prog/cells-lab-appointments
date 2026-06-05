-- Supabase SQL for Cells Lab Live App

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  appointment_date date not null,
  appointment_time time not null,
  patient_name text not null,
  phone text not null,
  doctor text not null,
  department text default 'تحاليل',
  status text default 'انتظار',
  employee text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.appointments enable row level security;

-- Development/open policy.
-- Allows public read/write using anon key. Use only if the app link is private/internal.
drop policy if exists "public appointments select" on public.appointments;
drop policy if exists "public appointments insert" on public.appointments;
drop policy if exists "public appointments update" on public.appointments;
drop policy if exists "public appointments delete" on public.appointments;

create policy "public appointments select"
on public.appointments for select
to anon
using (true);

create policy "public appointments insert"
on public.appointments for insert
to anon
with check (true);

create policy "public appointments update"
on public.appointments for update
to anon
using (true)
with check (true);

create policy "public appointments delete"
on public.appointments for delete
to anon
using (true);

create index if not exists appointments_date_idx on public.appointments (appointment_date);
create index if not exists appointments_doctor_date_time_idx on public.appointments (doctor, appointment_date, appointment_time);

-- Optional: prevent duplicate appointments for the same doctor/date/time
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'unique_doctor_datetime'
  ) then
    alter table public.appointments
    add constraint unique_doctor_datetime unique (doctor, appointment_date, appointment_time);
  end if;
end $$;
