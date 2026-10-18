# Имитирует verifyCachedBuild() из service-worker.js
import re

CACHE_NAME = re.search(r"CACHE_NAME = 'wargame-(v[\d.]+)'", open('service-worker.js', encoding='utf-8').read()).group(1)
print('CACHE_VERSION:', CACHE_NAME)

checks = [
    ('index.html', "var APP_VERSION = '" + CACHE_NAME + "';"),
    ('js/data.js', '⚡ BUILD-МАРКЕР: ' + CACHE_NAME),
    ('js/hexmaps.js', '⚡ BUILD-МАРКЕР: ' + CACHE_NAME),
    ('js/templates.js', '⚡ BUILD-МАРКЕР: ' + CACHE_NAME),
    ('js/operational_ui.js', '⚡ BUILD-МАРКЕР: ' + CACHE_NAME),
]
ok = True
for url, needle in checks:
    text = open(url, encoding='utf-8').read()
    found = needle in text
    print(('PASS' if found else 'FAIL'), url, '<-', needle)
    ok = ok and found
print('INSTALL WOULD', 'SUCCEED' if ok else 'FAIL')

# иконки из cards.js должны быть в прекэше SW
sw = open('service-worker.js', encoding='utf-8').read()
cards = open('js/cards.js', encoding='utf-8').read()
icons = set(re.findall(r'"icon":\s*"([^"]+)"', cards))
missing = [i for i in sorted(icons) if i.lstrip('./') not in sw and ('./' + i.lstrip('./')) not in sw]
print('card icons missing from SW precache:', missing if missing else 'NONE')
