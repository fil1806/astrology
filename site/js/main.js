// Тема: сохранённый выбор > системная настройка > тёмная
(function () {
  const saved = localStorage.getItem('theme');
  const theme = saved ||
    (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  document.documentElement.dataset.theme = theme;
})();

// Кнопка переключения темы в правом верхнем углу (в шапке)
function initThemeToggle() {
  const btn = document.createElement('button');
  btn.id = 'theme-toggle';

  function apply(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
    btn.textContent = theme === 'dark' ? '☀️' : '🌙';
    btn.title = theme === 'dark' ? 'Светлая тема' : 'Тёмная тема';
  }

  apply(document.documentElement.dataset.theme);
  btn.addEventListener('click', () => {
    apply(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });

  document.querySelector('.header-inner').appendChild(btn);
}

document.addEventListener('DOMContentLoaded', initThemeToggle);

// Подсветка активного пункта меню
(function () {
  const page = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('nav a').forEach(a => {
    if (a.getAttribute('href') === page) a.classList.add('active');
  });
})();

// Онлайн-чат.
// Сейчас это заглушка. Чтобы подключить реальный чат, замените содержимое
// функции initChat() на код виджета (например, Tawk.to, Crisp, Jivo)
// или на собственный чат — точка встраивания одна на всех страницах.
function initChat() {
  const btn = document.createElement('button');
  btn.id = 'chat-toggle';
  btn.title = 'Чат';
  btn.textContent = '💬';

  const panel = document.createElement('div');
  panel.id = 'chat-panel';
  panel.innerHTML =
    '<h3>Онлайн-чат</h3>' +
    '<p>Чат с астрологом скоро появится. А пока изучайте материалы сайта и слушайте аудио-лекции.</p>';

  btn.addEventListener('click', () => panel.classList.toggle('open'));

  document.body.appendChild(btn);
  document.body.appendChild(panel);
}

document.addEventListener('DOMContentLoaded', initChat);
