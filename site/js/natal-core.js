// Расчёт натальной карты. Без DOM: работает и в браузере, и в bun для проверки.
// Положения планет — astronomy-engine (истинная эклиптика даты, геоцентр).
// Асцендент, MC и дома по Плациду считаются здесь же; узлы и Чёрная Луна —
// средние, как по умолчанию в Sotis.
(function (root) {
  'use strict';
  const A = root.Astronomy;
  const D2R = Math.PI / 180;
  const R2D = 180 / Math.PI;
  const norm = (x) => ((x % 360) + 360) % 360;
  // Разность углов в диапазоне (-180, 180]
  const diff = (a, b) => { const d = norm(a - b); return d > 180 ? d - 360 : d; };

  // ︎ — просьба рисовать символ текстом, а не цветным эмодзи (iOS, Android)
  const T = '︎';

  const SIGNS = [
    { name: 'Овен', glyph: '♈' + T, element: 'fire', key: 'импульсивно, напором, первым' },
    { name: 'Телец', glyph: '♉' + T, element: 'earth', key: 'основательно, ценя комфорт и надёжность' },
    { name: 'Близнецы', glyph: '♊' + T, element: 'air', key: 'любознательно, через слово и контакты' },
    { name: 'Рак', glyph: '♋' + T, element: 'water', key: 'чутко, оберегая своё и своих' },
    { name: 'Лев', glyph: '♌' + T, element: 'fire', key: 'ярко, щедро, ожидая признания' },
    { name: 'Дева', glyph: '♍' + T, element: 'earth', key: 'аккуратно, анализируя и улучшая' },
    { name: 'Весы', glyph: '♎' + T, element: 'air', key: 'дипломатично, в поиске равновесия' },
    { name: 'Скорпион', glyph: '♏' + T, element: 'water', key: 'глубоко, страстно, до конца' },
    { name: 'Стрелец', glyph: '♐' + T, element: 'fire', key: 'широко, с верой и тягой к смыслу' },
    { name: 'Козерог', glyph: '♑' + T, element: 'earth', key: 'ответственно, на долгую дистанцию' },
    { name: 'Водолей', glyph: '♒' + T, element: 'air', key: 'независимо, нестандартно' },
    { name: 'Рыбы', glyph: '♓' + T, element: 'water', key: 'интуитивно, растворяясь и сопереживая' },
  ];

  const PLANETS = [
    { id: 'Sun', name: 'Солнце', glyph: '☉', key: 'суть личности, воля' },
    { id: 'Moon', name: 'Луна', glyph: '☽', key: 'эмоции, потребности, привычки' },
    { id: 'Mercury', name: 'Меркурий', glyph: '☿', key: 'мышление, речь' },
    { id: 'Venus', name: 'Венера', glyph: '♀', key: 'любовь, вкус, ценности' },
    { id: 'Mars', name: 'Марс', glyph: '♂', key: 'действие, напор' },
    { id: 'Jupiter', name: 'Юпитер', glyph: '♃', key: 'рост, удача, мировоззрение' },
    { id: 'Saturn', name: 'Сатурн', glyph: '♄', key: 'дисциплина, границы, опыт' },
    { id: 'Uranus', name: 'Уран', glyph: '♅', key: 'свобода, перемены' },
    { id: 'Neptune', name: 'Нептун', glyph: '♆', key: 'мечты, интуиция' },
    { id: 'Pluto', name: 'Плутон', glyph: '♇', key: 'трансформация, власть' },
  ];
  const POINTS = [
    { id: 'Node', name: 'Восходящий узел', glyph: '☊', key: 'направление развития' },
    { id: 'Lilith', name: 'Чёрная Луна', glyph: '⚸', key: 'теневая сторона, искушения' },
  ];

  const HOUSES = [
    'личность, внешность', 'деньги, ресурсы', 'общение, ближнее окружение',
    'дом, семья, корни', 'творчество, дети, любовь', 'работа, здоровье, быт',
    'партнёрство, брак', 'кризисы, чужие ресурсы', 'мировоззрение, путешествия',
    'карьера, статус', 'друзья, планы', 'тайное, уединение',
  ];

  const ASPECTS = [
    { angle: 0, name: 'Соединение', glyph: '☌', orb: 8, kind: 'major' },
    { angle: 60, name: 'Секстиль', glyph: '⚹', orb: 6, kind: 'soft' },
    { angle: 90, name: 'Квадрат', glyph: '□', orb: 7, kind: 'hard' },
    { angle: 120, name: 'Тригон', glyph: '△', orb: 8, kind: 'soft' },
    { angle: 180, name: 'Оппозиция', glyph: '☍', orb: 8, kind: 'hard' },
  ];

  // ---------- Время ----------

  // Сдвиг пояса tz от UTC (мс) в момент ms. Intl знает историю поясов,
  // включая местное среднее время до введения поясного.
  function tzOffsetMs(tz, ms) {
    const f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
    });
    const p = {};
    for (const x of f.formatToParts(new Date(ms))) p[x.type] = x.value;
    const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    return asUtc - Math.floor(ms / 1000) * 1000;
  }

  // Местное время в поясе tz → Date в UTC. Две итерации нужны на стыке
  // перевода часов: сдвиг зависит от самого искомого момента.
  function localToUtc(y, mo, d, h, mi, tz) {
    const wall = Date.UTC(y, mo - 1, d, h, mi);
    let t = wall - tzOffsetMs(tz, wall);
    t = wall - tzOffsetMs(tz, t);
    return new Date(t);
  }

  // ---------- Планеты ----------

  function bodyLon(id, date) {
    return A.Ecliptic(A.GeoVector(A.Body[id], date, true)).elon;
  }

  function centuries(date) { return A.MakeTime(date).tt / 36525; }

  // Средний восходящий узел Луны (Meeus, гл. 47)
  function meanNode(date) {
    const t = centuries(date);
    return norm(125.0445479 - 1934.1362891 * t + 0.0020754 * t * t + t * t * t / 467441);
  }

  // Средний апогей Луны — Чёрная Луна (Лилит)
  function meanLilith(date) {
    const t = centuries(date);
    return norm(83.3532465 + 4069.0137287 * t - 0.01032 * t * t - t * t * t / 80053 + 180);
  }

  function obliquity(date) {
    const t = centuries(date);
    return 23.439291111 - 0.013004167 * t - 1.639e-7 * t * t + 5.036e-7 * t * t * t;
  }

  // ---------- Угловые точки и дома ----------

  function angles(date, lat, lon) {
    const eps = obliquity(date) * D2R;
    const ramc = norm(A.SiderealTime(date) * 15 + lon);
    const r = ramc * D2R;
    const phi = lat * D2R;
    const mc = norm(Math.atan2(Math.sin(r), Math.cos(r) * Math.cos(eps)) * R2D);
    const asc = norm(Math.atan2(Math.cos(r), -(Math.sin(r) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps))) * R2D);
    return { ramc, mc, asc, eps: eps * R2D };
  }

  // Куспид Плацида: точка эклиптики, у которой прямое восхождение отстоит от
  // RAMC на заданную долю её же полудуги. Решается итерацией.
  function placidusCusp(ramc, epsDeg, lat, frac, below) {
    const eps = epsDeg * D2R;
    const tphi = Math.tan(lat * D2R);
    let ra = norm(ramc + (below ? 180 - frac * 90 : frac * 90));
    let lam = 0;
    for (let i = 0; i < 60; i++) {
      lam = Math.atan2(Math.sin(ra * D2R), Math.cos(ra * D2R) * Math.cos(eps));
      const dec = Math.asin(Math.sin(eps) * Math.sin(lam));
      const x = tphi * Math.tan(dec);
      if (Math.abs(x) >= 1) return null; // за полярным кругом Плацид не определён
      const dsa = 90 + Math.asin(x) * R2D;
      const nsa = 180 - dsa;
      const next = norm(below ? ramc + 180 - frac * nsa : ramc + frac * dsa);
      if (Math.abs(diff(next, ra)) < 1e-9) { ra = next; break; }
      ra = next;
    }
    return norm(Math.atan2(Math.sin(ra * D2R), Math.cos(ra * D2R) * Math.cos(eps)) * R2D);
  }

  function houses(ang, lat) {
    const c = new Array(13);
    c[1] = ang.asc;
    c[10] = ang.mc;
    let system = 'Placidus';
    const h11 = placidusCusp(ang.ramc, ang.eps, lat, 1 / 3, false);
    const h12 = placidusCusp(ang.ramc, ang.eps, lat, 2 / 3, false);
    const h2 = placidusCusp(ang.ramc, ang.eps, lat, 2 / 3, true);
    const h3 = placidusCusp(ang.ramc, ang.eps, lat, 1 / 3, true);
    if (h11 == null || h12 == null || h2 == null || h3 == null) {
      // Порфирий: каждая четверть между угловыми точками делится на три
      system = 'Porphyry';
      const q1 = norm(ang.asc - ang.mc); // MC → ASC
      const q2 = 180 - q1;              // ASC → IC
      c[11] = norm(ang.mc + q1 / 3); c[12] = norm(ang.mc + 2 * q1 / 3);
      c[2] = norm(ang.asc + q2 / 3); c[3] = norm(ang.asc + 2 * q2 / 3);
    } else {
      c[11] = h11; c[12] = h12; c[2] = h2; c[3] = h3;
    }
    c[4] = norm(c[10] + 180); c[5] = norm(c[11] + 180); c[6] = norm(c[12] + 180);
    c[7] = norm(c[1] + 180); c[8] = norm(c[2] + 180); c[9] = norm(c[3] + 180);
    return { cusps: c, system };
  }

  function houseOf(lon, cusps) {
    for (let i = 1; i <= 12; i++) {
      const a = cusps[i];
      const b = cusps[i === 12 ? 1 : i + 1];
      if (norm(lon - a) < norm(b - a)) return i;
    }
    return 12;
  }

  // ---------- Карта целиком ----------

  function signOf(lon) {
    const i = Math.floor(norm(lon) / 30);
    const inSign = norm(lon) - i * 30;
    let deg = Math.floor(inSign);
    let min = Math.round((inSign - deg) * 60);
    if (min === 60) { min = 0; deg += 1; }
    return { index: i, sign: SIGNS[i], deg, min };
  }

  function aspectsOf(objs) {
    const out = [];
    for (let i = 0; i < objs.length; i++) {
      for (let j = i + 1; j < objs.length; j++) {
        const a = objs[i];
        const b = objs[j];
        const sep = Math.abs(diff(a.lon, b.lon));
        const lum = a.id === 'Sun' || a.id === 'Moon' || b.id === 'Sun' || b.id === 'Moon';
        for (const asp of ASPECTS) {
          const orb = Math.abs(sep - asp.angle);
          if (orb <= asp.orb + (lum ? 2 : 0)) {
            out.push({ a, b, aspect: asp, orb });
            break;
          }
        }
      }
    }
    return out.sort((x, y) => x.orb - y.orb);
  }

  // input: { utc: Date, lat, lon, timeKnown }
  function compute(input) {
    const date = input.utc;
    const step = 12 * 3600 * 1000;
    const before = new Date(date.getTime() - step);
    const after = new Date(date.getTime() + step);

    const planets = PLANETS.map((p) => {
      const lon = bodyLon(p.id, date);
      const speed = diff(bodyLon(p.id, after), bodyLon(p.id, before)); // град/сутки
      return { ...p, lon, speed, retro: speed < 0 && p.id !== 'Sun' && p.id !== 'Moon' };
    });
    const points = [
      { ...POINTS[0], lon: meanNode(date), speed: -0.053, retro: false },
      { ...POINTS[1], lon: meanLilith(date), speed: 0.111, retro: false },
    ];

    let ang = null;
    let hs = null;
    if (input.timeKnown) {
      ang = angles(date, input.lat, input.lon);
      hs = houses(ang, input.lat);
    }

    const all = planets.concat(points).map((o) => ({
      ...o,
      pos: signOf(o.lon),
      house: hs ? houseOf(o.lon, hs.cusps) : null,
    }));

    return {
      utc: date,
      objects: all,
      angles: ang && { asc: { lon: ang.asc, pos: signOf(ang.asc) }, mc: { lon: ang.mc, pos: signOf(ang.mc) } },
      houses: hs,
      aspects: aspectsOf(all.filter((o) => PLANETS.some((p) => p.id === o.id))),
    };
  }

  const api = {
    SIGNS, PLANETS, POINTS, HOUSES, ASPECTS,
    norm, diff, tzOffsetMs, localToUtc, compute, signOf, houseOf,
  };
  root.NatalCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
