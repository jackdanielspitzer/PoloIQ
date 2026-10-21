PoloIQ voice-parser tests (run offline in Node; never touch the live backend)
  node phrases.js   -> 80 call phrases with expected events (all must pass)
  node explore.js   -> extra phrasings, printed for eyeballing
  node e2e.js       -> a mini game through the real logging path (score + stored events)
They load webapp/index.html directly, so run them after any change to the voice grammar.

lifecycle.js  full game: setup, color, voice + manual + notes, undo, Q1-Q4, OT, shootout, permissions,
              clock acceptance, final, player stats, every page render, tactics rec + outcome loop
clockflow.js  camera clock: auto-advance to next quarter on 0:00 -> 8:00 reset (Q1-Q3 only)
dom.js        recording fake DOM used by the two above
practice.js   practice mode: sandbox game never syncs/counts/learns; report of unrecognized phrases
storage.js    saved/synced state stays small (imported-score filler packed) and round-trips identically
accounts.js   admin (owner-only), Navy manager scoped to Navy, login/password
clockread.js  camera clock reader on synthetic clocks: solid, dot-matrix, slanted, blurry/noisy, small, amber, loose box
cloud.js      several devices against a fake Supabase with the schema's row rules: sign-up/confirm/login, admin guard, stats as rows, live updates, undo, offline queue, permissions, visitor read-only, reload, roster edit
gameday.js    tap-to-log grid + follow-up details, man-up tracking, shot spots, second-phone clock, special teams, scouting report, export
