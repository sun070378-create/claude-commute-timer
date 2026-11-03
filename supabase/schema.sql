-- 在 Supabase 後台的 SQL Editor 貼上整段執行。
-- 整份可以重複執行：新專案會建立全部，已上線的資料庫會直接升級，既有資料保留。

create table if not exists public.trips (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  -- 刷卡進站（沒按就是開始等車）的時刻，只保留到分鐘
  started_at    timestamptz not null,
  origin        text not null check (char_length(origin) between 1 and 30),
  destination   text not null check (char_length(destination) between 1 and 30),
  day_type      text not null check (day_type in ('weekday', 'weekend')),
  time_band     text not null check (time_band in ('peak', 'offpeak', 'weekend')),
  -- 月台到月台：等車 + 乘車 + 轉乘，精確到秒
  total_sec     integer not null check (total_sec between 30 and 14400),
  wait_sec      integer not null check (wait_sec >= 0),
  ride_sec      integer not null check (ride_sec > 0),
  transfer_sec  integer not null check (transfer_sec >= 0),
  transfers     smallint not null check (transfers between 0 and 10),
  segments      jsonb not null,
  -- 到站／離站（出門到車站、車站到目的地）：和住家位置有關，新版網站不再上傳，下面的觸發程序也會清空。
  -- 欄位保留給舊資料相容。
  access_mode   text check (access_mode in ('walk', 'bike', 'youbike', 'scooter', 'car', 'bus')),
  access_sec    integer check (access_sec between 0 and 7200),
  egress_mode   text check (egress_mode in ('walk', 'bike', 'youbike', 'scooter', 'car', 'bus')),
  egress_sec    integer check (egress_sec between 0 and 7200),
  -- 備註只有使用者勾選「送給維護者」才會上傳，不會公開
  note          text check (char_length(note) <= 200),
  client_id     text not null check (char_length(client_id) <= 64),
  check (wait_sec + ride_sec + transfer_sec = total_sec),
  check ((access_mode is null) = (access_sec is null)),
  check ((egress_mode is null) = (egress_sec is null))
);

-- 進站（閘門到月台）與出站（月台到閘門）；舊資料沒有這兩段，是空的
alter table public.trips add column if not exists entry_sec integer check (entry_sec between 0 and 3600);
alter table public.trips add column if not exists exit_sec integer check (exit_sec between 0 and 3600);

do $$
declare
  c record;
begin
  -- 舊版的出發時間檢查用了 now()，資料過兩天就會違規，備份還原也會失敗。
  -- 約束名稱是自動產生的，所以依定義找出來刪掉；新的檢查改在下面的觸發程序裡做。
  for c in
    select conname from pg_constraint
    where conrelid = 'public.trips'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%now()%'
  loop
    execute format('alter table public.trips drop constraint %I', c.conname);
  end loop;

  -- 限制 segments 的格式與大小，避免有人塞進超大的資料填滿空間。
  -- 最多 10 次轉乘：進站 1 + 等車乘車 22 + 轉乘 10 + 出站 1 = 34 段
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.trips'::regclass and conname = 'trips_segments_shape'
  ) then
    alter table public.trips add constraint trips_segments_shape check (
      jsonb_typeof(segments) = 'array'
      and jsonb_array_length(segments) <= 40
      and pg_column_size(segments) < 8000
    );
  end if;
end;
$$;

create index if not exists trips_od_idx on public.trips (origin, destination);
create index if not exists trips_created_idx on public.trips (created_at);
create index if not exists trips_client_idx on public.trips (client_id, created_at);

-- 權限：先全部收回，再只開放「新增」給網站使用的 anon 身分。
-- 原始紀錄不公開讀取，大家只能透過下面的 trip_stats() 看到統計結果。
-- 不管建立專案時有沒有勾 Automatically expose new tables，結果都一樣，也不會有修改、刪除的權限。
revoke all on public.trips from anon, authenticated;
grant insert on public.trips to anon;

-- 開啟列層級安全（第二道防線）
alter table public.trips enable row level security;

drop policy if exists "anyone can insert" on public.trips;
create policy "anyone can insert" on public.trips
  for insert to anon with check (true);

-- 舊版允許公開讀取原始紀錄，這裡移除
drop policy if exists "anyone can read" on public.trips;

