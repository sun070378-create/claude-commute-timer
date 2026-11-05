// 由 icons/icon.svg 輸出加到主畫面用的 PNG 圖示。改完 icon.svg 後執行：
//
//   node scripts/export-icons.js
//
// 需要 Playwright（npx playwright install chromium），網站本身不需要。
// - icon-192.png、icon-512.png：圓角，四角透明
// - icon-maskable-512.png：Android 自適應圖示，滿版方形底，內容縮到中心的安全區內，系統會自己裁成圓形或圓角方形
// - apple-touch-icon.png：iPhone 用，180×180 滿版方形底，系統會自己裁成圓角
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "..", "icons");
const src = fs.readFileSync(path.join(dir, "icon.svg"), "utf8");
const ROUNDED_BG = '<rect width="512" height="512" rx="112" fill="#1f2a33"/>';
if (!src.includes(ROUNDED_BG)) throw new Error("icon.svg 的背景改了，請一起更新這支程式的 ROUNDED_BG");

// 滿版方形底；scale 小於 1 時，內容以中心縮小
const square = (scale) => src
  .replace(ROUNDED_BG, `<rect width="512" height="512" fill="#1f2a33"/><g transform="translate(256 256) scale(${scale}) translate(-256 -256)">`)
  .replace("</svg>", "</g></svg>");

const jobs = [
  ["icon-192.png", 192, src, true],
  ["icon-512.png", 512, src, true],
  ["icon-maskable-512.png", 512, square(0.86), false],
  ["apple-touch-icon.png", 180, square(1), false],
];

(async () => {
  const browser = await chromium.launch();
  for (const [name, size, svg, transparent] of jobs) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<body style="margin:0">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body>`);
    await page.screenshot({ path: path.join(dir, name), omitBackground: transparent });
    await page.close();
    console.log(`已輸出 icons/${name}`);
  }
  await browser.close();
})();
