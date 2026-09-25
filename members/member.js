(() => {
  const config = globalThis.SV_SUPABASE_CONFIG;
  const client = globalThis.supabase && config?.url && config?.publishableKey
    ? globalThis.supabase.createClient(config.url, config.publishableKey)
    : null;
  const appearanceKey = 'spearfishing-victoria-clubhouse-v1';

  function icons() {
    if (globalThis.lucide) globalThis.lucide.createIcons({ attrs: { width: 17, height: 17 } });
  }

  function readAppearance() {
    try { return JSON.parse(localStorage.getItem(appearanceKey) || '{}'); } catch { return {}; }
  }

  function setAppearance(dark) {
    document.documentElement.classList.toggle('dark-mode', dark);
    const toggle = document.querySelector('[data-theme-toggle]');
    toggle.innerHTML = `<i data-lucide="${dark ? 'sun' : 'moon'}"></i>`;
    toggle.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    icons();
  }

  function publicImage(path) {
    return path && client ? client.storage.from('community-images').getPublicUrl(path).data.publicUrl : '';
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat('en-AU', { month: 'long', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
  }

  function contributionCard(item, recipe = false) {
    const link = document.createElement('a');
    link.className = 'contribution-card';
    link.href = `/species/${encodeURIComponent(item.species_slug)}/${recipe ? '#recipes' : '#records'}`;
    const image = document.createElement('img');
    image.src = publicImage(item.public_photo_path || item.public_photo_paths?.[0]);
    image.alt = recipe ? item.title : `${item.species_name} catch`;
    const body = document.createElement('span');
    body.className = 'card-body';
    const kicker = document.createElement('small');
    kicker.textContent = recipe ? item.species_name : `${item.species_name} · ${Number(item.length_cm).toFixed(1)} cm`;
    const title = document.createElement('strong');
    title.textContent = recipe ? item.title : item.story;
    const date = document.createElement('span');
    date.textContent = formatDate(item.published_on);
    body.append(kicker, title, date);
    link.append(image, body);
    return link;
  }

  function showPrivate() {
    document.querySelector('[data-loading]').hidden = true;
    document.querySelector('[data-private]').hidden = false;
    icons();
  }

  async function render(profile) {
    document.title = `${profile.display_name} | Spearfishing Victoria`;
    document.querySelector('[data-loading]').hidden = true;
    document.querySelector('[data-profile]').hidden = false;
    document.querySelector('[data-member-name]').textContent = profile.display_name;
    document.querySelector('[data-member-since]').textContent = `Community member since ${formatDate(profile.joined_on)}`;
    document.querySelector('[data-stat-points]').textContent = profile.year_points;
    document.querySelector('[data-stat-species]').textContent = profile.species_count;
    document.querySelector('[data-stat-catches]').textContent = profile.catch_count;
    document.querySelector('[data-stat-recipes]').textContent = profile.recipe_count;
    const { data: avatarPath } = await client.rpc('get_public_member_avatar', { target_member_id: profile.member_id });
    if (avatarPath) {
      const { data: signed } = await client.storage.from('profile-images').createSignedUrl(avatarPath, 3600);
      if (signed?.signedUrl) {
        const photo = document.querySelector('[data-member-avatar-photo]');
        photo.src = signed.signedUrl;
        photo.hidden = false;
        document.querySelector('[data-member-avatar-icon]').hidden = true;
      }
    }
    const instagram = document.querySelector('[data-member-instagram]');
    instagram.hidden = !profile.instagram_handle;
    if (profile.instagram_handle) {
      instagram.href = `https://www.instagram.com/${encodeURIComponent(profile.instagram_handle)}/`;
      instagram.querySelector('span').textContent = `@${profile.instagram_handle}`;
    }
    const catches = profile.catches || [];
    document.querySelector('[data-catches]').replaceChildren(...catches.map(item => contributionCard(item)));
    document.querySelector('[data-catches-empty]').hidden = catches.length > 0;
    const recipes = profile.recipes || [];
    document.querySelector('[data-recipes]').replaceChildren(...recipes.map(item => contributionCard(item, true)));
    document.querySelector('[data-recipes-empty]').hidden = recipes.length > 0;
    icons();
  }

  async function loadProfile() {
    const memberId = new URLSearchParams(location.search).get('id');
    const pathParts = location.pathname.split('/').filter(Boolean);
    const username = !memberId && pathParts.length === 1 && pathParts[0].toLowerCase() !== 'members' ? pathParts[0] : null;
    if (!client || (!memberId && !username)) { showPrivate(); return; }
    const { data, error } = username
      ? await client.rpc('get_public_member_profile_by_username', { target_username: username })
      : await client.rpc('get_public_member_profile', { target_member_id: memberId });
    if (error || !data) { showPrivate(); return; }
    await render(data);
  }

  setAppearance(readAppearance().appearance === 'dark');
  document.querySelector('[data-theme-toggle]').addEventListener('click', () => {
    const dark = !document.documentElement.classList.contains('dark-mode');
    const settings = readAppearance();
    settings.appearance = dark ? 'dark' : 'light';
    localStorage.setItem(appearanceKey, JSON.stringify(settings));
    setAppearance(dark);
  });
  loadProfile();
})();