-- 車站清單：用來擋掉不存在的站名（避免任意文字出現在統計頁）。
-- 清單必須和 stations.js 一致，改了 stations.js 請執行 node scripts/check-stations.js --write
create table if not exists public.stations (name text primary key);
alter table public.stations enable row level security;
revoke all on public.stations from anon, authenticated;

-- stations:begin（由 node scripts/check-stations.js --write 依 stations.js 產生，請勿手動修改）
with list(name) as (values
  ('紅樹林'),
  ('竿蓁林'),
  ('淡金鄧公'),
  ('淡江大學'),
  ('淡金北新'),
  ('新市一路'),
  ('淡水行政中心'),
  ('濱海義山'),
  ('濱海沙崙'),
  ('淡海新市鎮'),
  ('崁頂'),
  ('台北海洋大學'),
  ('沙崙'),
  ('淡水漁人碼頭'),
  ('雙城'),
  ('玫瑰中國城'),
  ('台北小城'),
  ('耕莘安康院區'),
  ('景文科大'),
  ('安康'),
  ('陽光運動公園'),
  ('新和國小'),
  ('十四張'),
  ('淡水'),
  ('竹圍'),
  ('關渡'),
  ('忠義'),
  ('復興崗'),
  ('新北投'),
  ('北投'),
  ('奇岩'),
  ('唭哩岸'),
  ('石牌'),
  ('明德'),
  ('芝山'),
  ('士林'),
  ('劍潭'),
  ('圓山'),
  ('民權西路'),
  ('雙連'),
  ('中山'),
  ('台北車站'),
  ('台大醫院'),
  ('中正紀念堂'),
  ('東門'),
  ('大安森林公園'),
  ('大安'),
  ('信義安和'),
  ('台北101/世貿'),
  ('象山'),
  ('頂埔'),
  ('永寧'),
  ('土城'),
  ('海山'),
  ('亞東醫院'),
  ('府中'),
  ('板橋'),
  ('新埔'),
  ('江子翠'),
  ('龍山寺'),
  ('西門'),
  ('善導寺'),
  ('忠孝新生'),
  ('忠孝復興'),
  ('忠孝敦化'),
  ('國父紀念館'),
  ('市政府'),
  ('永春'),
  ('後山埤'),
  ('昆陽'),
  ('南港'),
  ('南港展覽館'),
  ('新店'),
  ('新店區公所'),
  ('七張'),
  ('小碧潭'),
  ('大坪林'),
  ('景美'),
  ('萬隆'),
  ('公館'),
  ('台電大樓'),
  ('古亭'),
  ('小南門'),
  ('北門'),
  ('松江南京'),
  ('南京復興'),
  ('台北小巨蛋'),
  ('南京三民'),
  ('松山'),
  ('南勢角'),
  ('景安'),
  ('永安市場'),
  ('頂溪'),
  ('行天宮'),
  ('中山國小'),
  ('大橋頭'),
  ('三重國小'),
  ('三和國中'),
  ('徐匯中學'),
  ('三民高中'),
  ('蘆洲'),
  ('台北橋'),
  ('菜寮'),
  ('三重'),
  ('先嗇宮'),
  ('頭前庄'),
  ('新莊'),
  ('輔大'),
  ('丹鳳'),
  ('迴龍'),
  ('動物園'),
  ('木柵'),
  ('萬芳社區'),
  ('萬芳醫院'),
  ('辛亥'),
  ('麟光'),
  ('六張犁'),
  ('科技大樓'),
  ('中山國中'),
  ('松山機場'),
  ('大直'),
  ('劍南路'),
  ('西湖'),
  ('港墘'),
  ('文德'),
  ('內湖'),
  ('大湖公園'),
  ('葫洲'),
  ('東湖'),
  ('南港軟體園區'),
  ('秀朗橋'),
  ('景平'),
  ('中和'),
  ('橋和'),
  ('中原'),
  ('板新'),
  ('新埔民生'),
  ('幸福'),
  ('新北產業園區')
), added as (
  insert into public.stations (name) select name from list on conflict do nothing
)
delete from public.stations where name not in (select name from list);
-- stations:end

