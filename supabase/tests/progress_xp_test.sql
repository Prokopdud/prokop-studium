-- Runs against a database where bootstrap.sql and the progress migration are applied.
\set ON_ERROR_STOP on

create or replace function public._t(cond boolean, msg text)
returns void
language plpgsql
as $$
begin
  if cond is not true then
    raise exception 'TEST FAIL: %', msg;
  end if;
end;
$$;
grant execute on function public._t(boolean, text) to authenticated;

begin;

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'hidden-a@example.com'),
  ('22222222-2222-4222-8222-222222222222', 'hidden-b@example.com'),
  ('33333333-3333-4333-8333-333333333333', 'hidden-c@example.com');
insert into public.user_roles (user_id, role) values
  ('11111111-1111-4111-8111-111111111111', 'user'),
  ('22222222-2222-4222-8222-222222222222', 'moderator'),
  ('33333333-3333-4333-8333-333333333333', 'user');

select public._t(public.level_for(0) = 1, 'level 0');
select public._t(public.level_for(99) = 1, 'level 99');
select public._t(public.level_for(100) = 2, 'level 100');
select public._t(public.level_for(299) = 2, 'level 299');
select public._t(public.level_for(300) = 3, 'level 300');
select public._t(public.level_for(1000) = 5, 'level 1000');
select public._t(public.level_for(2099) = 6, 'level 2099');
select public._t(public.level_for(2100) = 7, 'level 2100');
select public._t(public.level_for(4499) = 9, 'level 4499');
select public._t(public.level_for(4500) = 10, 'level 4500');
select public._t((select count(*) from public.activity_catalog where source = 'study') = 405, '405 exercises');
select public._t((select count(*) from public.lessons) = 8, '8 lessons');

select public._t(
  (select c.reloptions @> array['security_invoker=true']
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'site_leaderboard'),
  'site view invoker');
select public._t(
  (select c.reloptions @> array['security_invoker=true']
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'friend_leaderboard'),
  'friend view invoker');
select public._t(
  (select c.reloptions @> array['security_invoker=true']
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'lesson_comments_feed'),
  'comments view invoker');

-- User A: auto nickname, no email in the payload.
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
set local role authenticated;
select public._t((public.ensure_profile()->>'display_name') like 'Student-%', 'auto nick');
select public._t((public.ensure_profile()->>'friend_code') ~ '^STUD-[A-Z0-9]{4}$', 'friend code');
select public._t(position('hidden-a@example.com' in public.my_dashboard()::text) = 0, 'dashboard hides email');
select public._t((public.my_dashboard()->'profile'->>'exercises_total')::int = 405, 'dash total');

-- Cannot write XP directly.
select public._t(
  (select has_table_privilege('authenticated', 'public.xp_events', 'INSERT') = false),
  'no insert xp');

-- Unknown exercise is rejected.
do $$
begin
  begin
    perform public.record_study_item('latina_study_L1', 'not_a_real_item', null, null);
    raise exception 'should have failed';
  exception when others then
    if sqlerrm not like '%invalid_item%' and sqlerrm not like '%should have failed%' then
      if position('invalid_item' in sqlerrm) = 0 then
        raise exception 'unexpected: %', sqlerrm;
      end if;
    end if;
    if position('invalid_item' in sqlerrm) = 0 then
      raise exception 'expected invalid_item, got %', sqlerrm;
    end if;
  end;
end $$;

-- First exercise: 10 XP. Same day again: 0.
select public._t((public.record_study_item('latina_study_L1', 's1e0', null, null)->>'awarded')::int = 10, 'first 10');
select public._t((public.record_study_item('latina_study_L1', 's1e0', null, null)->>'mode') = 'same', 'same day');
select public._t((public.record_study_item('latina_study_L1', 's1e1', null, null)->>'awarded')::int = 10, 'second item');

-- Manual complete with almost nothing done still grants +50 once.
select public._t((public.sync_snapshot('sh_done', '{"latina-lekce-01":1}'::jsonb)->>'awarded')::int = 50, 'manual 50');
select public._t((public.sync_snapshot('sh_done', '{"latina-lekce-01":1}'::jsonb)->>'awarded')::int = 0, 'manual once');

reset role;
select public._t(
  (select all_time_xp from public.profiles where user_id = '11111111-1111-4111-8111-111111111111') = 70,
  'xp 10+10+50');
select public._t(
  (select status = 'completed' and items_done = 2 and completed_manually
   from public.lesson_progress
   where user_id = '11111111-1111-4111-8111-111111111111' and lesson_slug = 'latina-lekce-01'),
  'manual status');

