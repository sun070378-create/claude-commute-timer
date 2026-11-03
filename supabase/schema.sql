-- 在 Supabase 後台的 SQL Editor 貼上整段執行一次即可。

create table if not exists public.trips (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  started_at    timestamptz not null,
  origin        text not null check (char_length(origin) between 1 and 30),
  destination   text not null check (char_length(destination) between 1 and 30),
  day_type      text not null check (day_type in ('weekday', 'weekend')),
  time_band     text not null check (time_band in ('peak', 'offpeak', 'weekend')),
  total_sec     integer not null check (total_sec between 30 and 14400),
  wait_sec      integer not null check (wait_sec >= 0),
  ride_sec      integer not null check (ride_sec > 0),
  transfer_sec  integer not null check (transfer_sec >= 0),
  transfers     smallint not null check (transfers between 0 and 10),
  segments      jsonb not null,
  -- 到站（出門→起點站月台）與離站（終點站→目的地）：每個人住的地方不同，不列入車站到車站的統計
  access_mode   text check (access_mode in ('walk', 'bike', 'youbike', 'scooter', 'car', 'bus')),
  access_sec    integer check (access_sec between 0 and 7200),
  egress_mode   text check (egress_mode in ('walk', 'bike', 'youbike', 'scooter', 'car', 'bus')),
  egress_sec    integer check (egress_sec between 0 and 7200),
  note          text check (char_length(note) <= 200),
  client_id     text not null check (char_length(client_id) <= 64),
  check (wait_sec + ride_sec + transfer_sec = total_sec),
  check ((access_mode is null) = (access_sec is null)),
  check ((egress_mode is null) = (egress_sec is null)),
  check (started_at > now() - interval '2 days' and started_at < now() + interval '10 minutes')
);

create index if not exists trips_od_idx on public.trips (origin, destination);
create index if not exists trips_created_idx on public.trips (created_at);
create index if not exists trips_client_idx on public.trips (client_id, created_at);

-- 權限：先全部收回，再只開放「新增」給網站使用的 anon 身分。
-- 原始紀錄不公開讀取：同一支手機的紀錄串起來，看得出一個人每天幾點出門、從哪站上車，
-- 所以大家只能透過下面的 trip_stats() 看到統計結果。
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

-- 送出頻率限制：擋掉程式大量灌資料
create or replace function public.trips_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
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
revoke all on function public.trips_rate_limit() from public, anon, authenticated;

drop trigger if exists trips_rate_limit on public.trips;
create trigger trips_rate_limit
  before insert on public.trips
  for each row execute function public.trips_rate_limit();

-- 統計結果：在資料庫裡先算好，網站只下載結果（每次幾 KB，而不是整包原始資料）。
-- time_band 為 'all' 的那一列是不分時段的合計。
-- 樣本少於 5 筆的組合不顯示，避免從統計反推出個人的通勤時間。
create or replace function public.trip_stats()
returns table (
  origin text,
  destination text,
  time_band text,
  n bigint,
  total_p25 integer,
  total_p50 integer,
  total_p75 integer,
  wait_p50 integer,
  ride_p50 integer,
  transfer_p50 integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    t.origin,
    t.destination,
    coalesce(t.time_band, 'all'),
    count(*),
    round(percentile_cont(0.25) within group (order by t.total_sec))::integer,
    round(percentile_cont(0.5) within group (order by t.total_sec))::integer,
    round(percentile_cont(0.75) within group (order by t.total_sec))::integer,
    round(percentile_cont(0.5) within group (order by t.wait_sec))::integer,
    round(percentile_cont(0.5) within group (order by t.ride_sec))::integer,
    round(percentile_cont(0.5) within group (order by t.transfer_sec))::integer
  from public.trips t
  group by grouping sets ((t.origin, t.destination, t.time_band), (t.origin, t.destination))
  having count(*) >= 5
$$;
revoke all on function public.trip_stats() from public;
grant execute on function public.trip_stats() to anon, authenticated;
