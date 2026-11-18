// Страница «Натальная карта»: форма, поиск города, круг карты, таблицы,
// краткая расшифровка, ссылка на карту и PDF. Расчёт — в natal-core.js.
(async function () {
  'use strict';
  const N = window.NatalCore;
  // Словарь языка страницы: i18n/<lang>.json рядом с корнем сайта
  const LANG = document.documentElement.lang || 'ru';
  const ROOT = new URL('../', document.currentScript.src);
  const DICT = await fetch(new URL(`i18n/${LANG}.json`, ROOT)).then((r) => r.json());
  N.localize(DICT.astro);
  const I = DICT.natal;
  // Подстановка {имя} в строку словаря
  const t = (key, vars = {}) => String(I[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  const $ = (id) => document.getElementById(id);
  const form = $('natal-form');
  const results = $('place-results');
  const SVGNS = 'http://www.w3.org/2000/svg';

  let place = null;      // { name, lat, lon, tz } — выбранный город
  let current = null;    // последняя построенная карта, для PDF и ссылки

  const COLORS = { fire: '#d9573f', earth: '#5b9a4a', air: '#c9a227', water: '#3d7fcf' };
  const ELEMENT = Object.fromEntries(Object.entries(COLORS).map(([k, color]) => [k, { name: DICT.astro.elements[k], color }]));
  const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

  const fmtPos = (p) => `${p.deg}°${String(p.min).padStart(2, '0')}′`;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- Поиск города (Open-Meteo, без ключа) ----------

  let searchTimer = 0;
  let searchSeq = 0;
  form.place.addEventListener('input', () => {
    place = null;
    $('place-chosen').textContent = '';
    clearTimeout(searchTimer);
    const q = form.place.value.trim();
    if (q.length < 2) { results.hidden = true; return; }
    searchTimer = setTimeout(() => searchPlace(q), 350);
  });

  async function searchPlace(q) {
    const seq = ++searchSeq;
    try {
      const url = 'https://geocoding-api.open-meteo.com/v1/search?count=7&language=' + LANG + '&format=json&name=' + encodeURIComponent(q);
      const r = await fetch(url);
      const data = await r.json();
      if (seq !== searchSeq) return; // пришёл ответ на устаревший запрос
      const list = (data.results || []).filter((x) => x.timezone);
      results.innerHTML = '';
      if (!list.length) {
        results.innerHTML = `<li class="empty">${t('noResults')}</li>`;
      }
      for (const x of list) {
        const li = document.createElement('li');
        const sub = [x.admin1, x.country].filter(Boolean).join(', ');
        li.innerHTML = `<strong>${esc(x.name)}</strong> <span>${esc(sub)}</span>`;
        li.addEventListener('mousedown', (e) => { e.preventDefault(); choosePlace(x); });
        results.appendChild(li);
      }
      results.hidden = false;
    } catch {
      results.innerHTML = `<li class="empty">${t('searchDown')}</li>`;
      results.hidden = false;
    }
  }

  function choosePlace(x) {
    const label = [x.name, x.admin1, x.country].filter(Boolean).join(', ');
    place = { name: label, lat: x.latitude, lon: x.longitude, tz: x.timezone };
    form.place.value = x.name;
    form.lat.value = x.latitude.toFixed(4);
    form.lon.value = x.longitude.toFixed(4);
    form.tz.value = x.timezone;
    $('place-chosen').textContent = `${label} · ${coordText(x.latitude, x.longitude)} · ${x.timezone}`;
    results.hidden = true;
  }

  form.place.addEventListener('blur', () => setTimeout(() => { results.hidden = true; }, 150));

  const coordText = (lat, lon) =>
    `${Math.abs(lat).toFixed(2)}° ${t(lat >= 0 ? 'north' : 'south')}, ${Math.abs(lon).toFixed(2)}° ${t(lon >= 0 ? 'east' : 'west')}`;

  form.unknown.addEventListener('change', () => { form.time.disabled = form.unknown.checked; });

  // ---------- Построение ----------

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    build(readForm());
  });

  function readForm() {
    return {
      name: form.name.value.trim(),
      date: form.date.value,
      time: form.time.value || '12:00',
      unknown: form.unknown.checked,
      place: place ? place.name : form.place.value.trim(),
      lat: parseFloat(form.lat.value),
      lon: parseFloat(form.lon.value),
      tz: form.tz.value.trim(),
    };
  }

  function validTz(tz) {
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
  }

  function build(p) {
    const err = $('form-error');
    err.textContent = '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date)) return (err.textContent = t('errDate'));
    if (!isFinite(p.lat) || !isFinite(p.lon) || !p.tz) {
      return (err.textContent = t('errPlace'));
    }
    if (Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180) return (err.textContent = t('errRange'));
    if (!validTz(p.tz)) return (err.textContent = t('errTz'));

    const [y, mo, d] = p.date.split('-').map(Number);
    const [h, mi] = (p.unknown ? '12:00' : p.time).split(':').map(Number);
    if (y < 1800 || y > 2100) return (err.textContent = t('errYears'));

    const utc = N.localToUtc(y, mo, d, h, mi, p.tz);
    const chart = N.compute({ utc, lat: p.lat, lon: p.lon, timeKnown: !p.unknown });
    const offMin = Math.round(N.tzOffsetMs(p.tz, utc.getTime()) / 60000);
    current = { p, chart, offMin };

    render(current);
    history.replaceState(null, '', '#' + toHash(p));
  }

  // ---------- Вывод ----------

  function metaText({ p, offMin }) {
    const date = p.date.split('-').reverse().join('.');
    const sign = offMin >= 0 ? '+' : '−';
    const a = Math.abs(offMin);
    const off = `UTC${sign}${Math.floor(a / 60)}${a % 60 ? ':' + String(a % 60).padStart(2, '0') : ''}`;
    const time = p.unknown ? t('timeUnknown') : `${p.time} (${off})`;
    return `${date}, ${time} · ${p.place || t('placeUnknown')} · ${coordText(p.lat, p.lon)}`;
  }

  const chartTitle = (name) => (name ? t('titleWithName', { name }) : t('title'));

  function render(cur) {
    const { p, chart } = cur;
    $('natal-result').hidden = false;
    $('result-title').textContent = chartTitle(p.name);
    $('result-meta').textContent = metaText(cur) + (chart.houses && chart.houses.system === 'Porphyry'
      ? t('porphyry') : '');

    const chartEl = $('chart');
    chartEl.innerHTML = '';
    chartEl.appendChild(wheelSvg(chart, screenPalette()));

    renderPlanets(chart, p.unknown);
    $('houses-block').hidden = !chart.houses;
    if (chart.houses) renderHouses(chart);
    renderAspects(chart);
    $('reading').innerHTML = readingParagraphs(chart, p.unknown).map((x) => `<p>${x}</p>`).join('');
    $('share-note').textContent = '';
    $('natal-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderPlanets(chart, unknown) {
    const rows = chart.objects.map((o) => `<tr>
      <td><span class="sym">${o.glyph}</span>${o.name}</td>
      <td><span class="sym el-${o.pos.sign.element}">${o.pos.sign.glyph}</span>${o.pos.sign.name}</td>
      <td class="num">${fmtPos(o.pos)}${o.retro ? ` <span class="retro" title="${t('retro')}">R</span>` : ''}</td>
      ${unknown ? '' : `<td class="num">${ROMAN[o.house]}</td>`}
    </tr>`).join('');
    $('planets-table').innerHTML = `<thead><tr><th>${t('thPlanet')}</th><th>${t('thSign')}</th><th>${t('thDegree')}</th>${unknown ? '' : `<th>${t('thHouse')}</th>`}</tr></thead><tbody>${rows}</tbody>`
      + (unknown ? `<caption>${t('unknownCaption')}</caption>` : '');
  }

  function renderHouses(chart) {
    const c = chart.houses.cusps;
    const rows = [];
    for (let i = 1; i <= 12; i++) {
      const pos = N.signOf(c[i]);
      const label = [1, 4, 7, 10].includes(i) ? t('angle' + i) : '';
      rows.push(`<tr><td class="num">${ROMAN[i]}${label}</td>
        <td><span class="sym el-${pos.sign.element}">${pos.sign.glyph}</span>${pos.sign.name} ${fmtPos(pos)}</td>
        <td class="dim">${N.HOUSES[i - 1]}</td></tr>`);
    }
    $('houses-table').innerHTML = `<thead><tr><th>${t('thHouse')}</th><th>${t('thCusp')}</th><th>${t('thSphere')}</th></tr></thead><tbody>${rows.join('')}</tbody>`;
  }

  function renderAspects(chart) {
    if (!chart.aspects.length) { $('aspects-table').innerHTML = `<tbody><tr><td>${t('noAspects')}</td></tr></tbody>`; return; }
    const rows = chart.aspects.map((x) => `<tr>
      <td><span class="sym">${x.a.glyph}</span>${x.a.name}</td>
      <td class="asp-${x.aspect.kind}"><span class="sym">${x.aspect.glyph}</span>${x.aspect.name}</td>
      <td><span class="sym">${x.b.glyph}</span>${x.b.name}</td>
      <td class="num">${x.orb.toFixed(1)}°</td></tr>`).join('');
    $('aspects-table').innerHTML = `<thead><tr><th>${t('thPlanet')}</th><th>${t('thAspect')}</th><th>${t('thPlanet')}</th><th>${t('thOrb')}</th></tr></thead><tbody>${rows}</tbody>`;
  }

  // Короткая расшифровка из ключевых слов: планета (что) + знак (как) + дом (где)
  function readingParagraphs(chart, unknown) {
    const out = [];
    if (chart.angles) {
      const s = chart.angles.asc.pos.sign;
      out.push(t('readAsc', { signIn: s.in, key: s.key }));
    }
    const main = chart.objects.filter((o) => N.PLANETS.some((x) => x.id === o.id));
    for (const o of main) {
      const house = !unknown && o.house ? t('readHouse', { house: ROMAN[o.house] }) : '';
      const sphere = !unknown && o.house ? t('readSphere', { sphere: N.HOUSES[o.house - 1] }) : '';
      out.push(t('readPlanet', {
        name: o.name, signIn: o.pos.sign.in, house, retro: o.retro ? t('readRetro') : '',
        key: o.key, signKey: o.pos.sign.key, sphere,
      }));
    }
    // Баланс стихий: светила считаются за два
    const count = { fire: 0, earth: 0, air: 0, water: 0 };
    for (const o of main) count[o.pos.sign.element] += o.id === 'Sun' || o.id === 'Moon' ? 2 : 1;
    const parts = Object.entries(count).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${ELEMENT[k].name} ${v}`);
    out.push(t('readElements', { list: parts.join(', ') }));
    const tight = chart.aspects.filter((x) => x.orb <= 2).slice(0, 5);
    if (tight.length) {
      out.push(t('readTight', { list: tight.map((x) => `${x.a.name} ${x.aspect.glyph} ${x.b.name} (${x.orb.toFixed(1)}°)`).join('; ') }));
    }
    return out;
  }

  // ---------- Круг карты (SVG) ----------

  function screenPalette() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    return { bg: v('--bg-card'), line: v('--line'), text: v('--text'), dim: v('--text-dim'), accent: v('--accent'), hard: '#d9573f', soft: '#3d7fcf' };
  }
  const PRINT_PALETTE = { bg: '#ffffff', line: '#c9c0ac', text: '#22242f', dim: '#6b6e7e', accent: '#a8760f', hard: '#c8402b', soft: '#2e6cbf' };

  function el(name, attrs, parent) {
    const e = document.createElementNS(SVGNS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function wheelSvg(chart, pal) {
    const S = 640, c = S / 2;
    const R0 = 304, R1 = 262, RP = 226, RD = 200, RH = 118, RA = 100;
    const base = chart.angles ? chart.angles.asc.lon : 0; // асцендент слева
    const th = (lon) => (180 + N.diff(lon, base)) * Math.PI / 180;
    const pt = (lon, r) => [c + r * Math.cos(th(lon)), c - r * Math.sin(th(lon))];
    const svg = el('svg', { viewBox: `0 0 ${S} ${S}`, class: 'natal-wheel', role: 'img', 'aria-label': t('wheel'), 'font-family': 'Georgia, serif' });

    el('circle', { cx: c, cy: c, r: R0, fill: pal.bg, stroke: pal.line, 'stroke-width': 1.5 }, svg);

    // Знаки: сектора, разделители, символы
    for (let i = 0; i < 12; i++) {
      const s = N.SIGNS[i];
      const a0 = i * 30, a1 = a0 + 30;
      const [x0, y0] = pt(a0, R0), [x1, y1] = pt(a1, R0), [x2, y2] = pt(a1, R1), [x3, y3] = pt(a0, R1);
      el('path', {
        d: `M${x0},${y0} A${R0},${R0} 0 0 0 ${x1},${y1} L${x2},${y2} A${R1},${R1} 0 0 1 ${x3},${y3} Z`,
        fill: ELEMENT[s.element].color, 'fill-opacity': 0.13, stroke: pal.line, 'stroke-width': 1,
      }, svg);
      const [gx, gy] = pt(a0 + 15, (R0 + R1) / 2);
      const t = el('text', { x: gx, y: gy, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 22, fill: ELEMENT[s.element].color }, svg);
      t.textContent = s.glyph;
      for (let dgr = 0; dgr < 30; dgr += 5) {
        const [a, b] = pt(a0 + dgr, R1), [e, f] = pt(a0 + dgr, R1 - (dgr % 10 === 0 ? 7 : 4));
        el('line', { x1: a, y1: b, x2: e, y2: f, stroke: pal.line, 'stroke-width': 1 }, svg);
      }
    }
    el('circle', { cx: c, cy: c, r: R1, fill: 'none', stroke: pal.line, 'stroke-width': 1.5 }, svg);
    el('circle', { cx: c, cy: c, r: RA, fill: 'none', stroke: pal.line, 'stroke-width': 1 }, svg);

    // Дома
    if (chart.houses) {
      const cu = chart.houses.cusps;
      for (let i = 1; i <= 12; i++) {
        const axis = i === 1 || i === 4 || i === 7 || i === 10;
        const [a, b] = pt(cu[i], RA), [e, f] = pt(cu[i], axis ? R0 : R1);
        el('line', { x1: a, y1: b, x2: e, y2: f, stroke: axis ? pal.accent : pal.line, 'stroke-width': axis ? 2 : 1 }, svg);
        const next = cu[i === 12 ? 1 : i + 1];
        const mid = cu[i] + N.norm(next - cu[i]) / 2;
        const [hx, hy] = pt(mid, RH);
        const t = el('text', { x: hx, y: hy, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 12, fill: pal.dim }, svg);
        t.textContent = ROMAN[i];
      }
      const lbl = (lon, txt) => {
        const [x, y] = pt(lon + 4, R1 - 14);
        const t = el('text', { x, y, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 12, 'font-weight': 'bold', fill: pal.accent }, svg);
        t.textContent = txt;
      };
      lbl(chart.angles.asc.lon, 'AC');
      lbl(chart.angles.mc.lon, 'MC');
    }

    // Аспекты
    for (const x of chart.aspects) {
      if (x.aspect.angle === 0) continue;
      const [a, b] = pt(x.a.lon, RA), [e, f] = pt(x.b.lon, RA);
      el('line', {
        x1: a, y1: b, x2: e, y2: f, stroke: x.aspect.kind === 'hard' ? pal.hard : pal.soft,
        'stroke-width': x.orb < 2 ? 1.6 : 1, 'stroke-opacity': x.orb < 2 ? 0.95 : 0.6,
      }, svg);
    }

    // Планеты: символы раздвигаются, чтобы не налезали; засечка — точное место
    const objs = chart.objects.slice().sort((a, b) => a.lon - b.lon);
    const disp = spread(objs.map((o) => o.lon), 9);
    objs.forEach((o, i) => {
      const [a, b] = pt(o.lon, R1), [e, f] = pt(o.lon, R1 - 9);
      el('line', { x1: a, y1: b, x2: e, y2: f, stroke: pal.text, 'stroke-width': 1.5 }, svg);
      const [lx, ly] = pt(o.lon, R1 - 10), [gx, gy] = pt(disp[i], RP);
      el('line', { x1: lx, y1: ly, x2: gx, y2: gy, stroke: pal.line, 'stroke-width': 0.8 }, svg);
      if (o.id === 'Sun') {
        // ☉ в системных шрифтах выходит вдвое мельче соседей — рисуем сами
        el('circle', { cx: gx, cy: gy, r: 8, fill: 'none', stroke: pal.text, 'stroke-width': 1.6 }, svg);
        el('circle', { cx: gx, cy: gy, r: 1.8, fill: pal.text }, svg);
      } else {
        const g = el('text', { x: gx, y: gy, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 21, fill: pal.text }, svg);
        g.textContent = o.glyph + '︎';
      }
      const [dx, dy] = pt(disp[i], RD);
      const d = el('text', { x: dx, y: dy, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 11, fill: pal.dim, 'font-family': 'Arial, sans-serif' }, svg);
      d.textContent = `${o.pos.deg}°${o.retro ? 'R' : ''}`;
    });
    return svg;
  }

  // Раздвигает углы (отсортированные по возрастанию) не меньше чем на gap
  // градусов, сохраняя порядок; по кругу.
  function spread(lons, gap) {
    const n = lons.length;
    const d = lons.slice();
    for (let iter = 0; iter < 60; iter++) {
      let moved = false;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const g = N.norm(d[j] - d[i]);
        if (n > 1 && g < gap) {
          const push = (gap - g) / 2;
          d[i] = N.norm(d[i] - push);
          d[j] = N.norm(d[j] + push);
          moved = true;
        }
      }
      if (!moved) break;
    }
    return d;
  }

  // ---------- Ссылка на карту ----------

  function toHash(p) {
    const q = new URLSearchParams();
    if (p.name) q.set('n', p.name);
    q.set('d', p.date);
    if (p.unknown) q.set('u', '1'); else q.set('t', p.time);
    q.set('lat', p.lat.toFixed(4));
    q.set('lon', p.lon.toFixed(4));
    q.set('tz', p.tz);
    if (p.place) q.set('p', p.place);
    return q.toString();
  }

  function fromHash() {
    const q = new URLSearchParams(location.hash.slice(1));
    if (!q.get('d') || !q.get('tz')) return;
    form.name.value = q.get('n') || '';
    form.date.value = q.get('d');
    form.unknown.checked = q.get('u') === '1';
    form.time.disabled = form.unknown.checked;
    if (q.get('t')) form.time.value = q.get('t');
    form.lat.value = q.get('lat');
    form.lon.value = q.get('lon');
    form.tz.value = q.get('tz');
    const name = q.get('p') || '';
    form.place.value = name.split(',')[0];
    place = { name, lat: +q.get('lat'), lon: +q.get('lon'), tz: q.get('tz') };
    $('place-chosen').textContent = `${name} · ${coordText(place.lat, place.lon)} · ${place.tz}`;
    build(readForm());
  }

  $('share-btn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      $('share-note').textContent = t('copied');
    } catch {
      $('share-note').textContent = t('copyManual');
    }
  });

  // ---------- PDF ----------
  // Страницы рисуются на canvas и кладутся в PDF картинками: так кириллица и
  // символы планет выходят без встраивания шрифтов, которых нет в jsPDF.

  // jsPDF лежит рядом с этим файлом; страницы есть и в корне, и в en/, hi/
  const JSPDF_SRC = new URL('js/jspdf.umd.min.js', ROOT).href;
  let jsPdfLoading = null;
  function loadJsPdf() {
    if (window.jspdf) return Promise.resolve();
    jsPdfLoading = jsPdfLoading || new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = JSPDF_SRC;
      s.onload = ok;
      s.onerror = () => { jsPdfLoading = null; fail(new Error('jsPDF failed to load')); };
      document.head.appendChild(s);
    });
    return jsPdfLoading;
  }

  function svgToImage(svg) {
    const xml = new XMLSerializer().serializeToString(svg);
    const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
    return new Promise((ok, fail) => {
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); ok(img); };
      img.onerror = (e) => { URL.revokeObjectURL(url); fail(e); };
      img.src = url;
    });
  }

  const PW = 1240, PH = 1754, M = 90; // A4 при 150 dpi
  // Деванагари в Arial и Georgia нет — дальше по списку системные шрифты с ним
  const SANS = '-apple-system, "Segoe UI", Roboto, Arial, "Kohinoor Devanagari", "Nirmala UI", "Noto Sans Devanagari", sans-serif';
  const SERIF = 'Georgia, "Kohinoor Devanagari", "Nirmala UI", "Noto Serif Devanagari", serif';

  function newPage() {
    const cv = document.createElement('canvas');
    cv.width = PW; cv.height = PH;
    const g = cv.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, PW, PH);
    g.textBaseline = 'alphabetic';
    return { cv, g, y: M };
  }

  // Текст с переносом по словам; поддерживает <strong> как жирный фрагмент
  function drawRich(pg, html, size, maxW) {
    const g = pg.g;
    const tokens = [];
    html.replace(/<strong>(.*?)<\/strong>|([^<]+)/g, (_, b, t) => {
      const text = (b ?? t).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      for (const w of text.split(/(\s+)/)) if (w) tokens.push({ w, bold: b != null });
    });
    const lh = size * 1.45;
    pg.y += size; // pg.y — верх строки, а fillText пишет по базовой линии
    let x = M;
    for (const t of tokens) {
      g.font = `${t.bold ? 'bold ' : ''}${size}px ${SANS}`;
      const w = g.measureText(t.w).width;
      if (/^\s+$/.test(t.w)) { if (x > M) x += w; continue; }
      if (x + w > M + maxW && x > M) { x = M; pg.y += lh; }
      g.fillStyle = '#22242f';
      g.fillText(t.w, x, pg.y);
      x += w;
    }
    pg.y += lh;
  }

  function drawTable(pages, header, rows, widths) {
    let pg = pages[pages.length - 1];
    const rh = 34;
    const row = (cells, head) => {
      if (pg.y + rh > PH - M) { pg = newPage(); pages.push(pg); }
      const g = pg.g;
      let x = M;
      if (head) { g.fillStyle = '#f1ecdf'; g.fillRect(M, pg.y, widths.reduce((a, b) => a + b, 0), rh); }
      cells.forEach((cell, i) => {
        g.strokeStyle = '#ddd5c2';
        g.lineWidth = 1;
        g.strokeRect(x, pg.y, widths[i], rh);
        g.font = `${head ? 'bold ' : ''}17px ${SANS}`;
        g.fillStyle = head ? '#7d5a0c' : '#22242f';
        let s = String(cell);
        while (g.measureText(s).width > widths[i] - 16 && s.length > 1) s = s.slice(0, -2) + '…';
        g.fillText(s, x + 8, pg.y + 23);
        x += widths[i];
      });
      pg.y += rh;
    };
    row(header, true);
    rows.forEach((r) => row(r, false));
    pg.y += 30;
    return pg;
  }

  function heading(pages, text) {
    let pg = pages[pages.length - 1];
    if (pg.y + 120 > PH - M) { pg = newPage(); pages.push(pg); }
    pg.g.font = `28px ${SERIF}`;
    pg.g.fillStyle = '#7d5a0c';
    pg.g.fillText(text, M, pg.y + 28);
    pg.y += 50;
    return pg;
  }

  async function makePdf() {
    const { p, chart } = current;
    await loadJsPdf();
    const pages = [newPage()];
    let pg = pages[0];
    const g = pg.g;
    const W = PW - 2 * M;

    g.font = `44px ${SERIF}`;
    g.fillStyle = '#7d5a0c';
    g.fillText(chartTitle(p.name), M, pg.y + 40);
    pg.y += 70;
    drawRich(pg, metaText(current), 20, W);
    pg.y += 10;

    const img = await svgToImage(wheelSvg(chart, PRINT_PALETTE));
    const size = W;
    g.drawImage(img, M, pg.y, size, size);
    pg.y += size + 30;
    g.font = `15px ${SANS}`;
    g.fillStyle = '#6b6e7e';
    g.fillText(t('legend') + ' ' + (chart.houses
      ? t('legendHouses', { system: DICT.astro.houseSystems[chart.houses.system] || chart.houses.system })
      : t('legendNoHouses')), M, pg.y);

    pages.push(newPage());
    pg = heading(pages, t('hPlanets'));
    const unknown = !chart.houses;
    drawTable(pages, unknown ? [t('thPlanet'), t('thSign'), t('thDegree')] : [t('thPlanet'), t('thSign'), t('thDegree'), t('thHouse')],
      chart.objects.map((o) => {
        const r = [`${o.glyph}  ${o.name}`, `${o.pos.sign.glyph}  ${o.pos.sign.name}`, fmtPos(o.pos) + (o.retro ? '  R' : '')];
        if (!unknown) r.push(ROMAN[o.house]);
        return r;
      }), unknown ? [420, 360, 280] : [400, 330, 200, 130]);

    if (chart.houses) {
      heading(pages, t('pdfHouses'));
      const cu = chart.houses.cusps;
      const rows = [];
      for (let i = 1; i <= 12; i++) {
        const pos = N.signOf(cu[i]);
        rows.push([ROMAN[i] + (i === 1 ? ' (AC)' : i === 10 ? ' (MC)' : ''), `${pos.sign.glyph}  ${pos.sign.name} ${fmtPos(pos)}`, N.HOUSES[i - 1]]);
      }
      drawTable(pages, [t('thHouse'), t('thCusp'), t('thSphere')], rows, [170, 380, 510]);
    }

    if (chart.aspects.length) {
      heading(pages, t('hAspects'));
      drawTable(pages, [t('thPlanet'), t('thAspect'), t('thPlanet'), t('thOrb')],
        chart.aspects.map((x) => [`${x.a.glyph}  ${x.a.name}`, `${x.aspect.glyph}  ${x.aspect.name}`, `${x.b.glyph}  ${x.b.name}`, x.orb.toFixed(1) + '°']),
        [300, 300, 300, 160]);
    }

    pg = heading(pages, t('hSummary'));
    for (const para of readingParagraphs(chart, unknown)) {
      pg = pages[pages.length - 1];
      if (pg.y + 80 > PH - M) { pg = newPage(); pages.push(pg); }
      drawRich(pg, para, 19, W);
      pg.y += 10;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    pages.forEach((pp, i) => {
      if (i) doc.addPage();
      pp.g.font = `14px ${SANS}`;
      pp.g.fillStyle = '#9a9caa';
      pp.g.fillText(`${location.host} · ${t('page', { n: i + 1, total: pages.length })}`, M, PH - 45);
      doc.addImage(pp.cv.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);
    });
    const fname = 'natal-' + (p.name ? p.name.replace(/[^\p{L}\p{N}]+/gu, '-') + '-' : '') + p.date + '.pdf';
    doc.save(fname);
  }

  $('pdf-btn').addEventListener('click', async () => {
    if (!current) return;
    const btn = $('pdf-btn');
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = t('pdfBusy');
    try {
      await makePdf();
    } catch (e) {
      $('share-note').textContent = t('pdfFail') + (e && e.message ? e.message : e);
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  });

  fromHash();
})();
