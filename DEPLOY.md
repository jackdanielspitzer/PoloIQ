# Deploying PoloIQ

## The app

GitHub Pages serves the `main` branch of jackdanielspitzer/PoloIQ. To ship a change:

1. Run the tests (see README).
2. `cp index.html "poloai (1) copy 2.html"`
3. Commit and `git push origin main`. Pages updates within a few minutes; add `?v=2` to the URL to skip the cache when checking.

## Supabase (one-time setup, already done)

- Project `rdbczjonabgmrqulvsxx`. The publishable key in `index.html` is meant to be public; the row rules in `supabase/schema.sql` are what protect the data. Run that file in the SQL Editor after any schema change.
- Authentication → URL Configuration: Site URL and redirect URL are the GitHub Pages address (`https://jackdanielspitzer.github.io/PoloIQ/` and `.../PoloIQ/**`).
- Authentication → Emails: custom SMTP through poloiq.donotreply@gmail.com (Gmail app password, port 587, sender name PoloIQ). The "Confirm signup" template is `supabase/email-confirm-signup.html`.
- Only jackdanielspitzer@gmail.com can hold the admin role; a database trigger enforces it.

## Daily stats update

A Claude cloud routine ("PoloIQ daily game and stats update (cloud)") runs at 14:30 UTC every day. It checks each school for newly finished games, updates the seeded results, stats and box scores, runs the tests, and commits to `main` only when something new is verified. Its runs are listed at https://claude.ai/code/routines.
