-- =====================================================================
-- Sharefs — schéma Supabase (Postgres + RLS)
-- À exécuter une fois dans Supabase > SQL Editor.
-- Toutes les écritures sensibles passent par des fonctions RPC : quota
-- mensuel, délais, avis scellés et paris sont garantis côté serveur.
-- =====================================================================
create extension if not exists pgcrypto;

-- ---------- Tables ----------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 40),
  avatar_url text,
  email_reminders boolean not null default true,
  last_digest_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.circles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  invite_code text not null unique default encode(gen_random_bytes(6), 'hex'),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.circle_members (
  circle_id uuid not null references public.circles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);

create table public.works (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('livre','film','serie','jeu')),
  title text not null check (char_length(title) between 1 and 200),
  creator text,
  year int check (year between 1000 and 2200),
  cover_url text check (cover_url is null or cover_url ~* '^https://'),
  synopsis text,
  source text,
  external_id text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (source, external_id)
);

create table public.library_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  work_id uuid not null references public.works(id) on delete cascade,
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  unique (user_id, work_id)
);

create table public.recos (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  work_id uuid not null references public.works(id),
  month text not null default to_char(now() at time zone 'Europe/Paris', 'YYYY-MM'),
  why text check (char_length(why) <= 500),
  pitch text check (char_length(pitch) <= 500),
  effort text check (char_length(effort) <= 80),
  link text check (link is null or link ~* '^https://'),
  reply_to uuid references public.recos(id) on delete set null,
  sent_at timestamptz not null default now()
);
-- Une reco par mois et par salon (les réponses ne comptent pas)
create unique index recos_one_per_month on public.recos (circle_id, sender_id, month) where reply_to is null;
-- Une seule réponse par reco reçue
create unique index recos_one_reply on public.recos (sender_id, reply_to) where reply_to is not null;
create index recos_circle_sent on public.recos (circle_id, sent_at desc);

-- Ce que l'expéditeur garde secret jusqu'à ce qu'on ait fini : sa note et son pari
create table public.reco_secrets (
  reco_id uuid primary key references public.recos(id) on delete cascade,
  sender_rating smallint check (sender_rating between 1 and 5),
  bet smallint check (bet between 1 and 5)
);

