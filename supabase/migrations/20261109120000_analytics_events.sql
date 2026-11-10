-- Studovna FBMI – privacy-friendly analytics (referenční kopie)
-- Nasazeno na projekt prokop-studium. Soubor je v repu kvůli revizi;
-- INSERT z prohlížeče musí mít Prefer: return=minimal (anon nemá SELECT).
-- Projekt: prokop-studium (keguwppdetlgfzozngvk)
-- Žádná osobní data: žádné IP, e-maily, jména. Jen anonymní ID.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Hlavní tabulka událostí
-- ---------------------------------------------------------------------------
create table if not exists public.analytics_events (
  id            bigserial primary key,
  occurred_at   timestamptz not null default now(),
  received_at   timestamptz not null default now(),
  session_id    uuid not null,
  visitor_id    uuid,                     -- volitelné, localStorage
  event_name    text not null,
  page_path     text not null,
  page_title    text,
  referrer_host text,                     -- jen hostname, ne plná URL
  device_type   text check (device_type in ('mobile','tablet','desktop','unknown')),
  props         jsonb not null default '{}'::jsonb
);

comment on table public.analytics_events is
  'Anonymní události studovny. Bez IP, e-mailů a jmen.';

create index if not exists analytics_events_occurred_at_idx
  on public.analytics_events (occurred_at desc);
create index if not exists analytics_events_event_name_idx
  on public.analytics_events (event_name);
create index if not exists analytics_events_page_path_idx
  on public.analytics_events (page_path);
create index if not exists analytics_events_session_idx
  on public.analytics_events (session_id);
create index if not exists analytics_events_visitor_idx
  on public.analytics_events (visitor_id)
  where visitor_id is not null;
create index if not exists analytics_events_props_gin
  on public.analytics_events using gin (props);

-- ---------------------------------------------------------------------------
-- RLS: anon smí jen INSERT; SELECT jen pro admina (user_roles.role = admin)
-- ---------------------------------------------------------------------------
alter table public.analytics_events enable row level security;

-- Žádný SELECT pro anon / authenticated běžné uživatele
revoke all on public.analytics_events from anon, authenticated;
grant insert on public.analytics_events to anon, authenticated;
grant usage, select on sequence public.analytics_events_id_seq to anon, authenticated;
grant select on public.analytics_events to authenticated;

drop policy if exists "analytics_anon_insert" on public.analytics_events;
create policy "analytics_anon_insert"
  on public.analytics_events
  for insert
  to anon, authenticated
  with check (
    session_id is not null
    and event_name <> ''
    and page_path <> ''
    and char_length(event_name) <= 64
    and char_length(page_path) <= 512
    and (props is null or pg_column_size(props) < 4096)
  );

drop policy if exists "analytics_admin_select" on public.analytics_events;
create policy "analytics_admin_select"
  on public.analytics_events
  for select
  to authenticated
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and ur.role = 'admin'
    )
  );

-- Žádný UPDATE / DELETE přes API
drop policy if exists "analytics_no_update" on public.analytics_events;
drop policy if exists "analytics_no_delete" on public.analytics_events;

-- ---------------------------------------------------------------------------
-- Agregační pohledy (security_invoker = respektují RLS vlastníka dotazu)
-- ---------------------------------------------------------------------------
create or replace view public.analytics_daily
  with (security_invoker = true)
as
select
  date_trunc('day', occurred_at)::date as day,
  count(*) filter (where event_name = 'page_view') as page_views,
  count(distinct session_id) filter (where event_name = 'page_view') as sessions,
  count(distinct visitor_id) filter (where event_name = 'page_view') as visitors
from public.analytics_events
group by 1
order by 1 desc;

create or replace view public.analytics_top_pages
  with (security_invoker = true)
as
select
  page_path,
  coalesce(max(page_title), page_path) as page_title,
  count(*) filter (where event_name = 'page_view') as views,
  count(distinct session_id) filter (where event_name = 'page_view') as sessions,
  round(avg((props->>'active_sec')::numeric)
    filter (where event_name = 'engaged_time' and (props->>'active_sec') ~ '^[0-9]+(\.[0-9]+)?$'), 1)
    as avg_active_sec,
  round(avg((props->>'depth_pct')::numeric)
    filter (where event_name = 'scroll_depth' and (props->>'depth_pct') ~ '^[0-9]+(\.[0-9]+)?$'), 1)
    as avg_scroll_pct
from public.analytics_events
group by page_path
order by views desc nulls last;

create or replace view public.analytics_feature_usage
  with (security_invoker = true)
as
select
  event_name,
  coalesce(props->>'feature', props->>'tool', props->>'name', '') as feature,
  count(*) as events,
  count(distinct session_id) as sessions
from public.analytics_events
where event_name in (
  'feature_use','search','anki_download','pomodoro',
  'sim_test_start','sim_test_finish','lesson_mode',
  'exercise_answer','tahak_section','backup'
)
group by 1, 2
order by events desc;

create or replace view public.analytics_devices
  with (security_invoker = true)
as
select
  coalesce(device_type, 'unknown') as device_type,
  count(distinct session_id) as sessions
from public.analytics_events
where event_name = 'page_view'
group by 1
order by sessions desc;

create or replace view public.analytics_referrers
  with (security_invoker = true)
as
select
  coalesce(nullif(referrer_host, ''), '(přímý / interní)') as referrer_host,
  count(*) filter (where event_name = 'page_view') as views,
  count(distinct session_id) as sessions
from public.analytics_events
group by 1
order by views desc;

create or replace view public.analytics_searches
  with (security_invoker = true)
as
select
  lower(trim(props->>'q')) as query,
  count(*) as searches,
  count(distinct session_id) as sessions
from public.analytics_events
where event_name = 'search'
  and coalesce(props->>'q', '') <> ''
  and char_length(trim(props->>'q')) >= 2
group by 1
order by searches desc
limit 100;

-- Pohledy: SELECT jen authenticated (RLS na tabulce je i tak vynucené)
revoke all on public.analytics_daily from anon, public;
revoke all on public.analytics_top_pages from anon, public;
revoke all on public.analytics_feature_usage from anon, public;
revoke all on public.analytics_devices from anon, public;
revoke all on public.analytics_referrers from anon, public;
revoke all on public.analytics_searches from anon, public;
grant select on public.analytics_daily to authenticated;
grant select on public.analytics_top_pages to authenticated;
grant select on public.analytics_feature_usage to authenticated;
grant select on public.analytics_devices to authenticated;
grant select on public.analytics_referrers to authenticated;
grant select on public.analytics_searches to authenticated;
