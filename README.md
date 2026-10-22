# PoloIQ

Water polo stats and tactics in the browser: rosters and schedules, live stat tracking by tap or voice, a camera game clock, box scores, scouting reports and a tactics board. It installs to a phone's home screen.

Live site: https://jackdanielspitzer.github.io/PoloIQ/

## How it is built

- `index.html` is the whole app (HTML, CSS and JavaScript in one file, no build step). `poloai (1) copy 2.html` is a byte-identical mirror; refresh it with `cp index.html "poloai (1) copy 2.html"` before every commit.
- Accounts and shared data live in Supabase. `supabase/schema.sql` creates the tables (profiles, teams, games, events, app_lists), the row rules (anyone can read; only the admin, statisticians, or a team's own coach or manager can write) and the sign-up trigger. `supabase/email-confirm-signup.html` is the confirmation email template.
- Built-in schedules, results, player stats and box scores are seeded inside `index.html`. A daily cloud routine refreshes them from 6-8 Sports and the schools' official sites using the scripts in `pipeline/`, then commits to `main`.
- `sw.js` caches only the app's own files so it opens offline. It never caches data.

## Tests

The tests run offline in Node against fake backends and never touch the real database:

```
node tests/phrases.js
node tests/lifecycle.js
node tests/clockflow.js
node tests/practice.js
node tests/storage.js
node tests/accounts.js
node tests/clockread.js
node tests/cloud.js
node tests/gameday.js
node tests/pbp.js
node tests/scout.js
```

See `tests/README.txt` for what each one covers.

## License

Proprietary, patent pending. See `LICENSE`.
