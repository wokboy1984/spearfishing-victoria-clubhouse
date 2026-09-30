(() => {
  if (!document.querySelector('link[href*="shared-theme.css?v=6"]')) {
    const theme = document.createElement('link');
    theme.rel = 'stylesheet';
    theme.href = '/shared-theme.css?v=6';
    document.head.append(theme);
  }
  const header = document.querySelector('body > .shell > .topbar');
  if (!header || header.querySelector('[data-shared-mobile-controls]')) return;

  const desktopNav = header.querySelector(':scope > nav');
  if (desktopNav) desktopNav.classList.add('shared-desktop-navigation');

  const controls = document.createElement('div');
  controls.className = 'shared-mobile-controls';
  controls.dataset.sharedMobileControls = '';
  controls.innerHTML = `
    <a class="shared-mobile-action shared-mobile-submit" href="/?submit=catch" aria-label="Submit a catch"><i data-lucide="camera" aria-hidden="true"></i></a>
    <a class="shared-mobile-action" href="/?account=open" aria-label="Member sign in"><i data-lucide="user-round" aria-hidden="true"></i></a>
    <button class="shared-mobile-action shared-mobile-menu-toggle" type="button" aria-label="Open navigation menu" aria-expanded="false" aria-controls="shared-mobile-navigation"><i data-lucide="menu" aria-hidden="true"></i></button>`;
  header.append(controls);

  const path = location.pathname.replace(/\/index\.html$/, '/');
  const items = [
    ['/', 'house', 'Home', 'Community hub'],
    ['/challenge/', 'trophy', 'Monthly Catch', 'Dashboard, catches and community standings'],
    ['/species/', 'utensils', 'Cookbook', 'Recipes filtered by species and cooking style'],
    ['/species-guide/', 'fish', 'Species', 'Rules, catches, records and seasonal status'],
    ['/directory/', 'map', 'Directory', 'Schools, clubs, stores and creators'],
    ['/safety/', 'shield-check', 'Safety Hub', 'Pre-dive checks and emergency guidance']
  ];
  const mobileNav = document.createElement('nav');
  mobileNav.className = 'shared-mobile-navigation';
  mobileNav.id = 'shared-mobile-navigation';
  mobileNav.setAttribute('aria-label', 'Mobile navigation');
  mobileNav.hidden = true;
  mobileNav.innerHTML = items.map(([href, icon, label, detail]) => {
    const current = href === '/' ? path === '/' : path.startsWith(href);
    return `<a href="${href}"${current ? ' aria-current="page"' : ''}><i data-lucide="${icon}" aria-hidden="true"></i><span><strong>${label}</strong><small>${detail}</small></span></a>`;
  }).join('');
  header.after(mobileNav);

  const toggle = controls.querySelector('.shared-mobile-menu-toggle');
  const setOpen = open => {
    mobileNav.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
    toggle.innerHTML = `<i data-lucide="${open ? 'x' : 'menu'}" aria-hidden="true"></i>`;
    if (globalThis.lucide) globalThis.lucide.createIcons({ attrs: { width: 17, height: 17 } });
  };
  toggle.addEventListener('click', () => setOpen(mobileNav.hidden));
  mobileNav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setOpen(false)));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !mobileNav.hidden) {
      setOpen(false);
      toggle.focus();
    }
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth > 850 && !mobileNav.hidden) setOpen(false);
  });
  if (globalThis.lucide) globalThis.lucide.createIcons({ attrs: { width: 17, height: 17 } });
})();
