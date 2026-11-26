-- Haftanın 11'i — veritabanı kurulumu
-- Supabase > SQL Editor'da bir kez çalıştırılır.

-- 1) Oyuncular ------------------------------------------------------------
create table if not exists public.players (
  id bigint generated always as identity primary key,
  team text not null,
  name text not null,
  position text not null,           -- detaylı mevki (Stoper, Sol Kanat...)
  zone text not null check (zone in ('Kaleci','Defans','Orta Saha','Forvet')),
  country text,
  number int,
  age int,
  active boolean not null default true
);

-- 2) Profiller --------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (char_length(username) between 3 and 20),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- 3) Haftalar ---------------------------------------------------------------
create table if not exists public.weeks (
  id int primary key,                -- hafta numarası (ör. 13)
  deadline timestamptz not null,     -- tahminlerin kapandığı an (ilk maç)
  created_at timestamptz not null default now()
);

-- 4) Tahminler (4-4-2 + kaptan) --------------------------------------------
create table if not exists public.predictions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  week_id int not null references public.weeks(id) on delete cascade,
  picks bigint[] not null check (array_length(picks, 1) = 11),
  captain bigint not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, week_id),
  check (captain = any (picks))
);

-- 5) Haftanın 11'i (Veri 11 / Taraftar 11) ---------------------------------
create table if not exists public.team_of_week (
  week_id int not null references public.weeks(id) on delete cascade,
  source text not null check (source in ('veri','taraftar')),
  player_id bigint not null references public.players(id),
  primary key (week_id, source, player_id)
);

-- Yardımcı: giriş yapan kullanıcı yönetici mi? ------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- Yardımcı: hafta kapandı mı? ----------------------------------------------
create or replace function public.week_closed(w int)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select deadline <= now() from public.weeks where id = w), false);
$$;

-- Satır güvenliği (RLS) -----------------------------------------------------
alter table public.players enable row level security;
alter table public.profiles enable row level security;
alter table public.weeks enable row level security;
alter table public.predictions enable row level security;
alter table public.team_of_week enable row level security;

-- Oyuncular: herkes okur, sadece yönetici değiştirir
drop policy if exists players_read on public.players;
create policy players_read on public.players for select using (true);
drop policy if exists players_admin on public.players;
create policy players_admin on public.players for all using (public.is_admin()) with check (public.is_admin());

-- Profiller: kullanıcı adları herkese açık; herkes sadece kendi profilini açar
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select using (true);
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert with check (id = auth.uid());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
-- is_admin sütununu kullanıcılar değiştiremez (sadece Supabase panelinden)
revoke insert, update on public.profiles from anon, authenticated;
grant insert (id, username) on public.profiles to authenticated;
grant update (username) on public.profiles to authenticated;

-- Haftalar: herkes okur, sadece yönetici ekler/değiştirir
drop policy if exists weeks_read on public.weeks;
create policy weeks_read on public.weeks for select using (true);
drop policy if exists weeks_admin on public.weeks;
create policy weeks_admin on public.weeks for all using (public.is_admin()) with check (public.is_admin());

-- Tahminler: kendi tahminini her zaman görürsün; başkalarınınkini SADECE hafta kapandıktan sonra
drop policy if exists predictions_read on public.predictions;
create policy predictions_read on public.predictions for select
  using (user_id = auth.uid() or public.week_closed(week_id));
-- Kayıt/değişiklik sadece kendi adına ve kapanıştan ÖNCE
drop policy if exists predictions_insert on public.predictions;
create policy predictions_insert on public.predictions for insert
  with check (user_id = auth.uid() and not public.week_closed(week_id));
drop policy if exists predictions_update on public.predictions;
create policy predictions_update on public.predictions for update
  using (user_id = auth.uid() and not public.week_closed(week_id))
  with check (user_id = auth.uid() and not public.week_closed(week_id));

-- Haftanın 11'i: herkes okur, sadece yönetici girer
drop policy if exists tow_read on public.team_of_week;
create policy tow_read on public.team_of_week for select using (true);
drop policy if exists tow_admin on public.team_of_week;
create policy tow_admin on public.team_of_week for all using (public.is_admin()) with check (public.is_admin());

-- Puanlar --------------------------------------------------------------------
-- Haftalık puan: 11'e giren her oyuncu 1 puan, kaptan girerse +1 (toplam 2).
-- Sadece kapanmış haftalar hesaplanır.
create or replace view public.week_scores as
select p.user_id, p.week_id, s.source,
  (select count(*) from unnest(p.picks) x
     where exists (select 1 from public.team_of_week t
                   where t.week_id = p.week_id and t.source = s.source and t.player_id = x))
  + case when exists (select 1 from public.team_of_week t
                      where t.week_id = p.week_id and t.source = s.source and t.player_id = p.captain)
         then 1 else 0 end as points
from public.predictions p
cross join (values ('veri'), ('taraftar')) as s(source)
join public.weeks w on w.id = p.week_id
where w.deadline <= now()
  and exists (select 1 from public.team_of_week t where t.week_id = p.week_id and t.source = s.source);

-- Sezon sıralaması
create or replace view public.leaderboard as
select ws.source, ws.user_id, pr.username,
  sum(ws.points)::int as total,
  count(*)::int as weeks_played,
  (array_agg(ws.points order by ws.week_id desc))[1]::int as last_week_points
from public.week_scores ws
join public.profiles pr on pr.id = ws.user_id
group by ws.source, ws.user_id, pr.username;

-- Çoğunluk ne dedi? (sadece kapanmış haftalar)
create or replace view public.pick_stats as
select p.week_id, x.player_id, count(*)::int as picked_by,
  (select count(*) from public.predictions p2 where p2.week_id = p.week_id)::int as total_predictions
from public.predictions p
cross join lateral unnest(p.picks) as x(player_id)
join public.weeks w on w.id = p.week_id
where w.deadline <= now()
group by p.week_id, x.player_id;

grant select on public.week_scores, public.leaderboard, public.pick_stats to anon, authenticated;

-- Yeni Supabase projelerinde tablolar API'ye otomatik açılmıyor: yetkileri açıkça veriyoruz (asıl kontrol RLS'te)
grant usage on schema public to anon, authenticated;
grant select on public.players, public.profiles, public.weeks, public.predictions, public.team_of_week to anon, authenticated;
grant insert, update, delete on public.players, public.weeks, public.predictions, public.team_of_week to authenticated;
grant execute on function public.is_admin(), public.week_closed(int) to anon, authenticated;
