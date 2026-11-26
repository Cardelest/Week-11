-- 05: Oyuncu durumu (sakat/cezalı/şüpheli) + ligde kimin kadro kurduğu
alter table public.players add column if not exists status text check (status in ('sakat','cezali','supheli'));
alter table public.players add column if not exists status_note text;

create or replace function public.league_ready(l bigint, w int)
returns setof uuid language sql stable security definer set search_path = public as $$
  select p.user_id from public.predictions p
  join public.league_members m on m.user_id = p.user_id and m.league_id = l
  where p.week_id = w and public.is_league_member(l);
$$;
revoke execute on function public.league_ready(bigint, int) from public, anon;
grant execute on function public.league_ready(bigint, int) to authenticated;
