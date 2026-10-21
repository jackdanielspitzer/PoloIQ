-- PoloIQ database (Supabase / Postgres). Paste this whole file into Supabase → SQL Editor → Run.
-- Safe to run again: everything is "create if not exists" / "create or replace".

-- ---------- Accounts ----------
-- Logins themselves (email + password) are handled by Supabase Auth; this is the app's profile for each one.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text,
  role text not null default 'player' check (role in ('player','captain','coach','manager','statistician','admin')),
  team_id text,
  profile_pic text,
  created_at timestamptz not null default now()
);

-- ---------- Teams, games, stats ----------
create table if not exists public.teams (
  id text primary key,                 -- stable id, e.g. 'team-navy'
  name text not null unique,
  data jsonb not null default '{}',    -- roster, colors, mascot, coach, claim info
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.games (
  id text primary key,                 -- stable id, e.g. 'sched-navy-2026-10-17-harvard'
  team_id text not null,
  date text,
  opponent text,
  status text not null default 'upcoming',
  data jsonb not null default '{}',    -- time, location, cap color, notes, clock, periods, tactics
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
create index if not exists games_team_idx on public.games(team_id);

-- One row per logged stat, so two phones adding to the same game never overwrite each other.
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references public.games(id) on delete cascade,
  period text not null,                -- '1'..'4', 'OT1', 'SO'
  seq bigint not null default (extract(epoch from clock_timestamp())*1000)::bigint, -- order within a period
  data jsonb not null,                 -- the event exactly as the app builds it (stat_type, side, cap, note, ...)
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists events_game_idx on public.events(game_id, period, seq);

-- Small shared lists (opponents, plays library, pasted box scores).
create table if not exists public.app_lists (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------- Permission helpers ----------
create or replace function public.my_role() returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;
create or replace function public.can_manage_team(t text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and (
    p.role in ('admin','statistician') or (p.role in ('manager','coach') and p.team_id = t)))
$$;
create or replace function public.can_manage_game(g text) returns boolean language sql stable security definer set search_path = public as $$
  select public.can_manage_team((select team_id from public.games where id = g))
$$;

-- Only the app owner's email may hold the admin role.
create or replace function public.guard_admin_role() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'admin' and lower(new.email) <> 'jackdanielspitzer@gmail.com' then
    raise exception 'The Admin role is only for the app owner.';
  end if;
  -- the email on a profile must match the login's own email
  if lower(new.email) <> lower((select email from auth.users where id = new.id)) then
    raise exception 'Profile email must match the account email.';
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before insert or update on public.profiles for each row execute function public.guard_admin_role();

-- ---------- Row-level security ----------
alter table public.profiles  enable row level security;
alter table public.teams     enable row level security;
alter table public.games     enable row level security;
alter table public.events    enable row level security;
alter table public.app_lists enable row level security;

-- Everyone (even logged out) can READ teams, games and stats — same as the app today.
drop policy if exists "read teams" on public.teams;      create policy "read teams"  on public.teams     for select using (true);
drop policy if exists "read games" on public.games;      create policy "read games"  on public.games     for select using (true);
drop policy if exists "read events" on public.events;    create policy "read events" on public.events    for select using (true);
drop policy if exists "read lists" on public.app_lists;  create policy "read lists"  on public.app_lists for select using (true);
-- Profiles: names/roles are visible to logged-in users (no passwords live here — Supabase keeps those).
drop policy if exists "read profiles" on public.profiles; create policy "read profiles" on public.profiles for select using (auth.role() = 'authenticated');

-- Profiles: you create and edit only your own.
drop policy if exists "own profile insert" on public.profiles; create policy "own profile insert" on public.profiles for insert with check (id = auth.uid());
drop policy if exists "own profile update" on public.profiles; create policy "own profile update" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- Teams: admins/statisticians edit any team; a coach/manager edits their own. Creating a new team needs a login.
drop policy if exists "team insert" on public.teams; create policy "team insert" on public.teams for insert with check (auth.role() = 'authenticated');
drop policy if exists "team update" on public.teams; create policy "team update" on public.teams for update using (public.can_manage_team(id) or data->>'claimStatus' is distinct from 'claimed') with check (true);

-- Games and stats: only people who manage that team.
drop policy if exists "game insert" on public.games; create policy "game insert" on public.games for insert with check (public.can_manage_team(team_id));
drop policy if exists "game update" on public.games; create policy "game update" on public.games for update using (public.can_manage_team(team_id)) with check (public.can_manage_team(team_id));
drop policy if exists "game delete" on public.games; create policy "game delete" on public.games for delete using (public.can_manage_team(team_id));
drop policy if exists "event insert" on public.events; create policy "event insert" on public.events for insert with check (public.can_manage_game(game_id));
drop policy if exists "event update" on public.events; create policy "event update" on public.events for update using (public.can_manage_game(game_id));
drop policy if exists "event delete" on public.events; create policy "event delete" on public.events for delete using (public.can_manage_game(game_id));

-- Shared lists: any logged-in coach/manager/statistician/admin.
drop policy if exists "list write" on public.app_lists; create policy "list write" on public.app_lists for all
  using (public.my_role() in ('admin','statistician','manager','coach')) with check (public.my_role() in ('admin','statistician','manager','coach'));

-- Live updates between phones (stats show up on other devices within about a second).
do $$ begin
  begin alter publication supabase_realtime add table public.events; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.games;  exception when duplicate_object then null; end;
end $$;

-- New sign-ups get their profile created by the database itself (name/role/team come from the sign-up
-- form), so it works even before the confirmation email is clicked. The admin guard above still applies.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, role, team_id)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
          coalesce(nullif(new.raw_user_meta_data->>'role',''), 'player'),
          nullif(new.raw_user_meta_data->>'team_id',''))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
