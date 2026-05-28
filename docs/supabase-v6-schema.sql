-- Trainer's Codex v6 — Supabase schema migration
--
-- Apply this in Supabase Dashboard → SQL Editor (after the v5 user_data table
-- from docs/DEPLOYMENT.md Phase 4 is in place). The migration is idempotent —
-- re-running it is safe.
--
-- Tables added in v6:
--   - profiles            : public-facing trainer handles + bio
--   - friendships         : pending/accepted/blocked relationships
--   - public_teams        : shared teams that other users can follow
--   - team_follows        : follower → team relationships
--   - game_badges         : canonical list of gym leaders + Elite 4 + Champions
--   - user_badges         : claimed badges (with photo proof + verification status)
--
-- All tables have RLS enabled. Public reads are scoped to `is_public = true`
-- rows; writes are user-scoped.

-- ============================================================
-- PROFILES — public trainer handles
-- ============================================================
create table if not exists profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  handle     text unique not null check (handle ~ '^[a-z0-9_-]{3,24}$'),
  display    text,
  bio        text check (length(bio) <= 280),
  avatar_url text,
  region     text,
  motto      text check (length(motto) <= 80),
  is_public  boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists profiles_handle_idx on profiles(lower(handle));

alter table profiles enable row level security;

drop policy if exists "profiles_public_read" on profiles;
create policy "profiles_public_read" on profiles
  for select using (is_public = true or auth.uid() = user_id);

drop policy if exists "profiles_self_insert" on profiles;
create policy "profiles_self_insert" on profiles
  for insert with check (auth.uid() = user_id);

drop policy if exists "profiles_self_update" on profiles;
create policy "profiles_self_update" on profiles
  for update using (auth.uid() = user_id);

-- ============================================================
-- FRIENDSHIPS — symmetric relationships
-- ============================================================
create table if not exists friendships (
  requester  uuid references profiles(user_id) on delete cascade,
  requested  uuid references profiles(user_id) on delete cascade,
  status     text not null check (status in ('pending', 'accepted', 'blocked')),
  created_at timestamptz default now(),
  primary key (requester, requested)
);

alter table friendships enable row level security;

drop policy if exists "friendships_visible" on friendships;
create policy "friendships_visible" on friendships
  for select using (auth.uid() = requester or auth.uid() = requested);

drop policy if exists "friendships_create" on friendships;
create policy "friendships_create" on friendships
  for insert with check (auth.uid() = requester);

drop policy if exists "friendships_update" on friendships;
create policy "friendships_update" on friendships
  for update using (auth.uid() = requester or auth.uid() = requested);

