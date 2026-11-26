-- 06: Yedekler (her asın bir yedeği) + oynamayanlar + 0,5 puanlı yedek puanlaması
alter table public.predictions add column if not exists subs bigint[];
alter table public.predictions drop constraint if exists predictions_subs_check;
alter table public.predictions add constraint predictions_subs_check
  check (subs is null or (array_length(subs, 1) = 11 and not (subs && picks)));

create table if not exists public.did_not_play (
  week_id int not null references public.weeks(id) on delete cascade,
  player_id bigint not null references public.players(id) on delete cascade,
  primary key (week_id, player_id)
);
alter table public.did_not_play enable row level security;
drop policy if exists dnp_read on public.did_not_play;
create policy dnp_read on public.did_not_play for select using (true);
drop policy if exists dnp_admin on public.did_not_play;
create policy dnp_admin on public.did_not_play for all using (public.is_admin()) with check (public.is_admin());
grant select on public.did_not_play to anon, authenticated;
grant insert, update, delete on public.did_not_play to authenticated;

drop view if exists public.leaderboard;
drop view if exists public.week_scores;
create view public.week_scores as
select p.user_id, p.week_id, s.source,
  coalesce(sum(
    case
      when not exists (select 1 from public.did_not_play d where d.week_id = p.week_id and d.player_id = x.pid) then
        case when exists (select 1 from public.team_of_week t where t.week_id = p.week_id and t.source = s.source and t.player_id = x.pid)
             then case when x.pid = p.captain then 2 else 1 end else 0 end
      when x.sub is not null
        and exists (select 1 from public.team_of_week t where t.week_id = p.week_id and t.source = s.source and t.player_id = x.sub)
        then 0.5
      else 0
    end), 0)::numeric(4,1) as points
from public.predictions p
cross join (values ('veri'), ('taraftar')) as s(source)
join public.weeks w on w.id = p.week_id
cross join lateral (select p.picks[i] as pid, p.subs[i] as sub from generate_series(1, 11) i) x
where w.deadline <= now()
  and exists (select 1 from public.team_of_week t where t.week_id = p.week_id and t.source = s.source)
group by p.user_id, p.week_id, s.source;

create view public.leaderboard as
select ws.source, ws.user_id, pr.username,
  sum(ws.points)::numeric(6,1) as total,
  count(*)::int as weeks_played,
  (array_agg(ws.points order by ws.week_id desc))[1] as last_week_points
from public.week_scores ws
join public.profiles pr on pr.id = ws.user_id
group by ws.source, ws.user_id, pr.username;

grant select on public.week_scores, public.leaderboard to anon, authenticated;
