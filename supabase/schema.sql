-- Sharefs : schéma Supabase. Tables préfixées sharefs_ pour cohabiter avec un projet existant.
-- Script rejouable sans erreur.

create table if not exists public.sharefs_profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null default '' check (char_length(name) <= 40),
  data jsonb not null default '{"done":{},"want":{},"shares":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.sharefs_circles (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.sharefs_circle_members (
  circle_id uuid references public.sharefs_circles on delete cascade,
  user_id uuid references auth.users on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);

alter table public.sharefs_profiles enable row level security;
alter table public.sharefs_circles enable row level security;
alter table public.sharefs_circle_members enable row level security;

create or replace function public.sharefs_my_circles() returns setof uuid
language sql stable security definer set search_path = public as $$
  select circle_id from sharefs_circle_members where user_id = auth.uid()
$$;

create or replace function public.sharefs_shares_circle(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from sharefs_circle_members a join sharefs_circle_members b on a.circle_id = b.circle_id
    where a.user_id = auth.uid() and b.user_id = other
  )
$$;

drop policy if exists "sharefs_profiles_read" on public.sharefs_profiles;
drop policy if exists "sharefs_profiles_insert" on public.sharefs_profiles;
drop policy if exists "sharefs_profiles_update" on public.sharefs_profiles;
drop policy if exists "sharefs_circles_read" on public.sharefs_circles;
drop policy if exists "sharefs_members_read" on public.sharefs_circle_members;
drop policy if exists "sharefs_members_leave" on public.sharefs_circle_members;

create policy "sharefs_profiles_read" on public.sharefs_profiles for select to authenticated
  using (id = auth.uid() or public.sharefs_shares_circle(id));
create policy "sharefs_profiles_insert" on public.sharefs_profiles for insert to authenticated
  with check (id = auth.uid());
create policy "sharefs_profiles_update" on public.sharefs_profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy "sharefs_circles_read" on public.sharefs_circles for select to authenticated
  using (id in (select public.sharefs_my_circles()));
create policy "sharefs_members_read" on public.sharefs_circle_members for select to authenticated
  using (circle_id in (select public.sharefs_my_circles()));
create policy "sharefs_members_leave" on public.sharefs_circle_members for delete to authenticated
  using (user_id = auth.uid());

create or replace function public.sharefs_create_circle() returns text
language plpgsql security definer set search_path = public as $$
declare c text; cid uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  loop
    c := upper(substr(md5(gen_random_uuid()::text), 1, 6));
    exit when not exists (select 1 from sharefs_circles where code = c);
  end loop;
  insert into sharefs_circles (code, created_by) values (c, auth.uid()) returning id into cid;
  insert into sharefs_circle_members (circle_id, user_id) values (cid, auth.uid());
  return c;
end $$;

create or replace function public.sharefs_join_circle(p_code text) returns boolean
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select id into cid from sharefs_circles where code = upper(trim(p_code));
  if cid is null then return false; end if;
  insert into sharefs_circle_members (circle_id, user_id) values (cid, auth.uid()) on conflict do nothing;
  return true;
end $$;

-- Supprime les données Sharefs et le compte. Attention : si d'autres apps partagent ce projet
-- Supabase, le compte auth y est aussi supprimé.
create or replace function public.sharefs_delete_me() returns void
language sql security definer set search_path = public, auth as $$
  delete from auth.users where id = auth.uid();
$$;

revoke all on function public.sharefs_create_circle(), public.sharefs_join_circle(text), public.sharefs_delete_me() from public, anon;
grant execute on function public.sharefs_create_circle(), public.sharefs_join_circle(text), public.sharefs_delete_me() to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.sharefs_profiles;
exception when duplicate_object then null;
end $$;
