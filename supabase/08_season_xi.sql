-- 08: Sezonun 11'i (bir kez kilitlenir) + Sofascore sezon ortalaması ölçümleri
create table if not exists public.season_picks (
  user_id uuid primary key references public.profiles(id) on update cascade on delete cascade,
  picks bigint[] not null check (array_length(picks, 1) = 11),
  locked_at timestamptz,
  unlocks int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.season_picks enable row level security;
drop policy if exists sp_read on public.season_picks;
create policy sp_read on public.season_picks for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists sp_insert on public.season_picks;
create policy sp_insert on public.season_picks for insert with check (user_id = auth.uid());
drop policy if exists sp_update on public.season_picks;
create policy sp_update on public.season_picks for update using (user_id = auth.uid() and locked_at is null) with check (user_id = auth.uid());
drop policy if exists sp_admin on public.season_picks;
create policy sp_admin on public.season_picks for update using (public.is_admin()) with check (public.is_admin());
revoke all on public.season_picks from anon, authenticated;
grant select on public.season_picks to authenticated;
grant insert (user_id, picks, updated_at) on public.season_picks to authenticated;
grant update (user_id, picks, updated_at) on public.season_picks to authenticated;

create or replace function public.lock_season()
returns timestamptz language plpgsql security definer set search_path = public as $$
declare r public.season_picks;
begin
  select * into r from public.season_picks where user_id = auth.uid();
  if r is null then raise exception 'Önce Sezonun 11''ini kur'; end if;
  if r.locked_at is not null then raise exception 'Sezonun 11''in zaten kilitli'; end if;
  if array_position(r.picks, null) is not null then raise exception '11 oyuncunun hepsini seç'; end if;
  update public.season_picks set locked_at = now() where user_id = auth.uid();
  return now();
end $$;
revoke execute on function public.lock_season() from public, anon;
grant execute on function public.lock_season() to authenticated;

create or replace function public.admin_unlock_season(u uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Yetki yok'; end if;
  update public.season_picks set locked_at = null, unlocks = unlocks + 1 where user_id = u;
end $$;
revoke execute on function public.admin_unlock_season(uuid) from public, anon;
grant execute on function public.admin_unlock_season(uuid) to authenticated;

create table if not exists public.rating_snapshots (
  taken_on date not null,
  player_id bigint not null references public.players(id) on delete cascade,
  avg_rating numeric(4,2) not null check (avg_rating between 0 and 10),
  apps int not null check (apps >= 0),
  primary key (taken_on, player_id)
);
alter table public.rating_snapshots enable row level security;
drop policy if exists rs_read on public.rating_snapshots;
create policy rs_read on public.rating_snapshots for select using (true);
drop policy if exists rs_admin on public.rating_snapshots;
create policy rs_admin on public.rating_snapshots for all using (public.is_admin()) with check (public.is_admin());
grant select on public.rating_snapshots to anon, authenticated;
grant insert, update, delete on public.rating_snapshots to authenticated;

-- Başlangıç: kilitten sonraki ilk ölçüm; son: en son ölçüm. Kilit sonrası ortalama = (o2*n2 - o1*n1)/(n2-n1)
create or replace view public.season_player_scores as
with base as (
  select sp.user_id, sp.locked_at,
    (select min(taken_on) from public.rating_snapshots where taken_on >= (sp.locked_at at time zone 'Europe/Istanbul')::date) as start_on,
    (select max(taken_on) from public.rating_snapshots) as end_on,
    sp.picks
  from public.season_picks sp where sp.locked_at is not null
)
select b.user_id, x.slot, x.pid as player_id, b.start_on, b.end_on,
  e.apps - coalesce(s.apps, 0) as apps_since,
  case when e.apps - coalesce(s.apps, 0) > 0
       then round((e.avg_rating * e.apps - coalesce(s.avg_rating * s.apps, 0)) / (e.apps - coalesce(s.apps, 0)), 2) end as avg_since
from base b
cross join lateral (select i as slot, b.picks[i] as pid from generate_series(1, 11) i) x
left join public.rating_snapshots s on s.taken_on = b.start_on and s.player_id = x.pid
left join public.rating_snapshots e on e.taken_on = b.end_on and e.player_id = x.pid
where b.start_on is not null and b.end_on > b.start_on;
revoke select on public.season_player_scores from anon, authenticated;

create or replace view public.season_my_players as
select * from public.season_player_scores where user_id = auth.uid() or public.is_admin();
grant select on public.season_my_players to authenticated;

-- Takım puanı: 11 oyuncunun ortalaması; kilitten sonra hiç puan almayan 6,00 sayılır
create or replace view public.season_leaderboard as
select pr.username, sp.user_id, sp.locked_at,
  round(avg(coalesce(s.avg_since, 6.0)), 2) as score,
  sum(coalesce(s.apps_since, 0))::int as apps
from public.season_picks sp
join public.profiles pr on pr.id = sp.user_id
join public.season_player_scores s on s.user_id = sp.user_id
where sp.locked_at is not null
group by pr.username, sp.user_id, sp.locked_at;
grant select on public.season_leaderboard to anon, authenticated;
