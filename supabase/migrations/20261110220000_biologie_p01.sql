-- Biologie, přednáška 1 (Biochemické složení buňky).
-- NENÍ nasazeno. Vlastník migraci aplikuje až po schválení.
-- Bez ní katalog nezná lekci biologie-p01, takže se do účtu nezapíše
-- cvičení, kapitola, Anki pauza, závěrečný test ani bonus za „označit jako hotovo“.
-- Snímky z prohlížeče: bio_p01_study_v1 (cvičení a test) a bio_p01_lekce_v1 (kapitoly a Anki pauza).

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
    'sg_hk_proto_v1', 'bio_p01_study_v1', 'bio_p01_lekce_v1', 'sh_done', 'sh_fav', 'sh_last'
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

  if p_key in ('anat_svaly_hk_study_v1', 'anat_axial_study_v1', 'bio_p01_study_v1') then
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

  if p_key in ('anat_svaly_hk_study_v1', 'anat_axial_study_v1', 'bio_p01_study_v1')
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
        'sg_hk_proto_v1', 'bio_p01_study_v1', 'bio_p01_lekce_v1', 'sh_done', 'sh_fav', 'sh_last'
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
  if v_slug is null or p_storage_key in ('sg_hk_proto_v1', 'bio_p01_lekce_v1') then
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

insert into public.lessons (slug, title, subject, sort) values
('biologie-p01','Přednáška 1 – Biochemické složení buňky','Biologie',9)
on conflict (slug) do nothing;

insert into public.activity_catalog (lesson_slug, item_key, source) values
('biologie-p01','q001','study'),
('biologie-p01','q002','study'),
('biologie-p01','q003','study'),
('biologie-p01','q004','study'),
('biologie-p01','q005','study'),
('biologie-p01','q006','study'),
('biologie-p01','q007','study'),
('biologie-p01','q008','study'),
('biologie-p01','q009','study'),
('biologie-p01','q010','study'),
('biologie-p01','q011','study'),
('biologie-p01','q012','study'),
('biologie-p01','q013','study'),
('biologie-p01','q014','study'),
('biologie-p01','q015','study'),
('biologie-p01','q016','study'),
('biologie-p01','q017','study'),
('biologie-p01','q018','study'),
('biologie-p01','q019','study'),
('biologie-p01','q020','study'),
('biologie-p01','q021','study'),
('biologie-p01','q022','study'),
('biologie-p01','q023','study'),
('biologie-p01','q024','study'),
('biologie-p01','q025','study'),
('biologie-p01','q026','study'),
('biologie-p01','q027','study'),
('biologie-p01','q028','study'),
('biologie-p01','q029','study'),
('biologie-p01','q030','study'),
('biologie-p01','q031','study'),
('biologie-p01','q032','study'),
('biologie-p01','q033','study'),
('biologie-p01','q034','study'),
('biologie-p01','q035','study'),
('biologie-p01','q036','study'),
('biologie-p01','q037','study'),
('biologie-p01','q038','study'),
('biologie-p01','q039','study'),
('biologie-p01','q040','study'),
('biologie-p01','q041','study'),
('biologie-p01','q042','study'),
('biologie-p01','q043','study'),
('biologie-p01','q044','study'),
('biologie-p01','q045','study'),
('biologie-p01','q046','study'),
('biologie-p01','q047','study'),
('biologie-p01','q048','study'),
('biologie-p01','q049','study'),
('biologie-p01','q050','study'),
('biologie-p01','q051','study'),
('biologie-p01','q052','study'),
('biologie-p01','q053','study'),
('biologie-p01','q054','study'),
('biologie-p01','q055','study'),
('biologie-p01','q056','study'),
('biologie-p01','q057','study'),
('biologie-p01','q058','study'),
('biologie-p01','q059','study'),
('biologie-p01','q060','study'),
('biologie-p01','q061','study'),
('biologie-p01','q062','study'),
('biologie-p01','q063','study'),
('biologie-p01','q064','study'),
('biologie-p01','q065','study'),
('biologie-p01','q066','study'),
('biologie-p01','q067','study'),
('biologie-p01','q068','study'),
('biologie-p01','q069','study'),
('biologie-p01','q070','study'),
('biologie-p01','q071','study'),
('biologie-p01','q072','study'),
('biologie-p01','q073','study'),
('biologie-p01','q074','study'),
('biologie-p01','q075','study'),
('biologie-p01','q076','study'),
('biologie-p01','q077','study'),
('biologie-p01','q078','study'),
('biologie-p01','q079','study'),
('biologie-p01','q080','study'),
('biologie-p01','q081','study'),
('biologie-p01','q082','study'),
('biologie-p01','q083','study'),
('biologie-p01','q084','study'),
('biologie-p01','q085','study'),
('biologie-p01','q086','study'),
('biologie-p01','q087','study'),
('biologie-p01','q088','study'),
('biologie-p01','q089','study'),
('biologie-p01','q090','study'),
('biologie-p01','q091','study'),
('biologie-p01','q092','study'),
('biologie-p01','q093','study'),
('biologie-p01','q094','study'),
('biologie-p01','q095','study'),
('biologie-p01','q096','study'),
('biologie-p01','q097','study'),
('biologie-p01','q098','study'),
('biologie-p01','q099','study'),
('biologie-p01','q100','study'),
('biologie-p01','q101','study'),
('biologie-p01','q102','study'),
('biologie-p01','q103','study'),
('biologie-p01','q104','study'),
('biologie-p01','q105','study'),
('biologie-p01','q106','study'),
('biologie-p01','q107','study'),
('biologie-p01','q108','study'),
('biologie-p01','q109','study'),
('biologie-p01','q110','study'),
('biologie-p01','exam_0','study'),
('biologie-p01','exam_0','exam'),
('biologie-p01','ch01','lekce'),
('biologie-p01','ch02','lekce'),
('biologie-p01','ch03','lekce'),
('biologie-p01','ch04','lekce'),
('biologie-p01','ch05','lekce'),
('biologie-p01','ch06','lekce'),
('biologie-p01','ch07','lekce'),
('biologie-p01','ch08','lekce'),
('biologie-p01','ch09','lekce'),
('biologie-p01','a01','anki_pause')
on conflict do nothing;