-- Client cannot inflate XP or reopen import.
set local role authenticated;
update public.profiles set display_name = 'Zabka' where user_id = auth.uid();
do $$
begin
  begin
    update public.profiles set all_time_xp = 999999 where user_id = auth.uid();
    raise exception 'xp update should be denied';
  exception when insufficient_privilege then
    null;
  end;
end $$;
reset role;
select public._t(
  (select display_name = 'Zabka' and all_time_xp = 70 and progress_imported_at is null
   from public.profiles where user_id = '11111111-1111-4111-8111-111111111111'),
  'name changed xp locked');

-- Import of stored browser progress bypasses the daily cap once, then locks.
set local role authenticated;
select public.import_browser_progress('{"latina_study_L2":{"s1e0":{"ok":1,"t":1,"best":100},"s1e1":{"ok":1,"t":1,"best":80},"seen0":1}}'::jsonb);
select public._t((public.my_dashboard()->'profile'->>'imported')::boolean, 'imported flag');
select public.import_browser_progress('{"latina_study_L3":{"s1e0":{"ok":1,"t":1,"best":100}}}'::jsonb);
reset role;
select public._t(
  (select items_done = 2 from public.lesson_progress
   where user_id = '11111111-1111-4111-8111-111111111111' and lesson_slug = 'latina-lekce-02'),
  'imported latina 2');
select public._t(
  not exists (
    select 1 from public.lesson_items
    where user_id = '11111111-1111-4111-8111-111111111111' and lesson_slug = 'latina-lekce-03'
  ),
  'second import ignored');

-- Daily cap on live recording: fresh user C, real catalog keys.
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
set local role authenticated;
select public.ensure_profile();
select public.import_browser_progress('{}'::jsonb);
do $$
declare
  r record;
begin
  for r in
    select item_key from public.activity_catalog
    where lesson_slug = 'latina-lekce-06' and source = 'study'
    order by item_key
  loop
    perform public.record_study_item('latina_study_L6', r.item_key, null, null);
  end loop;
end $$;
reset role;
select public._t(
  (select all_time_xp <= 200 from public.profiles where user_id = '33333333-3333-4333-8333-333333333333'),
  'daily cap');
select public._t(
  (select all_time_xp = 200 from public.profiles where user_id = '33333333-3333-4333-8333-333333333333'),
  'daily cap filled');

-- Review next day is +2, same lesson cap 20. Streak grows when a chapter qualifies.
select set_config('progress.internal', '1', true);
update public.lesson_items
set last_completed_at = now() - interval '1 day'
where user_id = '11111111-1111-4111-8111-111111111111' and item_key = 's1e0';
update public.profiles
set last_activity_on = public.prague_today() - 1,
    current_streak = 1
where user_id = '11111111-1111-4111-8111-111111111111';
select set_config('progress.internal', '', true);

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
set local role authenticated;
select public._t((public.record_study_item('latina_study_L1', 's1e0', null, null)->>'mode') = 'review', 'review mode');
reset role;
select public._t(
  exists (
    select 1 from public.xp_events
    where user_id = '11111111-1111-4111-8111-111111111111'
      and reason = 'item_review' and amount = 2 and item_key = 's1e0'
  ),
  'review 2 xp');

-- Chapter + anki from the reading lesson. One chapter qualifies the streak.
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
set local role authenticated;
select public.ensure_profile();
select public.import_browser_progress('{}'::jsonb);
select public.sync_snapshot('sg_hk_proto_v1', '{
  "r01_0":1,"r01_1":1,"x01_0_0":1,"x01_0_1":1,"x01_0_2":1,"x01_1_0":1,"x01_1_1":1,"x01_1_2":1,
  "a01":1
}'::jsonb);
reset role;
select public._t(
  exists (
    select 1 from public.xp_events
    where user_id = '22222222-2222-4222-8222-222222222222' and reason = 'chapter' and amount = 25
  ),
  'chapter 25');
select public._t(
  exists (
    select 1 from public.xp_events
    where user_id = '22222222-2222-4222-8222-222222222222' and reason = 'anki_check' and amount = 15
  ),
  'anki 15');
select public._t(
  (select private._effective_streak(last_activity_on, current_streak) >= 1
   from public.profiles where user_id = '22222222-2222-4222-8222-222222222222'),
  'streak from chapter');

-- Quiz: first 100% is 40+20+20. Same day again is 0. Move today's cap off user C first.
update public.daily_activity
set day = public.prague_today() - 1
where user_id = '33333333-3333-4333-8333-333333333333' and day = public.prague_today();
update public.xp_events
set occurred_on = public.prague_today() - 1
where user_id = '33333333-3333-4333-8333-333333333333' and occurred_on = public.prague_today();

