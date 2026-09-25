(() => {
  const config = globalThis.SV_SUPABASE_CONFIG;
  const client = config?.url && config?.publishableKey && globalThis.supabase
    ? globalThis.supabase.createClient(config.url, config.publishableKey)
    : null;
  const state = {
    session: null,
    profile: null,
    submissions: [],
    filter: 'pending',
    search: '',
    selectedId: null,
    signedUrls: new Map(),
    speciesMinimums: new Map(),
    featureSettings: new Map(),
    programs: { species: [], challenges: [], ballots: [] },
    selectedProgramId: null,
    pendingDecision: null,
    dark: localStorage.getItem('spearfishing-victoria-theme') === 'dark',
    lightboxPhotos: [],
    lightboxIndex: 0,
    lightboxScale: 1,
    lightboxX: 0,
    lightboxY: 0,
    lightboxPointers: new Map(),
    lightboxPinchDistance: 0
  };

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const app = $('[data-moderation-app]');
  const signedOut = $('[data-signed-out]');
  const noAccess = $('[data-no-access]');
  const decisionDialog = $('[data-confirm-dialog]');

  function icons() {
    if (globalThis.lucide) globalThis.lucide.createIcons({ attrs: { width: 16, height: 16 } });
  }

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[character]);
  }

  function formatDate(value, includeTime = false) {
    if (!value) return 'Not recorded';
    return new Intl.DateTimeFormat('en-AU', includeTime
      ? { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }
      : { day: 'numeric', month: 'short', year: 'numeric' }
    ).format(new Date(value));
  }

  function renderTheme() {
    document.documentElement.classList.toggle('dark-mode', state.dark);
    localStorage.setItem('spearfishing-victoria-theme', state.dark ? 'dark' : 'light');
    const button = $('[data-theme-toggle]');
    button.innerHTML = `<i data-lucide="${state.dark ? 'sun' : 'moon'}" aria-hidden="true"></i>`;
    button.setAttribute('aria-label', state.dark ? 'Switch to light mode' : 'Switch to dark mode');
    icons();
  }

  function showGate(mode) {
    signedOut.hidden = mode !== 'signed-out';
    noAccess.hidden = mode !== 'no-access';
    app.hidden = mode !== 'app';
  }

  async function sendMagicLink(event) {
    event.preventDefault();
    const status = $('[data-auth-status]');
    const button = event.currentTarget.querySelector('button');
    const email = new FormData(event.currentTarget).get('email')?.trim();
    if (!client) {
      status.textContent = 'Supabase is not configured for this local build.';
      return;
    }
    button.disabled = true;
    status.textContent = 'Sending your secure sign-in link...';
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/admin/` }
    });
    button.disabled = false;
    status.textContent = error
      ? (error.status === 429 || /rate|limit/i.test(error.message) ? 'Email limit reached. Supabase allows two sign-in emails per hour on the built-in service. Use the latest unused link in your inbox or try again later.' : error.message)
      : 'Sign-in email sent. Check your inbox; the link will return you to moderation.';
  }

  async function signInWithProvider(event) {
    const button = event.currentTarget;
    const provider = button.dataset.oauthProvider;
    const status = $('[data-auth-status]');
    if (!client) {
      status.textContent = 'Supabase is not configured for this local build.';
      return;
    }
    button.disabled = true;
    status.textContent = `Opening ${provider === 'google' ? 'Google' : 'Facebook'} sign-in...`;
    const { error } = await client.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${location.origin}/admin/`,
        ...(provider === 'facebook' ? { scopes: 'email,public_profile' } : {})
      }
    });
    if (error) {
      button.disabled = false;
      status.textContent = `${provider === 'google' ? 'Google' : 'Facebook'} sign-in is not available yet. Enable this provider in Supabase, then try again.`;
    }
  }

  async function loadProfile() {
    const { data, error } = await client.from('profiles')
      .select('id,username,display_name,role')
      .eq('id', state.session.user.id)
      .single();
    if (error) throw error;
    state.profile = data;
    return ['moderator', 'admin'].includes(data.role);
  }

  function renderStaff() {
    const name = state.profile.display_name || state.profile.username;
    $('[data-staff-name]').textContent = name;
    $('[data-staff-role]').textContent = state.profile.role;
    $('[data-staff-initials]').textContent = name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
  }

  async function loadSubmissions() {
    const [{ data, error }, { data: recipeRows, error: recipeError }, { data: featureRows, error: featureError }, { data: speciesRows, error: speciesError }] = await Promise.all([
      client.rpc('get_moderation_submissions'),
      client.rpc('get_recipe_moderation_submissions'),
      client.rpc('get_catch_feature_settings'),
      client.from('species').select('slug,minimum_legal_length_cm')
    ]);
    if (error) throw error;
    if (recipeError) throw recipeError;
    if (featureError) throw featureError;
    if (speciesError) throw speciesError;
    const normalisePhotos = row => {
      if (Array.isArray(row.photos)) return row.photos;
      try { return JSON.parse(row.photos || '[]'); } catch { return []; }
    };
    const normaliseRecipe = row => {
      if (row.recipe && typeof row.recipe === 'object') return row.recipe;
      try { return JSON.parse(row.recipe || '{}'); } catch { return {}; }
    };
    state.submissions = [
      ...(data || []).map(row => ({ ...row, photos: normalisePhotos(row) })),
      ...(recipeRows || []).map(row => ({ ...row, photos: normalisePhotos(row), recipe: normaliseRecipe(row), submission_kind: 'recipe', length_cm: null, caught_in_victoria: null, caught_within_last_week: null, rules_accepted_at: true, length_verified: false }))
    ];
    state.featureSettings = new Map((featureRows || []).map(row => [row.submission_id, row]));
    state.speciesMinimums = new Map((speciesRows || []).map(row => [row.slug, row.minimum_legal_length_cm == null ? null : Number(row.minimum_legal_length_cm)]));
    renderStats();
    renderQueue();
  }

  function localDateTime(value) {
    if (!value) return '';
    const date = new Date(value);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  function newProgramDefaults() {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 2, 0);
    const iso = date => date.toISOString().slice(0, 10);
    return { id: '', species_id: state.programs.species[0]?.id || '', title: `${first.toLocaleString('en-AU', { month: 'long', year: 'numeric' })} Challenge`, description: 'Enter your best verified catch. Only your largest approved fish counts.', starts_on: iso(first), ends_on: iso(last), status: 'draft' };
  }

  function monthValue(date) {
    const value = new Date(String(date).includes('T') ? date : `${date}T12:00:00`);
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;
  }

  function monthSchedule(value) {
    const [year, month] = value.split('-').map(Number);
    const first = new Date(year, month - 1, 1);
    const last = new Date(year, month, 0);
    const next = new Date(year, month, 1);
    const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const now = new Date();
    const stateLabel = now < first ? 'upcoming' : now > new Date(year, month, 0, 23, 59, 59) ? 'finished' : 'live';
    return {
      first, last, next, startsOn: iso(first), endsOn: iso(last),
      opensAt: new Date(year, month - 1, 1, 0, 0), closesAt: new Date(year, month, 1, 0, 0),
      challengeStatus: stateLabel === 'live' ? 'active' : stateLabel === 'finished' ? 'closed' : 'draft',
      ballotStatus: stateLabel === 'live' ? 'open' : stateLabel === 'finished' ? 'closed' : 'draft', stateLabel
    };
  }

  function renderMonthOptions() {
    const select = $('[data-program-month]');
    const now = new Date();
    const values = new Set(state.programs.challenges.map(challenge => monthValue(challenge.starts_on)));
    for (let offset = -2; offset <= 24; offset += 1) {
      const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      values.add(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
    }
    select.innerHTML = [...values].sort().map(value => {
      const schedule = monthSchedule(value);
      return `<option value="${value}">${schedule.first.toLocaleString('en-AU', { month: 'long', year: 'numeric' })}</option>`;
    }).join('');
  }

  function updateAutomaticSchedule(updateTitles = false) {
    const form = $('[data-program-form]');
    const schedule = monthSchedule(form.elements.program_month.value);
    const monthLabel = schedule.first.toLocaleString('en-AU', { month: 'long', year: 'numeric' });
    const nextLabel = schedule.next.toLocaleString('en-AU', { month: 'long', year: 'numeric' });
    if (updateTitles) {
      form.elements.challenge_title.value = `${monthLabel} ${form.elements.species_id.selectedOptions[0]?.textContent || ''} Monthly Catch`;
      form.elements.ballot_title.value = `${nextLabel} Species of the Month`;
    }
    $('[data-program-state]').textContent = schedule.stateLabel;
    $('[data-program-state]').className = `status-pill ${schedule.stateLabel === 'live' ? 'approved' : ''}`;
    $('[data-schedule-copy]').textContent = `${monthLabel} runs automatically from 1 ${schedule.first.toLocaleString('en-AU', { month: 'short' })} to ${schedule.last.getDate()} ${schedule.last.toLocaleString('en-AU', { month: 'short' })}. Voting for ${nextLabel} follows the same window.`;
    return schedule;
  }

  function renderProgramList() {
    const list = $('[data-program-list]');
    list.innerHTML = state.programs.challenges.map(challenge => {
      const species = state.programs.species.find(item => item.id === challenge.species_id);
      const schedule = monthSchedule(monthValue(challenge.starts_on));
      return `<button class="program-item" type="button" data-program-id="${challenge.id}" aria-current="${challenge.id === state.selectedProgramId}"><span><strong>${escapeHtml(challenge.title)}</strong><span>${escapeHtml(species?.name || 'Species')} · ${schedule.first.toLocaleString('en-AU', { month: 'long', year: 'numeric' })}</span></span><span class="status-pill ${schedule.stateLabel === 'live' ? 'approved' : ''}">${schedule.stateLabel}</span></button>`;
    }).join('') || '<div class="queue-empty">No monthly programs yet.</div>';
    $$('[data-program-id]').forEach(button => button.addEventListener('click', () => selectProgram(button.dataset.programId)));
  }

  function selectProgram(id = null) {
    state.selectedProgramId = id;
    const challenge = id ? state.programs.challenges.find(item => item.id === id) : newProgramDefaults();
    const ballot = id ? state.programs.ballots.find(item => monthValue(item.opens_at) === monthValue(challenge.starts_on)) : null;
    const form = $('[data-program-form]');
    form.elements.challenge_id.value = challenge?.id || '';
    form.elements.program_month.value = monthValue(challenge.starts_on);
    form.elements.species_id.value = challenge?.species_id || '';
    form.elements.challenge_title.value = challenge?.title || '';
    form.elements.description.value = challenge?.description || '';
    form.elements.ballot_id.value = ballot?.id || '';
    form.elements.ballot_title.value = ballot?.title || `Vote for ${new Date(`${challenge.starts_on}T12:00:00`).toLocaleString('en-AU', { month: 'long', year: 'numeric' })} Species of the Month`;
    const chosen = new Set(ballot?.species_ids || []);
    $$('[data-candidate-grid] input').forEach(input => { input.checked = chosen.has(input.value); });
    $('[data-program-form-title]').textContent = id ? 'Edit monthly competition' : 'Create monthly competition';
    updateAutomaticSchedule(!id);
    $('[data-program-status]').textContent = '';
    renderProgramList();
  }

  async function loadPrograms() {
    const { data, error } = await client.rpc('get_staff_programs');
    if (error) throw error;
    state.programs = data;
    renderMonthOptions();
    $('[data-program-species]').innerHTML = data.species.map(species => `<option value="${species.id}">${escapeHtml(species.name)}</option>`).join('');
    $('[data-candidate-grid]').innerHTML = data.species.map(species => `<label><input type="checkbox" name="candidate" value="${species.id}"><span>${escapeHtml(species.name)}</span></label>`).join('');
    selectProgram(data.challenges.find(challenge => monthSchedule(monthValue(challenge.starts_on)).stateLabel === 'live')?.id || data.challenges[0]?.id || null);
  }

  async function saveProgram(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const status = $('[data-program-status]');
    const candidates = [...form.querySelectorAll('input[name="candidate"]:checked')].map(input => input.value);
    if (candidates.length < 2) { status.textContent = 'Choose at least two voting candidates.'; return; }
    button.disabled = true;
    status.textContent = 'Saving monthly program...';
    const value = name => form.elements[name].value;
    const schedule = updateAutomaticSchedule(false);
    const { error } = await client.rpc('save_monthly_program', {
      target_challenge_id: value('challenge_id') || null, target_species_id: value('species_id'), target_challenge_title: value('challenge_title'), target_description: value('description'), target_starts_on: schedule.startsOn, target_ends_on: schedule.endsOn, target_challenge_status: schedule.challengeStatus, target_ballot_id: value('ballot_id') || null, target_ballot_title: value('ballot_title'), target_opens_at: schedule.opensAt.toISOString(), target_closes_at: schedule.closesAt.toISOString(), target_ballot_status: schedule.ballotStatus, target_ballot_species_ids: candidates
    });
    button.disabled = false;
    if (error) { status.textContent = error.message; return; }
    status.textContent = 'Monthly program saved and the homepage is ready to update.';
    await loadPrograms();
  }

  function setWorkspace(workspace) {
    const program = workspace === 'program';
    $('[data-moderation-workspace]').hidden = program;
    $('[data-program-workspace]').hidden = !program;
    $$('[data-workspace]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.workspace === workspace)));
    $('[data-workspace-title]').textContent = program ? 'Competition manager' : 'Community moderation';
    $('[data-workspace-copy]').textContent = program ? 'Run the Species of the Month challenge and community vote without editing the website.' : 'Review catches and recipes, protect private evidence and publish only submissions that meet the community rules.';
  }

  function renderStats() {
    const counts = state.submissions.reduce((result, submission) => {
      result[submission.submission_status] += 1;
      return result;
    }, { pending: 0, approved: 0, rejected: 0 });
    $('[data-count="pending"]').textContent = counts.pending;
    $('[data-count="approved"]').textContent = counts.approved;
    $('[data-count="rejected"]').textContent = counts.rejected;
    $('[data-count="reviewed"]').textContent = counts.approved + counts.rejected;
  }

  function filteredSubmissions() {
    const needle = state.search.toLowerCase();
    return state.submissions.filter(submission => {
      if (submission.submission_status !== state.filter) return false;
      return !needle || [submission.display_name, submission.username, submission.species_name]
        .some(value => value?.toLowerCase().includes(needle));
    });
  }

  function renderQueue() {
    const list = $('[data-queue-list]');
    const rows = filteredSubmissions();
    if (!rows.length) {
      const label = state.filter === 'pending' ? 'No catches are waiting for review.' : `No ${state.filter} catches match this view.`;
      list.innerHTML = `<div class="queue-empty">${escapeHtml(label)}</div>`;
      clearReview();
      return;
    }
    list.innerHTML = rows.map(submission => {
      const photo = submission.photos?.find(item => item.kind === 'hero');
      const thumb = state.signedUrls.get(photo?.storage_path);
      return `<button class="queue-item" type="button" data-submission-id="${submission.submission_id}" aria-current="${submission.submission_id === state.selectedId}">
        <span class="queue-thumb">${thumb ? `<img src="${escapeHtml(thumb)}" alt="">` : '<i data-lucide="fish" aria-hidden="true"></i>'}</span>
        <span class="queue-copy"><strong>${escapeHtml(submission.submission_kind === 'recipe' ? submission.title : (submission.species_name || 'Unknown species'))}</strong><span>${escapeHtml(submission.display_name || submission.username)} · ${escapeHtml(submission.submission_kind)} · ${escapeHtml(formatDate(submission.submitted_at))}</span></span>
        <span class="queue-length">${submission.submission_kind === 'recipe' ? 'Recipe' : `${Number(submission.length_cm).toFixed(1)} cm`}</span>
      </button>`;
    }).join('');
    list.querySelectorAll('[data-submission-id]').forEach(button => button.addEventListener('click', () => selectSubmission(button.dataset.submissionId)));
    icons();
    if (!rows.some(item => item.submission_id === state.selectedId)) selectSubmission(rows[0].submission_id);
  }

  function clearReview() {
    state.selectedId = null;
    $('[data-review-content]').hidden = true;
    $('[data-review-empty]').hidden = false;
  }

  async function signedUrl(path) {
    if (!path) return null;
    if (state.signedUrls.has(path)) return state.signedUrls.get(path);
    const { data, error } = await client.storage.from('submission-photos').createSignedUrl(path, 600);
    if (error) return null;
    state.signedUrls.set(path, data.signedUrl);
    return data.signedUrl;
  }

  function belowLegalMinimum(submission) {
    const minimum = state.speciesMinimums.get(submission.species_slug);
    return Number.isFinite(minimum) && Number(submission.length_cm) < minimum;
  }

  function applyLightboxTransform() {
    const image = $('[data-lightbox-image]');
    image.style.transform = `translate(${state.lightboxX}px, ${state.lightboxY}px) scale(${state.lightboxScale})`;
  }

  function resetLightboxTransform() {
    state.lightboxScale = 1;
    state.lightboxX = 0;
    state.lightboxY = 0;
    state.lightboxPointers.clear();
    state.lightboxPinchDistance = 0;
    applyLightboxTransform();
  }

  function renderLightboxPhoto() {
    const photo = state.lightboxPhotos[state.lightboxIndex];
    if (!photo) return;
    const image = $('[data-lightbox-image]');
    image.src = photo.url;
    image.alt = photo.alt;
    $('[data-lightbox-count]').textContent = `${state.lightboxIndex + 1} / ${state.lightboxPhotos.length}`;
    $('[data-lightbox-previous]').hidden = state.lightboxPhotos.length < 2;
    $('[data-lightbox-next]').hidden = state.lightboxPhotos.length < 2;
    resetLightboxTransform();
  }

  function moveLightbox(step) {
    if (!state.lightboxPhotos.length) return;
    state.lightboxIndex = (state.lightboxIndex + step + state.lightboxPhotos.length) % state.lightboxPhotos.length;
    renderLightboxPhoto();
  }

  function openLightbox(photos, index) {
    state.lightboxPhotos = photos;
    state.lightboxIndex = index;
    renderLightboxPhoto();
    $('[data-photo-lightbox]').showModal();
  }

  async function selectSubmission(id) {
    const submission = state.submissions.find(item => item.submission_id === id);
    if (!submission) return;
    state.selectedId = id;
    $$('.queue-item').forEach(item => item.setAttribute('aria-current', String(item.dataset.submissionId === id)));
    $('[data-review-empty]').hidden = true;
    $('[data-review-content]').hidden = false;

    $('[data-detail-status]').textContent = submission.submission_status;
    $('[data-detail-status]').className = `status-pill ${submission.submission_status}`;
    $('[data-detail-date]').textContent = `Submitted ${formatDate(submission.submitted_at, true)}`;
    const isRecipe = submission.submission_kind === 'recipe' || Boolean(submission.recipe);
    $('[data-detail-title]').textContent = isRecipe ? submission.title : (submission.species_name || submission.title);
    $('[data-detail-member]').textContent = submission.display_name || submission.username;
    $('[data-detail-handle]').textContent = submission.instagram_handle ? `@${submission.instagram_handle}` : '';
    $('[data-detail-length]').parentElement.hidden = isRecipe;
    $('[data-detail-length]').textContent = isRecipe ? '' : `${Number(submission.length_cm).toFixed(1)} cm`;
    $('[data-legal-size-badge]').hidden = isRecipe || !belowLegalMinimum(submission);
    $('[data-detail-story]').textContent = submission.story;
    $('[data-detail-story]').previousElementSibling.textContent = isRecipe ? 'Recipe introduction' : 'Catch story';
    $('[data-declaration="victoria"]').classList.toggle('confirmed', Boolean(submission.caught_in_victoria));
    $('[data-declaration="recent"]').classList.toggle('confirmed', Boolean(submission.caught_within_last_week));
    $('[data-declaration="rules"]').classList.toggle('confirmed', Boolean(submission.rules_accepted_at));
    $('.declarations').hidden = isRecipe;
    const recipeDetails = $('[data-recipe-details]');
    recipeDetails.hidden = !isRecipe;
    if (isRecipe) {
      const ingredients = Array.isArray(submission.recipe?.ingredients) ? submission.recipe.ingredients : [];
      const method = Array.isArray(submission.recipe?.method) ? submission.recipe.method : [];
      recipeDetails.innerHTML = `<div class="recipe-review-meta"><span>${submission.recipe?.prep_minutes ?? '—'} min prep</span><span>${submission.recipe?.cook_minutes ?? '—'} min cook</span><span>Serves ${submission.recipe?.serves ?? '—'}</span><span>${escapeHtml(submission.species_name)}</span></div><div><div class="section-label">Ingredients</div><h3>What goes in</h3><ul>${ingredients.map(item => `<li>${escapeHtml(item)}</li>`).join('') || '<li>No ingredients supplied</li>'}</ul></div><div><div class="section-label">Method</div><h3>How it is cooked</h3><ol>${method.map(item => `<li>${escapeHtml(item)}</li>`).join('') || '<li>No method supplied</li>'}</ol></div>`;
    }

    const photoReview = $('[data-photo-review]');
    photoReview.classList.toggle('recipe-photo-review', isRecipe);
    photoReview.classList.toggle('single-photo-review', (submission.photos || []).length === 1);
    const orderedPhotos = [...(submission.photos || [])].sort((a, b) => a.display_order - b.display_order);
    photoReview.innerHTML = orderedPhotos.map(photo => `
      <figure class="photo-frame ${photo.kind === 'extra' ? 'extra' : ''}" data-photo-path="${escapeHtml(photo.storage_path)}">
        <div class="photo-error"><i data-lucide="loader-circle" aria-hidden="true"></i><span>Loading private photo...</span></div>
        <span>${escapeHtml(photo.kind)} photo</span>
      </figure>`).join('');
    icons();

    const lightboxPhotos = (await Promise.all(orderedPhotos.map(async (photo, index) => {
      const url = await signedUrl(photo.storage_path);
      const frame = photoReview.querySelectorAll('.photo-frame')[index];
      if (!frame) return;
      frame.querySelector('.photo-error')?.remove();
      if (url) {
        const image = document.createElement('img');
        image.src = url;
        image.alt = `${photo.kind} evidence for ${submission.species_name}`;
        image.tabIndex = 0;
        image.setAttribute('role', 'button');
        image.setAttribute('aria-label', `Open full-size ${photo.kind} photo`);
        frame.prepend(image);
        return { url, alt: image.alt, image, index };
      } else {
        frame.insertAdjacentHTML('afterbegin', '<div class="photo-error"><i data-lucide="image-off" aria-hidden="true"></i><span>Photo unavailable</span></div>');
      }
      return null;
    }))).filter(Boolean);
    lightboxPhotos.forEach((photo, index) => {
      const open = () => openLightbox(lightboxPhotos, index);
      photo.image.addEventListener('click', open);
      photo.image.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } });
    });

    const pending = submission.submission_status === 'pending';
    $('[data-decision-form]').hidden = !pending;
    $('[data-reviewed-summary]').hidden = pending;
    if (pending) {
      $('[data-decision-form]').reset();
      $('[data-verification-fields]').innerHTML = isRecipe
        ? '<legend>Recipe verification</legend><label><input type="checkbox" name="recipe_photo"> The finished-dish photo is clear and suitable for publication</label><label><input type="checkbox" name="recipe_complete"> The ingredients and method are complete and understandable</label><label><input type="checkbox" name="recipe_species"> The recipe is associated with the correct tracked species</label>'
        : '<legend>Moderator verification</legend><label><input type="checkbox" name="measurement_visible"> The ruler and full fish are clearly visible</label><label><input type="checkbox" name="length_matches"> The claimed length matches the measurement photo</label><label><input type="checkbox" name="species_matches"> The species identification appears correct</label>';
      $('[data-decision-status]').textContent = '';
    } else {
      const outcome = submission.submission_status === 'approved' ? 'Approved' : 'Rejected';
      $('[data-reviewed-copy]').textContent = `${outcome} ${formatDate(submission.reviewed_at, true)}.${submission.moderation_note ? ` Note: ${submission.moderation_note}` : ''}`;
    }
    const featureControls = $('[data-feature-controls]');
    const approved = submission.submission_kind === 'catch' && submission.submission_status === 'approved' && Boolean(submission.public_photo_path);
    featureControls.hidden = !approved;
    if (approved) {
      const feature = state.featureSettings.get(submission.submission_id);
      $('[data-feature-toggle]').checked = Boolean(feature?.homepage_featured);
      $('[data-feature-order]').value = feature?.homepage_feature_order || 1;
      $('[data-feature-order]').disabled = !feature?.homepage_featured;
      $('[data-feature-status]').textContent = '';
    }
    icons();
  }

  async function saveFeatureSetting() {
    const submission = state.submissions.find(item => item.submission_id === state.selectedId);
    if (!submission) return;
    const button = $('[data-save-feature]');
    const status = $('[data-feature-status]');
    const featured = $('[data-feature-toggle]').checked;
    const order = Math.max(1, Number.parseInt($('[data-feature-order]').value, 10) || 1);
    button.disabled = true;
    status.textContent = 'Saving homepage setting...';
    const { error } = await client.rpc('set_catch_homepage_feature', {
      target_submission_id: submission.submission_id,
      target_featured: featured,
      target_order: order
    });
    button.disabled = false;
    if (error) {
      status.textContent = error.message || 'The homepage setting could not be saved.';
      return;
    }
    state.featureSettings.set(submission.submission_id, {
      submission_id: submission.submission_id,
      homepage_featured: featured,
      homepage_feature_order: featured ? order : null
    });
    status.textContent = featured ? `Featured at position ${order}.` : 'Removed from the masthead rotation.';
  }

  function requestDecision(decision) {
    const submission = state.submissions.find(item => item.submission_id === state.selectedId);
    if (!submission) return;
    const form = $('[data-decision-form]');
    const note = form.elements.moderation_note.value.trim();
    const status = $('[data-decision-status]');
    if (decision === 'approved') {
      const isRecipe = submission.submission_kind === 'recipe' || Boolean(submission.recipe);
      const checks = isRecipe ? ['recipe_photo', 'recipe_complete', 'recipe_species'] : ['measurement_visible', 'length_matches', 'species_matches'];
      if (!checks.every(name => form.elements[name].checked)) {
        status.textContent = `Complete all three ${isRecipe ? 'recipe' : 'catch'} verification checks before approving.`;
        return;
      }
    } else if (note.length < 5) {
      status.textContent = 'Add a short reason before rejecting this entry.';
      form.elements.moderation_note.focus();
      return;
    }
    state.pendingDecision = { decision, note };
    const approving = decision === 'approved';
    $('[data-confirm-icon]').innerHTML = `<i data-lucide="${approving ? 'check' : 'x'}" aria-hidden="true"></i>`;
    const type = submission.submission_kind === 'recipe' ? 'recipe' : 'catch';
    $('[data-confirm-title]').textContent = `${approving ? 'Approve' : 'Reject'} this ${type}?`;
    $('[data-confirm-copy]').textContent = approving
      ? `The hero photo will be published and this ${type} will appear on the species page.`
      : 'The member will see the moderation note explaining why this entry was rejected.';
    $('[data-confirm-action]').textContent = approving ? 'Approve and publish' : 'Reject entry';
    $('[data-confirm-action]').className = `button ${approving ? 'primary' : 'danger'}`;
    icons();
    decisionDialog.showModal();
  }

  async function publishPhotos(submission) {
    const photos = [...(submission.photos || [])].sort((a, b) => a.display_order - b.display_order);
    const selected = submission.submission_kind === 'recipe' ? photos : photos.filter(photo => photo.kind === 'hero').slice(0, 1);
    if (!selected.length) throw new Error('This entry has no publishable photo.');
    const publicPaths = [];
    for (const [index, photo] of selected.entries()) {
      const { data: blob, error: downloadError } = await client.storage.from('submission-photos').download(photo.storage_path);
      if (downloadError) throw downloadError;
      const extension = photo.storage_path.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = index === 0 ? `hero.${extension}` : `photo-${index + 1}.${extension}`;
      const publicPath = `${submission.submission_kind === 'recipe' ? 'recipes' : 'catches'}/${submission.submission_id}/${fileName}`;
      const { error: uploadError } = await client.storage.from('community-images').upload(publicPath, blob, {
        contentType: blob.type || 'image/jpeg', cacheControl: '3600', upsert: true
      });
      if (uploadError) throw uploadError;
      publicPaths.push(publicPath);
    }
    return { heroPath: publicPaths[0], publicPaths };
  }

  async function confirmDecision() {
    const submission = state.submissions.find(item => item.submission_id === state.selectedId);
    if (!submission || !state.pendingDecision) return;
    const button = $('[data-confirm-action]');
    const decisionStatus = $('[data-decision-status]');
    button.disabled = true;
    button.textContent = state.pendingDecision.decision === 'approved' ? 'Publishing...' : 'Rejecting...';
    let publication = null;
    try {
      if (state.pendingDecision.decision === 'approved') publication = await publishPhotos(submission);
      const rpc = submission.submission_kind === 'recipe' ? 'moderate_recipe_submission' : 'moderate_catch_submission';
      const params = submission.submission_kind === 'recipe'
        ? { target_submission_id: submission.submission_id, target_decision: state.pendingDecision.decision, target_note: state.pendingDecision.note || null, target_public_photo_path: publication?.heroPath || null, target_public_photo_paths: publication?.publicPaths || null }
        : { target_submission_id: submission.submission_id, target_decision: state.pendingDecision.decision, target_note: state.pendingDecision.note || null, target_length_verified: state.pendingDecision.decision === 'approved', target_public_photo_path: publication?.heroPath || null };
      const { error } = await client.rpc(rpc, params);
      if (error) throw error;
      decisionDialog.close();
      state.pendingDecision = null;
      state.selectedId = null;
      await loadSubmissions();
    } catch (error) {
      if (publication?.publicPaths?.length) await client.storage.from('community-images').remove(publication.publicPaths);
      decisionDialog.close();
      decisionStatus.textContent = error.message || 'The decision could not be saved.';
      console.warn('Moderation decision failed', error);
    } finally {
      button.disabled = false;
    }
  }

  async function initialise() {
    renderTheme();
    const oauthParams = new URLSearchParams(location.search);
    const oauthHash = new URLSearchParams(location.hash.replace(/^#/, ''));
    const oauthError = oauthParams.get('error_description') || oauthHash.get('error_description');
    if (oauthError) history.replaceState({}, '', `${location.pathname}`);
    if (!client) {
      showGate('signed-out');
      $('[data-auth-status]').textContent = 'Supabase is not configured for this local build.';
      return;
    }
    const { data } = await client.auth.getSession();
    state.session = data.session;
    if (!state.session) {
      showGate('signed-out');
      if (oauthError) $('[data-auth-status]').textContent = /email/i.test(oauthError)
        ? 'Facebook did not share an email address. Remove Spearfishing Victoria from Facebook Apps and Websites, then try again and allow email access.'
        : `Sign-in could not be completed: ${oauthError}`;
      return;
    }
    try {
      const staff = await loadProfile();
      if (!staff) {
        showGate('no-access');
        return;
      }
      showGate('app');
      renderStaff();
      await Promise.all([loadSubmissions(), loadPrograms()]);
    } catch (error) {
      showGate('no-access');
      noAccess.querySelector('p').textContent = 'The moderation workspace could not be loaded. Check that the latest database migration has been applied.';
      console.warn('Moderation workspace unavailable', error);
    }
  }

  $('[data-theme-toggle]').addEventListener('click', () => { state.dark = !state.dark; renderTheme(); });
  $('[data-auth-form]').addEventListener('submit', sendMagicLink);
  $$('[data-oauth-provider]').forEach(button => button.addEventListener('click', signInWithProvider));
  $$('[data-sign-out]').forEach(button => button.addEventListener('click', async () => { await client?.auth.signOut(); location.reload(); }));
  $$('[data-filter]').forEach(button => button.addEventListener('click', () => {
    state.filter = button.dataset.filter;
    state.selectedId = null;
    $$('[data-filter]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    renderQueue();
  }));
  $('[data-search]').addEventListener('input', event => { state.search = event.target.value.trim(); state.selectedId = null; renderQueue(); });
  $$('[data-decide]').forEach(button => button.addEventListener('click', () => requestDecision(button.dataset.decide)));
  $('[data-confirm-cancel]').addEventListener('click', () => { state.pendingDecision = null; decisionDialog.close(); });
  $('[data-confirm-action]').addEventListener('click', confirmDecision);
  $$('[data-workspace]').forEach(button => button.addEventListener('click', () => setWorkspace(button.dataset.workspace)));
  $('[data-new-program]').addEventListener('click', () => selectProgram(null));
  $('[data-program-month]').addEventListener('change', () => updateAutomaticSchedule(true));
  $('[data-program-species]').addEventListener('change', () => updateAutomaticSchedule(true));
  $('[data-program-form]').addEventListener('submit', saveProgram);
  $('[data-feature-toggle]').addEventListener('change', event => { $('[data-feature-order]').disabled = !event.target.checked; });
  $('[data-save-feature]').addEventListener('click', saveFeatureSetting);
  decisionDialog.addEventListener('click', event => { if (event.target === decisionDialog) { state.pendingDecision = null; decisionDialog.close(); } });
  const photoLightbox = $('[data-photo-lightbox]');
  const lightboxStage = $('[data-lightbox-stage]');
  $('[data-lightbox-close]').addEventListener('click', () => photoLightbox.close());
  $('[data-lightbox-previous]').addEventListener('click', () => moveLightbox(-1));
  $('[data-lightbox-next]').addEventListener('click', () => moveLightbox(1));
  photoLightbox.addEventListener('click', event => { if (event.target === photoLightbox) photoLightbox.close(); });
  lightboxStage.addEventListener('click', event => { if (event.target === lightboxStage) photoLightbox.close(); });
  photoLightbox.addEventListener('close', () => { state.lightboxPhotos = []; resetLightboxTransform(); });
  photoLightbox.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); moveLightbox(-1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); moveLightbox(1); }
  });
  lightboxStage.addEventListener('wheel', event => {
    event.preventDefault();
    state.lightboxScale = Math.min(6, Math.max(1, state.lightboxScale * (event.deltaY < 0 ? 1.15 : .87)));
    if (state.lightboxScale === 1) { state.lightboxX = 0; state.lightboxY = 0; }
    applyLightboxTransform();
  }, { passive: false });
  lightboxStage.addEventListener('pointerdown', event => {
    lightboxStage.setPointerCapture(event.pointerId);
    state.lightboxPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    lightboxStage.classList.add('dragging');
    if (state.lightboxPointers.size === 2) {
      const [a, b] = [...state.lightboxPointers.values()];
      state.lightboxPinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
    }
  });
  lightboxStage.addEventListener('pointermove', event => {
    const previous = state.lightboxPointers.get(event.pointerId);
    if (!previous) return;
    state.lightboxPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (state.lightboxPointers.size === 1 && state.lightboxScale > 1) {
      state.lightboxX += event.clientX - previous.x;
      state.lightboxY += event.clientY - previous.y;
    } else if (state.lightboxPointers.size === 2) {
      const [a, b] = [...state.lightboxPointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (state.lightboxPinchDistance) state.lightboxScale = Math.min(6, Math.max(1, state.lightboxScale * distance / state.lightboxPinchDistance));
      state.lightboxPinchDistance = distance;
    }
    applyLightboxTransform();
  });
  const finishPointer = event => {
    state.lightboxPointers.delete(event.pointerId);
    if (state.lightboxPointers.size < 2) state.lightboxPinchDistance = 0;
    if (!state.lightboxPointers.size) lightboxStage.classList.remove('dragging');
  };
  lightboxStage.addEventListener('pointerup', finishPointer);
  lightboxStage.addEventListener('pointercancel', finishPointer);
  initialise();
})();
