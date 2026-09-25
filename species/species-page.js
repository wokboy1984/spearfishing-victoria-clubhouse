(() => {
  const slug = document.body.dataset.speciesSlug;
  const species = globalThis.SV_SPECIES?.[slug];
  if (!species) return;
  const assetRoot = document.body.dataset.assetRoot || '../../assets/';
  const appearanceKey = 'spearfishing-victoria-clubhouse-v1';
  const supabaseConfig = globalThis.SV_SUPABASE_CONFIG;
  const supabaseClient = globalThis.supabase && supabaseConfig?.url && supabaseConfig?.publishableKey
    ? globalThis.supabase.createClient(supabaseConfig.url, supabaseConfig.publishableKey)
    : null;
  let period = 'month';
  let currentCatches = [];

  function setText(selector, value) {
    const element = document.querySelector(selector);
    if (element) element.textContent = value;
  }

  function fillPage() {
    document.title = `${species.name} | Spearfishing Victoria`;
    setText('[data-species-name]', species.name);
    setText('[data-species-scientific]', species.scientific);
    setText('[data-species-group]', species.group);
    setText('[data-species-summary]', species.summary);
    setText('[data-species-size]', species.size);
    setText('[data-species-bag]', species.bag);
    setText('[data-species-note]', species.note);
    const hero = document.querySelector('[data-species-image]');
    hero.src = `${assetRoot}${species.image}`;
    hero.alt = species.imageAlt;
    const rulesLink = document.querySelector('[data-rules-link]');
    rulesLink.href = species.rulesUrl;
    setText('[data-recipe-title]', species.recipe.title);
    setText('[data-recipe-description]', species.recipe.description);
    setText('[data-recipe-time]', species.recipe.time);
    setText('[data-recipe-serves]', species.recipe.serves);
    const recipeImage = document.querySelector('[data-recipe-image]');
    recipeImage.src = `${assetRoot}${species.recipe.image}`;
    recipeImage.alt = species.recipe.title;
    const ingredients = document.querySelector('[data-recipe-ingredients]');
    ingredients.replaceChildren(...species.recipe.ingredients.map(item => {
      const li = document.createElement('li');
      li.textContent = item;
      return li;
    }));
    const method = document.querySelector('[data-recipe-method]');
    method.replaceChildren(...species.recipe.method.map(item => {
      const li = document.createElement('li');
      li.textContent = item;
      return li;
    }));
  }

  function createRecordRow(record) {
    const row = document.createElement('tr');
    const rankCell = document.createElement('td');
    const rank = document.createElement('span');
    rank.className = 'record-rank';
    rank.textContent = record.rank;
    rankCell.append(rank);
    const memberCell = document.createElement('td');
    memberCell.className = 'record-member';
    const member = document.createElement('a');
    member.href = `../../${encodeURIComponent(record.username.toLowerCase())}/`;
    member.textContent = record.display_name || `@${record.username}`;
    memberCell.append(member);
    if (record.instagram_handle) {
      const instagram = document.createElement('span');
      instagram.textContent = `Instagram @${record.instagram_handle}`;
      memberCell.append(instagram);
    }
    const dateCell = document.createElement('td');
    dateCell.textContent = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${record.submitted_on}T12:00:00`));
    const lengthCell = document.createElement('td');
    lengthCell.textContent = `${Number(record.best_length_cm).toFixed(1)} cm`;
    row.append(rankCell, memberCell, dateCell, lengthCell);
    return row;
  }

  function publicCatchImage(path) {
    if (!path || !supabaseClient) return null;
    return supabaseClient.storage.from('community-images').getPublicUrl(path).data.publicUrl;
  }

  function ensureCatchGallery() {
    if (document.querySelector('[data-catch-gallery]')) return;
    const section = document.createElement('section');
    section.className = 'catch-gallery';
    section.dataset.catchGallery = '';
    const heading = document.createElement('div');
    heading.className = 'catch-gallery-head';
    const copy = document.createElement('div');
    const eyebrow = document.createElement('div');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = 'Approved community catches';
    const title = document.createElement('h3');
    title.textContent = 'Stories behind the records';
    const description = document.createElement('p');
    description.textContent = 'Hero photos chosen by members. Measurement evidence remains private to moderators.';
    copy.append(eyebrow, title, description);
    heading.append(copy);
    const grid = document.createElement('div');
    grid.className = 'catch-grid';
    grid.dataset.catchGrid = '';
    const empty = document.createElement('div');
    empty.className = 'catch-gallery-empty';
    empty.dataset.catchGalleryEmpty = '';
    empty.textContent = 'Approved catch photos will appear here.';
    section.append(heading, grid, empty);
    document.querySelector('.records-note').insertAdjacentElement('afterend', section);

    const dialog = document.createElement('dialog');
    dialog.className = 'catch-dialog';
    dialog.dataset.catchDialog = '';
    dialog.innerHTML = '<button class="catch-dialog-close" type="button" aria-label="Close catch story"><i data-lucide="x" aria-hidden="true"></i></button><img data-catch-dialog-image alt=""><div class="catch-dialog-copy"><div class="eyebrow">Community catch</div><div class="catch-dialog-meta"><span data-catch-dialog-rank></span><span data-catch-dialog-length></span><span data-catch-dialog-date></span></div><h3 data-catch-dialog-title></h3><p data-catch-dialog-member></p><p data-catch-dialog-story></p><a data-catch-dialog-instagram target="_blank" rel="noopener noreferrer" hidden><i data-lucide="instagram" aria-hidden="true"></i><span></span></a></div>';
    document.body.append(dialog);
    dialog.querySelector('.catch-dialog-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    if (globalThis.lucide) globalThis.lucide.createIcons({ attrs: { width: 16, height: 16 } });
  }

  function openCatchStory(record) {
    const dialog = document.querySelector('[data-catch-dialog]');
    const image = dialog.querySelector('[data-catch-dialog-image]');
    image.src = publicCatchImage(record.public_photo_path);
    image.alt = `${species.name} catch submitted by ${record.display_name || record.username}`;
    dialog.querySelector('[data-catch-dialog-rank]').textContent = `#${record.rank} ${period}`;
    dialog.querySelector('[data-catch-dialog-length]').textContent = `${Number(record.best_length_cm).toFixed(1)} cm`;
    dialog.querySelector('[data-catch-dialog-date]').textContent = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${record.submitted_on}T12:00:00`));
    dialog.querySelector('[data-catch-dialog-title]').textContent = species.name;
    dialog.querySelector('[data-catch-dialog-member]').textContent = record.display_name || `@${record.username}`;
    dialog.querySelector('[data-catch-dialog-story]').textContent = record.story;
    const instagram = dialog.querySelector('[data-catch-dialog-instagram]');
    instagram.hidden = !record.instagram_handle;
    if (record.instagram_handle) {
      instagram.href = `https://www.instagram.com/${encodeURIComponent(record.instagram_handle)}/`;
      instagram.querySelector('span').textContent = `@${record.instagram_handle}`;
    }
    dialog.showModal();
  }

  function createCatchCard(record) {
    const button = document.createElement('button');
    button.className = 'catch-card';
    button.type = 'button';
    const image = document.createElement('img');
    image.src = publicCatchImage(record.public_photo_path);
    image.alt = `${species.name} catch submitted by ${record.display_name || record.username}`;
    const rank = document.createElement('span');
    rank.className = 'catch-rank';
    rank.textContent = `#${record.rank}`;
    const body = document.createElement('span');
    body.className = 'catch-card-body';
    const name = document.createElement('strong');
    name.textContent = record.display_name || `@${record.username}`;
    const meta = document.createElement('span');
    meta.textContent = `${Number(record.best_length_cm).toFixed(1)} cm · ${new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short' }).format(new Date(`${record.submitted_on}T12:00:00`))}`;
    const story = document.createElement('span');
    story.className = 'catch-story-preview';
    story.textContent = record.story;
    body.append(name, meta, story);
    button.append(image, rank, body);
    button.addEventListener('click', () => openCatchStory(record));
    return button;
  }

  function renderCatchGallery(records) {
    ensureCatchGallery();
    currentCatches = records || [];
    const grid = document.querySelector('[data-catch-grid]');
    const empty = document.querySelector('[data-catch-gallery-empty]');
    grid.replaceChildren(...currentCatches.map(createCatchCard));
    empty.hidden = currentCatches.length > 0;
  }

  async function loadRecords() {
    const body = document.querySelector('[data-records-body]');
    const empty = document.querySelector('[data-records-empty]');
    body.replaceChildren();
    renderCatchGallery([]);
    empty.hidden = false;
    empty.textContent = 'Loading clubhouse records...';
    if (!supabaseClient) {
      empty.textContent = 'Live records are unavailable in this preview.';
      return;
    }
    const { data, error } = await supabaseClient.rpc('get_species_catches', {
      target_species_slug: slug,
      target_period: period,
      result_limit: 24
    });
    if (error) {
      console.warn('Species records unavailable', error);
      empty.textContent = 'Records are temporarily unavailable.';
      return;
    }
    body.replaceChildren(...(data || []).map(createRecordRow));
    renderCatchGallery(data || []);
    empty.hidden = Boolean(data?.length);
    if (!data?.length) empty.textContent = `No verified ${period} records yet.`;
  }

  function publicRecipeImage(path) {
    return publicCatchImage(path);
  }

  function ensureRecipeDialog() {
    if (document.querySelector('[data-recipe-dialog]')) return;
    const dialog = document.createElement('dialog');
    dialog.className = 'recipe-dialog';
    dialog.dataset.recipeDialog = '';
    dialog.innerHTML = '<button class="recipe-dialog-close" type="button" aria-label="Close recipe"><i data-lucide="x" aria-hidden="true"></i></button><div class="recipe-dialog-layout"><div class="recipe-dialog-media"><img data-recipe-dialog-image alt=""><div class="recipe-dialog-thumbs" data-recipe-dialog-thumbs></div></div><div class="recipe-dialog-copy"><div class="eyebrow">Community cookbook</div><h3 data-recipe-dialog-title></h3><p class="recipe-contributor" data-recipe-dialog-member></p><p data-recipe-dialog-story></p><div class="recipe-dialog-meta" data-recipe-dialog-meta></div><div class="recipe-dialog-columns"><section><h4>Ingredients</h4><ul data-recipe-dialog-ingredients></ul></section><section><h4>Method</h4><ol data-recipe-dialog-method></ol></section></div><a data-recipe-dialog-instagram target="_blank" rel="noopener noreferrer" hidden><i data-lucide="instagram" aria-hidden="true"></i><span></span></a></div></div>';
    document.body.append(dialog);
    dialog.querySelector('.recipe-dialog-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    if (globalThis.lucide) globalThis.lucide.createIcons({ attrs: { width: 16, height: 16 } });
  }

  function openRecipe(recipe) {
    ensureRecipeDialog();
    const dialog = document.querySelector('[data-recipe-dialog]');
    const paths = recipe.public_photo_paths?.length ? recipe.public_photo_paths : [recipe.public_photo_path].filter(Boolean);
    const mainImage = dialog.querySelector('[data-recipe-dialog-image]');
    const showImage = path => {
      mainImage.src = publicRecipeImage(path);
      mainImage.alt = `${recipe.title} by ${recipe.display_name || recipe.username}`;
    };
    showImage(paths[0]);
    const thumbs = dialog.querySelector('[data-recipe-dialog-thumbs]');
    thumbs.replaceChildren(...paths.map((path, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-label', `View recipe photo ${index + 1}`);
      const image = document.createElement('img');
      image.src = publicRecipeImage(path);
      image.alt = '';
      button.append(image);
      button.addEventListener('click', () => showImage(path));
      return button;
    }));
    thumbs.hidden = paths.length < 2;
    dialog.querySelector('[data-recipe-dialog-title]').textContent = recipe.title;
    dialog.querySelector('[data-recipe-dialog-member]').textContent = `Shared by ${recipe.display_name || `@${recipe.username}`}`;
    dialog.querySelector('[data-recipe-dialog-story]').textContent = recipe.story;
    const totalMinutes = Number(recipe.prep_minutes || 0) + Number(recipe.cook_minutes || 0);
    const meta = [recipe.prep_minutes ? `Prep ${recipe.prep_minutes} min` : null, recipe.cook_minutes ? `Cook ${recipe.cook_minutes} min` : null, totalMinutes ? `${totalMinutes} min total` : null, recipe.serves ? `Serves ${recipe.serves}` : null].filter(Boolean);
    dialog.querySelector('[data-recipe-dialog-meta]').replaceChildren(...meta.map(value => {
      const span = document.createElement('span');
      span.textContent = value;
      return span;
    }));
    const listItems = items => (items || []).map(item => { const li = document.createElement('li'); li.textContent = item; return li; });
    dialog.querySelector('[data-recipe-dialog-ingredients]').replaceChildren(...listItems(recipe.ingredients));
    dialog.querySelector('[data-recipe-dialog-method]').replaceChildren(...listItems(recipe.method));
    const instagram = dialog.querySelector('[data-recipe-dialog-instagram]');
    instagram.hidden = !recipe.instagram_handle;
    if (recipe.instagram_handle) {
      instagram.href = `https://www.instagram.com/${encodeURIComponent(recipe.instagram_handle)}/`;
      instagram.querySelector('span').textContent = `@${recipe.instagram_handle}`;
    }
    dialog.showModal();
  }

  function createRecipeCard(recipe) {
    const article = document.createElement('button');
    article.type = 'button';
    article.className = 'recipe-card';
    if (recipe.public_photo_path) {
      const image = document.createElement('img');
      image.src = publicRecipeImage(recipe.public_photo_path);
      image.alt = recipe.title;
      article.append(image);
    }
    const body = document.createElement('span');
    body.className = 'recipe-card-body';
    const kicker = document.createElement('span');
    kicker.textContent = recipe.instagram_handle ? `@${recipe.instagram_handle}` : `@${recipe.username}`;
    const title = document.createElement('h4');
    title.textContent = recipe.title;
    const description = document.createElement('p');
    description.textContent = recipe.story;
    const meta = document.createElement('p');
    const totalMinutes = Number(recipe.prep_minutes || 0) + Number(recipe.cook_minutes || 0);
    meta.textContent = [totalMinutes ? `${totalMinutes} min` : null, recipe.serves ? `Serves ${recipe.serves}` : null].filter(Boolean).join(' · ');
    body.append(kicker, title, description, meta);
    article.append(body);
    article.addEventListener('click', () => openRecipe(recipe));
    return article;
  }

  async function loadCommunityRecipes() {
    const grid = document.querySelector('[data-community-recipes]');
    const empty = document.querySelector('[data-recipes-empty]');
    if (!supabaseClient) return;
    const { data, error } = await supabaseClient.rpc('get_species_recipes', {
      target_species_slug: slug,
      result_limit: 24
    });
    if (error) {
      console.warn('Community recipes unavailable', error);
      return;
    }
    grid.replaceChildren(...(data || []).map(createRecipeCard));
    empty.hidden = Boolean(data?.length);
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

  fillPage();
  document.querySelectorAll('[data-period]').forEach(button => button.addEventListener('click', () => {
    period = button.dataset.period;
    document.querySelectorAll('[data-period]').forEach(option => option.setAttribute('aria-pressed', String(option === button)));
    loadRecords();
  }));
  const saved = readAppearance();
  setAppearance(saved.appearance === 'dark');
  document.querySelector('[data-theme-toggle]').addEventListener('click', () => {
    const nextDark = !document.documentElement.classList.contains('dark-mode');
    const current = readAppearance();
    current.appearance = nextDark ? 'dark' : 'light';
    localStorage.setItem(appearanceKey, JSON.stringify(current));
    setAppearance(nextDark);
  });
  loadRecords();
  loadCommunityRecipes();
})();