insert into public.chapter_requirements (lesson_slug, chapter_key, step_key) values
('biologie-p01','ch01','r01'),
('biologie-p01','ch01','q001'),
('biologie-p01','ch01','q002'),
('biologie-p01','ch01','q003'),
('biologie-p01','ch01','q004'),
('biologie-p01','ch01','q005'),
('biologie-p01','ch01','q006'),
('biologie-p01','ch01','q007'),
('biologie-p01','ch01','q008'),
('biologie-p01','ch01','q009'),
('biologie-p01','ch01','q010'),
('biologie-p01','ch02','r02'),
('biologie-p01','ch02','q011'),
('biologie-p01','ch02','q012'),
('biologie-p01','ch02','q013'),
('biologie-p01','ch02','q014'),
('biologie-p01','ch02','q015'),
('biologie-p01','ch02','q016'),
('biologie-p01','ch02','q017'),
('biologie-p01','ch02','q018'),
('biologie-p01','ch03','r03'),
('biologie-p01','ch03','q019'),
('biologie-p01','ch03','q020'),
('biologie-p01','ch03','q021'),
('biologie-p01','ch03','q022'),
('biologie-p01','ch03','q023'),
('biologie-p01','ch03','q024'),
('biologie-p01','ch03','q025'),
('biologie-p01','ch03','q026'),
('biologie-p01','ch03','q027'),
('biologie-p01','ch03','q028'),
('biologie-p01','ch03','q029'),
('biologie-p01','ch03','q030'),
('biologie-p01','ch03','q031'),
('biologie-p01','ch03','q032'),
('biologie-p01','ch04','r04'),
('biologie-p01','ch04','q033'),
('biologie-p01','ch04','q034'),
('biologie-p01','ch04','q035'),
('biologie-p01','ch04','q036'),
('biologie-p01','ch04','q037'),
('biologie-p01','ch04','q038'),
('biologie-p01','ch04','q039'),
('biologie-p01','ch04','q040'),
('biologie-p01','ch04','q041'),
('biologie-p01','ch04','q042'),
('biologie-p01','ch04','q043'),
('biologie-p01','ch04','q044'),
('biologie-p01','ch04','q045'),
('biologie-p01','ch05','r05'),
('biologie-p01','ch05','q046'),
('biologie-p01','ch05','q047'),
('biologie-p01','ch05','q048'),
('biologie-p01','ch05','q049'),
('biologie-p01','ch05','q050'),
('biologie-p01','ch05','q051'),
('biologie-p01','ch05','q052'),
('biologie-p01','ch05','q053'),
('biologie-p01','ch05','q054'),
('biologie-p01','ch05','q055'),
('biologie-p01','ch05','q056'),
('biologie-p01','ch05','q057'),
('biologie-p01','ch05','q058'),
('biologie-p01','ch05','q059'),
('biologie-p01','ch06','r06'),
('biologie-p01','ch06','q060'),
('biologie-p01','ch06','q061'),
('biologie-p01','ch06','q062'),
('biologie-p01','ch06','q063'),
('biologie-p01','ch06','q064'),
('biologie-p01','ch06','q065'),
('biologie-p01','ch06','q066'),
('biologie-p01','ch06','q067'),
('biologie-p01','ch06','q068'),
('biologie-p01','ch06','q069'),
('biologie-p01','ch06','q070'),
('biologie-p01','ch06','q071'),
('biologie-p01','ch06','q072'),
('biologie-p01','ch07','r07'),
('biologie-p01','ch07','q073'),
('biologie-p01','ch07','q074'),
('biologie-p01','ch07','q075'),
('biologie-p01','ch07','q076'),
('biologie-p01','ch07','q077'),
('biologie-p01','ch07','q078'),
('biologie-p01','ch07','q079'),
('biologie-p01','ch07','q080'),
('biologie-p01','ch07','q081'),
('biologie-p01','ch07','q082'),
('biologie-p01','ch07','q083'),
('biologie-p01','ch07','q084'),
('biologie-p01','ch07','q085'),
('biologie-p01','ch07','q086'),
('biologie-p01','ch08','r08'),
('biologie-p01','ch08','q087'),
('biologie-p01','ch08','q088'),
('biologie-p01','ch08','q089'),
('biologie-p01','ch08','q090'),
('biologie-p01','ch08','q091'),
('biologie-p01','ch08','q092'),
('biologie-p01','ch08','q093'),
('biologie-p01','ch08','q094'),
('biologie-p01','ch08','q095'),
('biologie-p01','ch08','q096'),
('biologie-p01','ch08','q097'),
('biologie-p01','ch08','q098'),
('biologie-p01','ch08','q099'),
('biologie-p01','ch09','r09'),
('biologie-p01','ch09','q100'),
('biologie-p01','ch09','q101'),
('biologie-p01','ch09','q102'),
('biologie-p01','ch09','q103'),
('biologie-p01','ch09','q104'),
('biologie-p01','ch09','q105'),
('biologie-p01','ch09','q106'),
('biologie-p01','ch09','q107'),
('biologie-p01','ch09','q108'),
('biologie-p01','ch09','q109'),
('biologie-p01','ch09','q110')
on conflict do nothing;
