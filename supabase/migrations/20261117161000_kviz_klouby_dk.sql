-- Kvíz Anatomie: klouby a vazy dolní končetiny (kviz-klouby-dk).
-- NENÍ NASAZENO. Tahle migrace se musí aplikovat ručně, agent ji nespouští.
-- Bez ní kvíz dál funguje jen z prohlížeče (localStorage, klíč anat_klouby_dk_v1).
-- sync_snapshot pro ten klíč vrátí unknown_storage_key a record_quiz pro
-- kviz-klouby-dk vrátí invalid_item, dokud katalog lekci nezná.
-- Po aplikaci se snímek zapíše do progress_snapshots, položky q000–q104
-- do activity_catalog (source study) a celé kolo přes record_quiz
-- (source simulace, položka run).

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
    when 'bio_p01_study_v1' then 'biologie-p01'
    when 'bio_p01_lekce_v1' then 'biologie-p01'
    when 'anat_klouby_dk_v1' then 'kviz-klouby-dk'
    else null
  end;
$$;

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
    'sg_hk_proto_v1', 'bio_p01_study_v1', 'bio_p01_lekce_v1', 'anat_klouby_dk_v1', 'sh_done', 'sh_fav', 'sh_last'
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

  if p_key in ('anat_svaly_hk_study_v1', 'anat_axial_study_v1', 'bio_p01_study_v1', 'anat_klouby_dk_v1') then
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

  elsif p_key in ('sg_hk_proto_v1', 'bio_p01_lekce_v1') then
    v_slug := private.slug_from_storage(p_key);
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

  if p_key in ('anat_svaly_hk_study_v1', 'anat_axial_study_v1', 'bio_p01_study_v1', 'anat_klouby_dk_v1')
     or p_key like 'latina_study_L%' then
    delete from public.lesson_items
    where user_id = p_user and lesson_slug = v_slug and source = 'study';
    perform private.recompute_lesson(p_user, v_slug);
  elsif p_key in ('sg_hk_proto_v1', 'bio_p01_lekce_v1') then
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
        'sg_hk_proto_v1', 'bio_p01_study_v1', 'bio_p01_lekce_v1', 'anat_klouby_dk_v1', 'sh_done', 'sh_fav', 'sh_last'
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

insert into public.lessons (slug, title, subject, sort) values
('kviz-klouby-dk','Klouby a vazy dolní končetiny','Anatomie',10)
on conflict (slug) do nothing;

insert into public.activity_catalog (lesson_slug, item_key, source)
select 'kviz-klouby-dk', 'q' || lpad(i::text, 3, '0'), 'study'
from generate_series(0, 104) as i
on conflict do nothing;

insert into public.activity_catalog (lesson_slug, item_key, source) values
('kviz-klouby-dk','run','simulace')
on conflict do nothing;
