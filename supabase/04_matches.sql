-- 04: Haftanın maç programı (herkes okur, yönetici yazar)
create table if not exists public.matches (
  id bigint generated always as identity primary key,
  week_id int not null references public.weeks(id) on delete cascade,
  kickoff timestamptz not null,
  home text not null,
  away text not null,
  stadium text
);
alter table public.matches enable row level security;
drop policy if exists matches_read on public.matches;
create policy matches_read on public.matches for select using (true);
drop policy if exists matches_admin on public.matches;
create policy matches_admin on public.matches for all using (public.is_admin()) with check (public.is_admin());
grant select on public.matches to anon, authenticated;
grant insert, update, delete on public.matches to authenticated;
