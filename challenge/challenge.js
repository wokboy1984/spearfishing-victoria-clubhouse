(() => {
  const config = globalThis.SV_SUPABASE_CONFIG;
  const client = globalThis.supabase && config?.url && config?.publishableKey ? globalThis.supabase.createClient(config.url, config.publishableKey) : null;
  const speciesData = globalThis.SV_SPECIES || {};
  const appearanceKey = 'spearfishing-victoria-clubhouse-v1';
  const $ = selector => document.querySelector(selector);
  const icons = () => globalThis.lucide?.createIcons({ attrs: { width: 16, height: 16 } });
  const publicImage = path => client.storage.from('community-images').getPublicUrl(path).data.publicUrl;
  const profileUrl = username => `../${encodeURIComponent(username.toLowerCase())}/`;

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
  function showError() { $('[data-loading]').hidden = true; $('[data-page]').hidden = true; $('[data-error]').hidden = false; icons(); }

  async function load() {
    if (!client) { showError(); return; }
    const today = new Date().toISOString().slice(0, 10);
    const { data: challenge, error } = await client.from('challenges').select('id,title,description,starts_on,ends_on,species:species_id(slug,common_name)').lte('starts_on', today).gte('ends_on', today).order('starts_on', { ascending: false }).limit(1).maybeSingle();
    if (error || !challenge) { showError(); return; }
    const species = challenge.species;
    const details = speciesData[species.slug];
    const start = new Date(`${challenge.starts_on}T12:00:00`);
    const end = new Date(`${challenge.ends_on}T23:59:59`);
    const days = daysLeftInMelbourneMonth();
    $('[data-title]').textContent = `${start.toLocaleString('en-AU', { month: 'long' })} ${species.common_name}`;
    $('[data-description]').textContent = challenge.description || 'Enter your best verified catch. Only your largest approved fish counts.';
    $('[data-dates]').textContent = `${start.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`;
    $('[data-days]').textContent = `${days} day${days === 1 ? '' : 's'} left`;
    $('[data-pulse-days]').textContent = days;
    $('[data-species-link]').href = `../species/${encodeURIComponent(species.slug)}/`;
    $('[data-species-image]').src = `../assets/${details?.image || 'sv-snapper.webp'}`;
    $('[data-species-image]').alt = details?.imageAlt || species.common_name;

    const [{ data: leaders }, { data: catches }, { data: ballots }] = await Promise.all([
      client.rpc('get_challenge_catch_leaderboard', { target_challenge_id: challenge.id }),
      client.rpc('get_species_catches', { target_species_slug: species.slug, target_period: 'month', result_limit: 12 }),
      client.from('ballots').select('id,title,closes_at').lte('opens_at', new Date().toISOString()).gte('closes_at', new Date().toISOString()).limit(1)
    ]);
    const ranked = (leaders || []).slice(0, 10);
    $('[data-member-count]').textContent = ranked.length;
    $('[data-leading-length]').textContent = ranked.length ? `${Number(ranked[0].best_length_cm).toFixed(1)} cm` : '—';
    $('[data-catch-count]').textContent = catches?.length || 0;
    $('[data-podium]').innerHTML = ranked.slice(0, 3).map((row, index) => `<a class="podium-place ${['first', 'second', 'third'][index]}" href="${profileUrl(row.username)}"><span class="podium-rank">${row.rank}</span><strong>${row.display_name || 'Community member'}</strong><span>${Number(row.best_length_cm).toFixed(1)} cm</span><b>${row.points} pts</b></a>`).join('');
    $('[data-leaders]').innerHTML = ranked.map(row => `<div class="leader-row"><span class="rank">${row.rank}</span><span><strong><a href="${profileUrl(row.username)}">${row.display_name || 'Community member'}</a></strong><span>${Number(row.best_length_cm).toFixed(1)} cm · 15 entry + ${row.placement_bonus} bonus</span></span><strong>${row.points} pts</strong></div>`).join('') || '<div class="empty">Standings begin with the first approved catch.</div>';
    $('[data-catches]').innerHTML = (catches || []).map(row => `<a class="catch-card" href="../species/${encodeURIComponent(species.slug)}/#records"><img src="${publicImage(row.public_photo_path)}" alt="${species.common_name} catch by ${row.display_name || 'a community member'}"><span class="catch-copy"><strong>${row.display_name || 'Community member'}</strong><span>${Number(row.best_length_cm).toFixed(1)} cm · #${row.rank}</span></span></a>`).join('');
    $('[data-catches-empty]').hidden = Boolean(catches?.length);

    const ballot = ballots?.[0];
    if (ballot) {
      $('[data-vote-title]').textContent = ballot.title;
      const { data: totals } = await client.rpc('get_species_vote_totals', { target_ballot_id: ballot.id });
      const total = (totals || []).reduce((sum, item) => sum + item.votes, 0);
      $('[data-vote-options]').innerHTML = (totals || []).map(item => { const percent = total ? Math.round(item.votes / total * 100) : 0; return `<div class="vote-option"><span class="vote-top"><span>${item.common_name}</span><strong>${percent}%</strong></span><span class="vote-track"><span class="vote-fill" style="width:${percent}%"></span></span></div>`; }).join('') || '<div class="empty">No votes yet.</div>';
    } else {
      $('[data-vote-options]').innerHTML = '<div class="empty">The next vote has not opened yet.</div>';
    }
    $('[data-loading]').hidden = true;
    $('[data-page]').hidden = false;
    icons();
  }

  setAppearance(appearance().appearance === 'dark');
  $('[data-theme-toggle]').addEventListener('click', () => { const settings = appearance(); settings.appearance = document.documentElement.classList.contains('dark-mode') ? 'light' : 'dark'; localStorage.setItem(appearanceKey, JSON.stringify(settings)); setAppearance(settings.appearance === 'dark'); });
  load().catch(showError);
})();
