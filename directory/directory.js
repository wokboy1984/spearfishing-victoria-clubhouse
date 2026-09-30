if (!document.querySelector('script[src*="shared-navigation.js"]')) {
  const sharedNavigation = document.createElement('script');
  sharedNavigation.src = '/shared-navigation.js?v=1';
  document.body.append(sharedNavigation);
}

(() => {
  let listings = window.SV_DIRECTORY || [];
  const categories = window.SV_DIRECTORY_CATEGORIES || [];
  const $ = selector => document.querySelector(selector);
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const state = { category:'All', search:'', region:'', recommended:false };
  const icons = {'Freediving Schools':'graduation-cap','Clubs':'users','Spearfishing Stores':'shopping-bag','Spearfishing Charters':'ship','YouTube Channels':'youtube','Instagram Accounts':'instagram','Underwater Sports':'trophy'};
  const db = () => window.supabase && window.SV_SUPABASE_CONFIG?.url ? window.supabase.createClient(window.SV_SUPABASE_CONFIG.url, window.SV_SUPABASE_CONFIG.publishableKey) : null;
  const asset = value => (value || '').replace(/^\.\.\//,'/');
  const staticListings = new Map((window.SV_DIRECTORY || []).map(item => [item.slug, item]));
  const mapLive = item => ({slug:item.slug,name:item.name,category:item.category,categories:item.categories?.length?item.categories:[item.category],type:item.category.replace(/s$/,''),region:item.region,location:item.location||item.region,serviceArea:item.service_area||item.region,description:item.description,services:item.services||[],website:item.website||'',instagram:item.instagram_url||'',youtube:item.youtube_url||'',email:item.contact_email||'',phone:item.phone||'',logo:item.logo_path||staticListings.get(item.slug)?.logo||'',lastUpdated:(item.last_updated||new Date().toISOString()).slice(0,10),verifiedOwner:Boolean(item.owner_verified),recommendations:Number(item.recommendation_count||0)});
  const regionBuckets = ['Port Phillip Bay','Mornington Peninsula','Bass Coast','Surf Coast','Wilsons Promontory','Regional Victoria'];
  function serviceAreaBuckets(value) {
    const source=String(value || '').toLowerCase();
    return regionBuckets.filter(bucket=>source.includes(bucket.toLowerCase()));
  }
  function serviceAreaFields(selected=[],name='service_area') {
    const chosen=new Set(selected);
    return `<fieldset class="service-area-options"><legend>Service areas</legend><p>Select every Victorian region this listing serves.</p><div>${regionBuckets.map(bucket=>`<label><input type="checkbox" name="${name}" value="${escapeHtml(bucket)}" ${chosen.has(bucket)?'checked':''}> <span>${escapeHtml(bucket)}</span></label>`).join('')}</div></fieldset>`;
  }
  function regionBucket(item) {
    const listedRegion=(item.region || '').toLowerCase();
    if (/geelong|bellarine|surf coast|queenscliff|anglesea|torquay/.test(listedRegion)) return 'Surf Coast';
    if (/mornington|sorrento|portsea|capel sound/.test(listedRegion)) return 'Mornington Peninsula';
    if (/bass coast|wonthaggi|cape paterson|phillip island/.test(listedRegion)) return 'Bass Coast';
    if (/wilsons prom|promontory/.test(listedRegion)) return 'Wilsons Promontory';
    if (/melbourne|port phillip|cheltenham|oakleigh|hallam|blackburn|maribyrnong|glen iris|box hill|clayton/.test(listedRegion)) return 'Port Phillip Bay';
    const value=[item.location,item.serviceArea].join(' ').toLowerCase();
    if (/mornington|sorrento|portsea|capel sound/.test(value)) return 'Mornington Peninsula';
    if (/bass coast|wonthaggi|cape paterson|phillip island/.test(value)) return 'Bass Coast';
    if (/geelong|bellarine|surf coast|queenscliff|anglesea|torquay/.test(value)) return 'Surf Coast';
    if (/wilsons prom|promontory/.test(value)) return 'Wilsons Promontory';
    if (/melbourne|port phillip|cheltenham|oakleigh|hallam|blackburn|maribyrnong|glen iris|box hill|clayton/.test(value)) return 'Port Phillip Bay';
    return 'Regional Victoria';
  }

  function renderCategories() {
    $('[data-categories]').innerHTML = ['All',...categories].map(category => `<button type="button" class="${state.category===category?'active':''}" data-category="${escapeHtml(category)}"><i data-lucide="${category==='All'?'layout-grid':icons[category]||'circle'}"></i> ${escapeHtml(category)}</button>`).join('');
    $('[data-categories]').querySelectorAll('button').forEach(button => button.addEventListener('click',()=>{state.category=button.dataset.category;$('[data-service]').value=state.category==='All'?'':state.category;render();}));
  }
  function filtered() {
    const query=state.search.toLowerCase();
    return listings.filter(item=>{const itemCategories=item.categories?.length?item.categories:[item.category];const haystack=[item.name,item.type,item.region,item.location,item.serviceArea,item.description,...itemCategories,...item.services].join(' ').toLowerCase();const servedAreas=serviceAreaBuckets(item.serviceArea);return(state.category==='All'||itemCategories.includes(state.category))&&(!query||haystack.includes(query))&&(!state.region||servedAreas.includes(state.region)||(!servedAreas.length&&regionBucket(item)===state.region))&&(!state.recommended||item.recommendations>=5);});
  }
  function card(item) {
    const owner=item.verifiedOwner?'<span class="verified"><i data-lucide="badge-check"></i> Verified owner</span>':'<span><i data-lucide="shield"></i> Community listing</span>';
    const recommendation=item.recommendations>=5?'<span class="recommended"><i data-lucide="thumbs-up"></i> Community recommended</span>':`<span><i data-lucide="thumbs-up"></i> ${item.recommendations} recommendations</span>`;
    const artwork=item.logo?`<img src="${escapeHtml(asset(item.logo))}" alt="${escapeHtml(item.name)} logo">`:`<div class="logo-fallback"><i data-lucide="${icons[item.category]||'waves'}"></i><strong>${escapeHtml(item.name.split(/\s+/).slice(0,2).map(word=>word[0]).join('').toUpperCase())}</strong></div>`;
    const categoryTags=(item.categories?.length?item.categories:[item.category]).map(category=>`<span>${escapeHtml(category)}</span>`).join('');
    const darkArtwork=['adreno-melbourne','drifters-freediving','freedive-geelong','geelong-freedivers','marlon-quinn-boundless-blue','melbourne-freedivers-club','simple-dive-melbourne','southern-freedivers','torelli-spearfishing-australia'].includes(item.slug)?' on-dark':'';
    return `<a class="listing-card" href="./${encodeURIComponent(item.slug)}/"><div class="listing-logo${darkArtwork}">${artwork}</div><div class="listing-body"><div class="listing-meta"><span><i data-lucide="map-pin"></i>${escapeHtml(item.region)}</span>${categoryTags}</div><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.description)}</p><div class="service-list">${item.services.slice(0,4).map(service=>`<span>${escapeHtml(service)}</span>`).join('')}</div><div class="trust-row">${owner}${recommendation}</div></div></a>`;
  }
  function render() { renderCategories();const result=filtered();$('[data-results-title]').textContent=state.category==='All'?'All listings':state.category;$('[data-results-count]').textContent=`${result.length} ${result.length===1?'listing':'listings'}`;$('[data-listings]').innerHTML=result.map(card).join('');$('[data-listings]').hidden=!result.length;$('[data-empty]').hidden=Boolean(result.length);if(window.lucide)window.lucide.createIcons({attrs:{width:16,height:16}}); }
  function fillFilters() { $('[data-region]').querySelectorAll('option:not(:first-child)').forEach(option=>option.remove());$('[data-service]').querySelectorAll('option:not(:first-child)').forEach(option=>option.remove());regionBuckets.filter(bucket=>listings.some(item=>regionBucket(item)===bucket)).forEach(value=>$('[data-region]').add(new Option(value,value)));categories.forEach(value=>$('[data-service]').add(new Option(value,value))); }
  function initialiseFilters() { fillFilters();$('[data-search]').addEventListener('input',event=>{state.search=event.target.value.trim();render();});$('[data-region]').addEventListener('change',event=>{state.region=event.target.value;render();});$('[data-service]').addEventListener('change',event=>{state.category=event.target.value||'All';render();});$('[data-recommended]').addEventListener('change',event=>{state.recommended=event.target.checked;render();}); }
  function initialiseSubmission() {
    const dialog=$('[data-listing-dialog]'),form=$('[data-listing-form]');
    const ownership=form.elements.ownership_evidence.closest('label');
    ownership.insertAdjacentHTML('beforebegin',`<div data-business-fields><div class="form-grid"><label>Location<input name="location" required maxlength="100" placeholder="e.g. Sorrento, VIC"></label><label>Phone<input name="phone" type="tel"></label></div>${serviceAreaFields()}</div><label>Logo or profile image URL<input name="logo_url" type="url" placeholder="https://"></label>`);
    categories.forEach(category=>form.elements.category.add(new Option(category,category)));
    const websiteLabel=form.elements.website.closest('label'),contactLabel=form.elements.contact_email.closest('label'),regionLabel=form.elements.region.closest('label'),businessFields=form.querySelector('[data-business-fields]'),notice=form.querySelector('.notice');
    function updateFormMode(){const creator=['Instagram Accounts','YouTube Channels'].includes(form.elements.category.value);websiteLabel.hidden=creator;contactLabel.hidden=creator;regionLabel.hidden=creator;businessFields.hidden=creator;form.elements.website.required=!creator;form.elements.contact_email.required=!creator;form.elements.region.required=!creator;form.elements.location.required=!creator;form.elements.social_url.required=creator;form.elements.services.closest('label').childNodes[0].nodeValue=creator?'Main topics':'Services offered';form.elements.services.placeholder=creator?'e.g. Spearfishing, freediving, recipes, gear':'Separate services with commas';form.elements.description.placeholder=creator?'Describe the content and explain its connection to Victoria.':'';notice.textContent=creator?'Submit an account you own or represent. Add the profile link, Victorian connection, main topics and a profile image.':'Only owners or authorised representatives can submit a listing. Every new listing is reviewed before publication.';}
    form.elements.category.addEventListener('change',updateFormMode);updateFormMode();
    document.querySelectorAll('[data-submit-listing]').forEach(button=>button.addEventListener('click',()=>dialog.showModal()));$('[data-close-dialog]').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
    form.addEventListener('submit',async event=>{event.preventDefault();const status=$('[data-form-status]'),client=db();if(!client){status.textContent='Member submissions need the directory database update before they can be sent.';return;}const {data:{session}}=await client.auth.getSession();if(!session){status.textContent='Sign in from the home page first, then return to submit your listing.';return;}const formData=new FormData(form),values=Object.fromEntries(formData),creator=['Instagram Accounts','YouTube Channels'].includes(values.category),serviceAreas=formData.getAll('service_area');if(!creator&&!serviceAreas.length){status.textContent='Choose at least one service area.';return;}status.textContent='Sending your listing for moderator review...';const {error}=await client.rpc('submit_directory_listing',{listing_name:values.name,listing_category:values.category,listing_region:creator?'Victoria-wide':values.region,listing_location:creator?null:values.location,listing_service_area:creator?null:serviceAreas.join(', '),listing_website:creator?null:values.website,listing_description:values.description,listing_services:values.services.split(',').map(value=>value.trim()).filter(Boolean),listing_contact_email:creator?null:values.contact_email,listing_phone:creator?null:values.phone||null,listing_social_url:values.social_url||null,listing_logo_url:values.logo_url||null,ownership_evidence:values.ownership_evidence});status.textContent=error?'Your listing could not be sent yet. The directory database update may still need to be applied.':'Listing received. It will appear after moderator review.';if(!error){form.reset();updateFormMode();}});
  }
  function initialiseManagement() {
    const dialog=$('[data-manage-dialog]'),status=$('[data-manage-status]'),container=$('[data-owned-listings]');
    $('[data-manage-listings]').addEventListener('click',async()=>{dialog.showModal();status.textContent='Loading your listings...';container.innerHTML='';const client=db();if(!client){status.textContent='Directory management will be available after the database update is applied.';return;}const {data:{session}}=await client.auth.getSession();if(!session){status.textContent='Sign in from the home page first, then return here.';return;}const {data,error}=await client.rpc('get_my_directory_listings');if(error){status.textContent='Your listings could not be loaded yet. The directory database update may still need to be applied.';return;}status.textContent=data.length?'':'You do not manage any directory listings yet.';container.innerHTML=data.map(item=>{const creator=['Instagram Accounts','YouTube Channels'].includes(item.category);return `<form class="owned-listing-form" data-owned-form data-id="${item.id}" data-creator="${creator}"><div class="owned-listing-head"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.status)}</span></div><label>Description<textarea name="description" maxlength="900" required>${escapeHtml(item.description)}</textarea></label><div class="form-grid"><label>Region<input name="region" value="${escapeHtml(item.region)}" required></label><label>Website<input name="website" type="url" value="${escapeHtml(item.website||'')}"></label></div>${creator?'':serviceAreaFields(serviceAreaBuckets(item.service_area))}<label>Services<input name="services" value="${escapeHtml((item.services||[]).join(', '))}"></label><button class="button orange" type="submit">Save listing</button><p class="form-status"></p></form>`;}).join('');container.querySelectorAll('[data-owned-form]').forEach(form=>form.addEventListener('submit',async event=>{event.preventDefault();const formData=new FormData(form),values=Object.fromEntries(formData),serviceAreas=formData.getAll('service_area'),creator=form.dataset.creator==='true',message=form.querySelector('.form-status');if(!creator&&!serviceAreas.length){message.textContent='Choose at least one service area.';return;}message.textContent='Saving...';const {error:updateError}=await client.rpc('update_owned_directory_listing',{listing_id:form.dataset.id,listing_description:values.description,listing_region:values.region,listing_service_area:creator?'':serviceAreas.join(', '),listing_website:values.website,listing_services:values.services.split(',').map(value=>value.trim()).filter(Boolean)});message.textContent=updateError?'Could not save this listing.':'Listing updated.';}));});
    $('[data-close-manage]').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
  }
  async function loadLive() { const client=db();if(!client)return;const {data,error}=await client.rpc('get_public_directory');if(!error&&data?.length){listings=data.map(mapLive);$('[data-total-count]').textContent=listings.length;fillFilters();render();} }
  $('[data-total-count]').textContent=listings.length;initialiseFilters();initialiseSubmission();initialiseManagement();render();loadLive();
})();
