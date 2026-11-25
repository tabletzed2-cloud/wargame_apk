"""Check the offline executable dependency closure. Run from any directory."""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sw = (ROOT / 'service-worker.js').read_text(encoding='utf-8')
html = (ROOT / 'index.html').read_text(encoding='utf-8')
version = re.search(r"CACHE_NAME = 'wargame-(v[\d.]+)'", sw).group(1)
core = re.search(r'const CORE_ASSETS = (\[[\s\S]*?\]);', sw).group(1)
assets = re.findall(r"['\"](\./[^'\"]*)['\"]", core)
scripts = re.findall(r'<script[^>]+src="([^"]+)"', html)
styles = re.findall(r'<link[^>]+href="([^"]+\.css)"', html)
errors = []
for url in scripts + styles:
    if './' + url not in assets:
        errors.append('Not mandatory in offline cache: ' + url)
    if not (ROOT / url).is_file():
        errors.append('Missing dependency: ' + url)
for url in scripts:
    if url == 'js/firebase-offline.js':
        continue  # vendored third-party bundle
    if 'BUILD-МАРКЕР: ' + version not in (ROOT / url).read_text(encoding='utf-8'):
        errors.append('Wrong build marker: ' + url)
if "var APP_VERSION = '" + version + "';" not in html:
    errors.append('Wrong APP_VERSION')
if version not in json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8'))['short_name']:
    errors.append('Wrong manifest version')
cards = (ROOT / 'js/cards.js').read_text(encoding='utf-8')
for icon in sorted(set(re.findall(r'"icon":\s*"([^"]+)"', cards))):
    if icon.lstrip('./') not in sw:
        errors.append('Card icon not precached: ' + icon)
print('CACHE_VERSION:', version)
for error in errors:
    print('FAIL:', error)
print('Build verification:', 'FAIL' if errors else 'PASS')
sys.exit(1 if errors else 0)