-- ============================================================
-- PUBLIC TEAMS — shareable team listings
-- ============================================================
create table if not exists public_teams (
  id          uuid primary key default gen_random_uuid(),
  owner      uuid references profiles(user_id) on delete cascade,
  name       text not null check (length(name) <= 60),
  members    jsonb not null,
  trainer    jsonb,
  is_public  boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists public_teams_owner_idx on public_teams(owner);
create index if not exists public_teams_public_idx on public_teams(is_public, updated_at desc) where is_public = true;

alter table public_teams enable row level security;

drop policy if exists "public_teams_read" on public_teams;
create policy "public_teams_read" on public_teams
  for select using (is_public = true or auth.uid() = owner);

drop policy if exists "public_teams_write" on public_teams;
create policy "public_teams_write" on public_teams
  for all using (auth.uid() = owner) with check (auth.uid() = owner);

-- ============================================================
-- TEAM FOLLOWS — user follows another user's public team
-- ============================================================
create table if not exists team_follows (
  follower  uuid references profiles(user_id) on delete cascade,
  team_id   uuid references public_teams(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (follower, team_id)
);

alter table team_follows enable row level security;

drop policy if exists "follows_self" on team_follows;
create policy "follows_self" on team_follows
  for all using (auth.uid() = follower) with check (auth.uid() = follower);

drop policy if exists "follows_read_by_team_owner" on team_follows;
create policy "follows_read_by_team_owner" on team_follows
  for select using (
    exists (select 1 from public_teams t where t.id = team_id and t.owner = auth.uid())
  );

-- ============================================================
-- GAME BADGES — canonical catalog (Kanto + later regions)
-- ============================================================
create table if not exists game_badges (
  id           text primary key,
  region       text not null,
  game         text,
  leader       text not null,
  city         text,
  badge_label  text not null,
  badge_color  text,
  display_order int default 0
);

-- Seed Kanto's 8. Other regions added in future migrations.
insert into game_badges (id, region, game, leader, city, badge_label, badge_color, display_order) values
  ('kanto-boulder',  'Kanto', 'RGBY/FRLG/LGPE', 'Brock',    'Pewter City',     'Boulder Badge',  '#afa981', 1),
  ('kanto-cascade',  'Kanto', 'RGBY/FRLG/LGPE', 'Misty',    'Cerulean City',   'Cascade Badge',  '#2980ef', 2),
  ('kanto-thunder',  'Kanto', 'RGBY/FRLG/LGPE', 'Surge',    'Vermilion City',  'Thunder Badge',  '#fac000', 3),
  ('kanto-rainbow',  'Kanto', 'RGBY/FRLG/LGPE', 'Erika',    'Celadon City',    'Rainbow Badge',  '#3fa129', 4),
  ('kanto-soul',     'Kanto', 'RGBY/FRLG/LGPE', 'Koga',     'Fuchsia City',    'Soul Badge',     '#9141cb', 5),
  ('kanto-marsh',    'Kanto', 'RGBY/FRLG/LGPE', 'Sabrina',  'Saffron City',    'Marsh Badge',    '#ef4179', 6),
  ('kanto-volcano',  'Kanto', 'RGBY/FRLG/LGPE', 'Blaine',   'Cinnabar Island', 'Volcano Badge',  '#e62829', 7),
  ('kanto-earth',    'Kanto', 'RGBY/FRLG/LGPE', 'Giovanni', 'Viridian City',   'Earth Badge',    '#915121', 8),
  -- Elite Four + Champion
  ('kanto-elite-lorelei', 'Kanto', 'RGBY/FRLG', 'Lorelei',  'Indigo Plateau', 'Elite Four · Lorelei', '#3dcef3', 9),
  ('kanto-elite-bruno',   'Kanto', 'RGBY/FRLG', 'Bruno',    'Indigo Plateau', 'Elite Four · Bruno',   '#ff8000', 10),
  ('kanto-elite-agatha',  'Kanto', 'RGBY/FRLG', 'Agatha',   'Indigo Plateau', 'Elite Four · Agatha',  '#704170', 11),
  ('kanto-elite-lance',   'Kanto', 'RGBY/FRLG', 'Lance',    'Indigo Plateau', 'Elite Four · Lance',   '#5060e1', 12),
  ('kanto-champion-blue', 'Kanto', 'RGBY/FRLG', 'Blue',     'Indigo Plateau', 'Champion · Blue',      '#f4ae3c', 13)
on conflict (id) do nothing;

alter table game_badges enable row level security;

drop policy if exists "badges_public_read" on game_badges;
create policy "badges_public_read" on game_badges
  for select using (true);

-- ============================================================
-- USER BADGES — claimed achievements with photo proof
-- ============================================================
create table if not exists user_badges (
  user_id        uuid references profiles(user_id) on delete cascade,
  badge_id       text references game_badges(id),
  proof_image_url text,
  status         text default 'pending' check (status in ('pending', 'approved', 'rejected')),
  rejection_reason text,
  submitted_at   timestamptz default now(),
  verified_at    timestamptz,
  verified_by    uuid references profiles(user_id),
  primary key (user_id, badge_id)
);

create index if not exists user_badges_status_idx on user_badges(status, submitted_at desc);

alter table user_badges enable row level security;

drop policy if exists "user_badges_self_read" on user_badges;
create policy "user_badges_self_read" on user_badges
  for select using (
    auth.uid() = user_id
    or status = 'approved'
    or auth.uid() = verified_by
  );

drop policy if exists "user_badges_self_submit" on user_badges;
create policy "user_badges_self_submit" on user_badges
  for insert with check (auth.uid() = user_id and status = 'pending');

drop policy if exists "user_badges_self_resubmit" on user_badges;
create policy "user_badges_self_resubmit" on user_badges
  for update using (auth.uid() = user_id and status != 'approved');

-- ============================================================
-- Trigger: update updated_at on profile/team mutations
-- ============================================================
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists profiles_updated_at on profiles;
create trigger profiles_updated_at before update on profiles
  for each row execute function set_updated_at();

drop trigger if exists public_teams_updated_at on public_teams;
create trigger public_teams_updated_at before update on public_teams
  for each row execute function set_updated_at();

-- ============================================================
-- Confirmation
-- ============================================================
select table_name, row_security
from information_schema.tables t
join pg_tables p on p.tablename = t.table_name
where t.table_schema = 'public'
  and t.table_name in ('profiles', 'friendships', 'public_teams', 'team_follows', 'game_badges', 'user_badges')
order by t.table_name;
