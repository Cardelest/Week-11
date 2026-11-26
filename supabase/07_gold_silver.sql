-- 07: Altın 11 (picks) + Gümüş 11 (subs) puanlaması. did_not_play artık puanlamada kullanılmıyor.
-- Altın'dan 11'e giren: 2 puan (kaptansa 4). Gümüş'ten 11'e giren: 1 puan.
drop view if exists public.leaderboard;
drop view if exists public.week_scores;
create view public.week_scores as
select p.user_id, p.week_id, s.source,
  ( (select coalesce(sum(case when x = p.captain then 4 else 2 end), 0) from unnest(p.picks) x
       where exists (select 1 from public.team_of_week t where t.week_id = p.week_id and t.source = s.source and t.player_id = x))
  + (select count(*) from unnest(coalesce(p.subs, '{}'::bigint[])) y
       where y is not null and exists (select 1 from public.team_of_week t where t.week_id = p.week_id and t.source = s.source and t.player_id = y))
  )::numeric(4,1) as points
from public.predictions p
cross join (values ('veri'), ('taraftar')) as s(source)
join public.weeks w on w.id = p.week_id
where w.deadline <= now()
  and exists (select 1 from public.team_of_week t where t.week_id = p.week_id and t.source = s.source);

create view public.leaderboard as
select ws.source, ws.user_id, pr.username,
  sum(ws.points)::numeric(6,1) as total,
  count(*)::int as weeks_played,
  (array_agg(ws.points order by ws.week_id desc))[1] as last_week_points
from public.week_scores ws
join public.profiles pr on pr.id = ws.user_id
group by ws.source, ws.user_id, pr.username;

grant select on public.week_scores, public.leaderboard to anon, authenticated;
