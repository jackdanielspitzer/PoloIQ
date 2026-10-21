"""Which schools the auto-ingest pipeline tracks, and where their data lives.

`host` is the school's Sidearm athletics site. `layout` is 'classic' (server-rendered
li.sidearm-schedule-game rows) or 'nuxt' (Sidearm's newer site, schedule embedded as a Nuxt
payload). `aliases` are lowercase name forms used to recognise the school in other schools'
schedules, Sidearm box scores and 6-8 Sports team names.
"""

SEASONS = [2024, 2025, 2026]

TEAMS = [
    {"name": "Navy", "host": "navysports.com", "layout": "classic", "mascot": "Midshipmen",
     "aliases": ["navy", "naval academy", "us naval academy", "nav"]},
    {"name": "Fordham", "host": "fordhamsports.com", "layout": "classic", "mascot": "Rams",
     "aliases": ["fordham", "fordham university", "for"]},
    {"name": "Iona", "host": "ionagaels.com", "layout": "classic", "mascot": "Gaels",
     "aliases": ["iona", "iona university", "iona college", "ion"]},
    {"name": "Mount St. Mary's", "host": "mountathletics.com", "layout": "classic", "mascot": "Mountaineers",
     "aliases": ["mount st. mary's", "mount st mary's", "mount st marys", "mount st. marys", "the mount",
                 "mount saint mary's", "msmu", "msm"]},
    {"name": "Bucknell", "host": "bucknellbison.com", "layout": "nuxt", "mascot": "Bison",
     "aliases": ["bucknell", "bucknell university", "buc"]},
    {"name": "Johns Hopkins", "host": "hopkinssports.com", "layout": "classic", "mascot": "Blue Jays",
     "aliases": ["johns hopkins", "jhu", "johns hopkins university", "joh"]},
    {"name": "George Washington", "host": "gwsports.com", "layout": "nuxt", "mascot": "Revolutionaries",
     "aliases": ["george washington", "gw", "gwu", "george washington university", "geo"]},
    {"name": "Princeton", "host": "goprincetontigers.com", "layout": "nuxt", "mascot": "Tigers",
     "aliases": ["princeton", "princeton university", "pri"]},
    {"name": "Harvard", "host": "gocrimson.com", "layout": "classic", "mascot": "Crimson",
     "aliases": ["harvard", "harvard university", "har"]},
    {"name": "Brown", "host": "brownbears.com", "layout": "nuxt", "mascot": "Bears",
     "aliases": ["brown", "brown university", "bro"]},
    {"name": "MIT", "host": "mitathletics.com", "layout": "classic", "mascot": "Engineers",
     "aliases": ["mit", "massachusetts institute of technology", "m.i.t."]},
]

# Opponent names as they already appear in the app's seed data, so imported games file under the
# same opponent label the app uses elsewhere (keys are normalized forms, see names.norm()).
CANONICAL_OPPONENTS = {
    "california": "California", "cal": "California", "uc berkeley": "California",
    "ucla": "UCLA", "usc": "USC", "stanford": "Stanford", "pacific": "Pacific",
    "uc davis": "UC Davis", "pepperdine": "Pepperdine", "uc irvine": "UC Irvine",
    "uc santa barbara": "UC Santa Barbara", "ucsb": "UC Santa Barbara",
    "uc san diego": "UC San Diego", "ucsd": "UC San Diego",
    "long beach state": "Long Beach State", "lbsu": "Long Beach State",
    "loyola marymount": "LMU", "lmu": "LMU", "air force": "Air Force",
    "san jose state": "San Jose State", "sjsu": "San Jose State",
    "santa clara": "Santa Clara", "saint mary's": "Saint Mary's", "st. mary's": "Saint Mary's",
    "claremont-mudd-scripps": "Claremont-Mudd-Scripps", "cms": "Claremont-Mudd-Scripps",
    "pomona-pitzer": "Pomona-Pitzer", "penn state behrend": "Penn St.-Behrend",
    "penn st. behrend": "Penn St.-Behrend", "penn st.-behrend": "Penn St.-Behrend",
    "washington & jefferson": "Washington & Jefferson", "w&j": "Washington & Jefferson",
    "connecticut college": "Connecticut College", "conn college": "Connecticut College",
    "st. francis brooklyn": "St. Francis Brooklyn", "liu": "LIU", "wagner": "Wagner",
    "gannon": "Gannon", "mercyhurst": "Mercyhurst", "salem": "Salem", "mckendree": "McKendree",
    "cal baptist": "Cal Baptist", "california baptist": "Cal Baptist", "occidental": "Occidental",
    "redlands": "Redlands", "whittier": "Whittier", "chapman": "Chapman", "la verne": "La Verne",
    "cal lutheran": "Cal Lutheran", "caltech": "Caltech", "austin college": "Austin College",
    "wheaton": "Wheaton", "augustana": "Augustana", "fresno pacific": "Fresno Pacific",
    "concordia": "Concordia", "biola": "Biola", "uc merced": "UC Merced",
    "cal state fullerton": "Cal State Fullerton", "csuf": "Cal State Fullerton",
}
