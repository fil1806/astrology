// Общее для всех страниц: тема, язык, подсветка меню, заглушка чата.
// Тема выставляется инлайн-скриптом в <head> каждой страницы —
// до первой отрисовки, чтобы не мелькала тема по умолчанию.
// Тексты — из i18n/<lang>.json, список языков — из i18n/languages.json.

const SITE_ROOT = new URL('../', document.currentScript.src);
const PAGE_LANG = document.documentElement.lang || 'ru';
const loadJson = (path) => fetch(new URL(path, SITE_ROOT)).then((r) => r.json());
const I18N = Promise.all([loadJson(`i18n/${PAGE_LANG}.json`), loadJson('i18n/languages.json')])
  .catch(() => [{ common: {} }, []]);

// Кнопка переключения темы в правом верхнем углу (в шапке)
function initThemeToggle(common) {
  const btn = document.createElement('button');
  btn.id = 'theme-toggle';

  function apply(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
    btn.textContent = theme === 'dark' ? '☀️' : '🌙';
    btn.title = theme === 'dark' ? common.themeToLight || '' : common.themeToDark || '';
  }

  apply(document.documentElement.dataset.theme);
  btn.addEventListener('click', () => {
    apply(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });

  document.querySelector('.header-inner').appendChild(btn);
}

// Переключатель языка: ссылка на ту же страницу в папке другого языка.
// Все языковые версии лежат под одинаковыми именами файлов.
function initLanguageSwitch(languages, common) {
  if (languages.length < 2) return;
  const here = languages.find((l) => l.code === PAGE_LANG) || languages[0];
  const pageUrl = new URL(location.href);
  const rel = decodeURIComponent(pageUrl.pathname).slice(new URL(here.dir, SITE_ROOT).pathname.length) || 'index.html';

  const box = document.createElement('div');
  box.className = 'lang-switch';
  box.setAttribute('role', 'navigation');
  box.setAttribute('aria-label', common.language || 'Language');
  for (const l of languages) {
    const a = document.createElement('a');
    a.textContent = l.label;
    a.title = l.name;
    a.lang = l.code;
    a.hreflang = l.code;
    // Хэш (данные натальной карты) переносится: карта откроется на другом языке
    a.href = new URL(l.dir + rel, SITE_ROOT).pathname + pageUrl.search + pageUrl.hash;
    if (l.code === here.code) a.setAttribute('aria-current', 'true');
    a.addEventListener('click', () => { a.href = new URL(l.dir + rel, SITE_ROOT).pathname + location.search + location.hash; });
    box.appendChild(a);
  }
  document.querySelector('.header-inner').appendChild(box);
}

// Подсветка активного пункта меню
(function () {
  const page = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('nav a').forEach(a => {
    const href = a.getAttribute('href');
    if (href === page || href === page + '.html') a.classList.add('active');
  });
})();

// Онлайн-чат.
// Сейчас это заглушка. Чтобы подключить реальный чат, замените содержимое
// функции initChat() на код виджета (например, Tawk.to, Crisp, Jivo)
// или на собственный чат — точка встраивания одна на всех страницах.
function initChat(common) {
  const btn = document.createElement('button');
  btn.id = 'chat-toggle';
  btn.title = common.chatButton || '';
  btn.textContent = '💬';

  const panel = document.createElement('div');
  panel.id = 'chat-panel';
  const h = document.createElement('h3');
  h.textContent = common.chatTitle || '';
  const p = document.createElement('p');
  p.textContent = common.chatText || '';
  panel.append(h, p);

  btn.addEventListener('click', () => panel.classList.toggle('open'));

  document.body.appendChild(btn);
  document.body.appendChild(panel);
}

document.addEventListener('DOMContentLoaded', async () => {
  const [dict, languages] = await I18N;
  const common = dict.common || {};
  initLanguageSwitch(languages, common);
  initThemeToggle(common);
  initChat(common);
});
