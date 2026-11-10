-- Studovna FBMI – postup, XP, kamarádi, žebříčky a komentáře lektorů
-- NENÍ nasazeno na projekt keguwppdetlgfzozngvk. Vlastník migraci aplikuje až po schválení.
--
-- Předpoklady, které už v projektu jsou a tahle migrace je nemění:
--   public.user_roles(user_id, role, created_at)
--   public.is_staff(), public.is_admin(), public.my_role()
--   public.handle_new_user_role()
--
-- Bez e-mailů a občanských jmen. Žebříček ukazuje jen přezdívku, úroveň a XP.
-- XP zapisuje jen kód v schématu private (SECURITY DEFINER). Schéma private
-- nesmí být v Exposed schemas – z Data API se volají jen obálky ve public.
-- Obálky jsou SECURITY INVOKER a jen předají volání do private.

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant usage on schema private to service_role';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Čas v Evropě/Praha (týden = pondělí–neděle)
-- ---------------------------------------------------------------------------

create or replace function public.prague_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (timezone('Europe/Prague', now()))::date;
$$;

create or replace function public.prague_week_monday()
returns date
language sql
stable
set search_path = ''
as $$
  select (date_trunc('week', timezone('Europe/Prague', now())))::date;
$$;

create or replace function public.level_for(p_xp integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  -- Úroveň n začíná na 50*n*(n-1). Inverze: floor((1+sqrt(1+4*xp/50))/2).
  select greatest(
    1,
    floor(
      (1 + sqrt((1 + (4.0 * greatest(coalesce(p_xp, 0), 0)) / 50.0)::numeric) + 0.0000001) / 2
    )::integer
  );
$$;

revoke all on function public.prague_today() from public;
revoke all on function public.prague_week_monday() from public;
revoke all on function public.level_for(integer) from public;
grant execute on function public.prague_today() to authenticated;
grant execute on function public.prague_week_monday() to authenticated;
grant execute on function public.level_for(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Katalog (žádná osobní data) a tabulky
-- ---------------------------------------------------------------------------

create table if not exists public.lessons (
  slug text primary key,
  title text not null,
  subject text not null,
  sort integer not null,
  constraint lessons_slug_fmt check (slug ~ '^[a-z0-9-]{1,64}$')
);

create table if not exists public.activity_catalog (
  lesson_slug text not null,
  item_key text not null,
  source text not null check (source in ('study', 'lekce', 'anki_pause', 'exam', 'simulace')),
  primary key (lesson_slug, item_key, source),
  constraint activity_catalog_slug_fmt check (lesson_slug ~ '^[a-z0-9-]{1,64}$'),
  constraint activity_catalog_key_fmt check (item_key ~ '^[a-zA-Z0-9_]{1,64}$')
);

create table if not exists public.chapter_requirements (
  lesson_slug text not null,
  chapter_key text not null,
  step_key text not null,
  primary key (lesson_slug, chapter_key, step_key),
  constraint chapter_requirements_slug_fmt check (lesson_slug ~ '^[a-z0-9-]{1,64}$'),
  constraint chapter_requirements_key_fmt check (chapter_key ~ '^[a-zA-Z0-9_]{1,64}$'),
  constraint chapter_requirements_step_fmt check (step_key ~ '^[a-zA-Z0-9_]{1,64}$')
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  display_name_norm text generated always as (lower(display_name)) stored,
  friend_code text not null,
  show_on_site boolean not null default true,
  show_on_friends boolean not null default true,
  all_time_xp integer not null default 0 check (all_time_xp >= 0),
  weekly_xp integer not null default 0 check (weekly_xp >= 0),
  week_start date not null default public.prague_week_monday(),
  current_streak integer not null default 0 check (current_streak >= 0),
  longest_streak integer not null default 0 check (longest_streak >= 0),
  last_activity_on date,
  progress_imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_len check (char_length(display_name) between 2 and 24),
  constraint profiles_display_name_no_email check (position('@' in display_name) = 0),
  constraint profiles_friend_code_fmt check (friend_code ~ '^STUD-[A-Z0-9]{4}$')
);

create unique index if not exists profiles_display_name_norm_uidx
  on public.profiles (display_name_norm);
create unique index if not exists profiles_friend_code_uidx
  on public.profiles (friend_code);

comment on table public.profiles is
  'Přezdívka, kód kamaráda, soukromí a souhrn XP. Bez e-mailu.';

-- Žebříček celé studovny. Bez user_id, aby z API nešel identifikátor účtu.
create table if not exists public.site_board (
  display_name_norm text primary key,
  display_name text not null,
  all_time_xp integer not null default 0 check (all_time_xp >= 0),
  weekly_xp integer not null default 0 check (weekly_xp >= 0),
  week_start date not null,
  show_on_site boolean not null default true,
  constraint site_board_name_len check (char_length(display_name) between 2 and 24),
  constraint site_board_no_email check (position('@' in display_name) = 0),
  constraint site_board_norm check (display_name_norm = lower(display_name))
);

create table if not exists public.lesson_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  lesson_slug text not null,
  status text not null default 'started'
    check (status in ('started', 'in_progress', 'completed')),
  items_done integer not null default 0 check (items_done >= 0),
  items_total integer not null default 0 check (items_total >= 0),
  pct integer not null default 0 check (pct between 0 and 100),
  completed_manually boolean not null default false,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_slug),
  constraint lesson_progress_slug_fmt check (lesson_slug ~ '^[a-z0-9-]{1,64}$')
);

create table if not exists public.lesson_items (
  user_id uuid not null references auth.users (id) on delete cascade,
  lesson_slug text not null,
  item_key text not null,
  source text not null check (source in ('study', 'lekce', 'anki_pause')),
  first_completed_at timestamptz not null default now(),
  last_completed_at timestamptz not null default now(),
  times_completed integer not null default 1 check (times_completed >= 1),
  primary key (user_id, lesson_slug, item_key, source),
  constraint lesson_items_slug_fmt check (lesson_slug ~ '^[a-z0-9-]{1,64}$'),
  constraint lesson_items_key_fmt check (item_key ~ '^[a-zA-Z0-9_]{1,64}$')
);

create table if not exists public.quiz_attempts (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  quiz_kind text not null check (quiz_kind in ('exam', 'simulace')),
  lesson_slug text,
  variant text,
  score integer not null check (score >= 0),
  max_score integer not null check (max_score > 0),
  pct integer generated always as (round(100.0 * score / max_score)::integer) stored,
  finished_at timestamptz not null default now(),
  constraint quiz_attempts_slug_fmt check (lesson_slug is null or lesson_slug ~ '^[a-z0-9-]{1,64}$'),
  constraint quiz_attempts_score_le_max check (score <= max_score),
  constraint quiz_attempts_variant_fmt check (variant is null or variant ~ '^[A-Za-z0-9_-]{1,16}$')
);

create index if not exists quiz_attempts_user_idx
  on public.quiz_attempts (user_id, quiz_kind, lesson_slug);

create table if not exists public.daily_activity (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  items_completed integer not null default 0 check (items_completed >= 0),
  chapters_done integer not null default 0 check (chapters_done >= 0),
  quizzes_done integer not null default 0 check (quizzes_done >= 0),
  xp_earned integer not null default 0 check (xp_earned >= 0),
  primary key (user_id, day)
);

create table if not exists public.xp_events (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  occurred_at timestamptz not null default now(),
  occurred_on date not null,
  amount integer not null check (amount > 0 and amount <= 200),
  reason text not null check (reason in (
    'item_first', 'item_review', 'lesson_complete', 'chapter', 'anki_check',
    'quiz_finish', 'quiz_score', 'quiz_record', 'streak'
  )),
  lesson_slug text,
  item_key text,
  source_id bigint
);

create index if not exists xp_events_user_day_idx
  on public.xp_events (user_id, occurred_on desc);

create unique index if not exists xp_events_once_uidx
  on public.xp_events (user_id, reason, lesson_slug, coalesce(item_key, ''))
  where reason in ('item_first', 'lesson_complete', 'chapter', 'anki_check');

create unique index if not exists xp_events_quiz_finish_uidx
  on public.xp_events (user_id, coalesce(lesson_slug, ''))
  where reason = 'quiz_finish';

create unique index if not exists xp_events_quiz_record_uidx
  on public.xp_events (user_id, coalesce(lesson_slug, ''), occurred_on)
  where reason = 'quiz_record';

create unique index if not exists xp_events_quiz_score_uidx
  on public.xp_events (user_id, coalesce(lesson_slug, ''), coalesce(item_key, ''), occurred_on)
  where reason = 'quiz_score';

create unique index if not exists xp_events_review_uidx
  on public.xp_events (user_id, lesson_slug, item_key, occurred_on)
  where reason = 'item_review';

create unique index if not exists xp_events_streak_uidx
  on public.xp_events (user_id, occurred_on)
  where reason = 'streak';

create table if not exists public.favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  lesson_slug text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, lesson_slug),
  constraint favorites_slug_fmt check (lesson_slug ~ '^[a-z0-9-]{1,64}$')
);

create table if not exists public.friendships (
  id bigserial primary key,
  requester_id uuid not null references auth.users (id) on delete cascade,
  addressee_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint friendships_not_self check (requester_id <> addressee_id)
);

create unique index if not exists friendships_pair_uidx
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists friendships_addressee_idx
  on public.friendships (addressee_id, status);
create index if not exists friendships_requester_idx
  on public.friendships (requester_id, status);

create table if not exists public.progress_snapshots (
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_key text not null,
  state jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, storage_key),
  constraint progress_snapshots_key_fmt check (storage_key ~ '^[A-Za-z0-9_]{1,40}$'),
  constraint progress_snapshots_size check (pg_column_size(state) < 200000)
);

create table if not exists public.lesson_comments (
  id bigserial primary key,
  lesson_slug text not null,
  author_id uuid not null references auth.users (id) on delete restrict,
  body text not null,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lesson_comments_slug_fmt check (lesson_slug ~ '^[a-z0-9-]{1,64}$'),
  constraint lesson_comments_body_len check (char_length(body) between 1 and 4000)
);

create index if not exists lesson_comments_slug_idx
  on public.lesson_comments (lesson_slug, pinned desc, created_at desc);
create unique index if not exists lesson_comments_one_pin_uidx
  on public.lesson_comments (lesson_slug)
  where pinned;

comment on table public.lesson_comments is
  'Poznámky k lekci. author_id se do žebříčku ani do čtecího pohledu nedává.';

-- ---------------------------------------------------------------------------
-- Kamarádství bez rekurze RLS
-- ---------------------------------------------------------------------------

create or replace function private.is_accepted_friend(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    other is not null
    and other <> (select auth.uid())
    and exists (
      select 1
      from public.friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = (select auth.uid()) and f.addressee_id = other)
          or (f.addressee_id = (select auth.uid()) and f.requester_id = other)
        )
    );
