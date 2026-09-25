(() => {
  const appearanceKey = 'spearfishing-victoria-clubhouse-v1';
  const checks = [...document.querySelectorAll('[data-checklist] input')];

  function readAppearance() {
    try { return JSON.parse(localStorage.getItem(appearanceKey) || '{}'); } catch { return {}; }
  }

  function setAppearance(dark) {
    document.documentElement.classList.toggle('dark-mode', dark);
    const toggle = document.querySelector('[data-theme-toggle]');
    toggle.innerHTML = `<i data-lucide="${dark ? 'sun' : 'moon'}" aria-hidden="true"></i>`;
    toggle.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    if (globalThis.lucide) globalThis.lucide.createIcons({ attrs: { width: 17, height: 17 } });
  }

  function renderProgress() {
    const completed = checks.filter(check => check.checked).length;
    document.querySelector('[data-check-label]').textContent = `${completed} of ${checks.length} checked`;
    document.querySelector('[data-check-progress]').style.width = `${(completed / checks.length) * 100}%`;
  }

  setAppearance(readAppearance().appearance === 'dark');
  document.querySelector('[data-theme-toggle]').addEventListener('click', () => {
    const dark = !document.documentElement.classList.contains('dark-mode');
    const settings = readAppearance();
    settings.appearance = dark ? 'dark' : 'light';
    localStorage.setItem(appearanceKey, JSON.stringify(settings));
    setAppearance(dark);
  });
  checks.forEach(check => check.addEventListener('change', renderProgress));
  document.querySelector('[data-reset-checks]').addEventListener('click', () => {
    checks.forEach(check => { check.checked = false; });
    renderProgress();
  });
  renderProgress();
})();