-- 新增紀錄前的檢查與整理：
-- 1. 出發時間要合理（只在新增時檢查，舊資料不受影響）
-- 2. 資料最小化：時刻只保留到分鐘、清空到站／離站、只留需要的欄位
-- 3. 起訖站、轉乘站必須在車站清單內
-- 4. 各段秒數依 segments 重新計算，前後一致
-- 5. 送出頻率限制
create or replace function public.trips_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  e jsonb;
  cleaned jsonb := '[]'::jsonb;
begin
  if new.started_at < now() - interval '2 days' or new.started_at > now() + interval '10 minutes' then
    raise exception '出發時間不合理，請確認手機的時間設定';
  end if;
  new.started_at := date_trunc('minute', new.started_at + interval '30 seconds');
  new.access_mode := null;
  new.access_sec := null;
  new.egress_mode := null;
  new.egress_sec := null;

  if not exists (select 1 from public.stations where name = new.origin)
     or not exists (select 1 from public.stations where name = new.destination) then
    raise exception '起點或終點不是有效的車站';
  end if;

  if jsonb_typeof(new.segments) is distinct from 'array' then
    raise exception '紀錄格式不正確';
  end if;
  for e in select value from jsonb_array_elements(new.segments) loop
    -- 舊版網頁可能還會送到站／離站，直接丟掉
    continue when e->>'type' in ('access', 'egress');
    if jsonb_typeof(e) is distinct from 'object'
       or coalesce(e->>'type', '') not in ('entry', 'wait', 'ride', 'transfer', 'exit')
       or jsonb_typeof(e->'sec') is distinct from 'number'
       or (e->>'sec')::numeric not between 0 and 14400 then
      raise exception '紀錄格式不正確';
    end if;
    if e ? 'station' and not exists (select 1 from public.stations where name = e->>'station') then
      raise exception '轉乘站不是有效的車站';
    end if;
    cleaned := cleaned || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'type', e->>'type',
      'sec', round((e->>'sec')::numeric)::integer,
      'at', case when e ? 'at' then to_char(
        date_trunc('minute', (e->>'at')::timestamptz + interval '30 seconds') at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS"Z"') end,
      'station', e->>'station',
      'ran', case when e->'ran' = 'true'::jsonb then true end,
      'missed', case when e->'missed' = 'true'::jsonb then true end
    )));
  end loop;
  new.segments := cleaned;

  select
    coalesce(sum((x->>'sec')::integer) filter (where x->>'type' = 'wait'), 0),
    coalesce(sum((x->>'sec')::integer) filter (where x->>'type' = 'ride'), 0),
    coalesce(sum((x->>'sec')::integer) filter (where x->>'type' = 'transfer'), 0),
    count(*) filter (where x->>'type' = 'transfer'),
    sum((x->>'sec')::integer) filter (where x->>'type' = 'entry'),
    sum((x->>'sec')::integer) filter (where x->>'type' = 'exit')
  into new.wait_sec, new.ride_sec, new.transfer_sec, new.transfers, new.entry_sec, new.exit_sec
  from jsonb_array_elements(cleaned) x;
  new.total_sec := new.wait_sec + new.ride_sec + new.transfer_sec;

  if exists (
    select 1 from public.trips
    where client_id = new.client_id and created_at > now() - interval '1 minute'
  ) then
    raise exception '送出太頻繁了，請過一分鐘再試';
  end if;
  -- 全站每分鐘上限；正常使用遠遠不會碰到，是防止有人換著裝置代碼灌資料
  if (select count(*) from public.trips where created_at > now() - interval '1 minute') >= 100 then
    raise exception '目前送出的人太多，請稍後再試';
  end if;
  return new;
end;
$$;
revoke all on function public.trips_before_insert() from public, anon, authenticated;

drop trigger if exists trips_before_insert on public.trips;
create trigger trips_before_insert
  before insert on public.trips
  for each row execute function public.trips_before_insert();

-- 舊版的觸發程序已由上面取代
drop trigger if exists trips_rate_limit on public.trips;
drop function if exists public.trips_rate_limit();

