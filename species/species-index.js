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

  function formatShortDate(date) {
    return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  }

  function firstSaturdayOnOrAfter(date) {
    const result = new Date(date);
    result.setDate(result.getDate() + ((6 - result.getDay() + 7) % 7));
    return result;
  }

  function getSeasonSticker(item, today = new Date()) {
    if (!item.season) return null;
    const current = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const year = current.getFullYear();

    if (item.season.type === 'rock-lobster') {
      const femaleClosed = current >= new Date(year, 5, 1) && current <= new Date(year, 10, 15);
      const maleClosed = current >= new Date(year, 8, 15) && current <= new Date(year, 10, 15);
      const opens = new Date(year, 10, 16);
      const lines = [
        `Male: ${maleClosed ? 'out of season' : 'season open'}`,
        `Female: ${femaleClosed ? 'out of season' : 'season open'}`
      ];
      if (femaleClosed || maleClosed) lines.push(`Season opens ${formatShortDate(opens)}`);
      return { title: femaleClosed || maleClosed ? 'Closed season' : 'Season open', lines, open: !femaleClosed && !maleClosed };
    }

    if (item.season.type === 'abalone-central') {
      const centralOpenWindow = current >= new Date(year, 10, 16) || current <= new Date(year, 3, 30);
      const nextOpening = firstSaturdayOnOrAfter(new Date(year, 10, 16));
      return centralOpenWindow
        ? { title: 'Central waters', lines: ['Nominated open days only', 'Weekends and public holidays, 16 Nov–30 Apr'], open: true }
        : { title: 'Central waters closed', lines: [`Weekend openings return ${formatShortDate(nextOpening)}`, 'Rules differ outside Central Victorian waters'], open: false };
    }

    return null;
  }

  function createSeasonSticker(item) {
    const status = getSeasonSticker(item);
    if (!status) return null;
    const sticker = document.createElement('span');
    sticker.className = `season-sticker${status.open ? ' is-open' : ''}`;
    const title = document.createElement('strong');
    title.textContent = status.title;
    sticker.append(title, ...status.lines.map(line => {
      const text = document.createElement('span');
      text.textContent = line;
      return text;
    }));
    return sticker;
  }

  function render() {
    const query = search.value.trim().toLowerCase();
    const matches = Object.entries(species).filter(([, item]) => {
      const haystack = [item.name, item.aliases, item.scientific, item.group, item.recipe.title].filter(Boolean).join(' ').toLowerCase();
      return !query || haystack.includes(query);
    }).sort(([, first], [, second]) => first.name.localeCompare(second.name, 'en-AU'));
    grid.replaceChildren(...matches.map(([slug, item]) => {
      const card = document.createElement('a');
      card.className = 'species-card';
      card.href = `${slug}/`;
      const image = document.createElement('img');
      image.src = `../assets/${item.image}`;
      image.alt = item.imageAlt;
      const seasonSticker = createSeasonSticker(item);
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
      card.append(image);
      if (seasonSticker) card.append(seasonSticker);
      card.append(copy);
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
