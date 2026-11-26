-- 03: Şifreyle hesap kurtarma + arkadaşlara özel ligler
create extension if not exists pgcrypto with schema extensions;

-- Profil kimliği değişebilsin (hesap başka cihaza taşınınca tahminler de taşınsın)
alter table public.predictions drop constraint if exists predictions_user_id_fkey;
alter table public.predictions add constraint predictions_user_id_fkey
  foreign key (user_id) references public.profiles(id) on update cascade on delete cascade;

-- Şifreler ayrı tabloda, istemci hiçbir şekilde okuyamaz (RLS açık, politika ve yetki yok)
create table if not exists public.account_secrets (
  user_id uuid primary key references public.profiles(id) on update cascade on delete cascade,
  pass_hash text not null,
  failed int not null default 0,
  locked_until timestamptz
);
alter table public.account_secrets enable row level security;
revoke all on public.account_secrets from anon, authenticated;

create or replace function public.has_password()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.account_secrets where user_id = auth.uid());
$$;

create or replace function public.set_password(p text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null or not exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'Önce kullanıcı adı oluştur';
  end if;
  if length(coalesce(p, '')) < 6 then raise exception 'Şifre en az 6 karakter olmalı'; end if;
  insert into public.account_secrets (user_id, pass_hash) values (auth.uid(), crypt(p, gen_salt('bf')))
  on conflict (user_id) do update set pass_hash = excluded.pass_hash, failed = 0, locked_until = null;
end $$;

-- Yeni cihazda: anonim oturum açılır, sonra kullanıcı adı + şifre ile eski profil bu oturuma taşınır
create or replace function public.claim_account(u text, p text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare old_id uuid; s public.account_secrets;
begin
  if auth.uid() is null then raise exception 'Oturum yok'; end if;
  if exists (select 1 from public.profiles where id = auth.uid()) then raise exception 'Bu cihazda zaten bir hesap açık'; end if;
  select id into old_id from public.profiles where lower(username) = lower(trim(u));
  if old_id is null then return false; end if;
  select * into s from public.account_secrets where user_id = old_id;
  if s is null then return false; end if;
  if s.locked_until is not null and s.locked_until > now() then raise exception 'Çok fazla deneme. 15 dakika sonra tekrar dene.'; end if;
  if s.pass_hash <> crypt(p, s.pass_hash) then
    update public.account_secrets set
      locked_until = case when failed + 1 >= 5 then now() + interval '15 minutes' else null end,
      failed = case when failed + 1 >= 5 then 0 else failed + 1 end
    where user_id = old_id;
    return false;
  end if;
  update public.profiles set id = auth.uid() where id = old_id;  -- tahminler, ligler, şifre zincirleme taşınır
  update public.account_secrets set failed = 0, locked_until = null where user_id = auth.uid();
  return true;
end $$;

-- Özel ligler
create table if not exists public.leagues (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 3 and 30),
  code text not null unique,
  owner uuid not null references public.profiles(id) on update cascade on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.league_members (
  league_id bigint not null references public.leagues(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on update cascade on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);
alter table public.leagues enable row level security;
alter table public.league_members enable row level security;

create or replace function public.is_league_member(l bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.league_members where league_id = l and user_id = auth.uid());
$$;

drop policy if exists leagues_read on public.leagues;
create policy leagues_read on public.leagues for select using (public.is_league_member(id));
drop policy if exists lm_read on public.league_members;
create policy lm_read on public.league_members for select using (public.is_league_member(league_id));
drop policy if exists lm_leave on public.league_members;
create policy lm_leave on public.league_members for delete using (user_id = auth.uid());

revoke all on public.leagues, public.league_members from anon, authenticated;
grant select on public.leagues, public.league_members to authenticated;
grant delete on public.league_members to authenticated;

create or replace function public.create_league(n text)
returns text language plpgsql security definer set search_path = public as $$
declare c text; lid bigint;
begin
  if not exists (select 1 from public.profiles where id = auth.uid()) then raise exception 'Önce kullanıcı adı oluştur'; end if;
  if char_length(trim(n)) not between 3 and 30 then raise exception 'Lig adı 3-30 karakter olmalı'; end if;
  if (select count(*) from public.leagues where owner = auth.uid()) >= 10 then raise exception 'En fazla 10 lig kurabilirsin'; end if;
  loop
    c := substr(translate(upper(encode(extensions.gen_random_bytes(8), 'base64')), '+/=0O1IL', ''), 1, 6);
    exit when length(c) = 6 and not exists (select 1 from public.leagues where code = c);
  end loop;
  insert into public.leagues (name, code, owner) values (trim(n), c, auth.uid()) returning id into lid;
  insert into public.league_members (league_id, user_id) values (lid, auth.uid());
  return c;
end $$;

create or replace function public.join_league(c text)
returns bigint language plpgsql security definer set search_path = public as $$
declare lid bigint;
begin
  if not exists (select 1 from public.profiles where id = auth.uid()) then raise exception 'Önce kullanıcı adı oluştur'; end if;
  select id into lid from public.leagues where code = upper(trim(c));
  if lid is null then raise exception 'Bu kodla bir lig bulunamadı'; end if;
  if (select count(*) from public.league_members where league_id = lid) >= 200 then raise exception 'Bu lig dolu'; end if;
  insert into public.league_members (league_id, user_id) values (lid, auth.uid()) on conflict do nothing;
  return lid;
end $$;

revoke execute on function public.has_password(), public.set_password(text), public.claim_account(text, text),
  public.create_league(text), public.join_league(text), public.is_league_member(bigint) from public, anon;
grant execute on function public.has_password(), public.set_password(text), public.claim_account(text, text),
  public.create_league(text), public.join_league(text), public.is_league_member(bigint) to authenticated;