-- 既有資料也套用資料最小化：時刻改成到分鐘、移除到站／離站
update public.trips set
  started_at = date_trunc('minute', started_at + interval '30 seconds'),
  access_mode = null,
  access_sec = null,
  egress_mode = null,
  egress_sec = null,
  segments = coalesce((
    select jsonb_agg(
      case when x ? 'at' then jsonb_set(x, '{at}', to_jsonb(to_char(
        date_trunc('minute', (x->>'at')::timestamptz + interval '30 seconds') at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS"Z"'))) else x end
      order by i)
    from jsonb_array_elements(segments) with ordinality as a(x, i)
    where x->>'type' not in ('access', 'egress')
  ), '[]'::jsonb)
where extract(second from started_at) <> 0
   or access_mode is not null
   or egress_mode is not null;

-- 統計結果：在資料庫裡先算好，網站只下載結果（每次幾 KB，而不是整包原始資料）。
-- time_band 為 'all' 的那一列是不分時段的合計。
-- 隱私門檻：同一條路線、同一時段有 5 個以上不同的裝置才顯示，
-- 避免一個人每天記同一條路線，統計頁顯示的就是他一個人的通勤時間。
-- 閘門到閘門（gate_*）只用有進站、出站兩段的紀錄，也要另外滿 5 個裝置才顯示。
-- 回傳的欄位有改，所以要先刪掉舊的再建立。
drop function if exists public.trip_stats();
create function public.trip_stats()
returns table (
  origin text,
  destination text,
  time_band text,
  n bigint,
  people bigint,
  total_p25 integer,
  total_p50 integer,
  total_p75 integer,
  wait_p50 integer,
  ride_p50 integer,
  transfer_p50 integer,
  gate_n bigint,
  gate_p25 integer,
  gate_p50 integer,
  gate_p75 integer,
  entry_p50 integer,
  exit_p50 integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.o, s.d, s.band, s.n, s.people,
    s.total_p25, s.total_p50, s.total_p75, s.wait_p50, s.ride_p50, s.transfer_p50,
    case when s.gate_people >= 5 then s.gate_n end,
    case when s.gate_people >= 5 then s.gate_p25 end,
    case when s.gate_people >= 5 then s.gate_p50 end,
    case when s.gate_people >= 5 then s.gate_p75 end,
    case when s.gate_people >= 5 then s.entry_p50 end,
    case when s.gate_people >= 5 then s.exit_p50 end
  from (
    select
      t.origin as o,
      t.destination as d,
      coalesce(t.time_band, 'all') as band,
      count(*) as n,
      count(distinct t.client_id) as people,
      round(percentile_cont(0.25) within group (order by t.total_sec))::integer as total_p25,
      round(percentile_cont(0.5) within group (order by t.total_sec))::integer as total_p50,
      round(percentile_cont(0.75) within group (order by t.total_sec))::integer as total_p75,
      round(percentile_cont(0.5) within group (order by t.wait_sec))::integer as wait_p50,
      round(percentile_cont(0.5) within group (order by t.ride_sec))::integer as ride_p50,
      round(percentile_cont(0.5) within group (order by t.transfer_sec))::integer as transfer_p50,
      count(*) filter (where t.entry_sec is not null and t.exit_sec is not null) as gate_n,
      count(distinct t.client_id) filter (where t.entry_sec is not null and t.exit_sec is not null) as gate_people,
      round(percentile_cont(0.25) within group (order by t.entry_sec + t.total_sec + t.exit_sec)
        filter (where t.entry_sec is not null and t.exit_sec is not null))::integer as gate_p25,
      round(percentile_cont(0.5) within group (order by t.entry_sec + t.total_sec + t.exit_sec)
        filter (where t.entry_sec is not null and t.exit_sec is not null))::integer as gate_p50,
      round(percentile_cont(0.75) within group (order by t.entry_sec + t.total_sec + t.exit_sec)
        filter (where t.entry_sec is not null and t.exit_sec is not null))::integer as gate_p75,
      round(percentile_cont(0.5) within group (order by t.entry_sec)
        filter (where t.entry_sec is not null and t.exit_sec is not null))::integer as entry_p50,
      round(percentile_cont(0.5) within group (order by t.exit_sec)
        filter (where t.entry_sec is not null and t.exit_sec is not null))::integer as exit_p50
    from public.trips t
    group by grouping sets ((t.origin, t.destination, t.time_band), (t.origin, t.destination))
  ) s
  where s.people >= 5
$$;
revoke all on function public.trip_stats() from public;
grant execute on function public.trip_stats() to anon, authenticated;
