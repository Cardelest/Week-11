-- 09: Haftanın soruları (7 soru, her doğru +2 puan, iki sıralamaya da eklenir)
create table if not exists public.bonus_answers (
  user_id uuid not null references public.profiles(id) on update cascade on delete cascade,
  week_id int not null references public.weeks(id) on delete cascade,
  q text not null check (q in ('team_goals','top_scorer','top_assist','top_saves','red_card','most_goals_match','fewest_goals_match')),
  answer text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, week_id, q)
);
alter table public.bonus_answers enable row level security;
drop policy if exists ba_read on public.bonus_answers;
create policy ba_read on public.bonus_answers for select using (user_id = auth.uid() or public.week_closed(week_id));
drop policy if exists ba_insert on public.bonus_answers;
create policy ba_insert on public.bonus_answers for insert with check (user_id = auth.uid() and not public.week_closed(week_id));
drop policy if exists ba_update on public.bonus_answers;
create policy ba_update on public.bonus_answers for update using (user_id = auth.uid() and not public.week_closed(week_id)) with check (user_id = auth.uid() and not public.week_closed(week_id));
drop policy if exists ba_delete on public.bonus_answers;
create policy ba_delete on public.bonus_answers for delete using (user_id = auth.uid() and not public.week_closed(week_id));
grant select, insert, update, delete on public.bonus_answers to authenticated;

create table if not exists public.bonus_results (
  week_id int not null references public.weeks(id) on delete cascade,
  q text not null,
  answer text not null,
  primary key (week_id, q, answer)
);
alter table public.bonus_results enable row level security;
drop policy if exists br_read on public.bonus_results;
create policy br_read on public.bonus_results for select using (true);
drop policy if exists br_admin on public.bonus_results;
create policy br_admin on public.bonus_results for all using (public.is_admin()) with check (public.is_admin());
grant select on public.bonus_results to anon, authenticated;
grant insert, update, delete on public.bonus_results to authenticated;

drop view if exists public.leaderboard;
drop view if exists public.week_scores;
create view public.week_scores as
select p.user_id, p.week_id, s.source,
  ( (select coalesce(sum(case when x = p.captain then 4 else 2 end), 0) from unnest(p.picks) x
       where exists (select 1 from public.team_of_week t where t.week_id = p.week_id and t.source = s.source and t.player_id = x))
  + (select count(*) from unnest(coalesce(p.subs, '{}'::bigint[])) y
       where y is not null and exists (select 1 from public.team_of_week t where t.week_id = p.week_id and t.source = s.source and t.player_id = y))
  + 2 * (select count(*) from public.bonus_answers a
       where a.user_id = p.user_id and a.week_id = p.week_id
         and exists (select 1 from public.bonus_results r where r.week_id = a.week_id and r.q = a.q and r.answer = a.answer))
  )::numeric(5,1) as points
from public.predictions p
cross join (values ('veri'), ('taraftar')) as s(source)
join public.weeks w on w.id = p.week_id
where w.deadline <= now()
  and exists (select 1 from public.team_of_week t where t.week_id = p.week_id and t.source = s.source);

create view public.leaderboard as
select ws.source, ws.user_id, pr.username,
  sum(ws.points)::numeric(7,1) as total,
  count(*)::int as weeks_played,
  (array_agg(ws.points order by ws.week_id desc))[1] as last_week_points
from public.week_scores ws
join public.profiles pr on pr.id = ws.user_id
group by ws.source, ws.user_id, pr.username;

grant select on public.week_scores, public.leaderboard to anon, authenticated;
