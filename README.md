# Spearfishing Victoria Clubhouse

This folder contains the editable website source promoted from the approved visual concept. The site is plain HTML, CSS and JavaScript. It can be opened directly, while the local development address enables saved preferences and future data integrations.

## Current version

- White, charcoal and orange community design
- Optional dark mode
- Species of the Month masthead
- Seven-day regional forecast selector
- Facebook Community Chat directory
- Monthly leaderboard
- Community vote
- Community catch, recipe and member imagery
- Working section navigation and Messenger link
- Browser-persisted region, vote and appearance preferences
- Live seven-day wind, rain, swell and moon forecasts from Open-Meteo
- Snapper species profile with current Victorian Fisheries Authority links
- Accessible community recipe cook view with ingredients and method
- Curated tracked-species library with search, filters, rules and recipes
- Supabase-backed email magic-link member sign-in
- Live authenticated species voting and challenge leaderboard foundation
- Best-catch scoring: 15 entry points plus a dynamic top-ten bonus, with only each member's largest verified fish counted
- Moderated catch-photo submissions with required measurement and hero photos, an optional extra image and no location collection
- Optional profile-level Instagram attribution for approved catches
- Searchable, bookmarkable species pages with unofficial month, year and overall website records
- Species-specific community recipe collections
- Staff-only moderation workspace with private photo review, verification checks and audited approval decisions
- In-app member notifications with submission status, rejection reasons and links to approved species records
- First-sign-in display-name setup and photo-led approved catch galleries on species pages
- Live homepage community imagery sourced from approved catches
- Staff-controlled rotating masthead slideshow and display order for public hero photos
- Staff Competition Manager for monthly challenge species, dates, status, homepage copy and community ballot candidates
- Member recipe submissions with a hero image and up to four supporting photos, staff moderation, species-page publication, in-app decisions and a 10-point approval reward
- Image-led public recipe cards with complete ingredients, method, contributor details and multi-photo galleries
- Rejected catch and recipe recovery with member-controlled correction, replacement submission and permanent deletion
- Switchable monthly, All Species Cup and yearly community leaderboards on the homepage
- Bookmarkable Safety Hub with a pre-dive checklist, buddy protocol, emergency actions and official Victorian resources
- Responsive mobile navigation with direct access to every core clubhouse area
- Opt-in public member profiles with independent catch and recipe privacy controls
- Private profile-photo uploads that follow each member's public-profile visibility
- Friendly Monthly Catch dashboard with participation metrics, a visual podium, live standings, approved catch gallery and next-species vote summary
- Calendar-driven Competition Manager for queuing monthly catches and next-species ballots without manually maintaining dates or statuses

## Project structure

- `index.html` contains the page content and accessible structure.
- `styles.css` contains the responsive light and dark themes.
- `app.js` contains the forecast selector, voting and appearance interactions.
- `assets/` contains the website imagery.
- `species/` contains the searchable index and bookmarkable species pages.
- `admin/` contains the protected moderation workspace for moderators and administrators.
- `supabase/` contains the provider-neutral database and security foundation for accounts, moderation, submissions, voting and leaderboards.

The voting and leaderboard panels read from Supabase when configured. Representative preview data remains available if the service is unreachable. Forecasts are live and use representative regional model points; they are planning guidance only and are not suitable for navigation or as a substitute for local safety checks.

## Suggested build order

1. Finalise layout, wording and navigation.
2. Connect marine weather and moon data.
3. Add community submissions and moderation.
4. Add member accounts, leaderboard and voting persistence.
5. Add recipes, species pages and search.
6. Publish the approved build to the existing Spearfishing Victoria site.

## Product backlog

- Final recipe lifecycle test: submit and approve a new multi-photo recipe, confirm every image publishes to its species gallery, then verify the member acknowledgement and points award.
- Authentication delivery: configure custom SMTP and/or Google sign-in before launch so staff and members are not dependent on Supabase's limited built-in email service.
- Social authentication setup: enable and configure the Google and Facebook providers in Supabase, including production redirect URLs and provider credentials; the member and staff interfaces are already wired for both.

## Experience principles

- Every meaningful member action must be acknowledged: confirm what was received or saved, explain what happens next, and provide a direct place to track the result.

## Opening the site

Use the local development address supplied by Codex while working on the site. Opening `index.html` directly remains useful as a simple fallback preview.

## Netlify configuration

Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in Netlify's environment variables. The build command generates the browser-safe `supabase-config.js` file used by the live site. Never use the Supabase service-role key here.
