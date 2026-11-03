// 檢查 supabase/schema.sql 裡的車站清單和 stations.js 是否一致。
// 資料庫用這份清單擋掉不存在的站名，所以兩邊必須相同。
//
//   node scripts/check-stations.js          只檢查，不一致時列出差異
//   node scripts/check-stations.js --write  依 stations.js 重新產生 schema.sql 裡的清單
//
// 改完 schema.sql 之後，記得到 Supabase 的 SQL Editor 重新執行整份檔案。
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const stationsSrc = fs.readFileSync(path.join(root, "stations.js"), "utf8");
const LINES = new Function(stationsSrc + "\nreturn LINES;")();
const fromJs = [...new Set(LINES.flatMap((l) => l.stations))];

const schemaPath = path.join(root, "supabase", "schema.sql");
const schema = fs.readFileSync(schemaPath, "utf8");
const BEGIN = "-- stations:begin";
const END = "-- stations:end";
const start = schema.indexOf(BEGIN);
const end = schema.indexOf(END);
if (start < 0 || end < 0) {
  console.error(`schema.sql 裡找不到 ${BEGIN} / ${END} 標記`);
  process.exit(1);
}

if (process.argv.includes("--write")) {
  const values = fromJs.map((s) => `  ('${s.replace(/'/g, "''")}')`).join(",\n");
  const block = `${BEGIN}（由 node scripts/check-stations.js --write 依 stations.js 產生，請勿手動修改）
with list(name) as (values
${values}
), added as (
  insert into public.stations (name) select name from list on conflict do nothing
)
delete from public.stations where name not in (select name from list);
`;
  fs.writeFileSync(schemaPath, schema.slice(0, start) + block + schema.slice(end));
  console.log(`已寫入 ${fromJs.length} 個車站`);
  process.exit(0);
}

const fromSql = [...schema.slice(start, end).matchAll(/\('((?:[^']|'')*)'\)/g)].map((m) => m[1].replace(/''/g, "'"));
const missing = fromJs.filter((s) => !fromSql.includes(s));
const extra = fromSql.filter((s) => !fromJs.includes(s));
if (missing.length || extra.length) {
  if (missing.length) console.error("schema.sql 少了：" + missing.join("、"));
  if (extra.length) console.error("schema.sql 多了：" + extra.join("、"));
  console.error("請執行 node scripts/check-stations.js --write");
  process.exit(1);
}
console.log(`一致，共 ${fromJs.length} 個車站`);
