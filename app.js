(() => {
      const root = document.getElementById('sv-facebook-clubhouse');
      const site = root.querySelector('.site');
      const storageKey = 'spearfishing-victoria-clubhouse-v1';
      let saved = {};
      try {
        saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
      } catch {
        saved = {};
      }
      const state = {
        region: saved.region || 'Port Phillip Bay',
        vote: saved.vote || null,
        dark: saved.appearance === 'dark'
      };
      const supabaseConfig = globalThis.SV_SUPABASE_CONFIG;
      const supabaseClient = globalThis.supabase && supabaseConfig?.url && supabaseConfig?.publishableKey
        ? globalThis.supabase.createClient(supabaseConfig.url, supabaseConfig.publishableKey)
        : null;
      let currentSession = null;
      let activeBallot = null;
      let activeChallenge = null;
      let liveVotes = null;
      let voteLabels = {};
      let speciesIdsBySlug = {};
      let trackedSpeciesIds = {};
      let memberProfile = null;
      let memberIdentities = [];
      let memberSubmissions = [];
      let memberPhotoUrls = new Map();
      let activeMemberTab = 'submissions';
      let mastheadSlides = [];
      let mastheadSlideIndex = 0;
      let mastheadTimer = null;
      let toastTimer = null;
      let replacingSubmissionId = null;
      let avatarRemovalRequested = false;
      let leaderboardMode = 'monthly';
      let leaderboardData = { monthly: [], species: [], yearly: [] };
      let communityDataStatus = supabaseClient ? 'loading' : 'preview';
      const regions = {
        'Port Phillip Bay': { latitude: -38.13, longitude: 144.82, point: 'Central Port Phillip Bay' },
        'Mornington Peninsula': { latitude: -38.36, longitude: 144.78, point: 'Off Sorrento' },
        'Bass Coast': { latitude: -38.57, longitude: 145.33, point: 'Off Cape Paterson' },
        'Surf Coast': { latitude: -38.48, longitude: 144.05, point: 'Off Anglesea' },
        'Wilsons Promontory': { latitude: -39.13, longitude: 146.34, point: 'Off Tidal River' }
      };
      const baseVotes = { 'king-george-whiting': 82, 'southern-calamari': 65, 'yellowtail-kingfish': 39 };
      const trackedSpecies = {
        snapper: {
          name: 'Snapper',
          scientific: 'Chrysophrys auratus',
          group: 'fish',
          image: 'assets/sv-snapper.webp',
          imageAlt: 'Snapper on the Victorian coast',
          summary: 'A familiar Victorian reef and bay species, with juvenile fish often called pinkies. This is the current Species of the Month.',
          size: '28 cm minimum',
          bag: '10 total; no more than 3 fish may be 40 cm or longer',
          note: 'Keep whole or in carcass form while in or on Victorian waters.',
          rulesUrl: 'https://vfa.vic.gov.au/recreational-fishing/recreational-fishing-guide/catch-limits-and-closed-seasons/types-of-fish/marine-and-estuarine-scale-fish/snapper',
          recipe: {
            title: 'Whole roasted snapper with tomato and herbs', time: '45 min', serves: 'Serves 4',
            ingredients: ['1 whole cleaned snapper', 'Cherry tomatoes', 'Lemon and garlic', 'Parsley or oregano', 'Olive oil and fish stock'],
            method: ['Heat the oven to 210°C and season the fish.', 'Fill the cavity with lemon, garlic and herbs.', 'Roast over tomatoes with stock for 25–30 minutes.', 'Rest for five minutes and serve with the pan juices.']
          }
        },
        'king-george-whiting': {
          name: 'King George whiting',
          scientific: 'Sillaginodes punctata',
          group: 'fish',
          image: 'assets/species-king-george-whiting.png',
          imageAlt: 'King George whiting over seagrass',
          summary: 'A slender silver-brown inshore species associated with sand, seagrass and sheltered coastal waters around Victoria.',
          size: '27 cm minimum',
          bag: '20',
          note: 'Keep whole or in carcass form while in or on Victorian waters.',
          rulesUrl: 'https://vfa.vic.gov.au/recreational-fishing/recreational-fishing-guide/catch-limits-and-closed-seasons/types-of-fish/marine-and-estuarine-scale-fish/king-george-whiting',
          recipe: {
            title: 'Herb-crumbed whiting fillets', time: '25 min', serves: 'Serves 2',
            ingredients: ['4 whiting fillets', 'Fresh breadcrumbs', 'Parsley and lemon zest', 'Olive oil', 'Salt and black pepper'],
            method: ['Heat the oven to 220°C.', 'Mix crumbs, parsley, zest and olive oil.', 'Press the crumb onto the fillets.', 'Bake for 8–10 minutes until just cooked through.']
          }
        },
        'southern-calamari': {
          name: 'Southern calamari',
          scientific: 'Sepioteuthis australis',
          group: 'cephalopod',
          image: 'assets/species-southern-calamari.png',
          imageAlt: 'Southern calamari above Victorian seagrass',
          summary: 'A colour-changing cephalopod common across Victorian bays and coastal seagrass habitat.',
          size: 'No minimum',
          bag: 'Combined total of 10 squid, calamari, octopus and cuttlefish',
          note: 'Collection is prohibited in Marine National Parks and Sanctuaries.',
          rulesUrl: 'https://vfa.vic.gov.au/recreational-fishing/recreational-fishing-guide/catch-limits-and-closed-seasons/types-of-fish/squid-octopus-cuttlefish',
          recipe: {
            title: 'Charred calamari with lemon and parsley', time: '20 min', serves: 'Serves 3',
            ingredients: ['Cleaned calamari tubes and tentacles', 'Lemon', 'Garlic', 'Flat-leaf parsley', 'Olive oil and sea salt'],
            method: ['Score the tubes lightly and pat everything dry.', 'Toss with oil, garlic and a little salt.', 'Cook on a very hot plate for 60–90 seconds per side.', 'Finish with lemon and parsley and serve immediately.']
          }
        },
        'yellowtail-kingfish': {
          name: 'Yellowtail kingfish',
          scientific: 'Seriola lalandi',
          group: 'fish',
          image: 'assets/species-yellowtail-kingfish.png',
          imageAlt: 'Yellowtail kingfish beside a kelp reef',
          summary: 'A fast, powerful pelagic fish that moves into Victorian coastal waters through the warmer months.',
          size: '60 cm minimum',
          bag: '2',
          note: 'Victoria reduced the daily bag limit from 5 to 2 in October 2025.',
          rulesUrl: 'https://vfa.vic.gov.au/about/news/angler-support-confirms-kingfish-bag-limit-change',
          recipe: {
            title: 'Miso-glazed kingfish', time: '35 min', serves: 'Serves 4',
            ingredients: ['4 kingfish portions', 'White miso', 'Soy sauce', 'Ginger', 'Rice vinegar and sesame seeds'],
            method: ['Mix miso, soy, ginger and vinegar.', 'Coat the portions and rest for 15 minutes.', 'Bake at 210°C for 10–12 minutes.', 'Finish with sesame seeds and serve with greens.']
          }
        },
        'southern-bluefin-tuna': {
          name: 'Southern bluefin tuna',
          scientific: 'Thunnus maccoyii',
          group: 'fish',
          image: 'assets/species-southern-bluefin-tuna.png',
          imageAlt: 'Southern bluefin tuna in open ocean',
          summary: 'A powerful open-ocean species found along Victoria’s offshore coast and one of the community’s most ambitious tracked fish.',
          size: 'No minimum',
          bag: 'Combined total of 2 southern bluefin, yellowfin and bigeye tuna',
          note: 'Statewide possession limit: 2 fish or less than 160 kg in any other form. Keep whole or in carcass form on Victorian waters.',
          rulesUrl: 'https://vfa.vic.gov.au/recreational-fishing/recreational-fishing-guide/catch-limits-and-closed-seasons/types-of-fish/marine-and-estuarine-scale-fish/tuna-southern-bluefin-yellowfin-and-big-eye',
          recipe: {
            title: 'Pepper-crusted tuna with warm tomato salad', time: '25 min', serves: 'Serves 4',
            ingredients: ['4 tuna steaks', 'Cracked black pepper', 'Cherry tomatoes', 'Capers', 'Lemon and olive oil'],
            method: ['Coat the tuna lightly with oil and cracked pepper.', 'Sear in a hot pan to your preferred doneness.', 'Warm tomatoes and capers in the same pan.', 'Rest the tuna, slice and serve with lemon and the tomato salad.']
          }
        }
      };
      let forecastRequest = null;

      function persist() {
        try {
          localStorage.setItem(storageKey, JSON.stringify({
            region: state.region,
            vote: state.vote,
            appearance: state.dark ? 'dark' : 'light'
          }));
        } catch {
          // Direct file previews can restrict storage; the local server does not.
        }
      }
      function showToast(message) {
        const toast = root.querySelector('[data-action-toast]');
        clearTimeout(toastTimer);
        toast.classList.remove('toast-leaving');
        root.querySelector('[data-action-toast-copy]').textContent = message;
        toast.hidden = false;
        toastTimer = window.setTimeout(() => {
          toast.classList.add('toast-leaving');
          window.setTimeout(() => { toast.hidden = true; toast.classList.remove('toast-leaving'); }, 220);
        }, 3200);
      }

      function showSubmissionAcknowledgement(type) {
        const dialog = root.querySelector('#submission-acknowledgement');
        const recipe = type === 'recipe';
        root.querySelector('[data-acknowledgement-title]').textContent = recipe ? 'Your recipe is with the moderators' : 'Your catch is with the moderators';
        root.querySelector('[data-acknowledgement-copy]').textContent = recipe ? 'Thanks for contributing to the community cookbook.' : 'Thanks for entering the community competition.';
        root.querySelector('[data-acknowledgement-next]').textContent = recipe ? 'We will review the recipe and finished-dish photo. The decision will appear in My submissions.' : 'We will review the ruler and hero photos. The decision will appear in My submissions.';
        dialog.showModal();
      }
      function renderRegion() {
        root.querySelector('.region-select').value = state.region;
        root.querySelector('#region-title').textContent = state.region;
      }
      function cardinalDirection(degrees) {
        if (!Number.isFinite(degrees)) return '—';
        const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        return points[Math.round(degrees / 45) % points.length];
      }
      function moonPhase(value) {
        if (!Number.isFinite(value)) return '—';
        if (value < 0.03 || value >= 0.97) return 'New moon';
        if (value < 0.22) return 'Waxing crescent';
        if (value < 0.28) return 'First quarter';
        if (value < 0.47) return 'Waxing gibbous';
        if (value < 0.53) return 'Full moon';
        if (value < 0.72) return 'Waning gibbous';
        if (value < 0.78) return 'Last quarter';
        return 'Waning crescent';
      }
      function conditionGuide(wind, swell, rain) {
        if (wind <= 8 && swell <= 0.8 && rain <= 25) return { label: 'Promising', className: 'best' };
        if (wind <= 12 && swell <= 1.2 && rain <= 40) return { label: 'Fair', className: '' };
        if (wind <= 17 && swell <= 1.8) return { label: 'Mixed', className: 'watch' };
        return { label: 'Rough', className: 'rough' };
      }
      function formatNumber(value, digits = 0) {
        return Number.isFinite(value) ? value.toFixed(digits) : '—';
      }
      function setMetric(name, value) {
        const metric = root.querySelector(`[data-weather="${name}"]`);
        if (metric) metric.textContent = value;
      }
      function renderForecast(days, region) {
        const formatter = new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
        const container = root.querySelector('.forecast-days');
        container.innerHTML = days.map((day) => {
          const guide = conditionGuide(day.windSpeed, day.swellHeight, day.rainChance);
          return `<div class="forecast-day ${guide.className}">
            <span>${formatter.format(new Date(`${day.date}T12:00:00`))}</span>
            <strong>${guide.label}</strong>
            <span>${cardinalDirection(day.windDirection)} ${formatNumber(day.windSpeed)} kn wind</span>
            <span>${formatNumber(day.swellHeight, 1)} m swell · ${formatNumber(day.swellPeriod)} s</span>
            <span>${formatNumber(day.rainChance)}% rain</span>
          </div>`;
        }).join('');
        const today = days[0];
        setMetric('swell', `${formatNumber(today.swellHeight, 1)} m ${cardinalDirection(today.swellDirection)}`);
        setMetric('wind', `${formatNumber(today.windSpeed)} kn ${cardinalDirection(today.windDirection)}`);
        setMetric('moon', moonPhase(today.moon));
        setMetric('updated', new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit' }).format(new Date()));
        root.querySelector('[data-forecast-note]').textContent = `${region.point}. Automated guide only; not navigation or safety advice.`;
      }
      function renderForecastError(message) {
        root.querySelector('.forecast-days').innerHTML = `<div class="forecast-message"><span>${message}</span><button class="button-secondary forecast-retry" type="button">Try again</button></div>`;
        ['swell', 'wind', 'moon', 'updated'].forEach((name) => setMetric(name, '—'));
      }
      async function loadForecast() {
        const region = regions[state.region];
        const panel = root.querySelector('.forecast-panel');
        forecastRequest?.abort();
        forecastRequest = new AbortController();
        panel.setAttribute('aria-busy', 'true');
        root.querySelector('.forecast-days').innerHTML = '<div class="forecast-message">Loading regional conditions…</div>';
        const params = new URLSearchParams({
          latitude: region.latitude,
          longitude: region.longitude,
          timezone: 'Australia/Sydney',
          forecast_days: '7'
        });
        const weatherParams = new URLSearchParams(params);
        weatherParams.set('daily', 'precipitation_probability_max,wind_speed_10m_max,wind_direction_10m_dominant,moon_phase');
        weatherParams.set('wind_speed_unit', 'kn');
        const marineParams = new URLSearchParams(params);
        marineParams.set('daily', 'wave_height_max,swell_wave_height_max,swell_wave_direction_dominant,swell_wave_period_max');
        marineParams.set('cell_selection', 'sea');
        try {
          const [weatherResponse, marineResponse] = await Promise.all([
            fetch(`https://api.open-meteo.com/v1/forecast?${weatherParams}`, { signal: forecastRequest.signal }),
            fetch(`https://marine-api.open-meteo.com/v1/marine?${marineParams}`, { signal: forecastRequest.signal })
          ]);
          if (!weatherResponse.ok || !marineResponse.ok) throw new Error('Forecast service unavailable');
          const [weatherData, marineData] = await Promise.all([weatherResponse.json(), marineResponse.json()]);
          const days = weatherData.daily.time.map((date, index) => ({
            date,
            rainChance: weatherData.daily.precipitation_probability_max[index],
            windSpeed: weatherData.daily.wind_speed_10m_max[index],
            windDirection: weatherData.daily.wind_direction_10m_dominant[index],
            moon: weatherData.daily.moon_phase[index],
            swellHeight: marineData.daily.swell_wave_height_max[index],
            swellDirection: marineData.daily.swell_wave_direction_dominant[index],
            swellPeriod: marineData.daily.swell_wave_period_max[index]
          }));
          renderForecast(days, region);
        } catch (error) {
          if (error.name !== 'AbortError') renderForecastError('Live forecast is temporarily unavailable.');
        } finally {
          if (!forecastRequest.signal.aborted) panel.setAttribute('aria-busy', 'false');
        }
      }
      function renderVote() {
        const votes = liveVotes ? { ...liveVotes } : { ...baseVotes };
        const total = Object.values(votes).reduce((sum, value) => sum + value, 0);
        const labels = Object.keys(votes).reduce((result, slug) => {
          result[slug] = voteLabels[slug] || trackedSpecies[slug]?.name || slug;
          return result;
        }, {});
        const voteList = root.querySelector('[data-vote-list]');
        voteList.innerHTML = Object.entries(votes).map(([key, value]) => {
          const percent = total ? Math.round((value / total) * 100) : 0;
          return `<button class="vote-option" type="button" data-vote="${escapeHtml(key)}" aria-pressed="${state.vote === key}"><span class="vote-top"><span>${escapeHtml(labels[key])}</span><strong data-percent="${escapeHtml(key)}">${percent}%</strong></span><span class="vote-track"><span class="vote-fill" data-fill="${escapeHtml(key)}" style="width:${percent}%"></span></span></button>`;
        }).join('');
        voteList.querySelectorAll('[data-vote]').forEach(button => button.addEventListener('click', () => handleVote(button.dataset.vote)));
        Object.entries(votes).forEach(([key, value]) => {
          const percent = total ? Math.round((value / total) * 100) : 0;
          const percentLabel = root.querySelector(`[data-percent="${key}"]`);
          const fill = root.querySelector(`[data-fill="${key}"]`);
          const option = root.querySelector(`[data-vote="${key}"]`);
          if (percentLabel) percentLabel.textContent = `${percent}%`;
          if (fill) fill.style.width = `${percent}%`;
          if (option) option.setAttribute('aria-pressed', String(state.vote === key));
        });
        let message = `Preview vote total: ${total}. Sign in to cast a live vote.`;
        if (communityDataStatus === 'loading') message = 'Connecting to the community vote...';
        if (communityDataStatus === 'unavailable') message = 'The live vote is temporarily unavailable. Preview results are shown.';
        if (communityDataStatus === 'live' && !activeBallot) message = 'There is no community ballot open right now.';
        if (communityDataStatus === 'live' && activeBallot) {
          message = currentSession ? `Choose one species. Current vote total: ${total}.` : `Sign in to vote. Current vote total: ${total}.`;
          if (state.vote) message = `Your vote: ${labels[state.vote] || state.vote}. Current vote total: ${total}.`;
        }
        root.querySelector('#vote-status').textContent = message;
      }

      function renderActiveChallenge() {
        if (!activeChallenge) return;
        const species = activeChallenge.species;
        const start = new Date(`${activeChallenge.starts_on}T12:00:00`);
        const end = new Date(`${activeChallenge.ends_on}T23:59:59`);
        const month = start.toLocaleString('en-AU', { month: 'long' });
        const days = Math.max(0, Math.ceil((end - new Date()) / 86400000));
        root.querySelector('[data-challenge-eyebrow]').textContent = `Species of the month · ${days} day${days === 1 ? '' : 's'} left`;
        root.querySelector('[data-challenge-title]').innerHTML = `${escapeHtml(month)} <span>${escapeHtml(species.common_name)} Challenge</span>`;
        root.querySelector('[data-challenge-description]').textContent = activeChallenge.description || 'Enter your best verified catch. Only your largest approved fish counts.';
        root.querySelector('[data-challenge-action]').textContent = `Enter ${month}`;
        root.querySelector('[data-leaderboard-eyebrow]').textContent = `${month} ${species.common_name} challenge`;
      }

      function ensureLeaderboardTabs() {
        if (root.querySelector('[data-leaderboard-tabs]')) return;
        const panel = root.querySelector('[data-leaderboard-rows]').closest('.panel');
        const tabs = document.createElement('div');
        tabs.className = 'leaderboard-tabs';
        tabs.dataset.leaderboardTabs = '';
        tabs.setAttribute('role', 'tablist');
        tabs.setAttribute('aria-label', 'Leaderboard view');
        [['monthly', 'Monthly'], ['species', 'All species'], ['yearly', 'Yearly community']].forEach(([mode, label]) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.dataset.leaderboardMode = mode;
          button.setAttribute('role', 'tab');
          button.textContent = label;
          button.addEventListener('click', () => {
            leaderboardMode = mode;
            renderLeaderboard();
          });
          tabs.append(button);
        });
        panel.querySelector('.panel-head').insertAdjacentElement('afterend', tabs);
      }

      function memberName(row) {
        return row.display_name && row.display_name !== 'New member' ? row.display_name : 'Community member';
      }

      function renderLeaderboard() {
        ensureLeaderboardTabs();
        const container = root.querySelector('[data-leaderboard-rows]');
        const panel = container.closest('.panel');
        const rows = leaderboardData[leaderboardMode] || [];
        const title = panel.querySelector('h2');
        const description = panel.querySelector('.panel-head p');
        const scoreStrip = panel.querySelector('.score-strip');
        root.querySelectorAll('[data-leaderboard-mode]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.leaderboardMode === leaderboardMode)));
        if (leaderboardMode === 'monthly') {
          title.textContent = 'Monthly catch leaderboard';
          description.textContent = 'Your single best verified catch counts. Placement bonuses remain provisional until the month closes.';
          scoreStrip.hidden = false;
        } else if (leaderboardMode === 'species') {
          title.textContent = `${new Date().getFullYear()} All Species Cup`;
          description.textContent = 'Your best verified catch for each tracked species counts once across the year.';
          scoreStrip.hidden = true;
        } else {
          title.textContent = `${new Date().getFullYear()} community standings`;
          description.textContent = 'Catch points plus published recipes and other recognised community contributions.';
          scoreStrip.hidden = true;
        }
        if (!rows?.length) {
          const empty = leaderboardMode === 'monthly' ? 'Standings begin with the first approved, length-verified entry.' : 'Standings will appear after the first qualifying contribution.';
          container.innerHTML = `<div class="leader-empty"><i data-lucide="flag" aria-hidden="true"></i><span>${empty}</span></div>`;
          if (globalThis.lucide) globalThis.lucide.createIcons({ attrs: { width: 16, height: 16 } });
          return;
        }
        container.innerHTML = rows.slice(0, 6).map((row, index) => {
          const detail = leaderboardMode === 'monthly'
            ? `${Number(row.best_length_cm).toFixed(1)} cm · 15 entry + ${row.placement_bonus} bonus`
            : leaderboardMode === 'species'
              ? `${row.species_entered} tracked species · ${row.submission_points} entry + ${row.placement_bonus} bonus`
              : `${row.catch_points} catch + ${row.contribution_points} contribution`;
          return `<div class="leader-row"><span class="rank">${leaderboardMode === 'monthly' ? row.rank : index + 1}</span><span><strong><a class="member-profile-link" href="${memberProfileUrl(row.username)}">${escapeHtml(memberName(row))}</a></strong><span class="leader-meta">${detail}</span></span><strong>${row.points} pts</strong></div>`;
        }).join('');
      }

      function publicCommunityPhoto(path) {
        return supabaseClient.storage.from('community-images').getPublicUrl(path).data.publicUrl;
      }

      function stopMastheadRotation() {
        if (mastheadTimer) clearInterval(mastheadTimer);
        mastheadTimer = null;
      }

      function showMastheadSlide(index, announce = false) {
        if (!mastheadSlides.length) return;
        mastheadSlideIndex = (index + mastheadSlides.length) % mastheadSlides.length;
        const slide = mastheadSlides[mastheadSlideIndex];
        const photo = root.querySelector('[data-mast-photo]');
        const credit = root.querySelector('[data-mast-credit]');
        photo.style.opacity = '0';
        window.setTimeout(() => {
          photo.src = publicCommunityPhoto(slide.public_photo_path);
          photo.alt = `${slide.display_name} with a featured ${slide.species_name} catch`;
          photo.style.opacity = '1';
        }, 160);
        credit.href = `species/${encodeURIComponent(slide.species_slug)}/#records`;
        credit.textContent = `${slide.display_name} · ${slide.species_name} · ${Number(slide.length_cm).toFixed(1)} cm`;
        credit.hidden = false;
        credit.setAttribute('aria-live', announce ? 'polite' : 'off');
        root.querySelectorAll('[data-mast-dot]').forEach((dot, dotIndex) => {
          dot.setAttribute('aria-current', String(dotIndex === mastheadSlideIndex));
        });
      }

      function startMastheadRotation() {
        stopMastheadRotation();
        if (mastheadSlides.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        mastheadTimer = window.setInterval(() => showMastheadSlide(mastheadSlideIndex + 1), 6000);
      }

      function configureMastheadSlideshow(rows) {
        mastheadSlides = rows.filter(row => row.homepage_featured);
        const mastImage = root.querySelector('[data-mast-image]');
        const controls = root.querySelector('[data-mast-controls]');
        const dots = root.querySelector('[data-mast-dots]');
        mastImage.classList.toggle('has-slides', mastheadSlides.length > 1);
        controls.hidden = mastheadSlides.length < 2;
        dots.innerHTML = mastheadSlides.map((slide, index) => `<button class="mast-dot" type="button" data-mast-dot="${index}" aria-label="Show ${escapeHtml(slide.display_name)}’s ${escapeHtml(slide.species_name)}" aria-current="${index === 0}"></button>`).join('');
        dots.querySelectorAll('[data-mast-dot]').forEach(dot => dot.addEventListener('click', () => {
          showMastheadSlide(Number(dot.dataset.mastDot), true);
          startMastheadRotation();
        }));
        if (mastheadSlides.length) showMastheadSlide(0);
        startMastheadRotation();
        if (globalThis.lucide) globalThis.lucide.createIcons({ attrs: { width: 16, height: 16 } });
      }

      function renderHomepageShowcase(rows) {
        if (!rows?.length) return;
        const grid = root.querySelector('#community-entries');
        grid.innerHTML = rows.slice(0, 8).map(row => {
          const member = row.instagram_handle ? `@${row.instagram_handle}` : row.display_name;
          return `<a class="entry-photo ${row.homepage_featured ? 'featured' : ''}" href="species/${encodeURIComponent(row.species_slug)}/#records" aria-label="View ${escapeHtml(row.display_name)}’s ${escapeHtml(row.species_name)} catch">
            <img src="${escapeHtml(publicCommunityPhoto(row.public_photo_path))}" alt="${escapeHtml(row.display_name)} with an approved ${escapeHtml(row.species_name)} catch" loading="lazy">
            <span class="entry-label">${escapeHtml(row.species_name)} · ${Number(row.length_cm).toFixed(1)} cm · ${escapeHtml(member)}</span>
          </a>`;
        }).join('');

        configureMastheadSlideshow(rows);
      }

      async function loadHomepageShowcase() {
        const { data, error } = await supabaseClient.rpc('get_homepage_showcase', { target_limit: 8 });
        if (error) throw error;
        renderHomepageShowcase(data || []);
      }
      function renderAppearance() {
        site.classList.toggle('dark-preview', state.dark);
        document.documentElement.classList.toggle('dark-mode', state.dark);
        const toggle = root.querySelector('.theme-toggle');
        toggle.innerHTML = `<i data-lucide="${state.dark ? 'sun' : 'moon'}" aria-hidden="true"></i>`;
        if (globalThis.lucide) globalThis.lucide.createIcons({ attrs: { width: 16, height: 16 } });
        toggle.setAttribute('aria-pressed', String(state.dark));
        toggle.setAttribute('aria-label', state.dark ? 'Switch to light mode' : 'Switch to dark mode');
      }
      const memberDialog = root.querySelector('#member-dialog');

      function setAuthStatus(message) {
        root.querySelector('[data-auth-status]').textContent = message || '';
      }

      function escapeHtml(value = '') {
        return String(value).replace(/[&<>'"]/g, character => ({
          '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        })[character]);
      }

      function formatMemberDate(value) {
        if (!value) return '';
        return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
      }

      function renderMemberNotifications() {
        const unread = currentSession ? memberSubmissions.filter(submission => submission.notification_unread).length : 0;
        const headerBadge = root.querySelector('[data-notification-badge]');
        const tabBadge = root.querySelector('[data-submission-tab-badge]');
        [headerBadge, tabBadge].forEach(badge => {
          badge.textContent = unread > 9 ? '9+' : String(unread);
          badge.hidden = unread === 0;
        });
      }

      function memberPhotoUrl(submission) {
        if (submission.public_photo_path) {
          return supabaseClient.storage.from('community-images').getPublicUrl(submission.public_photo_path).data.publicUrl;
        }
        return memberPhotoUrls.get(submission.hero_photo_path) || null;
      }

      function renderMySubmissions() {
        const container = root.querySelector('[data-my-submissions]');
        if (!currentSession) {
          container.innerHTML = '<div class="submission-list-message">Sign in to see your catch updates.</div>';
          return;
        }
        if (!memberSubmissions.length) {
          container.innerHTML = '<div class="submission-list-message">Your submitted catches will appear here with their moderation status.</div>';
          return;
        }
        container.innerHTML = memberSubmissions.slice(0, 20).map(submission => {
          const photoUrl = memberPhotoUrl(submission);
          const isRecipe = submission.length_cm == null;
          const title = isRecipe ? submission.submission_title : (submission.species_name || submission.submission_title || 'Catch submission');
          const status = submission.submission_status;
          const statusCopy = status === 'approved'
            ? (isRecipe ? 'Approved and published in the community cookbook.' : 'Approved and added to the clubhouse records.')
            : status === 'rejected'
              ? submission.moderation_note || 'This entry did not meet the competition requirements.'
              : (isRecipe ? 'Waiting for a moderator to review the recipe and finished-dish photo.' : 'Waiting for a moderator to review the photos and measurement.');
          const recordLink = status === 'approved' && submission.species_slug
            ? `<a class="member-submission-link" href="species/${encodeURIComponent(submission.species_slug)}/${isRecipe ? '#recipes' : '#records'}"><i data-lucide="${isRecipe ? 'utensils' : 'trophy'}" aria-hidden="true"></i> View ${isRecipe ? 'published recipe' : 'species records'}</a>`
            : '';
          const recoveryActions = `<div class="member-submission-actions">${status === 'rejected' ? `<button class="button-secondary" type="button" data-resubmit-submission="${submission.submission_id}" data-submission-type="${isRecipe ? 'recipe' : 'catch'}"><i data-lucide="refresh-cw" aria-hidden="true"></i> Correct and resubmit</button>` : ''}<button class="submission-delete" type="button" data-delete-submission="${submission.submission_id}" data-submission-status="${escapeHtml(status)}"><i data-lucide="trash-2" aria-hidden="true"></i> Delete</button></div>`;
          return `<article class="member-submission ${submission.notification_unread ? 'unread' : ''}">
            <div class="member-submission-media">${photoUrl ? `<img src="${escapeHtml(photoUrl)}" alt="Your ${escapeHtml(title)} submission">` : '<i data-lucide="fish" aria-hidden="true"></i>'}</div>
            <div class="member-submission-body">
              <div class="member-submission-top"><strong>${escapeHtml(title)}</strong><span class="submission-state ${escapeHtml(status)}">${escapeHtml(status)}</span></div>
              <div class="member-submission-meta">${isRecipe ? '<span>Community recipe</span>' : `<span>${Number(submission.length_cm).toFixed(1)} cm</span>`}<span>Submitted ${escapeHtml(formatMemberDate(submission.submitted_at))}</span>${submission.reviewed_at ? `<span>Reviewed ${escapeHtml(formatMemberDate(submission.reviewed_at))}</span>` : ''}</div>
              <p class="member-submission-note ${status === 'rejected' ? 'rejected' : ''}">${escapeHtml(statusCopy)}</p>
              ${recordLink}
              ${recoveryActions}
            </div>
          </article>`;
        }).join('');
        container.querySelectorAll('[data-resubmit-submission]').forEach(button => button.addEventListener('click', () => beginResubmission(button.dataset.resubmitSubmission, button.dataset.submissionType)));
        container.querySelectorAll('[data-delete-submission]').forEach(button => button.addEventListener('click', () => deleteMemberSubmission(button.dataset.deleteSubmission, button.dataset.submissionStatus)));
        if (globalThis.lucide) globalThis.lucide.createIcons({ attrs: { width: 16, height: 16 } });
      }

      async function privateSubmissionPhotoPaths(submissionId) {
        const { data } = await supabaseClient.from('submission_photos').select('storage_path').eq('submission_id', submissionId);
        return (data || []).map(photo => photo.storage_path);
      }

      async function publishedSubmissionPhotoPaths(submission) {
        const paths = submission.public_photo_path ? [submission.public_photo_path] : [];
        const { data } = await supabaseClient.from('recipes').select('public_photo_paths').eq('submission_id', submission.submission_id).maybeSingle();
        return [...new Set([...paths, ...(data?.public_photo_paths || [])])];
      }

      async function removeMemberSubmission(submissionId) {
        const submission = memberSubmissions.find(item => item.submission_id === submissionId);
        const privatePaths = await privateSubmissionPhotoPaths(submissionId);
        const publicPaths = submission ? await publishedSubmissionPhotoPaths(submission) : [];
        if (publicPaths.length) {
          const { error } = await supabaseClient.storage.from('community-images').remove(publicPaths);
          if (error) throw error;
        }
        const { error } = await supabaseClient.rpc('delete_my_submission', { target_submission_id: submissionId });
        if (error) throw error;
        if (privatePaths.length) await supabaseClient.storage.from('submission-photos').remove(privatePaths);
      }

      async function deleteMemberSubmission(submissionId, status) {
        const warning = status === 'approved'
          ? 'Delete this published submission? It will be removed from public pages, records and scoring. This cannot be undone.'
          : 'Delete this submission and its photos? This cannot be undone.';
        if (!confirm(warning)) return;
        try {
          await removeMemberSubmission(submissionId);
          await loadMemberSubmissions();
          showToast('Submission deleted.');
        } catch (error) { showToast(error.message || 'The submission could not be deleted.'); }
      }

      function beginResubmission(submissionId, type) {
        replacingSubmissionId = submissionId;
        memberDialog.close();
        const dialog = root.querySelector(type === 'recipe' ? '#recipe-submission' : '#catch-submission');
        const status = root.querySelector(type === 'recipe' ? '[data-recipe-submission-status]' : '[data-submission-status]');
        status.textContent = 'Add your corrected details and replacement photos. The rejected entry stays in your account until this replacement is received.';
        dialog.showModal();
      }

      async function finishReplacement() {
        if (!replacingSubmissionId) return;
        const replacedId = replacingSubmissionId;
        replacingSubmissionId = null;
        try { await removeMemberSubmission(replacedId); }
        catch (error) { console.warn('Replacement saved but rejected original was retained', error); }
      }

      async function loadMemberSubmissions() {
        memberSubmissions = [];
        memberPhotoUrls = new Map();
        if (!supabaseClient || !currentSession) {
          renderMemberNotifications();
          renderMySubmissions();
          return;
        }
        const { data, error } = await supabaseClient.rpc('get_my_submissions');
        if (error) throw error;
        memberSubmissions = data || [];
        await Promise.all(memberSubmissions.slice(0, 20).filter(submission => !submission.public_photo_path && submission.hero_photo_path).map(async submission => {
          const { data: signed } = await supabaseClient.storage.from('submission-photos').createSignedUrl(submission.hero_photo_path, 600);
          if (signed?.signedUrl) memberPhotoUrls.set(submission.hero_photo_path, signed.signedUrl);
        }));
        renderMemberNotifications();
        renderMySubmissions();
      }

      async function markSubmissionNotificationsSeen() {
        if (!supabaseClient || !currentSession || !memberSubmissions.some(submission => submission.notification_unread)) return;
        const { error } = await supabaseClient.rpc('mark_my_submission_notifications_seen');
        if (error) return;
        memberSubmissions = memberSubmissions.map(submission => ({ ...submission, notification_unread: false }));
        renderMemberNotifications();
        renderMySubmissions();
      }

      function setMemberTab(tab, acknowledge = true) {
        activeMemberTab = tab;
        root.querySelectorAll('[data-member-tab]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.memberTab === tab)));
        root.querySelectorAll('[data-member-panel]').forEach(panel => { panel.hidden = panel.dataset.memberPanel !== tab; });
        if (tab === 'submissions' && acknowledge) markSubmissionNotificationsSeen();
      }

      function renderAuth() {
        const user = currentSession?.user;
        const signedIn = Boolean(user);
        root.querySelector('[data-signed-out-view]').hidden = signedIn;
        root.querySelector('[data-signed-in-view]').hidden = !signedIn;
        root.querySelector('[data-auth-label]').textContent = signedIn ? 'My account' : 'Member sign in';
        root.querySelector('[data-auth-trigger]').setAttribute('aria-label', signedIn ? 'Open my member profile' : 'Member sign in');
        root.querySelector('#member-dialog-title').textContent = signedIn ? 'Your member account' : 'Sign in to participate';
        if (signedIn) {
          const displayName = memberProfile?.display_name || user.user_metadata?.display_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Community member';
          root.querySelector('[data-member-name]').textContent = displayName;
          root.querySelector('[data-member-email]').textContent = user.email || '';
          const profileForm = root.querySelector('[data-profile-form]');
          profileForm.elements.display_name.value = memberProfile?.display_name === 'New member' ? '' : memberProfile?.display_name || '';
          profileForm.elements.username.value = memberProfile?.username || '';
          root.querySelector('[data-profile-origin]').textContent = `${location.host}/`;
          profileForm.elements.instagram_handle.value = memberProfile?.instagram_handle || '';
          profileForm.elements.show_instagram.checked = Boolean(memberProfile?.show_instagram_on_catches);
          profileForm.elements.public_profile_enabled.checked = Boolean(memberProfile?.public_profile_enabled);
          profileForm.elements.show_catches_on_profile.checked = memberProfile?.show_catches_on_profile !== false;
          profileForm.elements.show_recipes_on_profile.checked = memberProfile?.show_recipes_on_profile !== false;
          renderProfilePrivacy();
          renderMemberAvatar();
          renderConnectedAccounts();
        }
        root.querySelector('[data-staff-link]').hidden = !['moderator', 'admin'].includes(memberProfile?.role);
        renderMemberNotifications();
        renderMySubmissions();
        setMemberTab(activeMemberTab, false);
        if (globalThis.lucide) globalThis.lucide.createIcons({ attrs: { width: 16, height: 16 } });
      }

      function openAuthDialog(message = '') {
        setAuthStatus(message);
        renderAuth();
        if (currentSession) setMemberTab(memberSubmissions.some(submission => submission.notification_unread) ? 'submissions' : activeMemberTab);
        if (!memberDialog.open) memberDialog.showModal();
      }

      async function loadMemberProfile() {
        if (!supabaseClient || !currentSession) {
          memberProfile = null;
          memberIdentities = [];
          return;
        }
        const [{ data, error }, identityResult] = await Promise.all([
          supabaseClient.from('profiles').select('username,display_name,avatar_url,instagram_handle,show_instagram_on_catches,public_profile_enabled,show_catches_on_profile,show_recipes_on_profile,role').eq('id', currentSession.user.id).single(),
          supabaseClient.auth.getUserIdentities()
        ]);
        if (error) throw error;
        memberProfile = data;
        memberIdentities = identityResult.data?.identities || currentSession.user.identities || [];
      }

      function renderConnectedAccounts() {
        const connected = new Set(memberIdentities.map(identity => identity.provider));
        root.querySelectorAll('[data-connected-provider]').forEach(row => {
          const provider = row.dataset.connectedProvider;
          const isConnected = connected.has(provider);
          row.querySelector('[data-provider-state]').textContent = isConnected ? 'Connected to this profile' : 'Not connected';
          const button = row.querySelector('[data-link-provider]');
          button.textContent = isConnected ? 'Connected' : 'Connect';
          button.disabled = isConnected;
        });
      }

      async function linkProvider(event) {
        const button = event.currentTarget;
        const provider = button.dataset.linkProvider;
        const status = root.querySelector('[data-link-status]');
        if (!supabaseClient || !currentSession) return;
        button.disabled = true;
        status.textContent = `Opening ${provider === 'google' ? 'Google' : 'Facebook'} to connect it...`;
        const redirectTo = `${location.origin}${location.pathname}?account-linked=${provider}#home`;
        const { error } = await supabaseClient.auth.linkIdentity({
          provider,
          options: {
            redirectTo,
            ...(provider === 'facebook' ? { scopes: 'email,public_profile' } : {})
          }
        });
        if (error) {
          button.disabled = false;
          status.textContent = /manual|linking.*disabled/i.test(error.message)
            ? 'Account linking still needs to be enabled in the site settings.'
            : `Could not connect ${provider === 'google' ? 'Google' : 'Facebook'}: ${error.message}`;
        }
      }

      async function saveMemberProfile(event) {
        event.preventDefault();
        if (!supabaseClient || !currentSession) return;
        const form = event.currentTarget;
        const status = root.querySelector('[data-profile-status]');
        const button = form.querySelector('button[type="submit"]');
        const displayName = form.elements.display_name.value.trim();
        const username = form.elements.username.value.trim().toLowerCase();
        const handle = form.elements.instagram_handle.value.trim().replace(/^@+/, '');
        const avatarFile = form.elements.profile_photo.files[0];
        if (displayName.length < 2 || displayName.length > 50) {
          status.textContent = 'Choose a display name between 2 and 50 characters.';
          return;
        }
        if (handle && !/^[A-Za-z0-9._]{1,30}$/.test(handle)) {
          status.textContent = 'Use letters, numbers, full stops or underscores only.';
          return;
        }
        if (!/^[a-z0-9][a-z0-9_-]{2,29}$/.test(username) || ['admin', 'assets', 'data', 'members', 'safety', 'species', 'supabase'].includes(username)) {
          status.textContent = 'Choose a unique profile address using 3–30 lowercase letters, numbers, dashes or underscores.';
          return;
        }
        if (avatarFile && (!['image/jpeg', 'image/png', 'image/webp'].includes(avatarFile.type) || avatarFile.size > 5 * 1024 * 1024)) {
          status.textContent = 'Choose a JPG, PNG or WebP profile photo no larger than 5MB.';
          return;
        }
        button.disabled = true;
        status.textContent = 'Saving profile...';
        const previousAvatarPath = memberProfile?.avatar_url || null;
        let avatarPath = avatarRemovalRequested ? null : previousAvatarPath;
        let uploadedAvatarPath = null;
        try {
          if (avatarFile) {
            const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[avatarFile.type];
            avatarPath = `${currentSession.user.id}/avatar.${extension}`;
            const { error: uploadError } = await supabaseClient.storage
              .from('profile-images')
              .upload(avatarPath, avatarFile, { upsert: true, contentType: avatarFile.type });
            if (uploadError) throw uploadError;
            uploadedAvatarPath = avatarPath;
          }
          const { error } = await supabaseClient.from('profiles').update({
            display_name: displayName,
            username,
            avatar_url: avatarPath,
            instagram_handle: handle || null,
            show_instagram_on_catches: Boolean(handle && form.elements.show_instagram.checked),
            public_profile_enabled: form.elements.public_profile_enabled.checked,
            show_catches_on_profile: form.elements.show_catches_on_profile.checked,
            show_recipes_on_profile: form.elements.show_recipes_on_profile.checked
          }).eq('id', currentSession.user.id);
          if (error) throw error;
          if (previousAvatarPath && previousAvatarPath !== avatarPath) {
            await supabaseClient.storage.from('profile-images').remove([previousAvatarPath]);
          }
          await loadMemberProfile();
          avatarRemovalRequested = false;
          form.elements.profile_photo.value = '';
          renderAuth();
          status.textContent = 'Profile saved.';
          showToast('Profile saved');
        } catch (error) {
          if (uploadedAvatarPath && uploadedAvatarPath !== previousAvatarPath) {
            await supabaseClient.storage.from('profile-images').remove([uploadedAvatarPath]);
          }
          status.textContent = 'Your profile could not be saved. Please try again.';
        } finally {
          button.disabled = false;
        }
      }

      function profileNeedsSetup() {
        return currentSession && (!memberProfile?.display_name || memberProfile.display_name === 'New member');
      }

      function renderProfilePrivacy() {
        const form = root.querySelector('[data-profile-form]');
        const enabled = Boolean(form.elements.public_profile_enabled.checked);
        form.querySelectorAll('.profile-dependent input').forEach(input => { input.disabled = !enabled; });
        const link = root.querySelector('[data-public-profile-link]');
        link.hidden = !enabled || !currentSession;
        if (enabled && currentSession) link.href = memberProfileUrl(memberProfile?.username);
      }

      function memberProfileUrl(username) {
        return username ? `${location.origin}/${encodeURIComponent(username.toLowerCase())}/` : 'members/';
      }

      async function renderMemberAvatar() {
        const summaryImage = root.querySelector('[data-member-avatar-image]');
        const summaryIcon = root.querySelector('[data-member-avatar-icon]');
        const previewImage = root.querySelector('[data-profile-photo-preview]');
        const previewIcon = root.querySelector('[data-profile-photo-icon]');
        const removeButton = root.querySelector('[data-remove-profile-photo]');
        let url = '';
        if (memberProfile?.avatar_url && supabaseClient) {
          const { data } = await supabaseClient.storage.from('profile-images').createSignedUrl(memberProfile.avatar_url, 3600);
          url = data?.signedUrl || '';
        }
        [summaryImage, previewImage].forEach(image => {
          image.hidden = !url;
          if (url) image.src = url;
        });
        summaryIcon.hidden = Boolean(url);
        previewIcon.hidden = Boolean(url);
        removeButton.hidden = !memberProfile?.avatar_url;
      }

      async function loadSpeciesDirectory() {
        const { data, error } = await supabaseClient
          .from('species')
          .select('id,slug,common_name')
          .eq('is_active', true)
          .order('common_name', { ascending: true });
        if (error) throw error;
        trackedSpeciesIds = Object.fromEntries((data || []).map(species => [species.slug, species.id]));
        root.querySelectorAll('.submission-form select[name="species"]').forEach(select => {
          const selected = select.value;
          const placeholder = document.createElement('option');
          placeholder.value = '';
          placeholder.textContent = 'Choose a tracked species';
          select.replaceChildren(placeholder, ...(data || []).map(species => {
            const option = document.createElement('option');
            option.value = species.slug;
            option.textContent = species.common_name;
            return option;
          }));
          if (selected && trackedSpeciesIds[selected]) select.value = selected;
        });
      }

      async function loadVoteData() {
        const now = new Date().toISOString();
        const { data: ballots, error: ballotError } = await supabaseClient
          .from('ballots')
          .select('id,title,closes_at')
          .lte('opens_at', now)
          .gte('closes_at', now)
          .order('closes_at', { ascending: true })
          .limit(1);
        if (ballotError) throw ballotError;

        activeBallot = ballots?.[0] || null;
        root.querySelector('[data-ballot-title]').textContent = activeBallot?.title || 'Choose the next Species of the Month';
        state.vote = null;
        speciesIdsBySlug = {};
        liveVotes = activeBallot ? {} : Object.fromEntries(Object.keys(baseVotes).map(key => [key, 0]));
        voteLabels = {};

        if (activeBallot) {
          const { data: totals, error: totalsError } = await supabaseClient
            .rpc('get_species_vote_totals', { target_ballot_id: activeBallot.id });
          if (totalsError) throw totalsError;
          totals.forEach(row => {
            liveVotes[row.slug] = row.votes;
            voteLabels[row.slug] = row.common_name;
            speciesIdsBySlug[row.slug] = row.species_id;
          });

          if (currentSession) {
            const { data: memberVote, error: voteError } = await supabaseClient
              .from('species_votes')
              .select('species_id')
              .eq('ballot_id', activeBallot.id)
              .maybeSingle();
            if (voteError) throw voteError;
            state.vote = Object.keys(speciesIdsBySlug).find(slug => speciesIdsBySlug[slug] === memberVote?.species_id) || null;
          }
        }
      }

      async function loadActiveChallenge() {
        const today = new Date().toISOString().slice(0, 10);
        const { data, error } = await supabaseClient.from('challenges')
          .select('id,title,description,starts_on,ends_on,status,species:species_id(id,slug,common_name)')
          .lte('starts_on', today).gte('ends_on', today)
          .order('starts_on', { ascending: false }).limit(1).maybeSingle();
        if (error) throw error;
        activeChallenge = data;
        renderActiveChallenge();
      }

      async function loadLeaderboard() {
        const year = new Date().getFullYear();
        const [monthly, species, yearly] = await Promise.all([
          activeChallenge
            ? supabaseClient.rpc('get_challenge_catch_leaderboard', { target_challenge_id: activeChallenge.id })
            : Promise.resolve({ data: [], error: null }),
          supabaseClient.rpc('get_all_species_cup', { target_year: year }),
          supabaseClient.rpc('get_yearly_community_leaderboard', { target_year: year })
        ]);
        const error = monthly.error || species.error || yearly.error;
        if (error) throw error;
        leaderboardData = {
          monthly: (monthly.data || []).sort((a, b) => a.rank - b.rank),
          species: species.data || [],
          yearly: yearly.data || []
        };
        renderLeaderboard();
      }

      async function loadCommunityData() {
        if (!supabaseClient) return;
        communityDataStatus = 'loading';
        renderVote();
        try {
          await Promise.all([loadVoteData(), loadActiveChallenge(), loadSpeciesDirectory(), loadHomepageShowcase()]);
          await loadLeaderboard();
          communityDataStatus = 'live';
        } catch (error) {
          console.warn('Community data connection unavailable', error);
          communityDataStatus = 'unavailable';
          activeBallot = null;
          liveVotes = null;
        }
        renderVote();
      }

      async function handleVote(slug) {
        if (!supabaseClient || communityDataStatus !== 'live' || !activeBallot) {
          root.querySelector('#vote-status').textContent = 'The live ballot is not available yet.';
          return;
        }
        if (!currentSession) {
          openAuthDialog('Sign in first, then your vote will count on the community ballot.');
          return;
        }
        const speciesId = speciesIdsBySlug[slug];
        if (!speciesId) return;
        root.querySelector('#vote-status').textContent = 'Saving your vote...';
        const { error } = await supabaseClient.from('species_votes').upsert({
          ballot_id: activeBallot.id,
          species_id: speciesId,
          user_id: currentSession.user.id
        }, { onConflict: 'ballot_id,user_id' });
        if (error) {
          root.querySelector('#vote-status').textContent = 'Your vote could not be saved. Please try again.';
          return;
        }
        state.vote = slug;
        persist();
        await loadVoteData();
        communityDataStatus = 'live';
        renderVote();
        showToast('Vote received. You can change it while voting remains open.');
      }

      async function sendMagicLink(event) {
        event.preventDefault();
        if (!supabaseClient) {
          setAuthStatus('Member sign-in is not configured in this preview.');
          return;
        }
        const form = event.currentTarget;
        const button = form.querySelector('button[type="submit"]');
        const email = new FormData(form).get('email')?.trim();
        button.disabled = true;
        setAuthStatus('Sending your secure sign-in link...');
        const redirectTo = location.origin.startsWith('http') ? `${location.origin}${location.pathname}` : 'http://127.0.0.1:4173/';
        const { error } = await supabaseClient.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
        button.disabled = false;
        setAuthStatus(error
          ? (error.status === 429 || /rate|limit/i.test(error.message) ? 'Email limit reached. Supabase allows two sign-in emails per hour on the built-in service. Use the latest unused link in your inbox or try again later.' : error.message)
          : 'Sign-in email sent. Check your inbox; the link will return you to the clubhouse.');
      }

      async function signInWithProvider(event) {
        const button = event.currentTarget;
        const provider = button.dataset.oauthProvider;
        if (!supabaseClient) {
          setAuthStatus('Member sign-in is not configured in this preview.');
          return;
        }
        button.disabled = true;
        setAuthStatus(`Opening ${provider === 'google' ? 'Google' : 'Facebook'} sign-in...`);
        const redirectTo = location.origin.startsWith('http') ? `${location.origin}${location.pathname}` : 'http://127.0.0.1:4173/';
        const { error } = await supabaseClient.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo,
            ...(provider === 'facebook' ? { scopes: 'email,public_profile' } : {})
          }
        });
        if (error) {
          button.disabled = false;
          setAuthStatus(`${provider === 'google' ? 'Google' : 'Facebook'} sign-in is not available yet. Enable this provider in Supabase, then try again.`);
        }
      }

      function setSubmissionStatus(message) {
        root.querySelector('[data-submission-status]').textContent = message || '';
      }

      function photoExtension(file) {
        const extension = file.name.split('.').pop()?.toLowerCase();
        if (['jpg', 'jpeg', 'png', 'webp'].includes(extension)) return extension === 'jpeg' ? 'jpg' : extension;
        if (file.type === 'image/png') return 'png';
        if (file.type === 'image/webp') return 'webp';
        return 'jpg';
      }

      function validatePhoto(file, label) {
        if (!file) throw new Error(`${label} is required.`);
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error(`${label} must be a JPG, PNG or WebP image.`);
        if (file.size > 12 * 1024 * 1024) throw new Error(`${label} must be smaller than 12 MB.`);
      }

      function openSubmissionDialog() {
        setSubmissionStatus(currentSession ? '' : 'You can prepare the entry now. Sign in is required when you send it.');
        const dialog = root.querySelector('#catch-submission');
        if (!dialog.open) dialog.showModal();
      }

      async function submitCatch(event) {
        event.preventDefault();
        if (!supabaseClient || !currentSession) {
          root.querySelector('#catch-submission').close();
          openAuthDialog('Sign in first, then you can submit your competition catch.');
          return;
        }
        const form = event.currentTarget;
        const button = form.querySelector('button[type="submit"]');
        const speciesSlug = form.elements.species.value;
        const speciesId = trackedSpeciesIds[speciesSlug];
        const measurementPhoto = form.elements.measurement_photo.files[0];
        const heroPhoto = form.elements.hero_photo.files[0];
        const extraPhoto = form.elements.extra_photo.files[0] || null;
        try {
          if (!speciesId) throw new Error('Choose a tracked species.');
          validatePhoto(measurementPhoto, 'Measurement photo');
          validatePhoto(heroPhoto, 'Hero photo');
          if (extraPhoto) validatePhoto(extraPhoto, 'Extra photo');
        } catch (error) {
          setSubmissionStatus(error.message);
          return;
        }

        button.disabled = true;
        setSubmissionStatus('Uploading your photos...');
        const submissionId = crypto.randomUUID();
        const userFolder = currentSession.user.id;
        const uploadedPaths = [];
        const photoInputs = [
          ['measurement', measurementPhoto],
          ['hero', heroPhoto],
          ['extra', extraPhoto]
        ].filter(([, file]) => file);
        try {
          const photoPaths = {};
          for (const [type, file] of photoInputs) {
            const path = `${userFolder}/${submissionId}/${type}.${photoExtension(file)}`;
            const { error } = await supabaseClient.storage.from('submission-photos').upload(path, file, {
              contentType: file.type,
              cacheControl: '3600',
              upsert: false
            });
            if (error) throw error;
            uploadedPaths.push(path);
            photoPaths[type] = path;
          }

          setSubmissionStatus('Saving your entry for moderation...');
          const { error } = await supabaseClient.rpc('create_catch_submission', {
            target_submission_id: submissionId,
            target_species_id: speciesId,
            target_length_cm: Number(form.elements.length_cm.value),
            target_story: form.elements.story.value.trim(),
            measurement_photo_path: photoPaths.measurement,
            hero_photo_path: photoPaths.hero,
            extra_photo_path: photoPaths.extra || null,
            confirmed_victoria: form.elements.caught_in_victoria.checked,
            confirmed_recent: form.elements.caught_recently.checked,
            confirmed_rules: form.elements.rules_accepted.checked
          });
          if (error) throw error;

          await finishReplacement();
          form.reset();
          root.querySelectorAll('[data-file-name]').forEach(label => { label.textContent = 'Choose photo'; });
          setSubmissionStatus('Catch received.');
          await loadMemberSubmissions();
          root.querySelector('#catch-submission').close();
          showSubmissionAcknowledgement('catch');
        } catch (error) {
          if (uploadedPaths.length) await supabaseClient.storage.from('submission-photos').remove(uploadedPaths);
          console.warn('Catch submission failed', error);
          setSubmissionStatus('Your catch could not be submitted. Please check the details and try again.');
        } finally {
          button.disabled = false;
        }
      }

      function recipeLines(value) {
        return value.split(/\r?\n/).map(line => line.trim().replace(/^\d+[.)]\s*/, '')).filter(Boolean);
      }

      async function submitRecipe(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const status = root.querySelector('[data-recipe-submission-status]');
        if (!supabaseClient || !currentSession) {
          root.querySelector('#recipe-submission').close();
          openAuthDialog('Sign in first, then you can submit your recipe for publication.');
          return;
        }
        const button = form.querySelector('button[type="submit"]');
        const speciesId = trackedSpeciesIds[form.elements.species.value];
        const photo = form.elements.recipe_hero_photo.files[0];
        const extraPhotos = [...form.elements.recipe_extra_photos.files];
        const ingredients = recipeLines(form.elements.ingredients.value);
        const method = recipeLines(form.elements.method.value);
        try {
          if (!speciesId) throw new Error('Choose a tracked species.');
          validatePhoto(photo, 'Recipe photo');
          if (extraPhotos.length > 4) throw new Error('Add no more than four optional recipe photos.');
          extraPhotos.forEach((file, index) => validatePhoto(file, `Optional recipe photo ${index + 1}`));
          if (ingredients.length < 2 || method.length < 2) throw new Error('Add at least two ingredients and two method steps, one per line.');
        } catch (error) { status.textContent = error.message; return; }
        button.disabled = true;
        status.textContent = 'Uploading your finished-dish photo...';
        const submissionId = crypto.randomUUID();
        const path = `${currentSession.user.id}/${submissionId}/hero.${photoExtension(photo)}`;
        const uploadedPaths = [];
        try {
          const { error: uploadError } = await supabaseClient.storage.from('submission-photos').upload(path, photo, { contentType: photo.type, cacheControl: '3600', upsert: false });
          if (uploadError) throw uploadError;
          uploadedPaths.push(path);
          const extraPhotoPaths = [];
          for (const [index, extraPhoto] of extraPhotos.entries()) {
            const extraPath = `${currentSession.user.id}/${submissionId}/recipe-extra-${index + 1}.${photoExtension(extraPhoto)}`;
            const { error: extraUploadError } = await supabaseClient.storage.from('submission-photos').upload(extraPath, extraPhoto, { contentType: extraPhoto.type, cacheControl: '3600', upsert: false });
            if (extraUploadError) throw extraUploadError;
            uploadedPaths.push(extraPath);
            extraPhotoPaths.push(extraPath);
          }
          status.textContent = 'Saving your recipe for moderation...';
          const { error } = await supabaseClient.rpc('create_recipe_submission', {
            target_submission_id: submissionId,
            target_species_id: speciesId,
            target_title: form.elements.title.value.trim(),
            target_story: form.elements.story.value.trim(),
            target_prep_minutes: Number(form.elements.prep_minutes.value),
            target_cook_minutes: Number(form.elements.cook_minutes.value),
            target_serves: Number(form.elements.serves.value),
            target_ingredients: ingredients,
            target_method: method,
            target_photo_path: path,
            target_rules_accepted: form.elements.rules_accepted.checked,
            target_extra_photo_paths: extraPhotoPaths
          });
          if (error) throw error;
          await finishReplacement();
          form.reset();
          root.querySelector('[data-file-name="recipe_hero_photo"]').textContent = 'Choose photo';
          root.querySelector('[data-file-name="recipe_extra_photos"]').textContent = 'Choose photos';
          status.textContent = 'Recipe received.';
          await loadMemberSubmissions();
          root.querySelector('#recipe-submission').close();
          showSubmissionAcknowledgement('recipe');
        } catch (error) {
          if (uploadedPaths.length) await supabaseClient.storage.from('submission-photos').remove(uploadedPaths);
          console.warn('Recipe submission failed', error);
          status.textContent = error.message || 'Your recipe could not be submitted.';
        } finally { button.disabled = false; }
      }

      async function initialiseSupabase() {
        const oauthParams = new URLSearchParams(location.search);
        const oauthHash = new URLSearchParams(location.hash.replace(/^#/, ''));
        const oauthError = oauthParams.get('error_description') || oauthHash.get('error_description');
        const linkedProvider = oauthParams.get('account-linked');
        if (oauthError) history.replaceState({}, '', `${location.pathname}#home`);
        if (!supabaseClient) {
          communityDataStatus = 'preview';
          renderVote();
          return;
        }
        const { data } = await supabaseClient.auth.getSession();
        currentSession = data.session;
        await Promise.all([loadMemberProfile(), loadMemberSubmissions()]);
        renderAuth();
        if (currentSession && linkedProvider) {
          history.replaceState({}, '', `${location.pathname}#home`);
          activeMemberTab = 'profile';
          setMemberTab('profile', false);
          root.querySelector('[data-link-status]').textContent = `${linkedProvider === 'google' ? 'Google' : 'Facebook'} is now connected to this member profile.`;
          if (!memberDialog.open) memberDialog.showModal();
        }
        if (!currentSession && oauthError) {
          const message = /email/i.test(oauthError)
            ? 'Facebook did not share an email address. Remove Spearfishing Victoria from Facebook Apps and Websites, then sign in again and allow email access.'
            : `Sign-in could not be completed: ${oauthError}`;
          openAuthDialog(message);
        }
        if (profileNeedsSetup()) {
          activeMemberTab = 'profile';
          setMemberTab('profile', false);
          root.querySelector('[data-profile-status]').textContent = 'Choose a display name before joining the leaderboard.';
          if (!memberDialog.open) memberDialog.showModal();
        }
        await loadCommunityData();
        if (new URLSearchParams(location.search).get('submit') === 'catch') {
          history.replaceState({}, '', `${location.pathname}#challenge`);
          openSubmissionDialog();
        }
        supabaseClient.auth.onAuthStateChange((_event, session) => {
          currentSession = session;
          setTimeout(async () => {
            await Promise.all([loadMemberProfile(), loadMemberSubmissions()]);
            renderAuth();
            if (profileNeedsSetup()) {
              activeMemberTab = 'profile';
              setMemberTab('profile', false);
              root.querySelector('[data-profile-status]').textContent = 'Choose a display name before joining the leaderboard.';
              if (!memberDialog.open) memberDialog.showModal();
            }
            loadCommunityData();
          }, 0);
        });
      }

      root.querySelector('.region-select').addEventListener('change', event => { state.region = event.target.value; renderRegion(); persist(); loadForecast(); });
      root.querySelector('.forecast-days').addEventListener('click', event => { if (event.target.closest('.forecast-retry')) loadForecast(); });
      root.querySelector('.theme-toggle').addEventListener('click', () => { state.dark = !state.dark; renderAppearance(); persist(); });
      const mobileMenu = root.querySelector('[data-mobile-navigation]');
      const mobileMenuToggle = root.querySelector('[data-mobile-menu-toggle]');
      const setMobileMenu = open => {
        mobileMenu.hidden = !open;
        mobileMenuToggle.setAttribute('aria-expanded', String(open));
        mobileMenuToggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
        mobileMenuToggle.innerHTML = `<i data-lucide="${open ? 'x' : 'menu'}" aria-hidden="true"></i>`;
        if (globalThis.lucide) globalThis.lucide.createIcons({ attrs: { width: 17, height: 17 } });
      };
      mobileMenuToggle.addEventListener('click', () => setMobileMenu(mobileMenu.hidden));
      mobileMenu.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setMobileMenu(false)));
      document.addEventListener('keydown', event => { if (event.key === 'Escape' && !mobileMenu.hidden) setMobileMenu(false); });
      window.addEventListener('resize', () => { if (window.innerWidth > 850 && !mobileMenu.hidden) setMobileMenu(false); });
      root.querySelector('[data-mast-previous]').addEventListener('click', () => { showMastheadSlide(mastheadSlideIndex - 1, true); startMastheadRotation(); });
      root.querySelector('[data-mast-next]').addEventListener('click', () => { showMastheadSlide(mastheadSlideIndex + 1, true); startMastheadRotation(); });
      root.querySelector('[data-mast-image]').addEventListener('mouseenter', stopMastheadRotation);
      root.querySelector('[data-mast-image]').addEventListener('mouseleave', startMastheadRotation);
      root.querySelector('[data-mast-image]').addEventListener('focusin', stopMastheadRotation);
      root.querySelector('[data-mast-image]').addEventListener('focusout', startMastheadRotation);
      root.querySelector('[data-auth-trigger]').addEventListener('click', () => openAuthDialog());
      root.querySelector('[data-close-auth]').addEventListener('click', () => memberDialog.close());
      root.querySelector('[data-auth-form]').addEventListener('submit', sendMagicLink);
      root.querySelectorAll('[data-oauth-provider]').forEach(button => button.addEventListener('click', signInWithProvider));
      root.querySelector('[data-profile-form]').addEventListener('submit', saveMemberProfile);
      root.querySelectorAll('[data-link-provider]').forEach(button => button.addEventListener('click', linkProvider));
      root.querySelector('[data-profile-form] [name="public_profile_enabled"]').addEventListener('change', renderProfilePrivacy);
      root.querySelector('[data-profile-form] [name="profile_photo"]').addEventListener('change', event => {
        const file = event.target.files[0];
        if (!file) return;
        avatarRemovalRequested = false;
        const preview = root.querySelector('[data-profile-photo-preview]');
        preview.src = URL.createObjectURL(file);
        preview.hidden = false;
        root.querySelector('[data-profile-photo-icon]').hidden = true;
        root.querySelector('[data-remove-profile-photo]').hidden = false;
      });
      root.querySelector('[data-remove-profile-photo]').addEventListener('click', () => {
        avatarRemovalRequested = true;
        const form = root.querySelector('[data-profile-form]');
        form.elements.profile_photo.value = '';
        root.querySelector('[data-profile-photo-preview]').hidden = true;
        root.querySelector('[data-profile-photo-icon]').hidden = false;
        root.querySelector('[data-remove-profile-photo]').hidden = true;
        root.querySelector('[data-profile-status]').textContent = 'Photo will be removed when you save your profile.';
      });
      root.querySelectorAll('[data-member-tab]').forEach(button => button.addEventListener('click', () => setMemberTab(button.dataset.memberTab)));
      root.querySelector('[data-sign-out]').addEventListener('click', async () => { await supabaseClient?.auth.signOut(); memberDialog.close(); });
      memberDialog.addEventListener('click', event => { if (event.target === memberDialog) memberDialog.close(); });
      const recipeDialog = root.querySelector('#snapper-recipe');
      root.querySelector('[data-open-recipe]').addEventListener('click', () => recipeDialog.showModal());
      root.querySelector('[data-close-recipe]').addEventListener('click', () => recipeDialog.close());
      recipeDialog.addEventListener('click', event => { if (event.target === recipeDialog) recipeDialog.close(); });
      const recipeSubmissionDialog = root.querySelector('#recipe-submission');
      root.querySelector('[data-open-recipe-submission]').addEventListener('click', () => {
        if (!currentSession) { openAuthDialog('Sign in first, then you can share a recipe with the community.'); return; }
        root.querySelector('[data-recipe-submission-status]').textContent = '';
        recipeSubmissionDialog.showModal();
      });
      root.querySelector('[data-close-recipe-submission]').addEventListener('click', () => recipeSubmissionDialog.close());
      recipeSubmissionDialog.addEventListener('click', event => { if (event.target === recipeSubmissionDialog) recipeSubmissionDialog.close(); });
      root.querySelector('[data-recipe-submission-form]').addEventListener('submit', submitRecipe);
      const acknowledgementDialog = root.querySelector('#submission-acknowledgement');
      root.querySelector('[data-close-acknowledgement]').addEventListener('click', () => acknowledgementDialog.close());
      root.querySelector('[data-open-member-submissions]').addEventListener('click', () => {
        acknowledgementDialog.close();
        activeMemberTab = 'submissions';
        setMemberTab('submissions', false);
        renderAuth();
        if (!memberDialog.open) memberDialog.showModal();
      });
      acknowledgementDialog.addEventListener('click', event => { if (event.target === acknowledgementDialog) acknowledgementDialog.close(); });
      const scoringDialog = root.querySelector('#scoring-rules');
      root.querySelector('[data-open-scoring]').addEventListener('click', () => scoringDialog.showModal());
      root.querySelector('[data-close-scoring]').addEventListener('click', () => scoringDialog.close());
      scoringDialog.addEventListener('click', event => { if (event.target === scoringDialog) scoringDialog.close(); });
      const submissionDialog = root.querySelector('#catch-submission');
      root.querySelectorAll('[data-open-submission]').forEach(button => button.addEventListener('click', openSubmissionDialog));
      root.querySelector('[data-close-submission]').addEventListener('click', () => submissionDialog.close());
      submissionDialog.addEventListener('click', event => { if (event.target === submissionDialog) submissionDialog.close(); });
      root.querySelector('[data-submission-form]').addEventListener('submit', submitCatch);
      root.querySelectorAll('.photo-input input[type="file"]').forEach(input => input.addEventListener('change', () => {
        const label = root.querySelector(`[data-file-name="${input.name}"]`);
        if (label) label.textContent = input.multiple && input.files.length > 1
          ? `${input.files.length} photos selected`
          : input.files[0]?.name || (input.multiple ? 'Choose photos' : 'Choose photo');
      }));
      renderRegion();
      renderVote();
      renderAppearance();
      loadForecast();
      initialiseSupabase();
    })();