select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
set local role authenticated;
select public._t((public.record_quiz('simulace', 'simulace-latina', 'A', 10, 10)->>'awarded')::int = 80, 'quiz 100');
select public._t((public.record_quiz('simulace', 'simulace-latina', 'B', 10, 10)->>'awarded')::int = 0, 'quiz same day');
do $$
begin
  begin
    perform public.save_lesson_comment(null, 'svaly-hlavy-krku', 'nemam roli', false);
    raise exception 'comment should fail';
  exception when others then
    if position('forbidden' in sqlerrm) = 0 then
      raise exception 'expected forbidden, got %', sqlerrm;
    end if;
  end;
end $$;
reset role;

-- Moderator writes, student reads the feed without author_id, direct author_id is denied.
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
set local role authenticated;
select public._t(
  (public.save_lesson_comment(null, 'svaly-hlavy-krku', 'Na zkoušce se ptají na masseter.', true)->>'ok')::boolean,
  'mod insert');
select public._t((select author_label = 'Moderátor' and pinned from public.lesson_comments_feed where lesson_slug = 'svaly-hlavy-krku'), 'feed label');
do $$
begin
  begin
    perform author_id from public.lesson_comments;
    raise exception 'author column should be hidden';
  exception when insufficient_privilege then
    null;
  end;
end $$;
reset role;

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
set local role authenticated;
select public._t(
  (select body like '%masseter%' from public.lesson_comments_feed where lesson_slug = 'svaly-hlavy-krku'),
  'student reads comment');
do $$
begin
  begin
    perform public.save_lesson_comment(null, 'svaly-hlavy-krku', 'student', false);
    raise exception 'student comment should fail';
  exception when others then
    if position('forbidden' in sqlerrm) = 0 then
      raise exception 'expected forbidden, got %', sqlerrm;
    end if;
  end;
end $$;
reset role;

-- Friends and both leaderboards. No email column anywhere in the new views.
select public._t(
  (select count(*) from information_schema.columns
   where table_schema = 'public'
     and table_name in (
       'profiles','site_board','lesson_progress','lesson_items','xp_events',
       'friendships','lesson_comments','friend_leaderboard','site_leaderboard',
       'lesson_comments_feed'
     )
     and column_name ilike '%email%') = 0,
  'no email columns');

select friend_code as b_code from public.profiles
where user_id = '22222222-2222-4222-8222-222222222222' \gset

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
set local role authenticated;
select public._t(
  (select count(*) from public.friend_leaderboard) = 1,
  'friends board is only me');
select public._t(
  (select display_name from public.site_leaderboard where display_name = 'Zabka') = 'Zabka',
  'site board shows nick');
select public._t((public.send_friend_request(:'b_code')->>'ok')::boolean, 'request sent');
select public._t(
  (select count(*) from public.friend_leaderboard where display_name <> 'Zabka') = 0,
  'pending is not on the board');
reset role;

select id as friend_req from public.friendships
where addressee_id = '22222222-2222-4222-8222-222222222222' and status = 'pending' \gset

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
set local role authenticated;
select public._t((public.respond_friend(:friend_req, true)->>'ok')::boolean, 'accept');
select public._t(
  (select count(*) from public.friend_leaderboard) = 2,
  'both friends listed');
select public._t(
  jsonb_array_length(public.friend_lessons('Zabka')) = 8,
  'friend sees lessons');
reset role;

-- A opts out of the friends board: B no longer sees A's XP or checkmarks, but the friendship stays.
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
set local role authenticated;
select public.set_privacy(true, false);
reset role;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
set local role authenticated;
select public._t(
  (select count(*) from public.friend_leaderboard where display_name = 'Zabka') = 0,
  'opt out of friends board');
select public._t(
  jsonb_array_length(public.friend_lessons('Zabka')) = 0,
  'opt out hides checkmarks');
select public._t(
  exists (
    select 1
    from jsonb_array_elements(public.my_dashboard()->'friends') f
    where f->>'display_name' = 'Zabka' and f->>'status' = 'accepted'
  ),
  'friendship remains');
reset role;

-- A opts out of the whole-site board.
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
set local role authenticated;
select public.set_privacy(false, false);
reset role;
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
set local role authenticated;
select public._t(
  (select count(*) from public.site_leaderboard where display_name = 'Zabka') = 0,
  'opt out of site board');
select public._t(
  (select count(*) from public.lesson_progress_feed where user_id <> auth.uid()) = 0,
  'stranger sees no progress');
reset role;

-- Anon cannot read the board.
set local role anon;
do $$
begin
  begin
    perform * from public.site_leaderboard;
    raise exception 'anon should not read';
  exception when insufficient_privilege then
    null;
  end;
end $$;
reset role;

select public._t(true, 'done');
rollback;