$$;

revoke all on function private.is_accepted_friend(uuid) from public;
grant execute on function private.is_accepted_friend(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- XP a série. Volá je jen trigger nebo private RPC, ne prohlížeč.
-- ---------------------------------------------------------------------------

create or replace function private._award_xp(
  p_user uuid,
  p_amount integer,
  p_reason text,
  p_lesson text,
  p_item text,
  p_source bigint
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := public.prague_today();
  v_week date := public.prague_week_monday();
  v_today_xp integer := 0;
  v_give integer := 0;
  v_n integer := 0;
  v_importing boolean := coalesce(current_setting('progress.importing', true), '') = '1';
begin
  if p_user is null or p_amount is null or p_amount <= 0 then
    return 0;
  end if;

  insert into public.daily_activity (user_id, day)
  values (p_user, v_today)
  on conflict (user_id, day) do nothing;

  select xp_earned into v_today_xp
  from public.daily_activity
  where user_id = p_user and day = v_today
  for update;

  v_today_xp := coalesce(v_today_xp, 0);
  if v_importing then
    v_give := least(p_amount, 200);
  else
    if v_today_xp >= 200 then
      return 0;
    end if;
    v_give := least(p_amount, 200 - v_today_xp);
  end if;
  if v_give <= 0 then
    return 0;
  end if;

  insert into public.xp_events (user_id, occurred_on, amount, reason, lesson_slug, item_key, source_id)
  values (p_user, v_today, v_give, p_reason, p_lesson, p_item, p_source)
  on conflict do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    return 0;
  end if;

  update public.daily_activity
  set xp_earned = xp_earned + v_give
  where user_id = p_user and day = v_today;

  perform set_config('progress.internal', '1', true);
  update public.profiles
  set all_time_xp = all_time_xp + v_give,
      weekly_xp = case when week_start = v_week then weekly_xp + v_give else v_give end,
      week_start = v_week
  where user_id = p_user;

  return v_give;
end;
$$;

revoke all on function private._award_xp(uuid, integer, text, text, text, bigint) from public;

create or replace function private._note_activity_and_streak(p_user uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := public.prague_today();
  v_items integer;
  v_chapters integer;
  v_quizzes integer;
  v_last date;
  v_streak integer;
  v_bonus integer;
begin
  insert into public.daily_activity (user_id, day)
  values (p_user, v_today)
  on conflict (user_id, day) do nothing;

  if p_kind = 'item' then
    update public.daily_activity set items_completed = items_completed + 1
    where user_id = p_user and day = v_today;
  elsif p_kind = 'chapter' then
    update public.daily_activity set chapters_done = chapters_done + 1
    where user_id = p_user and day = v_today;
  elsif p_kind = 'quiz' then
    update public.daily_activity set quizzes_done = quizzes_done + 1
    where user_id = p_user and day = v_today;
  else
    return;
  end if;

  select items_completed, chapters_done, quizzes_done
  into v_items, v_chapters, v_quizzes
  from public.daily_activity
  where user_id = p_user and day = v_today;

  if not (v_items >= 3 or v_chapters >= 1 or v_quizzes >= 1) then
    return;
  end if;

  select last_activity_on, current_streak
  into v_last, v_streak
  from public.profiles
  where user_id = p_user
  for update;

  if v_last = v_today then
    return;
  end if;

  if v_last is null or v_last < (v_today - 1) then
    v_streak := 1;
  elsif v_last = v_today - 1 then
    v_streak := coalesce(v_streak, 0) + 1;
  else
    v_streak := 1;
  end if;

  perform set_config('progress.internal', '1', true);
  update public.profiles
  set current_streak = v_streak,
      longest_streak = greatest(longest_streak, v_streak),
      last_activity_on = v_today
  where user_id = p_user;

  v_bonus := least(25, 5 * v_streak);
  perform private._award_xp(p_user, v_bonus, 'streak', null, null, null);
end;
$$;

revoke all on function private._note_activity_and_streak(uuid, text) from public;

create or replace function private.recompute_lesson(p_user uuid, p_slug text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer;
  v_done integer;
  v_manual boolean := false;
  v_status text;
  v_pct integer;
  v_completed_at timestamptz;
begin
  select count(*) into v_total
  from public.activity_catalog
  where lesson_slug = p_slug and source = 'study';

  select count(*) into v_done
  from public.lesson_items
  where user_id = p_user and lesson_slug = p_slug and source = 'study';

  select completed_manually, completed_at
  into v_manual, v_completed_at
  from public.lesson_progress
  where user_id = p_user and lesson_slug = p_slug;
  v_manual := coalesce(v_manual, false);

  if v_manual or (v_total > 0 and v_done >= v_total) then
    v_status := 'completed';
  elsif v_done > 0 then
    v_status := 'in_progress';
  else
    v_status := 'started';
  end if;

  v_pct := case
    when v_total <= 0 then 0
    else least(100, round(100.0 * v_done / v_total)::integer)
  end;

  insert into public.lesson_progress (
    user_id, lesson_slug, status, items_done, items_total, pct,
    completed_manually, completed_at, updated_at
  )
  values (
    p_user, p_slug, v_status, v_done, v_total, v_pct,
    v_manual,
    case when v_status = 'completed' then coalesce(v_completed_at, now()) else null end,
    now()
  )
  on conflict (user_id, lesson_slug) do update
  set status = excluded.status,
      items_done = excluded.items_done,
      items_total = excluded.items_total,
      pct = excluded.pct,
      completed_manually = excluded.completed_manually,
      completed_at = case
        when excluded.status = 'completed' then coalesce(public.lesson_progress.completed_at, now())
        else null
      end,
      updated_at = now();
end;
$$;

revoke all on function private.recompute_lesson(uuid, text) from public;

create or replace function private.set_manual(p_user uuid, p_slug text, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.lessons where slug = p_slug) then
    return;
  end if;
  insert into public.lesson_progress (user_id, lesson_slug, completed_manually, status)
  values (p_user, p_slug, p_on, 'started')
  on conflict (user_id, lesson_slug) do update
  set completed_manually = excluded.completed_manually,
      updated_at = now();
  perform private.recompute_lesson(p_user, p_slug);
end;
$$;

revoke all on function private.set_manual(uuid, text, boolean) from public;

create or replace function private.trg_lesson_items_xp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := public.prague_today();
  v_review integer;
  v_amount integer;
begin
  if not exists (
    select 1 from public.activity_catalog c
    where c.lesson_slug = new.lesson_slug
      and c.item_key = new.item_key
      and c.source = case new.source when 'lekce' then 'lekce' when 'anki_pause' then 'anki_pause' else 'study' end
  ) then
    raise exception 'invalid_item';
  end if;

  if tg_op = 'INSERT' then
    if new.source = 'study' then
      perform private._award_xp(new.user_id, 10, 'item_first', new.lesson_slug, new.item_key, null);
      perform private._note_activity_and_streak(new.user_id, 'item');
    elsif new.source = 'lekce' then
      perform private._award_xp(new.user_id, 25, 'chapter', new.lesson_slug, new.item_key, null);
      perform private._note_activity_and_streak(new.user_id, 'chapter');
    elsif new.source = 'anki_pause' then
      perform private._award_xp(new.user_id, 15, 'anki_check', new.lesson_slug, new.item_key, null);
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.source = 'study'
     and new.times_completed > old.times_completed
     and (timezone('Europe/Prague', new.last_completed_at))::date
         is distinct from (timezone('Europe/Prague', old.last_completed_at))::date
  then
    select coalesce(sum(amount), 0) into v_review
    from public.xp_events
    where user_id = new.user_id
      and reason = 'item_review'
      and lesson_slug = new.lesson_slug
      and occurred_on = v_today;
    v_amount := greatest(0, least(2, 20 - v_review));
    if v_amount > 0 then
      perform private._award_xp(new.user_id, v_amount, 'item_review', new.lesson_slug, new.item_key, null);
    end if;
    perform private._note_activity_and_streak(new.user_id, 'item');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lesson_items_xp on public.lesson_items;
create trigger trg_lesson_items_xp
  after insert or update on public.lesson_items
  for each row execute function private.trg_lesson_items_xp();

create or replace function private.trg_lesson_progress_xp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Rozhodnutí vlastníka: bonus +50 XP za „označit jako hotovo“ se připíše
  -- vždy, jednou za lekci. Podmínka „alespoň polovina cvičení“ se nepoužije.
  -- Stejný jednorázový bonus dostane i dokončení všech cvičení v lekci.
  if new.status = 'completed'
     and (tg_op = 'INSERT' or old.status is distinct from 'completed')
  then
    perform private._award_xp(new.user_id, 50, 'lesson_complete', new.lesson_slug, null, null);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lesson_progress_xp on public.lesson_progress;
create trigger trg_lesson_progress_xp
  after insert or update on public.lesson_progress
  for each row execute function private.trg_lesson_progress_xp();

create or replace function private.trg_quiz_attempts_xp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_best integer;
  v_today date := public.prague_today();
  v_today_already boolean;
begin
  select coalesce(max(pct), -1) into v_best
  from public.quiz_attempts
  where user_id = new.user_id
    and quiz_kind = new.quiz_kind
    and coalesce(lesson_slug, '') = coalesce(new.lesson_slug, '')
    and id <> new.id;

  select exists (
    select 1 from public.xp_events
    where user_id = new.user_id
      and coalesce(lesson_slug, '') = coalesce(new.lesson_slug, '')
      and occurred_on = v_today
      and reason in ('quiz_finish', 'quiz_record', 'quiz_score')
  ) into v_today_already;

  if v_best < 0 then
    perform private._award_xp(new.user_id, 40, 'quiz_finish', new.lesson_slug, null, new.id);
    if new.pct >= 80 then
      perform private._award_xp(new.user_id, 20, 'quiz_score', new.lesson_slug, 'pct80', new.id);
    end if;
    if new.pct = 100 then
      perform private._award_xp(new.user_id, 20, 'quiz_score', new.lesson_slug, 'pct100', new.id);
    end if;
  elsif new.pct > v_best and not v_today_already then
    perform private._award_xp(new.user_id, 10, 'quiz_record', new.lesson_slug, null, new.id);
    if new.pct >= 80 then
      perform private._award_xp(new.user_id, 20, 'quiz_score', new.lesson_slug, 'pct80', new.id);
    end if;
    if new.pct = 100 then
      perform private._award_xp(new.user_id, 20, 'quiz_score', new.lesson_slug, 'pct100', new.id);
    end if;
  end if;

  perform private._note_activity_and_streak(new.user_id, 'quiz');
  return new;
end;
$$;

drop trigger if exists trg_quiz_attempts_xp on public.quiz_attempts;
create trigger trg_quiz_attempts_xp
  after insert on public.quiz_attempts
  for each row execute function private.trg_quiz_attempts_xp();

revoke all on function private.trg_lesson_items_xp() from public;
revoke all on function private.trg_lesson_progress_xp() from public;
revoke all on function private.trg_quiz_attempts_xp() from public;

-- ---------------------------------------------------------------------------
-- Profily: klient nesmí měnit XP, sérii, kód ani příznak importu
-- ---------------------------------------------------------------------------

create or replace function private.trg_profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('progress.internal', true), '') = '1' then
    new.updated_at := now();
    return new;
  end if;
  if char_length(new.display_name) < 2
     or char_length(new.display_name) > 24
     or new.display_name <> btrim(new.display_name)
     or position('@' in new.display_name) > 0
     or new.display_name ~ '[[:cntrl:]]'
     or new.display_name !~ '[0-9A-Za-zÁČĎÉĚÍŇÓŘŠŤÚŮÝŽáčďéěíňóřšťúůýž]'
  then
    raise exception 'invalid_display_name';
  end if;
  new.user_id := old.user_id;
  new.friend_code := old.friend_code;
  new.all_time_xp := old.all_time_xp;
  new.weekly_xp := old.weekly_xp;
  new.week_start := old.week_start;
  new.current_streak := old.current_streak;
  new.longest_streak := old.longest_streak;
  new.last_activity_on := old.last_activity_on;
  new.progress_imported_at := old.progress_imported_at;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_guard on public.profiles;
create trigger trg_profiles_guard
  before update on public.profiles
  for each row execute function private.trg_profiles_guard();

create or replace function private.trg_profiles_board()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.display_name_norm is distinct from old.display_name_norm then
    if tg_op = 'UPDATE' then
      delete from public.site_board where display_name_norm = old.display_name_norm;
    end if;
    insert into public.site_board (
      display_name_norm, display_name, all_time_xp, weekly_xp, week_start, show_on_site
    ) values (
      new.display_name_norm, new.display_name, new.all_time_xp, new.weekly_xp, new.week_start, new.show_on_site
    );
  else
    update public.site_board
    set display_name = new.display_name,
        all_time_xp = new.all_time_xp,
        weekly_xp = new.weekly_xp,
        week_start = new.week_start,
        show_on_site = new.show_on_site
    where display_name_norm = new.display_name_norm;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_profiles_board on public.profiles;
create trigger trg_profiles_board
  after insert or update on public.profiles
  for each row execute function private.trg_profiles_board();

revoke all on function private.trg_profiles_guard() from public;
revoke all on function private.trg_profiles_board() from public;
grant execute on function private.trg_profiles_guard() to authenticated;
grant execute on function private.trg_profiles_board() to authenticated;

-- ---------------------------------------------------------------------------
-- Snímky postupu z prohlížeče a ruční dokončení
-- ---------------------------------------------------------------------------

create or replace function private.slug_from_storage(p_key text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_key
    when 'anat_svaly_hk_study_v1' then 'svaly-hlavy-krku'
    when 'anat_axial_study_v1' then 'axialni-system'
    when 'latina_study_L1' then 'latina-lekce-01'
    when 'latina_study_L2' then 'latina-lekce-02'
    when 'latina_study_L3' then 'latina-lekce-03'
    when 'latina_study_L4' then 'latina-lekce-04'
    when 'latina_study_L5' then 'latina-lekce-05'
    when 'latina_study_L6' then 'latina-lekce-06'
    when 'sg_hk_proto_v1' then 'svaly-hlavy-krku'
    else null
  end;
$$;

revoke all on function private.slug_from_storage(text) from public;

create or replace function private._replace_items(
  p_user uuid,
  p_slug text,
  p_source text,
  p_keys text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_n integer;
begin
  delete from public.lesson_items li
  where li.user_id = p_user
    and li.lesson_slug = p_slug
    and li.source = p_source
    and not (li.item_key = any (coalesce(p_keys, '{}'::text[])));

  if p_keys is null then
    return;
  end if;
  foreach v_key in array p_keys loop
    insert into public.lesson_items (user_id, lesson_slug, item_key, source)
    values (p_user, p_slug, v_key, p_source)
    on conflict do nothing;
    get diagnostics v_n = row_count;
    if v_n > 0 and p_source = 'study' and v_key = 'exam_0' then
      -- Kvíz k zápočtu doplní apply_storage, tady jen položka cvičení.
      null;
    end if;
  end loop;
end;
$$;

revoke all on function private._replace_items(uuid, text, text, text[]) from public;

create or replace function private.apply_storage(p_user uuid, p_key text, p_state jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text;
  v_keys text[] := '{}'::text[];
  v_chapter text;
  v_ok integer;
  v_n integer;
  v_new integer;
  v_on boolean;
  r record;
begin
  if p_key not in (
    'anat_svaly_hk_study_v1', 'anat_axial_study_v1',
    'latina_study_L1', 'latina_study_L2', 'latina_study_L3',
    'latina_study_L4', 'latina_study_L5', 'latina_study_L6',
    'sg_hk_proto_v1', 'sh_done', 'sh_fav', 'sh_last'
  ) then
    raise exception 'unknown_storage_key';
  end if;
  if p_state is null or pg_column_size(p_state) > 200000 then
    raise exception 'invalid_state';
  end if;
  if p_key = 'sh_last' then
    if jsonb_typeof(p_state) not in ('string', 'object') then
      raise exception 'invalid_state';
    end if;
  elsif jsonb_typeof(p_state) <> 'object' then
    raise exception 'invalid_state';
  end if;

  insert into public.progress_snapshots (user_id, storage_key, state, updated_at)
  values (p_user, p_key, p_state, now())
  on conflict (user_id, storage_key) do update
  set state = excluded.state, updated_at = now();

  if p_key in ('anat_svaly_hk_study_v1', 'anat_axial_study_v1') then
    v_slug := private.slug_from_storage(p_key);
    select coalesce(array_agg(k), '{}') into v_keys
    from jsonb_object_keys(coalesce(p_state->'ex', '{}'::jsonb)) as k
    where exists (
      select 1 from public.activity_catalog c
      where c.lesson_slug = v_slug and c.item_key = k and c.source = 'study'
    );
    perform private._replace_items(p_user, v_slug, 'study', v_keys);
    if 'exam_0' = any (coalesce(v_keys, '{}'))
       and jsonb_typeof(p_state->'ex'->'exam_0') = 'object'
       and not exists (
         select 1 from public.quiz_attempts q
         where q.user_id = p_user and q.quiz_kind = 'exam' and q.lesson_slug = v_slug
       )
    then
      v_ok := nullif(p_state->'ex'->'exam_0'->>'ok', '')::integer;
      v_n := nullif(p_state->'ex'->'exam_0'->>'n', '')::integer;
      if v_ok is not null and v_n is not null and v_n > 0 and v_ok between 0 and v_n then
        insert into public.quiz_attempts (user_id, quiz_kind, lesson_slug, score, max_score)
        values (p_user, 'exam', v_slug, v_ok, v_n);
      end if;
    end if;
    perform private.recompute_lesson(p_user, v_slug);

  elsif p_key like 'latina_study_L%' then
    v_slug := private.slug_from_storage(p_key);
    select coalesce(array_agg(k), '{}') into v_keys
    from jsonb_object_keys(p_state) as k
    where exists (
      select 1 from public.activity_catalog c
      where c.lesson_slug = v_slug and c.item_key = k and c.source = 'study'
    )
      and coalesce(p_state->>k, '') not in ('', '0', 'false', 'null');
    perform private._replace_items(p_user, v_slug, 'study', v_keys);
    perform private.recompute_lesson(p_user, v_slug);

  elsif p_key = 'sg_hk_proto_v1' then
    v_slug := 'svaly-hlavy-krku';
    select coalesce(array_agg(c.item_key), '{}') into v_keys
    from public.activity_catalog c
    where c.lesson_slug = v_slug
      and c.source = 'anki_pause'
      and coalesce(p_state->>c.item_key, '') in ('1', 'true');
    perform private._replace_items(p_user, v_slug, 'anki_pause', v_keys);

    for v_chapter in
      select distinct chapter_key
      from public.chapter_requirements
      where lesson_slug = v_slug
    loop
      if not exists (
        select 1 from public.chapter_requirements req
        where req.lesson_slug = v_slug
          and req.chapter_key = v_chapter
          and coalesce(p_state->>req.step_key, '') not in ('1', 'true')
      ) and exists (
        select 1 from public.chapter_requirements req
        where req.lesson_slug = v_slug and req.chapter_key = v_chapter
      ) then
        insert into public.lesson_items (user_id, lesson_slug, item_key, source)
        values (p_user, v_slug, v_chapter, 'lekce')
        on conflict do nothing;
      else
        delete from public.lesson_items
        where user_id = p_user and lesson_slug = v_slug and source = 'lekce' and item_key = v_chapter;
      end if;
    end loop;

  elsif p_key = 'sh_done' then
    for r in select slug from public.lessons loop
      v_on := coalesce(p_state->>r.slug, '') in ('1', 'true');
      if v_on or exists (
        select 1 from public.lesson_progress lp
        where lp.user_id = p_user and lp.lesson_slug = r.slug and lp.completed_manually
      ) then
        perform private.set_manual(p_user, r.slug, v_on);
      end if;
    end loop;

  elsif p_key = 'sh_fav' then
    delete from public.favorites where user_id = p_user;
    insert into public.favorites (user_id, lesson_slug)
    select p_user, l.slug
    from public.lessons l
    where coalesce(p_state->>l.slug, '') in ('1', 'true');
  end if;
end;
$$;

revoke all on function private.apply_storage(uuid, text, jsonb) from public;

create or replace function private.clear_storage(p_user uuid, p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text;
begin
  v_slug := private.slug_from_storage(p_key);
  delete from public.progress_snapshots
  where user_id = p_user and storage_key = p_key;

  if p_key in ('anat_svaly_hk_study_v1', 'anat_axial_study_v1')
     or p_key like 'latina_study_L%' then
    delete from public.lesson_items
    where user_id = p_user and lesson_slug = v_slug and source = 'study';
    perform private.recompute_lesson(p_user, v_slug);
  elsif p_key = 'sg_hk_proto_v1' then
    delete from public.lesson_items
    where user_id = p_user and lesson_slug = v_slug and source in ('lekce', 'anki_pause');
  elsif p_key = 'sh_done' then
    perform private.apply_storage(p_user, 'sh_done', '{}'::jsonb);
  elsif p_key = 'sh_fav' then
    delete from public.favorites where user_id = p_user;
  elsif p_key = 'sh_last' then
    null;
  else
    raise exception 'unknown_storage_key';
  end if;
end;
$$;

revoke all on function private.clear_storage(uuid, text) from public;

-- ---------------------------------------------------------------------------
-- RPC pro prohlížeč
-- ---------------------------------------------------------------------------

create or replace function private._me()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid();
$$;

revoke all on function private._me() from public;

create or replace function private._require_user()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v uuid := auth.uid();
begin
  if v is null then
    raise exception 'not_authenticated';
  end if;
  return v;
end;
$$;

revoke all on function private._require_user() from public;

create or replace function private._random_token(n integer)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  raw text := replace(gen_random_uuid()::text, '-', '');
  out text := '';
  i integer;
  b integer;
begin
  for i in 1..n loop
    b := get_byte(decode(substr(raw, (i * 2) - 1, 2), 'hex'), 0);
    out := out || substr(alphabet, 1 + (b % length(alphabet)), 1);
  end loop;
  return out;
end;
$$;

revoke all on function private._random_token(integer) from public;

create or replace function private.ensure_profile()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_code text;
  i integer;
  v_row public.profiles%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  select * into v_row from public.profiles where user_id = v_uid;
  if found then
    return private._profile_json(v_row.user_id);
  end if;

  for i in 1..24 loop
    v_name := 'Student-' || private._random_token(4);
    exit when not exists (
      select 1 from public.profiles p where p.display_name_norm = lower(v_name)
    );
  end loop;
  for i in 1..24 loop
    v_code := 'STUD-' || private._random_token(4);
    exit when not exists (select 1 from public.profiles p where p.friend_code = v_code);
  end loop;

  insert into public.profiles (user_id, display_name, friend_code)
  values (v_uid, v_name, v_code);
  return private._profile_json(v_uid);
end;
$$;

revoke all on function private.ensure_profile() from public;

create or replace function private._effective_streak(p_last date, p_streak integer)
returns integer
language sql
stable
set search_path = ''
as $$
  select case
    when p_last is null then 0
    when p_last < public.prague_today() - 1 then 0
    else coalesce(p_streak, 0)
  end;
$$;

revoke all on function private._effective_streak(date, integer) from public;

create or replace function private._profile_json(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.profiles%rowtype;
  v_level integer;
  v_floor integer;
  v_next integer;
  v_done integer;
  v_total integer;
  v_lessons_done integer;
begin
  select * into p from public.profiles where user_id = p_user;
  if not found then
    return '{}'::jsonb;
  end if;
  v_level := public.level_for(p.all_time_xp);
  v_floor := 50 * (v_level - 1) * v_level;
  v_next := 50 * v_level * (v_level + 1);
  select count(*) into v_done
  from public.lesson_items
  where user_id = p_user and source = 'study';
  select count(*) into v_total
  from public.activity_catalog
  where source = 'study';
  select count(*) into v_lessons_done
  from public.lesson_progress
  where user_id = p_user and status = 'completed';
  return jsonb_build_object(
    'display_name', p.display_name,
    'friend_code', p.friend_code,
    'show_on_site', p.show_on_site,
    'show_on_friends', p.show_on_friends,
    'level', v_level,
    'all_time_xp', p.all_time_xp,
    'weekly_xp', case when p.week_start = public.prague_week_monday() then p.weekly_xp else 0 end,
    'level_floor', v_floor,
    'next_floor', v_next,
    'xp_to_next', greatest(0, v_next - p.all_time_xp),
    'streak', private._effective_streak(p.last_activity_on, p.current_streak),
    'longest_streak', p.longest_streak,
    'imported', p.progress_imported_at is not null,
    'exercises_done', v_done,
    'exercises_total', v_total,
    'lessons_completed', v_lessons_done,
    'lessons_total', (select count(*) from public.lessons)
  );
end;
$$;

revoke all on function private._profile_json(uuid) from public;

create or replace function private._lessons_json(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.sort), '[]'::jsonb)
  from (
    select
      l.slug,
      l.title,
      l.subject,
      l.sort,
      coalesce(lp.status, 'not_started') as status,
      coalesce(lp.pct, 0) as pct,
      coalesce(lp.items_done, 0) as items_done,
      coalesce(lp.items_total, (
        select count(*)::integer from public.activity_catalog c
        where c.lesson_slug = l.slug and c.source = 'study'
      )) as items_total,
      coalesce(lp.completed_manually, false) as completed_manually
    from public.lessons l
    left join public.lesson_progress lp
      on lp.lesson_slug = l.slug and lp.user_id = p_user
  ) x;
$$;

revoke all on function private._lessons_json(uuid) from public;

create or replace function private._friends_json(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', f.id,
    'status', f.status,
    'direction', case when f.requester_id = p_user then 'out' else 'in' end,
    'display_name', op.display_name
  ) order by f.created_at), '[]'::jsonb)
  from public.friendships f
  join public.profiles op
    on op.user_id = case when f.requester_id = p_user then f.addressee_id else f.requester_id end
  where p_user in (f.requester_id, f.addressee_id)
    and f.status in ('pending', 'accepted');
$$;

revoke all on function private._friends_json(uuid) from public;

create or replace function private.my_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private._require_user();
  v_snaps jsonb;
begin
  perform private.ensure_profile();
  select coalesce(jsonb_object_agg(storage_key, state), '{}'::jsonb)
  into v_snaps
  from public.progress_snapshots
  where user_id = v_uid;
  return jsonb_build_object(
    'profile', private._profile_json(v_uid),
    'lessons', private._lessons_json(v_uid),
    'friends', private._friends_json(v_uid),
    'snapshots', coalesce(v_snaps, '{}'::jsonb)
  );
end;
$$;

revoke all on function private.my_dashboard() from public;

create or replace function private.import_browser_progress(p_snapshots jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private._require_user();
  v_imported timestamptz;
  k text;
  v_state jsonb;
begin
  perform private.ensure_profile();
  if p_snapshots is null or jsonb_typeof(p_snapshots) <> 'object' then
    raise exception 'invalid_state';
  end if;
  if pg_column_size(p_snapshots) > 800000 then
    raise exception 'state_too_large';
  end if;

  select progress_imported_at into v_imported
  from public.profiles
  where user_id = v_uid
  for update;

  if v_imported is not null then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  perform set_config('progress.importing', '1', true);
  begin
    for k, v_state in select * from jsonb_each(p_snapshots) loop
      if k in (
        'anat_svaly_hk_study_v1', 'anat_axial_study_v1',
        'latina_study_L1', 'latina_study_L2', 'latina_study_L3',
        'latina_study_L4', 'latina_study_L5', 'latina_study_L6',
        'sg_hk_proto_v1', 'sh_done', 'sh_fav', 'sh_last'
      ) then
        perform private.apply_storage(v_uid, k, v_state);
      end if;
    end loop;
    perform set_config('progress.internal', '1', true);
    update public.profiles
    set progress_imported_at = now()
    where user_id = v_uid;
  exception when others then
    perform set_config('progress.importing', '', true);
    perform set_config('progress.internal', '', true);
    raise;
  end;
  perform set_config('progress.importing', '', true);
  perform set_config('progress.internal', '', true);

  return jsonb_build_object('ok', true, 'already', false, 'profile', private._profile_json(v_uid));
end;
$$;

revoke all on function private.import_browser_progress(jsonb) from public;

create or replace function private.sync_snapshot(p_key text, p_state jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private._require_user();
  v_before integer;
  v_after integer;
begin
  perform private.ensure_profile();
  select all_time_xp into v_before from public.profiles where user_id = v_uid;
  perform private.apply_storage(v_uid, p_key, p_state);
  select all_time_xp into v_after from public.profiles where user_id = v_uid;
  return jsonb_build_object('ok', true, 'awarded', coalesce(v_after, 0) - coalesce(v_before, 0));
end;
$$;

revoke all on function private.sync_snapshot(text, jsonb) from public;

create or replace function private.clear_snapshot(p_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private._require_user();
begin
  perform private.ensure_profile();
  perform private.clear_storage(v_uid, p_key);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function private.clear_snapshot(text) from public;

create or replace function private.record_study_item(
  p_storage_key text,
  p_item_key text,
  p_score integer,
  p_max integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private._require_user();
  v_slug text;
  v_row public.lesson_items%rowtype;
  v_mode text := 'same';
  v_before integer;
  v_after integer;
begin
  perform private.ensure_profile();
  v_slug := private.slug_from_storage(p_storage_key);
  if v_slug is null or p_storage_key = 'sg_hk_proto_v1' then
    raise exception 'invalid_item';
  end if;
  if p_item_key is null or p_item_key !~ '^[a-zA-Z0-9_]{1,64}$' then
    raise exception 'invalid_item';
  end if;
  if not exists (
    select 1 from public.activity_catalog
    where lesson_slug = v_slug and item_key = p_item_key and source = 'study'
  ) then
    raise exception 'invalid_item';
  end if;

  select all_time_xp into v_before from public.profiles where user_id = v_uid;
  select * into v_row
  from public.lesson_items
  where user_id = v_uid and lesson_slug = v_slug and item_key = p_item_key and source = 'study'
  for update;

  if not found then
    insert into public.lesson_items (user_id, lesson_slug, item_key, source)
    values (v_uid, v_slug, p_item_key, 'study');
    v_mode := 'new';
  elsif (timezone('Europe/Prague', v_row.last_completed_at))::date < public.prague_today() then
    update public.lesson_items
    set times_completed = times_completed + 1,
        last_completed_at = now()
    where user_id = v_uid and lesson_slug = v_slug and item_key = p_item_key and source = 'study';
    v_mode := 'review';
  end if;

  if v_mode in ('new', 'review')
     and p_item_key = 'exam_0'
     and p_max is not null and p_score is not null
     and p_max between 1 and 500
     and p_score between 0 and p_max
  then
    insert into public.quiz_attempts (user_id, quiz_kind, lesson_slug, score, max_score)
    values (v_uid, 'exam', v_slug, p_score, p_max);
  end if;

  perform private.recompute_lesson(v_uid, v_slug);
  select all_time_xp into v_after from public.profiles where user_id = v_uid;
  return jsonb_build_object(
    'ok', true,
    'mode', v_mode,
    'awarded', coalesce(v_after, 0) - coalesce(v_before, 0)
  );
end;
$$;

revoke all on function private.record_study_item(text, text, integer, integer) from public;

create or replace function private.record_quiz(
  p_kind text,
  p_lesson text,
  p_variant text,
  p_score integer,
  p_max integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private._require_user();
  v_before integer;
  v_after integer;
  v_variant text := nullif(btrim(coalesce(p_variant, '')), '');
begin
  perform private.ensure_profile();
  if p_kind not in ('exam', 'simulace') then
    raise exception 'invalid_item';
  end if;
  if p_lesson is null or p_lesson !~ '^[a-z0-9-]{1,64}$' then
    raise exception 'invalid_item';
  end if;
  if not exists (
    select 1 from public.activity_catalog
    where lesson_slug = p_lesson and source = p_kind
  ) then
    raise exception 'invalid_item';
  end if;
  if p_score is null or p_max is null or p_max < 1 or p_max > 500 or p_score < 0 or p_score > p_max then
    raise exception 'invalid_score';
  end if;
  if v_variant is not null and v_variant !~ '^[A-Za-z0-9_-]{1,16}$' then
    v_variant := null;
  end if;

  select all_time_xp into v_before from public.profiles where user_id = v_uid;
  insert into public.quiz_attempts (user_id, quiz_kind, lesson_slug, variant, score, max_score)
  values (v_uid, p_kind, p_lesson, v_variant, p_score, p_max);
  select all_time_xp into v_after from public.profiles where user_id = v_uid;
  return jsonb_build_object('ok', true, 'awarded', coalesce(v_after, 0) - coalesce(v_before, 0));
end;
$$;

revoke all on function private.record_quiz(text, text, text, integer, integer) from public;

create or replace function private.set_display_name(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private._require_user();
  v_name text := btrim(coalesce(p_name, ''));
begin
  perform private.ensure_profile();
  if char_length(v_name) < 2
     or char_length(v_name) > 24
     or position('@' in v_name) > 0
     or v_name ~ '[[:cntrl:]]'
     or v_name !~ '[0-9A-Za-zÁČĎÉĚÍŇÓŘŠŤÚŮÝŽáčďéěíňóřšťúůýž]'
  then
    raise exception 'invalid_display_name';
  end if;
  begin
    update public.profiles set display_name = v_name where user_id = v_uid;
  exception when unique_violation then
    raise exception 'display_name_taken';
  end;
  return private._profile_json(v_uid);
end;
$$;

revoke all on function private.set_display_name(text) from public;

create or replace function private.set_privacy(p_site boolean, p_friends boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private._require_user();
begin
  perform private.ensure_profile();
  if p_site is null or p_friends is null then
    raise exception 'invalid_state';
  end if;
  update public.profiles
  set show_on_site = p_site,
      show_on_friends = p_friends
  where user_id = v_uid;
  return private._profile_json(v_uid);
end;
$$;

revoke all on function private.set_privacy(boolean, boolean) from public;

create or replace function private.send_friend_request(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private._require_user();
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  v_other public.profiles%rowtype;
  v_existing public.friendships%rowtype;
  v_pending integer;
begin
  perform private.ensure_profile();
  if v_code ~ '^[A-Z0-9]{4}$' then
    v_code := 'STUD-' || v_code;
  end if;
  if v_code !~ '^STUD-[A-Z0-9]{4}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  select * into v_other from public.profiles where friend_code = v_code;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_other.user_id = v_uid then
    return jsonb_build_object('ok', false, 'error', 'self');
  end if;

  select * into v_existing
  from public.friendships
  where least(requester_id, addressee_id) = least(v_uid, v_other.user_id)
    and greatest(requester_id, addressee_id) = greatest(v_uid, v_other.user_id);

  if found then
    if v_existing.status = 'accepted' then
      return jsonb_build_object('ok', false, 'error', 'already_friends', 'display_name', v_other.display_name);
    end if;
    if v_existing.status = 'pending' and v_existing.requester_id = v_uid then
      return jsonb_build_object('ok', false, 'error', 'pending', 'display_name', v_other.display_name);
    end if;
    if v_existing.status = 'pending' and v_existing.addressee_id = v_uid then
      return jsonb_build_object('ok', false, 'error', 'they_asked_you', 'display_name', v_other.display_name);
    end if;
    update public.friendships
    set requester_id = v_uid,
        addressee_id = v_other.user_id,
        status = 'pending',
        created_at = now(),
        responded_at = null
    where id = v_existing.id;
    return jsonb_build_object('ok', true, 'display_name', v_other.display_name);
  end if;

  select count(*) into v_pending
  from public.friendships
  where requester_id = v_uid and status = 'pending';
  if v_pending >= 30 then
    return jsonb_build_object('ok', false, 'error', 'too_many');
  end if;

  insert into public.friendships (requester_id, addressee_id, status)
  values (v_uid, v_other.user_id, 'pending');
  return jsonb_build_object('ok', true, 'display_name', v_other.display_name);
end;
$$;

revoke all on function private.send_friend_request(text) from public;

create or replace function private.respond_friend(p_id bigint, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private._require_user();
  v_row public.friendships%rowtype;
begin
  if p_accept is null then
    raise exception 'invalid_state';
  end if;
  select * into v_row
  from public.friendships
  where id = p_id and addressee_id = v_uid and status = 'pending'
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  update public.friendships
  set status = case when p_accept then 'accepted' else 'declined' end,
      responded_at = now()
  where id = v_row.id;
  return jsonb_build_object('ok', true, 'status', case when p_accept then 'accepted' else 'declined' end);
end;
$$;

revoke all on function private.respond_friend(bigint, boolean) from public;

create or replace function private.remove_friend(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private._require_user();
  v_n integer;
begin
  delete from public.friendships
  where id = p_id and v_uid in (requester_id, addressee_id);
  get diagnostics v_n = row_count;
  if v_n = 0 then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function private.remove_friend(bigint) from public;

create or replace function private.friend_lessons(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private._require_user();
  v_norm text := lower(btrim(coalesce(p_name, '')));
  v_other uuid;
  v_share boolean;
begin
  if v_norm = '' then
    return '[]'::jsonb;
  end if;
  select user_id, show_on_friends into v_other, v_share
  from public.profiles
  where display_name_norm = v_norm
    and (user_id = v_uid or private.is_accepted_friend(user_id));
  if not found then
    return '[]'::jsonb;
  end if;
  if v_other <> v_uid and not coalesce(v_share, false) then
    return '[]'::jsonb;
  end if;
  return private._lessons_json(v_other);
end;
$$;

revoke all on function private.friend_lessons(text) from public;

create or replace function private.save_lesson_comment(
  p_id bigint,
  p_lesson text,
  p_body text,
  p_pinned boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private._require_user();
  v_body text := btrim(coalesce(p_body, ''));
  v_id bigint;
  v_row public.lesson_comments%rowtype;
  v_count integer;
begin
  if not public.is_staff() then
    raise exception 'forbidden';
  end if;
  if p_lesson is null or p_lesson !~ '^[a-z0-9-]{1,64}$' then
    raise exception 'invalid_lesson';
  end if;
  if char_length(v_body) < 1 or char_length(v_body) > 4000 then
    raise exception 'invalid_body';
  end if;

  if coalesce(p_pinned, false) then
    update public.lesson_comments
    set pinned = false, updated_at = now()
    where lesson_slug = p_lesson and pinned and (p_id is null or id <> p_id);
  end if;

  if p_id is null then
    select count(*) into v_count from public.lesson_comments where lesson_slug = p_lesson;
    if v_count >= 80 then
      raise exception 'too_many';
    end if;
    insert into public.lesson_comments (lesson_slug, author_id, body, pinned)
    values (p_lesson, v_uid, v_body, coalesce(p_pinned, false))
    returning id into v_id;
  else
    update public.lesson_comments
    set body = v_body,
        pinned = coalesce(p_pinned, false),
        updated_at = now()
    where id = p_id and lesson_slug = p_lesson
    returning id into v_id;
    if v_id is null then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
  end if;

  select * into v_row from public.lesson_comments where id = v_id;
  return jsonb_build_object(
    'ok', true,
    'id', v_row.id,
    'lesson_slug', v_row.lesson_slug,
    'body', v_row.body,
    'pinned', v_row.pinned,
    'created_at', v_row.created_at,
    'updated_at', v_row.updated_at,
    'author_label', 'Moderátor'
  );
end;
$$;

revoke all on function private.save_lesson_comment(bigint, text, text, boolean) from public;

create or replace function private.delete_lesson_comment(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private._require_user();
  v_n integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_staff() then
    raise exception 'forbidden';
  end if;
  delete from public.lesson_comments where id = p_id;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function private.delete_lesson_comment(bigint) from public;

-- Veřejné obálky. Data API vidí jen public, a tyhle funkce práva nezvyšují.
create or replace function public.ensure_profile()
returns jsonb language sql security invoker set search_path = ''
as $$ select private.ensure_profile(); $$;

create or replace function public.my_dashboard()
returns jsonb language sql security invoker set search_path = ''
as $$ select private.my_dashboard(); $$;

create or replace function public.import_browser_progress(p_snapshots jsonb)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.import_browser_progress(p_snapshots); $$;

create or replace function public.sync_snapshot(p_key text, p_state jsonb)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.sync_snapshot(p_key, p_state); $$;

create or replace function public.clear_snapshot(p_key text)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.clear_snapshot(p_key); $$;

create or replace function public.record_study_item(p_storage_key text, p_item_key text, p_score integer, p_max integer)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.record_study_item(p_storage_key, p_item_key, p_score, p_max); $$;

create or replace function public.record_quiz(p_kind text, p_lesson text, p_variant text, p_score integer, p_max integer)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.record_quiz(p_kind, p_lesson, p_variant, p_score, p_max); $$;

create or replace function public.set_display_name(p_name text)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.set_display_name(p_name); $$;

create or replace function public.set_privacy(p_site boolean, p_friends boolean)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.set_privacy(p_site, p_friends); $$;

create or replace function public.send_friend_request(p_code text)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.send_friend_request(p_code); $$;

create or replace function public.respond_friend(p_id bigint, p_accept boolean)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.respond_friend(p_id, p_accept); $$;

create or replace function public.remove_friend(p_id bigint)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.remove_friend(p_id); $$;

create or replace function public.friend_lessons(p_name text)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.friend_lessons(p_name); $$;

create or replace function public.save_lesson_comment(p_id bigint, p_lesson text, p_body text, p_pinned boolean)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.save_lesson_comment(p_id, p_lesson, p_body, p_pinned); $$;

create or replace function public.delete_lesson_comment(p_id bigint)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.delete_lesson_comment(p_id); $$;

revoke all on function public.ensure_profile() from public;
revoke all on function public.my_dashboard() from public;
revoke all on function public.import_browser_progress(jsonb) from public;
revoke all on function public.sync_snapshot(text, jsonb) from public;
revoke all on function public.clear_snapshot(text) from public;
revoke all on function public.record_study_item(text, text, integer, integer) from public;
revoke all on function public.record_quiz(text, text, text, integer, integer) from public;
revoke all on function public.set_display_name(text) from public;
revoke all on function public.set_privacy(boolean, boolean) from public;
revoke all on function public.send_friend_request(text) from public;
revoke all on function public.respond_friend(bigint, boolean) from public;
revoke all on function public.remove_friend(bigint) from public;
revoke all on function public.friend_lessons(text) from public;
revoke all on function public.save_lesson_comment(bigint, text, text, boolean) from public;
revoke all on function public.delete_lesson_comment(bigint) from public;

grant execute on function public.ensure_profile() to authenticated;
grant execute on function public.my_dashboard() to authenticated;
grant execute on function public.import_browser_progress(jsonb) to authenticated;
grant execute on function public.sync_snapshot(text, jsonb) to authenticated;
grant execute on function public.clear_snapshot(text) to authenticated;
grant execute on function public.record_study_item(text, text, integer, integer) to authenticated;
grant execute on function public.record_quiz(text, text, text, integer, integer) to authenticated;
grant execute on function public.set_display_name(text) to authenticated;
grant execute on function public.set_privacy(boolean, boolean) to authenticated;
grant execute on function public.send_friend_request(text) to authenticated;
grant execute on function public.respond_friend(bigint, boolean) to authenticated;
grant execute on function public.remove_friend(bigint) to authenticated;
grant execute on function public.friend_lessons(text) to authenticated;
grant execute on function public.save_lesson_comment(bigint, text, text, boolean) to authenticated;
grant execute on function public.delete_lesson_comment(bigint) to authenticated;

grant execute on function private.ensure_profile() to authenticated;
grant execute on function private.my_dashboard() to authenticated;
grant execute on function private.import_browser_progress(jsonb) to authenticated;
grant execute on function private.sync_snapshot(text, jsonb) to authenticated;
grant execute on function private.clear_snapshot(text) to authenticated;
grant execute on function private.record_study_item(text, text, integer, integer) to authenticated;
grant execute on function private.record_quiz(text, text, text, integer, integer) to authenticated;
grant execute on function private.set_display_name(text) to authenticated;
grant execute on function private.set_privacy(boolean, boolean) to authenticated;
grant execute on function private.send_friend_request(text) to authenticated;
grant execute on function private.respond_friend(bigint, boolean) to authenticated;
grant execute on function private.remove_friend(bigint) to authenticated;
grant execute on function private.friend_lessons(text) to authenticated;
grant execute on function private.save_lesson_comment(bigint, text, text, boolean) to authenticated;
grant execute on function private.delete_lesson_comment(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.lessons enable row level security;
alter table public.activity_catalog enable row level security;
alter table public.chapter_requirements enable row level security;
alter table public.profiles enable row level security;
alter table public.site_board enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.lesson_items enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.daily_activity enable row level security;
alter table public.xp_events enable row level security;
alter table public.favorites enable row level security;
alter table public.friendships enable row level security;
alter table public.progress_snapshots enable row level security;
alter table public.lesson_comments enable row level security;

revoke all on public.lessons, public.activity_catalog, public.chapter_requirements,
  public.profiles, public.site_board, public.lesson_progress, public.lesson_items,
  public.quiz_attempts, public.daily_activity, public.xp_events, public.favorites,
  public.friendships, public.progress_snapshots, public.lesson_comments
  from public, anon, authenticated;

grant select on public.lessons to authenticated;
grant select on public.activity_catalog to authenticated;
grant select on public.chapter_requirements to authenticated;
grant select (
  user_id, display_name, display_name_norm, show_on_site, show_on_friends,
  all_time_xp, weekly_xp, week_start
) on public.profiles to authenticated;
grant update (display_name, show_on_site, show_on_friends) on public.profiles to authenticated;
grant select on public.site_board to authenticated;
grant select (
  user_id, lesson_slug, status, items_done, items_total, pct, completed_manually
) on public.lesson_progress to authenticated;
grant select (id, lesson_slug, body, pinned, created_at, updated_at)
  on public.lesson_comments to authenticated;

drop policy if exists lessons_read on public.lessons;
create policy lessons_read on public.lessons
  for select to authenticated using (true);

drop policy if exists activity_catalog_read on public.activity_catalog;
create policy activity_catalog_read on public.activity_catalog
  for select to authenticated using (true);

drop policy if exists chapter_requirements_read on public.chapter_requirements;
create policy chapter_requirements_read on public.chapter_requirements
  for select to authenticated using (true);

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      show_on_friends
      and private.is_accepted_friend(user_id)
    )
  );

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists site_board_select on public.site_board;
create policy site_board_select on public.site_board
  for select to authenticated
  using (show_on_site);

drop policy if exists lesson_progress_select on public.lesson_progress;
create policy lesson_progress_select on public.lesson_progress
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      private.is_accepted_friend(user_id)
      and exists (
        select 1 from public.profiles p
        where p.user_id = lesson_progress.user_id
          and p.show_on_friends
      )
    )
    or (select public.is_admin())
  );

drop policy if exists lesson_items_select on public.lesson_items;
create policy lesson_items_select on public.lesson_items
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists quiz_attempts_select on public.quiz_attempts;
create policy quiz_attempts_select on public.quiz_attempts
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists daily_activity_select on public.daily_activity;
create policy daily_activity_select on public.daily_activity
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists xp_events_select on public.xp_events;
create policy xp_events_select on public.xp_events
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists favorites_own on public.favorites;
create policy favorites_own on public.favorites
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists friendships_parties on public.friendships;
create policy friendships_parties on public.friendships
  for select to authenticated
  using (
    requester_id = (select auth.uid())
    or addressee_id = (select auth.uid())
  );

drop policy if exists snapshots_own on public.progress_snapshots;
create policy snapshots_own on public.progress_snapshots
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists lesson_comments_select on public.lesson_comments;
create policy lesson_comments_select on public.lesson_comments
  for select to authenticated
  using (true);

-- Žádný insert/update/delete grant na xp_events, daily_activity, lesson_items,
-- lesson_progress, quiz_attempts, friendships, comments. Zápis jde jen přes
-- SECURITY DEFINER funkce, které katalog a roli kontrolují samy.

-- ---------------------------------------------------------------------------
-- Pohledy security_invoker (RLS volajícího platí)
-- ---------------------------------------------------------------------------

create or replace view public.xp_totals
with (security_invoker = true) as
select
  p.user_id,
  p.all_time_xp,
  case when p.week_start = public.prague_week_monday() then p.weekly_xp else 0 end as weekly_xp
from public.profiles p;

create or replace view public.friend_leaderboard
with (security_invoker = true) as
select
  p.display_name,
  public.level_for(p.all_time_xp) as level,
  p.all_time_xp,
  case when p.week_start = public.prague_week_monday() then p.weekly_xp else 0 end as weekly_xp
from public.profiles p;

comment on view public.friend_leaderboard is
  'Já a přijatí kamarádi, kteří žebříček kamarádů nevypnuli. Jen přezdívka, úroveň a XP.';

create or replace view public.site_leaderboard
with (security_invoker = true) as
select
  b.display_name,
  public.level_for(b.all_time_xp) as level,
  b.all_time_xp,
  case when b.week_start = public.prague_week_monday() then b.weekly_xp else 0 end as weekly_xp
from public.site_board b
where b.show_on_site;

comment on view public.site_leaderboard is
  'Žebříček přihlášených, kteří se neodhlásili. Bez e-mailu a bez user_id.';

create or replace view public.lesson_progress_feed
with (security_invoker = true) as
select
  lp.user_id,
  lp.lesson_slug,
  lp.status,
  lp.items_done,
  lp.items_total,
  lp.pct,
  lp.completed_manually
from public.lesson_progress lp;

create or replace view public.lesson_comments_feed
with (security_invoker = true) as
select
  c.id,
  c.lesson_slug,
  c.body,
  c.pinned,
  c.created_at,
  c.updated_at,
  'Moderátor'::text as author_label
from public.lesson_comments c;

comment on view public.lesson_comments_feed is
  'Komentáře k lekci pro přihlášené. Bez author_id a bez e-mailu.';

revoke all on public.xp_totals, public.friend_leaderboard, public.site_leaderboard,
  public.lesson_progress_feed, public.lesson_comments_feed
  from public, anon, authenticated;
grant select on public.xp_totals to authenticated;
grant select on public.friend_leaderboard to authenticated;
grant select on public.site_leaderboard to authenticated;
grant select on public.lesson_progress_feed to authenticated;
grant select on public.lesson_comments_feed to authenticated;
-- catalog seed
insert into public.lessons (slug, title, subject, sort) values
('svaly-hlavy-krku','Svaly hlavy a krku','Anatomie',1),
('axialni-system','Axiální systém','Anatomie',2),
('latina-lekce-01','Latina 1','Latina',3),
('latina-lekce-02','Latina 2','Latina',4),
('latina-lekce-03','Latina 3','Latina',5),
('latina-lekce-04','Latina 4','Latina',6),
('latina-lekce-05','Latina 5','Latina',7),
('latina-lekce-06','Latina 6','Latina',8)
on conflict (slug) do nothing;

insert into public.activity_catalog (lesson_slug, item_key, source) values
('svaly-hlavy-krku','b01_0','study'),
('svaly-hlavy-krku','b01_1','study'),
('svaly-hlavy-krku','b01_2','study'),
('svaly-hlavy-krku','b01_3','study'),
('svaly-hlavy-krku','b01_4','study'),
('svaly-hlavy-krku','b01_5','study'),
('svaly-hlavy-krku','b02_0','study'),
('svaly-hlavy-krku','b02_1','study'),
('svaly-hlavy-krku','b02_2','study'),
('svaly-hlavy-krku','b02_3','study'),
('svaly-hlavy-krku','b02_4','study'),
('svaly-hlavy-krku','b02_5','study'),
('svaly-hlavy-krku','b02_6','study'),
('svaly-hlavy-krku','b03_0','study'),
('svaly-hlavy-krku','b03_1','study'),
('svaly-hlavy-krku','b03_2','study'),
('svaly-hlavy-krku','b03_3','study'),
('svaly-hlavy-krku','b03_4','study'),
('svaly-hlavy-krku','b03_5','study'),
('svaly-hlavy-krku','b03_6','study'),
('svaly-hlavy-krku','b04_0','study'),
('svaly-hlavy-krku','b04_1','study'),
('svaly-hlavy-krku','b04_2','study'),
('svaly-hlavy-krku','b04_3','study'),
('svaly-hlavy-krku','b04_4','study'),
('svaly-hlavy-krku','b04_5','study'),
('svaly-hlavy-krku','b05_0','study'),
('svaly-hlavy-krku','b05_1','study'),
('svaly-hlavy-krku','b05_2','study'),
('svaly-hlavy-krku','b05_3','study'),
('svaly-hlavy-krku','b05_4','study'),
('svaly-hlavy-krku','b05_5','study'),
('svaly-hlavy-krku','b05_6','study'),
('svaly-hlavy-krku','b06_0','study'),
('svaly-hlavy-krku','b06_1','study'),
('svaly-hlavy-krku','b06_2','study'),
('svaly-hlavy-krku','b06_3','study'),
('svaly-hlavy-krku','b06_4','study'),
('svaly-hlavy-krku','b06_5','study'),
('svaly-hlavy-krku','b06_6','study'),
('svaly-hlavy-krku','b07_0','study'),
('svaly-hlavy-krku','b07_1','study'),
('svaly-hlavy-krku','b07_2','study'),
('svaly-hlavy-krku','b07_3','study'),
('svaly-hlavy-krku','b07_4','study'),
('svaly-hlavy-krku','b07_5','study'),
('svaly-hlavy-krku','b08_0','study'),
('svaly-hlavy-krku','b08_1','study'),
('svaly-hlavy-krku','b08_2','study'),
('svaly-hlavy-krku','b08_3','study'),
('svaly-hlavy-krku','b08_4','study'),
('svaly-hlavy-krku','b08_5','study'),
('svaly-hlavy-krku','exam_0','study'),
('axialni-system','b01_0','study'),
('axialni-system','b01_1','study'),
('axialni-system','b01_2','study'),
('axialni-system','b01_3','study'),
('axialni-system','b01_4','study'),
('axialni-system','b01_5','study'),
('axialni-system','b02_0','study'),
('axialni-system','b02_1','study'),
('axialni-system','b02_2','study'),
('axialni-system','b02_3','study'),
('axialni-system','b02_4','study'),
('axialni-system','b02_5','study'),
('axialni-system','b02_6','study'),
('axialni-system','b03_0','study'),
('axialni-system','b03_1','study'),
('axialni-system','b03_2','study'),
('axialni-system','b03_3','study'),
('axialni-system','b03_4','study'),
('axialni-system','b03_5','study'),
('axialni-system','b03_6','study'),
('axialni-system','b04_0','study'),
('axialni-system','b04_1','study'),
('axialni-system','b04_2','study'),
('axialni-system','b04_3','study'),
('axialni-system','b04_4','study'),
('axialni-system','b04_5','study'),
('axialni-system','b05_0','study'),
('axialni-system','b05_1','study'),
('axialni-system','b05_2','study'),
('axialni-system','b05_3','study'),
('axialni-system','b05_4','study'),
('axialni-system','b05_5','study'),
('axialni-system','b05_6','study'),
('axialni-system','b06_0','study'),
('axialni-system','b06_1','study'),
('axialni-system','b06_2','study'),
('axialni-system','b06_3','study'),
('axialni-system','b06_4','study'),
('axialni-system','b06_5','study'),
('axialni-system','b06_6','study'),
('axialni-system','b07_0','study'),
('axialni-system','b07_1','study'),
('axialni-system','b07_2','study'),
('axialni-system','b07_3','study'),
('axialni-system','b07_4','study'),
('axialni-system','b08_0','study'),
('axialni-system','b08_1','study'),
('axialni-system','b08_2','study'),
('axialni-system','b08_3','study'),
('axialni-system','b08_4','study'),
('axialni-system','b08_5','study'),
('axialni-system','b09_0','study'),
('axialni-system','b09_1','study'),
('axialni-system','b09_2','study'),
('axialni-system','b09_3','study'),
('axialni-system','b09_4','study'),
('axialni-system','b09_5','study'),
('axialni-system','exam_0','study'),
('latina-lekce-01','s1e0','study'),
('latina-lekce-01','s1e1','study'),
('latina-lekce-01','s1e2','study'),
('latina-lekce-01','s2e0','study'),
('latina-lekce-01','s2e1','study'),
('latina-lekce-01','s2e2','study'),
('latina-lekce-01','s3e0','study'),
('latina-lekce-01','s3e1','study'),
('latina-lekce-01','s4e0','study'),
('latina-lekce-01','s5e0','study'),
('latina-lekce-01','s5e1','study'),
('latina-lekce-01','s6e0','study'),
('latina-lekce-01','s6e1','study'),
('latina-lekce-01','s6e2','study'),
('latina-lekce-01','s7e0','study'),
('latina-lekce-01','s7e1','study'),
('latina-lekce-01','s7e2','study'),
('latina-lekce-01','s8e0','study'),
('latina-lekce-01','s8e1','study'),
('latina-lekce-01','s8e2','study'),
('latina-lekce-01','s9e0','study'),
('latina-lekce-01','s10e0','study'),
('latina-lekce-01','s10e1','study'),
('latina-lekce-01','s10e2','study'),
('latina-lekce-01','s11e0','study'),
('latina-lekce-01','s12e0','study'),
('latina-lekce-01','s12e1','study'),
('latina-lekce-01','s12e2','study'),
('latina-lekce-01','s13e0','study'),
('latina-lekce-01','s13e1','study'),
('latina-lekce-01','s13e2','study'),
('latina-lekce-01','s14e0','study'),
('latina-lekce-01','s14e1','study'),
('latina-lekce-01','s14e2','study'),
('latina-lekce-01','s15e0','study'),
('latina-lekce-01','s15e1','study'),
('latina-lekce-01','s15e2','study'),
('latina-lekce-02','s1e0','study'),
('latina-lekce-02','s1e1','study'),
('latina-lekce-02','s1e2','study'),
('latina-lekce-02','s2e0','study'),
('latina-lekce-02','s2e1','study'),
('latina-lekce-02','s2e2','study'),
('latina-lekce-02','s3e0','study'),
('latina-lekce-02','s4e0','study'),
('latina-lekce-02','s4e1','study'),
('latina-lekce-02','s5e0','study'),
('latina-lekce-02','s6e0','study'),
('latina-lekce-02','s7e0','study'),
('latina-lekce-02','s7e1','study'),
('latina-lekce-02','s7e2','study'),
('latina-lekce-02','s8e0','study'),
('latina-lekce-02','s8e1','study'),
('latina-lekce-02','s8e2','study'),
('latina-lekce-02','s9e0','study'),
('latina-lekce-02','s10e0','study'),
('latina-lekce-02','s10e1','study'),
('latina-lekce-02','s10e2','study'),
('latina-lekce-02','s11e0','study'),
('latina-lekce-02','s11e1','study'),
('latina-lekce-02','s11e2','study'),
('latina-lekce-02','s12e0','study'),
('latina-lekce-02','s12e1','study'),
('latina-lekce-02','s12e2','study'),
('latina-lekce-02','s13e0','study'),
('latina-lekce-02','s13e1','study'),
('latina-lekce-02','s13e2','study'),
('latina-lekce-02','s14e0','study'),
('latina-lekce-02','s14e1','study'),
('latina-lekce-02','s14e2','study'),
('latina-lekce-02','s15e0','study'),
('latina-lekce-02','s15e1','study'),
('latina-lekce-02','s15e2','study'),
('latina-lekce-02','s16e0','study'),
('latina-lekce-02','s16e1','study'),
('latina-lekce-02','s16e2','study'),
('latina-lekce-02','s17e0','study'),
('latina-lekce-02','s17e1','study'),
('latina-lekce-02','s17e2','study'),
('latina-lekce-02','s18e0','study'),
('latina-lekce-02','s19e0','study'),
('latina-lekce-02','s20e0','study'),
('latina-lekce-02','s21e0','study'),
('latina-lekce-02','s21e1','study'),
('latina-lekce-02','s21e2','study'),
('latina-lekce-03','s1e0','study'),
('latina-lekce-03','s1e1','study'),
('latina-lekce-03','s1e2','study'),
('latina-lekce-03','s2e0','study'),
('latina-lekce-03','s2e1','study'),
('latina-lekce-03','s3e0','study'),
('latina-lekce-03','s3e1','study'),
('latina-lekce-03','s3e2','study'),
('latina-lekce-03','s4e0','study'),
('latina-lekce-03','s5e0','study'),
('latina-lekce-03','s6e0','study'),
('latina-lekce-03','s7e0','study'),
('latina-lekce-03','s7e1','study'),
('latina-lekce-03','s8e0','study'),
('latina-lekce-03','s9e0','study'),
('latina-lekce-03','s9e1','study'),
('latina-lekce-03','s9e2','study'),
('latina-lekce-03','s10e0','study'),
('latina-lekce-03','s10e1','study'),
('latina-lekce-03','s10e2','study'),
('latina-lekce-03','s11e0','study'),
('latina-lekce-03','s12e0','study'),
('latina-lekce-03','s12e1','study'),
('latina-lekce-03','s12e2','study'),
('latina-lekce-03','s13e0','study'),
('latina-lekce-03','s13e1','study'),
('latina-lekce-03','s13e2','study'),
('latina-lekce-03','s14e0','study'),
('latina-lekce-03','s14e1','study'),
('latina-lekce-03','s14e2','study'),
('latina-lekce-03','s15e0','study'),
('latina-lekce-03','s15e1','study'),
('latina-lekce-03','s15e2','study'),
('latina-lekce-03','s16e0','study'),
('latina-lekce-03','s16e1','study'),
('latina-lekce-03','s16e2','study'),
('latina-lekce-03','s17e0','study'),
('latina-lekce-03','s17e1','study'),
('latina-lekce-03','s17e2','study'),
('latina-lekce-03','s18e0','study'),
('latina-lekce-03','s19e0','study'),
('latina-lekce-03','s19e1','study'),
('latina-lekce-03','s19e2','study'),
('latina-lekce-03','s20e0','study'),
('latina-lekce-03','s20e1','study'),
('latina-lekce-03','s20e2','study'),
('latina-lekce-03','s21e0','study'),
('latina-lekce-03','s22e0','study'),
('latina-lekce-03','s23e0','study'),
('latina-lekce-03','s24e0','study'),
('latina-lekce-03','s24e1','study'),
('latina-lekce-03','s24e2','study'),
('latina-lekce-03','s25e0','study'),
('latina-lekce-03','s25e1','study'),
('latina-lekce-04','s1e0','study'),
('latina-lekce-04','s1e1','study'),
('latina-lekce-04','s1e2','study'),
('latina-lekce-04','s2e0','study'),
('latina-lekce-04','s2e1','study'),
('latina-lekce-04','s2e2','study'),
('latina-lekce-04','s3e0','study'),
('latina-lekce-04','s3e1','study'),
('latina-lekce-04','s3e2','study'),
('latina-lekce-04','s4e0','study'),
('latina-lekce-04','s5e0','study'),
('latina-lekce-04','s6e0','study'),
('latina-lekce-04','s6e1','study'),
('latina-lekce-04','s6e2','study'),
('latina-lekce-04','s7e0','study'),
('latina-lekce-04','s7e1','study'),
('latina-lekce-04','s7e2','study'),
('latina-lekce-04','s8e0','study'),
('latina-lekce-04','s8e1','study'),
('latina-lekce-04','s8e2','study'),
('latina-lekce-04','s9e0','study'),
('latina-lekce-04','s9e1','study'),
('latina-lekce-04','s9e2','study'),
('latina-lekce-04','s10e0','study'),
('latina-lekce-04','s10e1','study'),
('latina-lekce-04','s10e2','study'),
('latina-lekce-04','s11e0','study'),
('latina-lekce-04','s11e1','study'),
('latina-lekce-04','s11e2','study'),
('latina-lekce-04','s12e0','study'),
('latina-lekce-04','s12e1','study'),
('latina-lekce-04','s12e2','study'),
('latina-lekce-04','s13e0','study'),
('latina-lekce-04','s13e1','study'),
('latina-lekce-04','s13e2','study'),
('latina-lekce-04','s14e0','study'),
('latina-lekce-04','s14e1','study'),
('latina-lekce-04','s14e2','study'),
('latina-lekce-04','s15e0','study'),
('latina-lekce-04','s15e1','study'),
('latina-lekce-04','s15e2','study'),
('latina-lekce-04','s16e0','study'),
('latina-lekce-04','s16e1','study'),
('latina-lekce-04','s16e2','study'),
('latina-lekce-04','s17e0','study'),
('latina-lekce-04','s17e1','study'),
('latina-lekce-04','s17e2','study'),
('latina-lekce-04','s18e0','study'),
('latina-lekce-04','s18e1','study'),
('latina-lekce-04','s19e0','study'),
('latina-lekce-05','s1e0','study'),
('latina-lekce-05','s1e1','study'),
('latina-lekce-05','s1e2','study'),
('latina-lekce-05','s2e0','study'),
('latina-lekce-05','s2e1','study'),
('latina-lekce-05','s2e2','study'),
('latina-lekce-05','s3e0','study'),
('latina-lekce-05','s3e1','study'),
('latina-lekce-05','s3e2','study'),
('latina-lekce-05','s4e0','study'),
('latina-lekce-05','s4e1','study'),
('latina-lekce-05','s4e2','study'),
('latina-lekce-05','s6e0','study'),
('latina-lekce-05','s6e1','study'),
('latina-lekce-05','s6e2','study'),
('latina-lekce-05','s7e0','study'),
('latina-lekce-05','s7e1','study'),
('latina-lekce-05','s7e2','study'),
('latina-lekce-05','s8e0','study'),
('latina-lekce-05','s8e1','study'),
('latina-lekce-05','s8e2','study'),
('latina-lekce-05','s9e0','study'),
('latina-lekce-05','s9e1','study'),
('latina-lekce-05','s9e2','study'),
('latina-lekce-05','s10e0','study'),
('latina-lekce-05','s10e1','study'),
('latina-lekce-05','s10e2','study'),
('latina-lekce-05','s11e0','study'),
('latina-lekce-05','s11e1','study'),
('latina-lekce-05','s11e2','study'),
('latina-lekce-05','s12e0','study'),
('latina-lekce-05','s12e1','study'),
('latina-lekce-05','s12e2','study'),
('latina-lekce-05','s13e0','study'),
('latina-lekce-05','s13e1','study'),
('latina-lekce-05','s13e2','study'),
('latina-lekce-05','s14e0','study'),
('latina-lekce-05','s14e1','study'),
('latina-lekce-05','s14e2','study'),
('latina-lekce-05','s15e0','study'),
('latina-lekce-05','s15e1','study'),
('latina-lekce-05','s15e2','study'),
('latina-lekce-05','s16e0','study'),
('latina-lekce-05','s16e1','study'),
('latina-lekce-05','s16e2','study'),
('latina-lekce-05','s17e0','study'),
('latina-lekce-05','s17e1','study'),
('latina-lekce-05','s17e2','study'),
('latina-lekce-05','s18e0','study'),
('latina-lekce-05','s18e1','study'),
('latina-lekce-05','s18e2','study'),
('latina-lekce-05','s19e0','study'),
('latina-lekce-05','s20e0','study'),
('latina-lekce-05','s21e0','study'),
('latina-lekce-06','s1e0','study'),
('latina-lekce-06','s1e1','study'),
('latina-lekce-06','s1e2','study'),
('latina-lekce-06','s2e0','study'),
('latina-lekce-06','s2e1','study'),
('latina-lekce-06','s2e2','study'),
('latina-lekce-06','s3e0','study'),
('latina-lekce-06','s3e1','study'),
('latina-lekce-06','s3e2','study'),
('latina-lekce-06','s4e0','study'),
('latina-lekce-06','s4e1','study'),
('latina-lekce-06','s4e2','study'),
('latina-lekce-06','s5e0','study'),
('latina-lekce-06','s5e1','study'),
('latina-lekce-06','s5e2','study'),
('latina-lekce-06','s6e0','study'),
('latina-lekce-06','s6e1','study'),
('latina-lekce-06','s6e2','study'),
('latina-lekce-06','s7e0','study'),
('latina-lekce-06','s8e0','study'),
('latina-lekce-06','s9e0','study'),
('latina-lekce-06','s9e1','study'),
('latina-lekce-06','s9e2','study'),
('latina-lekce-06','s10e0','study'),
('latina-lekce-06','s10e1','study'),
('latina-lekce-06','s10e2','study'),
('latina-lekce-06','s11e0','study'),
('latina-lekce-06','s11e1','study'),
('latina-lekce-06','s11e2','study'),
('latina-lekce-06','s12e0','study'),
('latina-lekce-06','s12e1','study'),
('latina-lekce-06','s12e2','study'),
('latina-lekce-06','s13e0','study'),
('latina-lekce-06','s13e1','study'),
('latina-lekce-06','s13e2','study'),
('latina-lekce-06','s14e0','study'),
('latina-lekce-06','s14e1','study'),
('latina-lekce-06','s14e2','study'),
('latina-lekce-06','s15e0','study'),
('latina-lekce-06','s15e1','study'),
('latina-lekce-06','s15e2','study'),
('latina-lekce-06','s16e0','study'),
('latina-lekce-06','s16e1','study'),
('latina-lekce-06','s16e2','study'),
('latina-lekce-06','s17e0','study'),
('latina-lekce-06','s17e1','study'),
('latina-lekce-06','s17e2','study'),
('latina-lekce-06','s18e0','study'),
('latina-lekce-06','s18e1','study'),
('latina-lekce-06','s18e2','study'),
('latina-lekce-06','s19e0','study'),
('svaly-hlavy-krku','exam_0','exam'),
('axialni-system','exam_0','exam'),
('simulace-latina','simulace','simulace'),
('svaly-hlavy-krku','ch01','lekce'),
('svaly-hlavy-krku','a01','anki_pause'),
('svaly-hlavy-krku','ch02','lekce'),
('svaly-hlavy-krku','a02','anki_pause'),
('svaly-hlavy-krku','ch03','lekce'),
('svaly-hlavy-krku','a03','anki_pause'),
('svaly-hlavy-krku','ch04','lekce'),
('svaly-hlavy-krku','a04','anki_pause'),
('svaly-hlavy-krku','ch05','lekce'),
('svaly-hlavy-krku','a05','anki_pause'),
('svaly-hlavy-krku','ch06','lekce'),
('svaly-hlavy-krku','a06','anki_pause'),
('svaly-hlavy-krku','ch07','lekce'),
('svaly-hlavy-krku','a07','anki_pause'),
('svaly-hlavy-krku','ch08','lekce'),
('svaly-hlavy-krku','a08','anki_pause')
on conflict do nothing;

insert into public.chapter_requirements (lesson_slug, chapter_key, step_key) values
('svaly-hlavy-krku','ch01','r01_0'),
('svaly-hlavy-krku','ch01','x01_0_0'),
('svaly-hlavy-krku','ch01','x01_0_1'),
('svaly-hlavy-krku','ch01','x01_0_2'),
('svaly-hlavy-krku','ch01','r01_1'),
('svaly-hlavy-krku','ch01','x01_1_0'),
('svaly-hlavy-krku','ch01','x01_1_1'),
('svaly-hlavy-krku','ch01','x01_1_2'),
('svaly-hlavy-krku','ch02','r02_0'),
('svaly-hlavy-krku','ch02','x02_0_0'),
('svaly-hlavy-krku','ch02','x02_0_1'),
('svaly-hlavy-krku','ch02','x02_0_2'),
('svaly-hlavy-krku','ch02','r02_1'),
('svaly-hlavy-krku','ch02','x02_1_0'),
('svaly-hlavy-krku','ch02','x02_1_1'),
('svaly-hlavy-krku','ch02','x02_1_2'),
('svaly-hlavy-krku','ch03','r03_0'),
('svaly-hlavy-krku','ch03','x03_0_0'),
('svaly-hlavy-krku','ch03','x03_0_1'),
('svaly-hlavy-krku','ch03','x03_0_2'),
('svaly-hlavy-krku','ch03','r03_1'),
('svaly-hlavy-krku','ch03','x03_1_0'),
('svaly-hlavy-krku','ch03','x03_1_1'),
('svaly-hlavy-krku','ch03','x03_1_2'),
('svaly-hlavy-krku','ch04','r04_0'),
('svaly-hlavy-krku','ch04','x04_0_0'),
('svaly-hlavy-krku','ch04','x04_0_1'),
('svaly-hlavy-krku','ch04','x04_0_2'),
('svaly-hlavy-krku','ch04','r04_1'),
('svaly-hlavy-krku','ch04','x04_1_0'),
('svaly-hlavy-krku','ch04','x04_1_1'),
('svaly-hlavy-krku','ch04','x04_1_2'),
('svaly-hlavy-krku','ch05','r05_0'),
('svaly-hlavy-krku','ch05','x05_0_0'),
('svaly-hlavy-krku','ch05','x05_0_1'),
('svaly-hlavy-krku','ch05','x05_0_2'),
('svaly-hlavy-krku','ch05','r05_1'),
('svaly-hlavy-krku','ch05','x05_1_0'),
('svaly-hlavy-krku','ch05','x05_1_1'),
('svaly-hlavy-krku','ch05','x05_1_2'),
('svaly-hlavy-krku','ch06','r06_0'),
('svaly-hlavy-krku','ch06','x06_0_0'),
('svaly-hlavy-krku','ch06','x06_0_1'),
('svaly-hlavy-krku','ch06','x06_0_2'),
('svaly-hlavy-krku','ch06','r06_1'),
('svaly-hlavy-krku','ch06','x06_1_0'),
('svaly-hlavy-krku','ch06','x06_1_1'),
('svaly-hlavy-krku','ch06','x06_1_2'),
('svaly-hlavy-krku','ch07','r07_0'),
('svaly-hlavy-krku','ch07','x07_0_0'),
('svaly-hlavy-krku','ch07','x07_0_1'),
('svaly-hlavy-krku','ch07','x07_0_2'),
('svaly-hlavy-krku','ch07','r07_1'),
('svaly-hlavy-krku','ch07','x07_1_0'),
('svaly-hlavy-krku','ch07','x07_1_1'),
('svaly-hlavy-krku','ch07','x07_1_2'),
('svaly-hlavy-krku','ch08','r08_0'),
('svaly-hlavy-krku','ch08','x08_0_0'),
('svaly-hlavy-krku','ch08','x08_0_1'),
('svaly-hlavy-krku','ch08','x08_0_2'),
('svaly-hlavy-krku','ch08','r08_1'),
('svaly-hlavy-krku','ch08','x08_1_0'),
('svaly-hlavy-krku','ch08','x08_1_1'),
('svaly-hlavy-krku','ch08','x08_1_2')
on conflict do nothing;
