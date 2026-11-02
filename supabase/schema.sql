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

-- 權限：先全部收回，再只開放「讀取」和「新增」給網站使用的 anon 身分。
-- 不管建立專案時有沒有勾 Automatically expose new tables，結果都一樣，也不會有修改、刪除的權限。
revoke all on public.trips from anon, authenticated;
grant select, insert on public.trips to anon;

-- 開啟列層級安全（第二道防線）：匿名使用者只能新增和讀取，不能修改或刪除別人的資料。
alter table public.trips enable row level security;

drop policy if exists "anyone can insert" on public.trips;
create policy "anyone can insert" on public.trips
  for insert to anon with check (true);

drop policy if exists "anyone can read" on public.trips;
create policy "anyone can read" on public.trips
  for select to anon using (true);
