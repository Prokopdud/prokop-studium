-- Local-only stubs so the progress migration can be tested without Supabase.
-- Not part of the production migration. The live project already has these objects.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated noinherit nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon noinherit nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role noinherit nologin bypassrls;
  end if;
end $$;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'user' check (role in ('admin', 'moderator', 'user')),
  created_at timestamptz not null default now()
);

alter table public.user_roles enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role in ('admin', 'moderator')
  );
$$;

create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select role from public.user_roles where user_id = auth.uid()),
    'user'
  );
$$;

revoke all on function public.is_admin() from public;
revoke all on function public.is_staff() from public;
revoke all on function public.my_role() from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.my_role() to authenticated;
