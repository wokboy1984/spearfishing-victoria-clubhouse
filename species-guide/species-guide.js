(() => {
  const species = globalThis.SV_SPECIES || {};
  const search = document.querySelector('[data-guide-search]');
  const grid = document.querySelector('[data-guide-grid]');
  const count = document.querySelector('[data-guide-count]');
  const empty = document.querySelector('[data-guide-empty]');
  const appearanceKey = 'spearfishing-victoria-clubhouse-v1';
  const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;

  function statusFor(item) {
    const today = new Date();
    const year = today.getFullYear();
    if (item.season?.type === 'rock-lobster') {
      const closed = (today >= new Date(year, 5, 1) && today <= new Date(year, 10, 15)) || (today >= new Date(year, 8, 15) && today <= new Date(year, 10, 15));
      return { label: closed ? 'Closed season' : 'Season open', closed };
    }
    if (item.season?.type === 'abalone-central') {
      const open = today >= new Date(year, 10, 16) || today <= new Date(year, 3, 30);
      return { label: open ? 'Central waters: check open days' : 'Central waters closed', closed: !open };
    }
    return { label: 'Check current rules', closed: false };
  }

  function escapeHtml(value='') { return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])); }

  function render() {
    const query = search.value.trim().toLowerCase();
    const matches = Object.entries(species).filter(([, item]) => [item.name,item.aliases,item.scientific,item.group,item.summary].filter(Boolean).join(' ').toLowerCase().includes(query)).sort(([,a],[,b]) => a.name.localeCompare(b.name,'en-AU'));
    grid.innerHTML = matches.map(([slug,item]) => {
      const status = statusFor(item);
      return `<article class="guide-card"><a class="guide-image" href="../species/${encodeURIComponent(slug)}/index.html"><img src="../assets/${escapeHtml(item.image)}" alt="${escapeHtml(item.imageAlt)}">${item.season ? `<span class="season-badge${status.closed?' closed':''}">${escapeHtml(status.label)}</span>` : ''}</a><div class="guide-copy"><em>${escapeHtml(item.scientific)}</em><h3>${escapeHtml(item.name)}</h3><span class="guide-status${status.closed?' closed':''}">${icon(status.closed?'circle-alert':'shield-check')}${escapeHtml(status.label)}</span><p>${escapeHtml(item.size)} · ${escapeHtml(item.bag)}</p><div class="guide-actions"><a href="../species/${encodeURIComponent(slug)}/index.html">View species</a><a href="${escapeHtml(item.rulesUrl)}" target="_blank" rel="noopener noreferrer">Check rules ${icon('external-link')}</a></div></div></article>`;
    }).join('');
    count.textContent = matches.length;
    empty.hidden = matches.length > 0;
    if (globalThis.lucide) globalThis.lucide.createIcons({attrs:{width:16,height:16}});
  }

  function appearance() { try { return JSON.parse(localStorage.getItem(appearanceKey)||'{}'); } catch { return {}; } }
  function setAppearance(dark) { document.documentElement.classList.toggle('dark-mode',dark); const toggle=document.querySelector('[data-theme-toggle]'); toggle.innerHTML=icon(dark?'sun':'moon'); toggle.setAttribute('aria-label',dark?'Switch to light mode':'Switch to dark mode'); if(globalThis.lucide)globalThis.lucide.createIcons({attrs:{width:16,height:16}}); }
  setAppearance(appearance().appearance==='dark');
  document.querySelector('[data-theme-toggle]').addEventListener('click',()=>{const dark=!document.documentElement.classList.contains('dark-mode');const saved=appearance();saved.appearance=dark?'dark':'light';localStorage.setItem(appearanceKey,JSON.stringify(saved));setAppearance(dark)});
  search.addEventListener('input',render);
  render();
})();
