(() => {
  const species = globalThis.SV_SPECIES || {};
  const grid = document.querySelector('[data-species-grid]');
  const search = document.querySelector('[data-species-search]');
  const count = document.querySelector('[data-species-count]');
  const empty = document.querySelector('[data-species-empty]');
  const featuredGrid = document.querySelector('[data-featured-recipes]');
  const filterControls = [...document.querySelectorAll('[data-recipe-filter]')];
  const recipeResult = document.querySelector('[data-recipe-result]');
  const appearanceKey = 'spearfishing-victoria-clubhouse-v1';
  const recipeMeta = {
    snapper: { displayTitle: 'Whole roasted snapper', method: 'bake', difficulty: 'easy', minutes: 45 },
    'southern-calamari': { displayTitle: 'Southern calamari two ways', method: 'bbq', difficulty: 'easy', minutes: 20 },
    'king-george-whiting': { displayTitle: 'King George whiting tacos', method: 'pan-fry', difficulty: 'easy', minutes: 25 },
    'rock-lobster': { displayTitle: 'Rock lobster garlic butter', method: 'bbq', difficulty: 'medium', minutes: 35 },
    'yellowtail-kingfish': { method: 'bake', difficulty: 'easy', minutes: 35 },
    'southern-bluefin-tuna': { method: 'pan-fry', difficulty: 'medium', minutes: 25 },
    abalone: { method: 'pan-fry', difficulty: 'medium', minutes: 30 },
    boarfish: { method: 'pan-fry', difficulty: 'easy', minutes: 30 },
    flathead: { method: 'pan-fry', difficulty: 'easy', minutes: 25 },
    scallop: { method: 'pan-fry', difficulty: 'easy', minutes: 15 }
  };
  const featuredSlugs = ['snapper', 'southern-calamari', 'king-george-whiting', 'rock-lobster'];

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

  function recipeImage(item) {
    return `../assets/${item.recipe?.image || item.image}`;
  }

  function recipeMatches(slug, item) {
    const query = search.value.trim().toLowerCase();
    const selected = Object.fromEntries(filterControls.map(control => [control.dataset.recipeFilter, control.value]));
    const meta = recipeMeta[slug] || {};
    const haystack = [item.name, item.aliases, item.scientific, item.group, item.recipe?.title, meta.displayTitle, meta.method].filter(Boolean).join(' ').toLowerCase();
    return (!query || haystack.includes(query))
      && (selected.species === 'all' || selected.species === slug)
      && (selected.method === 'all' || selected.method === meta.method)
      && (selected.time === 'all' || (selected.time === 'under-30' && meta.minutes < 30))
      && (selected.difficulty === 'all' || selected.difficulty === meta.difficulty);
  }

  function renderFeaturedRecipes(matches) {
    const visible = featuredSlugs.filter(slug => matches.some(([matchSlug]) => matchSlug === slug));
    featuredGrid.replaceChildren(...visible.map(slug => {
      const item = species[slug];
      const meta = recipeMeta[slug];
      const card = document.createElement('a');
      card.className = 'featured-recipe-card';
      card.href = `../recipes/index.html?species=${encodeURIComponent(slug)}`;
      card.innerHTML = `<img src="${recipeImage(item)}" alt="${item.recipe.title}"><span class="featured-recipe-shade"></span><span class="featured-recipe-top"><b>${item.name}</b><span><i data-lucide="clock-3"></i>${meta.minutes} min</span><span><i data-lucide="chef-hat"></i>${meta.difficulty}</span></span><span class="featured-recipe-copy"><strong>${meta.displayTitle}</strong><small>${meta.method.replace('-', ' ')}</small><em aria-hidden="true"><i data-lucide="arrow-right"></i></em></span>`;
      return card;
    }));
    featuredGrid.classList.toggle('is-empty', visible.length === 0);
  }

  function render() {
    const matches = Object.entries(species).filter(([slug, item]) => recipeMatches(slug, item)).sort(([, first], [, second]) => first.name.localeCompare(second.name, 'en-AU'));
    renderFeaturedRecipes(matches);
    grid.replaceChildren(...matches.map(([slug, item]) => {
      const card = document.createElement('article');
      card.className = 'species-card cookbook-recipe-card';
      const imageLink = document.createElement('a');
      imageLink.className = 'species-card-image';
      imageLink.href = `../recipes/index.html?species=${encodeURIComponent(slug)}`;
      const image = document.createElement('img');
      image.src = recipeImage(item);
      image.alt = item.recipe.title;
      const copy = document.createElement('div');
      copy.className = 'species-card-copy';
      const scientific = document.createElement('em');
      scientific.textContent = item.name;
      const name = document.createElement('h3');
      name.textContent = recipeMeta[slug]?.displayTitle || item.recipe.title;
      const facts = document.createElement('small');
      facts.textContent = item.recipe.description;
      const status = document.createElement('span');
      status.className = 'recipe-card-meta';
      status.innerHTML = `<span><i data-lucide="clock-3"></i>${recipeMeta[slug]?.minutes || parseInt(item.recipe.time, 10)} min</span><span><i data-lucide="chef-hat"></i>${recipeMeta[slug]?.difficulty || 'easy'}</span><span><i data-lucide="flame"></i>${(recipeMeta[slug]?.method || 'pan-fry').replace('-', ' ')}</span>`;
      const actions = document.createElement('div');
      actions.className = 'species-card-actions';
      const view = document.createElement('a');
      view.href = `../recipes/index.html?species=${encodeURIComponent(slug)}`;
      view.append(document.createTextNode('View recipe '), createIcon('arrow-right'));
      const speciesLink = document.createElement('a');
      speciesLink.href = `${slug}/index.html`;
      speciesLink.textContent = 'Species page';
      actions.append(view, speciesLink);
      copy.append(scientific, name, status, facts, actions);
      imageLink.append(image);
      card.append(imageLink);
      card.append(copy);
      return card;
    }));
    count.textContent = matches.length;
    empty.hidden = matches.length > 0;
    recipeResult.textContent = matches.length === Object.keys(species).length ? 'Showing all recipe ideas.' : `${matches.length} matching ${matches.length === 1 ? 'recipe' : 'recipes'}.`;
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
  const speciesFilter = document.querySelector('[data-recipe-filter="species"]');
  Object.entries(species).sort(([, first], [, second]) => first.name.localeCompare(second.name, 'en-AU')).forEach(([slug, item]) => {
    const option = document.createElement('option');
    option.value = slug;
    option.textContent = item.name;
    speciesFilter.append(option);
  });
  search.addEventListener('input', render);
  filterControls.forEach(control => control.addEventListener('change', render));
  render();
  loadMonthlyCatch();
})();
