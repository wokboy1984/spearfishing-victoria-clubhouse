(() => {
  const species = globalThis.SV_SPECIES || {};
  const grid = document.querySelector('[data-species-grid]');
  const search = document.querySelector('[data-species-search]');
  const count = document.querySelector('[data-species-count]');
  const empty = document.querySelector('[data-species-empty]');
  const appearanceKey = 'spearfishing-victoria-clubhouse-v1';

  function createIcon(name) {
    const icon = document.createElement('i');
    icon.dataset.lucide = name;
    icon.setAttribute('aria-hidden', 'true');
    return icon;
  }

  function render() {
    const query = search.value.trim().toLowerCase();
    const matches = Object.entries(species).filter(([, item]) => {
      const haystack = [item.name, item.scientific, item.group, item.recipe.title].join(' ').toLowerCase();
      return !query || haystack.includes(query);
    });
    grid.replaceChildren(...matches.map(([slug, item]) => {
      const card = document.createElement('a');
      card.className = 'species-card';
      card.href = `${slug}/`;
      const image = document.createElement('img');
      image.src = `../assets/${item.image}`;
      image.alt = item.imageAlt;
      const copy = document.createElement('span');
      copy.className = 'species-card-copy';
      const scientific = document.createElement('em');
      scientific.textContent = item.scientific;
      const name = document.createElement('strong');
      name.textContent = item.name;
      const facts = document.createElement('small');
      facts.textContent = `${item.size} · ${item.bag}`;
      const link = document.createElement('span');
      link.className = 'card-link';
      link.append(createIcon('arrow-right'), document.createTextNode(' Recipes, catches and records'));
      copy.append(scientific, name, facts, link);
      card.append(image, copy);
      return card;
    }));
    count.textContent = matches.length;
    empty.hidden = matches.length > 0;
    if (globalThis.lucide) globalThis.lucide.createIcons({ attrs: { width: 16, height: 16 } });
  }

  function readAppearance() {
    try { return JSON.parse(localStorage.getItem(appearanceKey) || '{}'); } catch { return {}; }
  }

  function setAppearance(dark) {
    document.documentElement.classList.toggle('dark-mode', dark);
    const toggle = document.querySelector('[data-theme-toggle]');
    toggle.innerHTML = `<i data-lucide="${dark ? 'sun' : 'moon'}" aria-hidden="true"></i>`;
    toggle.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    if (globalThis.lucide) globalThis.lucide.createIcons({ attrs: { width: 16, height: 16 } });
  }

  async function loadMonthlyCatch() {
    const config = globalThis.SV_SUPABASE_CONFIG;
    if (!globalThis.supabase || !config?.url || !config?.publishableKey) return;
    const client = globalThis.supabase.createClient(config.url, config.publishableKey);
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await client.from('challenges').select('title,starts_on,ends_on,species:species_id(slug,common_name)').lte('starts_on', today).gte('ends_on', today).order('starts_on', { ascending: false }).limit(1).maybeSingle();
    if (!data?.species) return;
    const item = species[data.species.slug];
    const days = Math.max(0, Math.ceil((new Date(`${data.ends_on}T23:59:59`) - new Date()) / 86400000));
    document.querySelector('[data-monthly-title]').textContent = data.title || `${data.species.common_name} Monthly Catch`;
    document.querySelector('[data-monthly-copy]').textContent = `${days} day${days === 1 ? '' : 's'} left · View standings, catches and the next species vote.`;
    const image = document.querySelector('[data-monthly-image]');
    image.src = `../assets/${item?.image || 'sv-snapper.webp'}`;
    image.alt = item?.imageAlt || data.species.common_name;
    document.querySelector('[data-monthly-banner]').hidden = false;
  }

  const saved = readAppearance();
  setAppearance(saved.appearance === 'dark');
  document.querySelector('[data-theme-toggle]').addEventListener('click', () => {
    const nextDark = !document.documentElement.classList.contains('dark-mode');
    const current = readAppearance();
    current.appearance = nextDark ? 'dark' : 'light';
    localStorage.setItem(appearanceKey, JSON.stringify(current));
    setAppearance(nextDark);
  });
  search.addEventListener('input', render);
  render();
  loadMonthlyCatch();
})();
