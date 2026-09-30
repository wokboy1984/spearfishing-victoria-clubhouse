(() => {
  const config = globalThis.SV_SUPABASE_CONFIG;
  const client = globalThis.supabase && config?.url && config?.publishableKey ? globalThis.supabase.createClient(config.url, config.publishableKey) : null;
  const speciesData = globalThis.SV_SPECIES || {};
  const appearanceKey = 'spearfishing-victoria-clubhouse-v1';
  const $ = selector => document.querySelector(selector);
  const icons = () => globalThis.lucide?.createIcons({ attrs: { width: 16, height: 16 } });
  const publicImage = path => client.storage.from('community-images').getPublicUrl(path).data.publicUrl;
  const profileUrl = username => username ? `../${encodeURIComponent(username.toLowerCase())}/` : '../members/';

  function daysLeftInMelbourneMonth(date = new Date()) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-AU', {
      timeZone: 'Australia/Melbourne', year: 'numeric', month: 'numeric', day: 'numeric'
    }).formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
    const today = Date.UTC(parts.year, parts.month - 1, parts.day);
    const nextMonth = Date.UTC(parts.year, parts.month, 1);
    return Math.max(0, Math.ceil((nextMonth - today) / 86400000));
  }

  function appearance() { try { return JSON.parse(localStorage.getItem(appearanceKey) || '{}'); } catch { return {}; } }
  function setAppearance(dark) { document.documentElement.classList.toggle('dark-mode', dark); $('[data-theme-toggle]').innerHTML = `<i data-lucide="${dark ? 'sun' : 'moon'}"></i>`; icons(); }
  function showError() { $('[data-loading]').hidden = true; $('[data-page]').hidden = false; $('[data-error]').hidden = true; $('[data-species-image]').src = '../assets/sv-victorian-coast-hero.png'; $('[data-species-image]').alt = 'A Victorian spearo entering cold coastal water'; icons(); }

  const submissionOverlay = $('[data-challenge-submission]');
  const submissionFrame = $('[data-submission-frame]');
  document.querySelectorAll('[data-open-challenge-submission]').forEach(button => button.addEventListener('click', () => {
    const frameDocument = submissionFrame.contentDocument;
    const formDialog = frameDocument?.querySelector('#catch-submission');
    const memberDialog = frameDocument?.querySelector('#member-dialog');
    if (!formDialog?.open && !memberDialog?.open) {
      const signedOut = frameDocument?.querySelector('[data-auth-label]')?.textContent.trim() === 'Member sign in';
      frameDocument?.querySelector(signedOut ? '[data-auth-trigger]' : '[data-open-submission]')?.click();
      submissionOverlay.classList.toggle('is-auth', signedOut);
    }
    if (!submissionOverlay.open) submissionOverlay.showModal();
  }));
  $('[data-close-challenge-submission]').addEventListener('click', () => submissionOverlay.close());
  submissionOverlay.addEventListener('click', event => { if (event.target === submissionOverlay) submissionOverlay.close(); });
  submissionFrame.addEventListener('load', () => {
    const frameDocument = submissionFrame.contentDocument;
    const style = frameDocument?.createElement('style');
    if (!style) return;
    style.textContent = '#sv-facebook-clubhouse .site > :not(dialog):not(.action-toast){display:none!important} #sv-facebook-clubhouse .site{min-height:0!important;background:transparent!important} body{background:transparent!important} #catch-submission,#member-dialog{width:100%!important;max-width:none!important;height:100%!important;max-height:none!important;margin:0!important;border-radius:16px!important;color-scheme:light!important} #catch-submission::backdrop,#member-dialog::backdrop{background:transparent!important}';
    frameDocument.head.append(style);
    const closeOuter = () => { if (submissionOverlay.open) submissionOverlay.close(); };
    frameDocument.querySelectorAll('#catch-submission,#member-dialog').forEach(dialog => dialog.addEventListener('close', closeOuter));
    frameDocument.querySelectorAll('[data-close-submission],[data-close-auth]').forEach(button => button.addEventListener('click', closeOuter));
    let attempts = 0;
    const revealForm = setInterval(() => {
      const formDialog = frameDocument.querySelector('#catch-submission');
      const memberDialog = frameDocument.querySelector('#member-dialog');
      if (memberDialog?.open) { submissionOverlay.classList.add('is-auth'); clearInterval(revealForm); return; }
      if (formDialog?.open) { submissionOverlay.classList.remove('is-auth'); clearInterval(revealForm); return; }
      if (attempts > 15) {
        const signedOut = frameDocument.querySelector('[data-auth-label]')?.textContent.trim() === 'Member sign in';
        frameDocument.querySelector(signedOut ? '[data-auth-trigger]' : '[data-open-submission]')?.click();
      }
      if (formDialog?.open || attempts++ > 45) clearInterval(revealForm);
    }, 100);
  });
  submissionOverlay.addEventListener('close', () => {
    const frameDocument = submissionFrame.contentDocument;
    frameDocument?.querySelectorAll('#catch-submission[open],#member-dialog[open]').forEach(dialog => dialog.close());
  });
  submissionFrame.src = '../index.html?submit=catch&embedded=challenge&overlay=light-2';

  async function load() {
    if (!client) { showError(); return; }
    const today = new Date().toISOString().slice(0, 10);
    const { data: challenge, error } = await client.from('challenges').select('id,title,description,starts_on,ends_on,species:species_id(slug,common_name)').lte('starts_on', today).gte('ends_on', today).order('starts_on', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    let leaders = [];
    let catches = [];
    let species = challenge?.species || null;
    if (challenge && species) {
      const details = speciesData[species.slug];
      const start = new Date(`${challenge.starts_on}T12:00:00`);
      const end = new Date(`${challenge.ends_on}T23:59:59`);
      const days = daysLeftInMelbourneMonth();
      $('[data-title]').textContent = `${start.toLocaleString('en-AU', { month: 'long' })} ${species.common_name} Challenge`;
      $('[data-description]').textContent = challenge.description || 'Enter your best verified catch. Only your largest approved fish counts.';
      $('[data-dates]').textContent = `${start.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`;
      $('[data-days]').textContent = `${days} day${days === 1 ? '' : 's'} left`;
      $('[data-pulse-days]').textContent = days;
      $('[data-species-image]').src = `../assets/${details?.image || 'sv-snapper.webp'}`;
      $('[data-species-image]').alt = details?.imageAlt || species.common_name;
      const [leaderResult, catchResult] = await Promise.all([
        client.rpc('get_challenge_catch_leaderboard', { target_challenge_id: challenge.id }),
        client.rpc('get_species_catches', { target_species_slug: species.slug, target_period: 'month', result_limit: 12 })
      ]);
      leaders = leaderResult.data || [];
      catches = catchResult.data || [];
    } else {
      $('[data-title]').textContent = 'The Monthly Challenge';
      $('[data-description]').textContent = 'A new featured species each month, with verified catches, friendly scoring and a community leaderboard.';
      $('[data-pulse-days]').textContent = '—';
      $('[data-species-image]').src = '../assets/sv-victorian-coast-hero.png';
      $('[data-species-image]').alt = 'A Victorian spearo in cold coastal water at sunrise';
      const [{ data: allLeaders }, { data: showcase }] = await Promise.all([
        client.rpc('get_challenge_catch_leaderboard', { target_challenge_id: null }),
        client.rpc('get_homepage_showcase', { target_limit: 12 })
      ]);
      leaders = allLeaders || [];
      catches = showcase || [];
      if (!leaders.length && catches.length) {
        const bestByMember = new Map();
        catches.forEach(row => {
          const key = row.display_name || row.submission_id;
          const existing = bestByMember.get(key);
          if (!existing || Number(row.length_cm) > Number(existing.length_cm)) bestByMember.set(key, row);
        });
        leaders = [...bestByMember.values()].sort((a, b) => Number(b.length_cm) - Number(a.length_cm)).map((row, index) => ({ rank: index + 1, username: null, display_name: row.display_name, best_length_cm: row.length_cm, placement_bonus: Math.max(0, 10 - index), points: 15 + Math.max(0, 10 - index) }));
      }
    }
    const ranked = leaders.slice(0, 10);
    $('[data-member-count]').textContent = ranked.length;
    $('[data-leading-length]').textContent = ranked.length ? `${Number(ranked[0].best_length_cm).toFixed(1)} cm` : '—';
    $('[data-catch-count]').textContent = catches?.length || 0;
    $('[data-podium]').innerHTML = ranked.slice(0, 3).map((row, index) => `<a class="podium-place ${['first', 'second', 'third'][index]}" href="${profileUrl(row.username)}"><span class="podium-rank">${row.rank}</span><strong>${row.display_name || 'Community member'}</strong><span>${Number(row.best_length_cm).toFixed(1)} cm</span><b>${row.points} pts</b></a>`).join('');
    $('[data-leaders]').innerHTML = ranked.map(row => `<div class="leader-row"><span class="rank">${row.rank}</span><span><strong><a href="${profileUrl(row.username)}">${row.display_name || 'Community member'}</a></strong><span>${Number(row.best_length_cm).toFixed(1)} cm · 15 entry + ${row.placement_bonus} bonus</span></span><strong>${row.points} pts</strong></div>`).join('') || '<div class="empty">Standings begin with the first approved catch.</div>';
    $('[data-catches]').innerHTML = catches.map(row => { const slug = row.species_slug || species?.slug || 'snapper'; const speciesName = row.species_name || species?.common_name || 'Featured catch'; const length = Number(row.best_length_cm ?? row.length_cm); return `<a class="catch-card" href="../species/${encodeURIComponent(slug)}/index.html#records"><img src="${publicImage(row.public_photo_path)}" alt="${speciesName} catch by ${row.display_name || 'a community member'}"><span class="catch-copy"><strong>${row.display_name || 'Community member'}</strong><span>${Number.isFinite(length) ? `${length.toFixed(1)} cm` : speciesName}${row.rank ? ` · #${row.rank}` : ''}</span></span></a>`; }).join('');
    $('[data-catches-empty]').hidden = Boolean(catches?.length);
    $('[data-loading]').hidden = true;
    $('[data-page]').hidden = false;
    icons();
  }

  setAppearance(appearance().appearance === 'dark');
  $('[data-theme-toggle]').addEventListener('click', () => { const settings = appearance(); settings.appearance = document.documentElement.classList.contains('dark-mode') ? 'light' : 'dark'; localStorage.setItem(appearanceKey, JSON.stringify(settings)); setAppearance(settings.appearance === 'dark'); });
  load().catch(showError);
})();
