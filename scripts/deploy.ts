// Выкладка site/ в воркер Cloudflare без wrangler: сессия загрузки ассетов,
// загрузка недостающих файлов, затем новая версия скрипта только с ассетами.
//
//   set -a; . ~/ewc/dev-ops/.env.fil; set +a     # CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN
//   bun scripts/build.ts && bun scripts/deploy.ts
//
// Новая версия расходится по узлам Cloudflare около минуты.
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join, relative, extname } from "node:path";

const [dir = join(import.meta.dir, "../site"), script = "patient-cake-f328"] = process.argv.slice(2);
const acc = process.env.CLOUDFLARE_ACCOUNT_ID!;
const tok = process.env.CLOUDFLARE_API_TOKEN!;
const API = `https://api.cloudflare.com/client/v4/accounts/${acc}/workers`;

function walk(d: string): string[] {
  return readdirSync(d).flatMap((n) => {
    if (n.startsWith(".") || n === "_headers" || n === "_redirects") return [];
    const p = join(d, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = walk(dir).map((p) => {
  const buf = readFileSync(p);
  const b64 = buf.toString("base64");
  const ext = extname(p).slice(1);
  // Как у wrangler: хеш от base64-содержимого и расширения, 32 hex-символа
  const hash = new Bun.CryptoHasher("sha256").update(b64 + ext).digest("hex").slice(0, 32);
  return { path: "/" + relative(dir, p), b64, hash, size: buf.length, ext };
});
const manifest = Object.fromEntries(files.map((f) => [f.path, { hash: f.hash, size: f.size }]));

async function cf(url: string, init: RequestInit, auth = tok) {
  const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${auth}`, ...(init.headers || {}) } });
  const j: any = await r.json();
  if (!j.success) throw new Error(`${url}: ${JSON.stringify(j.errors)}`);
  return j.result;
}

const sess = await cf(`${API}/scripts/${script}/assets-upload-session`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ manifest }),
});
let jwt: string = sess.jwt;
const buckets: string[][] = sess.buckets || [];
console.log(`files ${files.length}, to upload ${buckets.flat().length} in ${buckets.length} bucket(s)`);

const MIME: Record<string, string> = {
  html: "text/html", css: "text/css", js: "application/javascript", jpg: "image/jpeg", mp3: "audio/mpeg",
  png: "image/png", svg: "image/svg+xml", md: "text/markdown",
};
for (const bucket of buckets) {
  const fd = new FormData();
  for (const h of bucket) {
    const f = files.find((x) => x.hash === h)!;
    fd.append(h, new File([f.b64], h, { type: MIME[f.ext] || "application/octet-stream" }));
  }
  const res = await cf(`${API}/assets/upload?base64=true`, { method: "POST", body: fd }, jwt);
  if (res?.jwt) jwt = res.jwt;
}

const fd = new FormData();
fd.append("metadata", new Blob([JSON.stringify({
  compatibility_date: "2026-07-30",
  // _headers и _redirects — не файлы сайта, а настройки: идут текстом в config
  assets: {
    jwt,
    config: Object.fromEntries(["_headers", "_redirects"]
      .filter((n) => Bun.file(join(dir, n)).size > 0)
      .map((n) => [n, readFileSync(join(dir, n), "utf8")])),
  },
})], { type: "application/json" }));
const out = await cf(`${API}/scripts/${script}`, { method: "PUT", body: fd });
console.log("deployed", out.id, out.modified_on, "has_assets", out.has_assets);