create table public.challenges (
  reco_id uuid not null references public.recos(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active','done','dropped')),
  invited boolean not null default true,
  started_at timestamptz not null default now(),
  deadline timestamptz not null,
  joker_used boolean not null default false,
  done_at timestamptz,
  primary key (reco_id, user_id)
);
create index challenges_user on public.challenges (user_id, status, deadline);

create table public.reviews (
  reco_id uuid not null references public.recos(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text check (char_length(body) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (reco_id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  reco_id uuid not null references public.recos(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index messages_reco on public.messages (reco_id, created_at);

-- ---------- Profil créé à l'inscription ------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    left(coalesce(nullif(new.raw_user_meta_data->>'full_name',''), nullif(new.raw_user_meta_data->>'name',''), split_part(new.email,'@',1), ''), 40),
    nullif(new.raw_user_meta_data->>'avatar_url','')
  ) on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Fonctions d'accès (utilisées par les policies) -----------
create or replace function public.is_member(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from circle_members where circle_id = c and user_id = auth.uid())
$$;

create or replace function public.shares_circle(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from circle_members a join circle_members b on a.circle_id = b.circle_id
    where a.user_id = auth.uid() and b.user_id = u)
$$;

create or replace function public.reco_circle(r uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select circle_id from recos where id = r
$$;

-- Débloqué = j'ai envoyé la reco, ou je l'ai terminée (et notée)
create or replace function public.is_unlocked(r uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from recos where id = r and sender_id = auth.uid())
      or exists (select 1 from reviews where reco_id = r and user_id = auth.uid())
$$;

-- ---------- RPC : salons --------------------------------------------
create or replace function public.create_circle(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  insert into circles (name, created_by) values (trim(p_name), auth.uid()) returning id into v;
  insert into circle_members (circle_id, user_id, role) values (v, auth.uid(), 'owner');
  return v;
end $$;

create or replace function public.circle_preview(p_code text)
returns table (id uuid, name text, members bigint, is_member boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.name,
    (select count(*) from circle_members m where m.circle_id = c.id),
    exists (select 1 from circle_members m where m.circle_id = c.id and m.user_id = auth.uid())
  from circles c where c.invite_code = lower(trim(p_code))
$$;

create or replace function public.join_circle(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  select id into v from circles where invite_code = lower(trim(p_code));
  if v is null then raise exception 'Code d''invitation inconnu'; end if;
  insert into circle_members (circle_id, user_id) values (v, auth.uid()) on conflict do nothing;
  return v;
end $$;

-- ---------- RPC : catalogue ------------------------------------------
create or replace function public.ensure_work(
  p_kind text, p_title text, p_creator text, p_year int, p_cover text,
  p_synopsis text, p_source text, p_external_id text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if p_source is not null and p_external_id is not null then
    select id into v from works where source = p_source and external_id = p_external_id;
    if v is not null then return v; end if;
  end if;
  insert into works (kind, title, creator, year, cover_url, synopsis, source, external_id, created_by)
  values (p_kind, trim(p_title), nullif(trim(p_creator),''), p_year,
          case when p_cover ~* '^https://' then p_cover end, left(p_synopsis, 1200),
          p_source, p_external_id, auth.uid())
  returning id into v;
  return v;
end $$;

-- ---------- RPC : envoyer une reco (ou y répondre) --------------------
create or replace function public.send_reco(
  p_circle uuid, p_work uuid, p_recipients uuid[], p_why text, p_pitch text,
  p_effort text, p_link text, p_rating int, p_bet int, p_reply_to uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_me uuid := auth.uid(); v_to uuid[]; v_circle uuid := p_circle; v_src recos%rowtype;
begin
  if v_me is null then raise exception 'Connexion requise'; end if;
  if p_reply_to is not null then
    select * into v_src from recos where id = p_reply_to;
    if not found then raise exception 'Référence introuvable'; end if;
    if not exists (select 1 from challenges where reco_id = p_reply_to and user_id = v_me and status = 'done') then
      raise exception 'Termine la référence avant d''y répondre';
    end if;
    v_circle := v_src.circle_id;
    v_to := array[v_src.sender_id];
  else
    select coalesce(array_agg(distinct x), '{}') into v_to
    from unnest(coalesce(p_recipients, '{}')) x
    where x <> v_me and exists (select 1 from circle_members m where m.circle_id = v_circle and m.user_id = x);
  end if;
  if not exists (select 1 from circle_members where circle_id = v_circle and user_id = v_me) then
    raise exception 'Tu ne fais pas partie de ce salon';
  end if;
  if coalesce(array_length(v_to, 1), 0) = 0 then raise exception 'Choisis au moins un destinataire'; end if;
  if nullif(trim(p_link),'') is not null and trim(p_link) !~* '^https://' then
    raise exception 'Le lien doit commencer par https://';
  end if;
  begin
    insert into recos (circle_id, sender_id, work_id, why, pitch, effort, link, reply_to)
    values (v_circle, v_me, p_work, nullif(trim(p_why),''), nullif(trim(p_pitch),''),
            nullif(trim(p_effort),''), nullif(trim(p_link),''), p_reply_to)
    returning id into v_id;
  exception when unique_violation then
    if p_reply_to is null then raise exception 'Tu as déjà envoyé ta référence du mois dans ce salon';
    else raise exception 'Tu as déjà répondu à cette référence'; end if;
  end;
  insert into reco_secrets (reco_id, sender_rating, bet) values (v_id, nullif(p_rating, 0), nullif(p_bet, 0));
  insert into challenges (reco_id, user_id, invited, deadline)
    select v_id, x, true, now() + interval '30 days' from unnest(v_to) x;
  insert into library_items (user_id, work_id) values (v_me, p_work) on conflict do nothing;
  return v_id;
end $$;

-- ---------- RPC : défis ----------------------------------------------
create or replace function public.join_challenge(p_reco uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r recos%rowtype;
begin
  select * into r from recos where id = p_reco;
  if not found or not is_member(r.circle_id) then raise exception 'Référence introuvable'; end if;
  if r.sender_id = auth.uid() then raise exception 'C''est ta propre recommandation'; end if;
  insert into challenges (reco_id, user_id, invited, deadline)
  values (p_reco, auth.uid(), false, now() + interval '30 days') on conflict do nothing;
end $$;

create or replace function public.finish_challenge(p_reco uuid, p_rating int, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare r recos%rowtype;
begin
  select * into r from recos where id = p_reco;
  if not found or not is_member(r.circle_id) then raise exception 'Référence introuvable'; end if;
  if r.sender_id = auth.uid() then raise exception 'C''est ta propre recommandation'; end if;
  if p_rating is null or p_rating not between 1 and 5 then raise exception 'Donne une note de 1 à 5'; end if;
  insert into challenges (reco_id, user_id, invited, deadline, status, done_at)
  values (p_reco, auth.uid(), false, now(), 'done', now())
  on conflict (reco_id, user_id) do update set status = 'done', done_at = coalesce(challenges.done_at, now());
  insert into reviews (reco_id, user_id, rating, body) values (p_reco, auth.uid(), p_rating, nullif(trim(p_body),''))
  on conflict (reco_id, user_id) do update set rating = excluded.rating, body = excluded.body, updated_at = now();
end $$;

create or replace function public.use_joker(p_reco uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update challenges set deadline = deadline + interval '15 days', joker_used = true
  where reco_id = p_reco and user_id = auth.uid() and status = 'active' and not joker_used;
  if not found then raise exception 'Joker indisponible pour ce défi'; end if;
end $$;

create or replace function public.set_challenge_status(p_reco uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('active','dropped') then raise exception 'Statut invalide'; end if;
  update challenges set status = p_status
  where reco_id = p_reco and user_id = auth.uid() and status in ('active','dropped');
  if not found then raise exception 'Défi introuvable'; end if;
end $$;

-- ---------- Row Level Security ---------------------------------------
alter table public.profiles enable row level security;
alter table public.circles enable row level security;
alter table public.circle_members enable row level security;
alter table public.works enable row level security;
alter table public.library_items enable row level security;
alter table public.recos enable row level security;
alter table public.reco_secrets enable row level security;
alter table public.challenges enable row level security;
alter table public.reviews enable row level security;
alter table public.messages enable row level security;

create policy profiles_read on public.profiles for select using (id = auth.uid() or public.shares_circle(id));
create policy profiles_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy circles_read on public.circles for select using (public.is_member(id));
create policy circles_rename on public.circles for update
  using (exists (select 1 from public.circle_members m where m.circle_id = id and m.user_id = auth.uid() and m.role = 'owner'));

create policy members_read on public.circle_members for select using (public.is_member(circle_id));
create policy members_leave on public.circle_members for delete using (user_id = auth.uid());

create policy works_read on public.works for select to authenticated using (true);

create policy library_read on public.library_items for select using (user_id = auth.uid() or public.shares_circle(user_id));
create policy library_insert on public.library_items for insert with check (user_id = auth.uid());
create policy library_update on public.library_items for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy library_delete on public.library_items for delete using (user_id = auth.uid());

create policy recos_read on public.recos for select using (public.is_member(circle_id));
create policy secrets_read on public.reco_secrets for select using (public.is_unlocked(reco_id));
create policy challenges_read on public.challenges for select using (public.is_member(public.reco_circle(reco_id)));

-- Avis scellés : visibles seulement par leur auteur, l'expéditeur, et ceux qui ont fini
create policy reviews_read on public.reviews for select
  using (user_id = auth.uid() or (public.is_member(public.reco_circle(reco_id)) and public.is_unlocked(reco_id)));

-- Salon : réservé à l'expéditeur et à ceux qui ont fini
create policy messages_read on public.messages for select
  using (public.is_member(public.reco_circle(reco_id)) and public.is_unlocked(reco_id));
create policy messages_insert on public.messages for insert
  with check (user_id = auth.uid() and public.is_member(public.reco_circle(reco_id)) and public.is_unlocked(reco_id));

-- ---------- Droits d'accès explicites --------------------------------
-- Compatible avec l'option « Automatically expose new tables » décochée :
-- chaque rôle reçoit uniquement ce dont l'app a besoin. La RLS filtre ensuite les lignes.
revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant usage on schema public to authenticated, service_role;

grant select on public.profiles to authenticated;
grant update (display_name, email_reminders) on public.profiles to authenticated;
grant select on public.circles to authenticated;
grant update (name) on public.circles to authenticated;
grant select, delete on public.circle_members to authenticated;
grant select on public.works to authenticated;
grant select, insert, delete on public.library_items to authenticated;
grant update (note) on public.library_items to authenticated;
grant select on public.recos, public.reco_secrets, public.challenges, public.reviews to authenticated;
grant select, insert on public.messages to authenticated;

grant execute on function
  public.is_member(uuid), public.shares_circle(uuid), public.reco_circle(uuid), public.is_unlocked(uuid),
  public.create_circle(text), public.circle_preview(text), public.join_circle(text),
  public.ensure_work(text, text, text, int, text, text, text, text),
  public.send_reco(uuid, uuid, uuid[], text, text, text, text, int, int, uuid),
  public.join_challenge(uuid), public.finish_challenge(uuid, int, text),
  public.use_joker(uuid), public.set_challenge_status(uuid, text)
to authenticated;

-- E-mail quotidien (route cron, clé service_role)
grant select on all tables in schema public to service_role;
grant update (last_digest_at) on public.profiles to service_role;

-- ---------- Temps réel pour le salon ---------------------------------
alter publication supabase_realtime add table public.messages;
