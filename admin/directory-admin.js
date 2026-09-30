(() => {
  const $ = selector => document.querySelector(selector);
  const config = window.SV_SUPABASE_CONFIG;
  const client = window.supabase.createClient(config.url, config.publishableKey);
  const categories = ['Freediving Schools','Clubs','Spearfishing Stores','Spearfishing Charters','YouTube Channels','Instagram Accounts','Underwater Sports'];
  let kind = 'listings';
  let data = { listings:[], published:[], claims:[], reports:[] };
  const editor = $('[data-listing-editor]');
  const editForm = $('[data-edit-form]');
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));

  const formatDate = value => value ? new Intl.DateTimeFormat('en-AU', { dateStyle:'medium', timeStyle:'short' }).format(new Date(value)) : 'Unknown';
  const getDomain = value => { try { return new URL(value).hostname.replace(/^www\./, ''); } catch { return ''; } };
  const emailDomain = value => String(value || '').split('@')[1]?.toLowerCase() || '';

  function claimCard(item) {
    const listing = item.listing;
    const siteDomain = getDomain(listing.website);
    const contactMatches = Boolean(siteDomain && emailDomain(item.business_email) === siteDomain);
    const accountAgeDays = item.claimant?.created_at ? Math.max(0, Math.floor((Date.now() - new Date(item.claimant.created_at)) / 86400000)) : null;
    const signals = [
      { good:contactMatches, text:contactMatches ? 'Email domain matches website' : 'Email domain does not match website' },
      { good:Boolean(item.verification_url), text:item.verification_url ? 'Public verification page supplied' : 'No public verification page' },
      { good:accountAgeDays !== null && accountAgeDays >= 7, text:accountAgeDays === null ? 'Account age unavailable' : `Member account is ${accountAgeDays} day${accountAgeDays === 1 ? '' : 's'} old` }
    ];
    return `<article class="directory-review claim-review" data-claim-card="${item.id}"><header><div><div class="eyebrow">Ownership claim</div><h2>${escapeHtml(listing.name)}</h2><p>Approval gives this member editing access to the public listing.</p></div><span class="risk-badge">Verify independently</span></header><div class="claim-grid"><section><h3>Claimant</h3><dl><div><dt>Member</dt><dd>${escapeHtml(item.claimant?.display_name || 'Unknown')} <span class="muted">@${escapeHtml(item.claimant?.username || 'unknown')}</span></dd></div><div><dt>Role claimed</dt><dd>${escapeHtml(item.claimant_role || 'Not supplied')}</dd></div><div><dt>Organisation email</dt><dd><a href="mailto:${escapeHtml(item.business_email)}">${escapeHtml(item.business_email || 'Not supplied')}</a></dd></div><div><dt>Submitted</dt><dd>${escapeHtml(formatDate(item.created_at))}</dd></div></dl></section><section><h3>Evidence</h3><p class="evidence-copy">${escapeHtml(item.evidence || '')}</p><a class="evidence-link" href="${escapeHtml(item.verification_url || '#')}" target="_blank" rel="noopener noreferrer">Open public verification page <i data-lucide="external-link"></i></a></section><section><h3>Automated signals</h3><ul class="signal-list">${signals.map(signal => `<li class="${signal.good ? 'good' : 'warn'}"><i data-lucide="${signal.good ? 'check-circle-2' : 'alert-triangle'}"></i>${escapeHtml(signal.text)}</li>`).join('')}</ul><p class="signal-note">Signals are prompts, not proof. Contact the organisation through details found independently—not details supplied only in this claim.</p></section></div><fieldset class="verification-checks"><legend>Moderator verification required before approval</legend><label><input type="checkbox" data-check="contact"> I contacted the organisation using independently published contact details.</label><label><input type="checkbox" data-check="authority"> The organisation confirmed this member is authorised to manage the listing.</label><label><input type="checkbox" data-check="scope"> I checked the listing and the requested access scope is appropriate.</label></fieldset><div class="directory-actions"><button class="button edit" data-edit-listing data-id="${listing.id}"><i data-lucide="pencil"></i> Review listing</button><button class="button approve" data-decision="approved" data-id="${item.id}" disabled>Approve ownership</button><button class="button reject" data-decision="rejected" data-id="${item.id}">Reject</button></div></article>`;
  }

  function card(item) {
    const listing = item.listing || item;
    const detail = kind === 'listings' ? listing.ownership_evidence : kind === 'claims' ? item.evidence : kind === 'reports' ? item.details : '';
    const workflow = kind === 'published'
      ? `<button class="button reject" data-delete-listing data-id="${listing.id}" data-name="${escapeHtml(listing.name)}">Delete listing</button>`
      : `<button class="button approve" data-decision="approved" data-id="${item.id}">${kind === 'reports' ? 'Resolve' : 'Approve'}</button><button class="button reject" data-decision="rejected" data-id="${item.id}">${kind === 'reports' ? 'Dismiss' : 'Reject'}</button>`;
    const categoryLabels = listing.categories?.length ? listing.categories.join(', ') : listing.category;
    return `<article class="directory-review"><header><div><div class="eyebrow">${escapeHtml(categoryLabels)}</div><h2>${escapeHtml(listing.name)}</h2><p>${escapeHtml(listing.description || '')}</p></div><strong>${escapeHtml(listing.region || '')}</strong></header><dl><div><dt>Website</dt><dd>${listing.website ? `<a href="${escapeHtml(listing.website)}" target="_blank">Open website</a>` : 'Not supplied'}</dd></div><div><dt>Services</dt><dd>${escapeHtml((listing.services || []).join(', '))}</dd></div><div><dt>${kind === 'reports' ? 'Report' : kind === 'published' ? 'Owner status' : 'Ownership evidence'}</dt><dd>${kind === 'published' ? (listing.owner_verified_at ? 'Verified owner' : 'Unclaimed') : escapeHtml(detail || '')}</dd></div></dl><div class="directory-actions"><button class="button edit" data-edit-listing data-id="${listing.id}"><i data-lucide="pencil"></i> Edit listing</button>${workflow}</div></article>`;
  }

  function render() {
    const items = data[kind] || [];
    $('[data-queue]').innerHTML = items.length ? items.map(item => kind === 'claims' ? claimCard(item) : card(item)).join('') : `<div class="review-empty"><i data-lucide="inbox"></i><h2>Nothing waiting here</h2><p>The ${kind} queue is clear.</p></div>`;
    $('[data-queue]').querySelectorAll('[data-claim-card]').forEach(card => { const checks=[...card.querySelectorAll('[data-check]')],approve=card.querySelector('[data-decision="approved"]'); checks.forEach(check => check.addEventListener('change', () => { approve.disabled=!checks.every(input => input.checked); })); });
    $('[data-queue]').querySelectorAll('[data-decision]').forEach(button => button.addEventListener('click', () => decide(button.dataset.id, button.dataset.decision)));
    $('[data-queue]').querySelectorAll('[data-delete-listing]').forEach(button => button.addEventListener('click', () => removeListing(button.dataset.id, button.dataset.name)));
    $('[data-queue]').querySelectorAll('[data-edit-listing]').forEach(button => button.addEventListener('click', () => openEditor(button.dataset.id)));
    window.lucide?.createIcons();
  }

  async function load() {
    const { data:result, error } = await client.rpc('get_directory_moderation_queue');
    if (error) { $('[data-status]').textContent = 'The directory moderation database update still needs to be applied.'; return; }
    data = result;
    render();
  }

  function findListing(id) {
    for (const collection of Object.values(data)) {
      for (const item of collection || []) {
        const listing = item.listing || item;
        if (listing.id === id) return listing;
      }
    }
    return null;
  }

  function openEditor(id) {
    const listing = findListing(id);
    if (!listing) return;
    for (const [name,value] of Object.entries(listing)) if (editForm.elements[name] && !['categories','services'].includes(name)) editForm.elements[name].value = value ?? '';
    editForm.elements.services.value = (listing.services || []).join(', ');
    const selected = listing.categories?.length ? listing.categories : [listing.category];
    editForm.querySelectorAll('[name="categories"]').forEach(input => { input.checked = selected.includes(input.value); });
    $('[data-edit-status]').textContent = '';
    editor.showModal();
  }

  async function saveListing(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(editForm));
    const selected = [...editForm.querySelectorAll('[name="categories"]:checked')].map(input => input.value);
    if (!selected.includes(values.category)) selected.unshift(values.category);
    $('[data-edit-status]').textContent = 'Saving listing...';
    const { error } = await client.rpc('admin_update_directory_listing', {
      listing_id:values.id, listing_slug:values.slug, listing_name:values.name,
      listing_category:values.category, listing_categories:selected, listing_status:values.status,
      listing_region:values.region, listing_location:values.location || null,
      listing_service_area:values.service_area || null, listing_description:values.description,
      listing_services:values.services.split(',').map(value => value.trim()).filter(Boolean),
      listing_website:values.website || null, listing_instagram_url:values.instagram_url || null,
      listing_youtube_url:values.youtube_url || null, listing_contact_email:values.contact_email || null,
      listing_phone:values.phone || null, listing_logo_path:values.logo_path || null
    });
    $('[data-edit-status]').textContent = error ? error.message : 'Listing saved.';
    if (!error) { await load(); setTimeout(() => editor.close(), 350); }
  }

  async function decide(id, decision) {
    const note = prompt(decision === 'approved' ? 'Optional moderator note:' : 'Reason for this decision:') ?? '';
    const claim = kind === 'claims' ? document.querySelector(`[data-claim-card="${CSS.escape(id)}"]`) : null;
    const checks = claim ? [...claim.querySelectorAll('[data-check]')] : [];
    const rpc = kind === 'claims' ? 'moderate_directory_claim' : 'moderate_directory_item';
    const params = kind === 'claims' ? { claim_id:id, claim_decision:decision, moderator_note:note, contact_checked:checks[0]?.checked || false, authority_confirmed:checks[1]?.checked || false, scope_checked:checks[2]?.checked || false } : { item_kind:kind, item_id:id, item_decision:decision, moderator_note:note };
    const { error } = await client.rpc(rpc, params);
    $('[data-status]').textContent = error ? error.message : 'Decision saved.';
    if (!error) load();
  }

  async function removeListing(id, name) {
    if (!confirm(`Permanently delete ${name}? Its recommendations, claims and reports will also be removed.`)) return;
    const { error } = await client.rpc('delete_directory_listing', { listing_id:id });
    $('[data-status]').textContent = error ? error.message : 'Listing deleted.';
    if (!error) load();
  }

  categories.forEach(category => {
    editForm.elements.category.add(new Option(category, category));
    $('[data-category-checks]').insertAdjacentHTML('beforeend', `<label><input type="checkbox" name="categories" value="${escapeHtml(category)}"> ${escapeHtml(category)}</label>`);
  });
  editForm.elements.category.addEventListener('change', event => { editForm.querySelector(`[name="categories"][value="${CSS.escape(event.target.value)}"]`).checked = true; });
  editForm.addEventListener('submit', saveListing);
  document.querySelectorAll('[data-close-editor]').forEach(button => button.addEventListener('click', () => editor.close()));
  editor.addEventListener('click', event => { if (event.target === editor) editor.close(); });
  document.querySelectorAll('[data-kind]').forEach(button => button.addEventListener('click', () => { kind=button.dataset.kind; document.querySelectorAll('[data-kind]').forEach(tab => tab.setAttribute('aria-pressed', String(tab === button))); render(); }));

  (async () => {
    const { data:{session} } = await client.auth.getSession();
    if (!session) { $('[data-access-copy]').textContent = 'Sign in through the main moderation page first.'; return; }
    const { data:staff } = await client.rpc('is_staff');
    if (!staff) { $('[data-access-copy]').textContent = 'This account does not have moderator access.'; return; }
    $('[data-access]').hidden = true;
    $('[data-app]').hidden = false;
    load();
  })();
})();
