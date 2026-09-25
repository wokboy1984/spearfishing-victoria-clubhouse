# Supabase foundation

The first migration defines a provider-neutral community data model. Members can begin with email magic links and later use Google, Facebook or another supported OAuth provider without changing their submissions, votes, recipes or leaderboard history.

## Included

- Public member profiles and private emergency/qualification details
- Species and monthly challenges
- Catch, recipe and community submissions
- Administrator/moderator approval workflow
- One member vote per species ballot
- Auditable leaderboard point events
- Restricted public aggregate functions for vote totals and leaderboards
- Row Level Security policies for public, member and staff access
- No field for exact dive locations

## Before connecting the website

1. Create a Supabase project.
2. Run the SQL migration in the Supabase SQL editor or with the Supabase CLI.
3. Sign in once with the intended administrator account.
4. Promote that profile with:

```sql
update public.profiles
set role = 'admin'
where id = '<auth-user-id>';
```

5. Add the local and production addresses to the Supabase redirect URL allow-list.
6. Configure additional OAuth providers only when their application IDs and secrets are ready.

Do not place a Supabase service-role key in browser code. The website will use only the project URL and publishable browser key; privileged moderation actions remain protected by Row Level Security.
