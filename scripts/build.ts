// Сборка многоязычной части сайта. Запуск: bun scripts/build.ts
//
// 1. natal.html на каждом языке — из scripts/natal.template.html и
//    site/i18n/<язык>.json; шапка и подвал берутся из index.html того же языка.
// 2. На каждой странице каждого языка — canonical и hreflang на все языковые
//    версии плюс x-default (язык по умолчанию). Абсолютными адресами: Google
//    относительные hreflang не принимает.
// 3. sitemap.xml с языковыми парами и robots.txt со ссылкой на него.
//
// Новый язык: site/i18n/<код>.json, строка в site/i18n/languages.json,
// переведённые страницы в site/<код>/ — и перезапуск этого скрипта.
// Смена домена — scripts/site.json.

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SITE = join(ROOT, "site");
const cfg = JSON.parse(readFileSync(join(import.meta.dir, "site.json"), "utf8")) as { url: string; defaultLang: string };
const BASE_URL = cfg.url.replace(/\/$/, "");
type Lang = { code: string; label: string; name: string; dir: string };
const LANGS: Lang[] = JSON.parse(readFileSync(join(SITE, "i18n/languages.json"), "utf8"));
const DEFAULT = LANGS.find((l) => l.code === cfg.defaultLang) ?? LANGS[0];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Страницы — по корневому (основному) языку; у остальных берутся те, что есть
const PAGES = readdirSync(join(SITE, DEFAULT.dir)).filter((f) => f.endsWith(".html")).sort();

// Финальный адрес без перенаправлений: Cloudflare отдаёт /planets, а не
// /planets.html, и /en/ вместо /en/index.html
const pageUrl = (l: Lang, page: string) =>
  `${BASE_URL}/${l.dir}${page === "index.html" ? "" : page.replace(/\.html$/, "")}`;

// ---------- 1. natal.html ----------

const template = readFileSync(join(import.meta.dir, "natal.template.html"), "utf8");
for (const l of LANGS) {
  const dict = JSON.parse(readFileSync(join(SITE, "i18n", `${l.code}.json`), "utf8"));
  const index = readFileSync(join(SITE, l.dir, "index.html"), "utf8");
  const header = index.match(/<header>[\s\S]*?<\/header>/)?.[0];
  const footer = index.match(/<footer>[\s\S]*?<\/footer>/)?.[0];
  if (!header || !footer) throw new Error(`${l.code}/index.html: нет <header> или <footer>`);
  const vars: Record<string, string> = {
    lang: l.code,
    base: "../".repeat(l.dir.split("/").filter(Boolean).length),
    header, footer,
  };
  const html = template
    .replace(/\{\{\{(\w+)\}\}\}/g, (_, k) => dict.natal[k] ?? "")             // HTML как есть
    .replace(/\{\{(\w+)\}\}/g, (_, k) => (k in vars ? vars[k] : esc(dict.natal[k] ?? `{{${k}}}`)));
  writeFileSync(join(SITE, l.dir, "natal.html"), html);
}

// ---------- 2. canonical и hreflang ----------

const BEGIN = "<!-- i18n:begin (scripts/build.ts) -->";
const END = "<!-- i18n:end -->";
for (const l of LANGS) {
  for (const page of PAGES) {
    const file = join(SITE, l.dir, page);
    if (!existsSync(file)) continue;
    const have = LANGS.filter((x) => existsSync(join(SITE, x.dir, page)));
    const block = [
      BEGIN,
      `<link rel="canonical" href="${pageUrl(l, page)}">`,
      ...have.map((x) => `<link rel="alternate" hreflang="${x.code}" href="${pageUrl(x, page)}">`),
      `<link rel="alternate" hreflang="x-default" href="${pageUrl(DEFAULT, page)}">`,
      END,
    ].join("\n");
    let html = readFileSync(file, "utf8");
    html = html
      .replace(new RegExp(`${BEGIN.replace(/[()]/g, "\\$&")}[\\s\\S]*?${END}\\n?`), "")
      .replace(/^<link rel="(alternate|canonical)"[^>]*>\n/gm, "");
    html = html.replace(/(<link rel="stylesheet"[^>]*>\n)/, `$1${block}\n`);
    writeFileSync(file, html);
  }
}

// ---------- 3. sitemap.xml и robots.txt ----------

const today = new Date().toISOString().slice(0, 10);
const urls: string[] = [];
for (const page of PAGES) {
  const have = LANGS.filter((x) => existsSync(join(SITE, x.dir, page)));
  for (const l of have) {
    urls.push([
      "  <url>",
      `    <loc>${pageUrl(l, page)}</loc>`,
      `    <lastmod>${today}</lastmod>`,
      ...have.map((x) => `    <xhtml:link rel="alternate" hreflang="${x.code}" href="${pageUrl(x, page)}"/>`),
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${pageUrl(DEFAULT, page)}"/>`,
      "  </url>",
    ].join("\n"));
  }
}
writeFileSync(join(SITE, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join("\n")}\n</urlset>\n`);
writeFileSync(join(SITE, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${BASE_URL}/sitemap.xml\n`);

console.log(`languages: ${LANGS.map((l) => l.code).join(", ")}; pages: ${PAGES.length}; sitemap urls: ${urls.length}`);
