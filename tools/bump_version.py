#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
⚡ v13.185: единый бампер версии сборки.

Зачем. Версия игры живёт в 13 местах, и раньше её правили руками:
  • index.html          — `var APP_VERSION = 'vX.YYZ';`
  • manifest.json       — `"short_name": "БМ vX.YYZ"`
  • service-worker.js   — `const CACHE_NAME = 'wargame-vX.YYZ';` + BUILD-МАРКЕР в шапке
  • js/*.js (10 файлов) — BUILD-МАРКЕР в первой строке

v13.184 вышла с APP_VERSION = v13.184 и маркерами v13.183. Из-за этого
service-worker отменял установку (verifyCachedBuild), а приложение уходило
в глубокую перезагрузку с чисткой кэшей — офлайн и PWA не работали.

Использование:
    python3 tools/bump_version.py --check      # только проверить синхронность
    python3 tools/bump_version.py v13.185      # проставить версию везде
    python3 tools/bump_version.py --check      # в CI/перед коммитом

Код возврата 1, если версии расходятся (в режиме --check).
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
MARKER_PREFIX = '⚡ BUILD-МАРКЕР:'
VERSION_RE = re.compile(r'v(\d+)\.(\d{3})')

# Порядок важен только для отчёта.
MODULES = [
    'js/data.js', 'js/hexmaps.js', 'js/templates.js', 'js/operational_ui.js',
    'js/cards.js', 'js/map_actions.js', 'js/online_battles.js', 'js/placement.js',
    'js/recon.js', 'js/weapons.js',
]


def read(rel):
    return (ROOT / rel).read_text(encoding='utf-8')


def write(rel, text):
    (ROOT / rel).write_text(text, encoding='utf-8')


def index_version():
    m = re.search(r"var APP_VERSION = '(v\d+\.\d+)';", read('index.html'))
    return m.group(1) if m else None


def marker_of(text):
    m = re.search(MARKER_PREFIX + r' (v\d+\.\d+)', text)
    return m.group(1) if m else None


def collect():
    """Все места, где зафиксирована версия: [{where, current}]."""
    html = read('index.html')
    found = [{'where': 'index.html:APP_VERSION', 'current': index_version()}]
    title = re.search(r'<title>Боевой модуль (v\d+\.\d+)', html)
    found.append({'where': 'index.html:<title>', 'current': title.group(1) if title else None})
    badge = re.search(r'id="appVersionBadge"[^>]*>(v\d+\.\d+)<', html)
    found.append({'where': 'index.html:#appVersionBadge', 'current': badge.group(1) if badge else None})
    h2 = re.search(r'id="battleModuleTitle"[^>]*>⚔️ Боевой модуль (v\d+\.\d+)', html)
    found.append({'where': 'index.html:#battleModuleTitle', 'current': h2.group(1) if h2 else None})

    manifest = json.loads(read('manifest.json'))
    short = str(manifest.get('short_name', ''))
    mm = VERSION_RE.search(short)
    found.append({'where': 'manifest.json:short_name', 'current': mm.group(0) if mm else None})

    sw = read('service-worker.js')
    cm = re.search(r"const CACHE_NAME = 'wargame-(v\d+\.\d+)';", sw)
    found.append({'where': 'service-worker.js:CACHE_NAME', 'current': cm.group(1) if cm else None})
    found.append({'where': 'service-worker.js:BUILD-МАРКЕР', 'current': marker_of(sw)})

    for mod in MODULES:
        found.append({'where': mod + ':BUILD-МАРКЕР', 'current': marker_of(read(mod))})
    return found


def apply_version(version):
    """Проставляет version во все места, сохраняя хвостовые комментарии маркеров."""
    if not VERSION_RE.fullmatch(version):
        raise SystemExit('версия должна быть вида v13.185, получено: %r' % version)

    # index.html — APP_VERSION + видимые в интерфейсе заголовки и бейдж.
    # ⚡ v13.185: до этого в <title>, <h1>, #battleModuleTitle и #appVersionBadge
    #    оставалась старая версия: игрок видел «Боевой модуль v13.183» при
    #    APP_VERSION = v13.184 (регрессия regression_v13100 это ловила).
    html = read('index.html')
    html, n_html = re.subn(r"var APP_VERSION = 'v\d+\.\d+';",
                           "var APP_VERSION = '%s';" % version, html, count=1)
    html = re.sub(r'Боевой модуль v\d+\.\d+', 'Боевой модуль ' + version, html)
    html = re.sub(r'(<p id="appVersionBadge"[^>]*>)v\d+\.\d+(</p>)',
                  r'\1' + version + r'\2', html)
    write('index.html', html)

    # manifest.json — сохраняем форматирование (2 пробела, как в файле)
    manifest_path = ROOT / 'manifest.json'
    manifest = json.loads(read('manifest.json'))
    manifest['short_name'] = re.sub(r'v\d+\.\d+', version, str(manifest.get('short_name', '')))
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')

    # service-worker.js
    sw = read('service-worker.js')
    sw, n_cache = re.subn(r"const CACHE_NAME = 'wargame-v\d+\.\d+';",
                          "const CACHE_NAME = 'wargame-%s';" % version, sw, count=1)
    sw = replace_marker(sw, version)
    write('service-worker.js', sw)

    # модули ядра
    changed = 0
    for mod in MODULES:
        text = read(mod)
        new = replace_marker(text, version)
        if new != text:
            write(mod, new)
            changed += 1

    return {'index': n_html, 'cache': n_cache, 'modules': changed}


def replace_marker(text, version):
    """Меняет только версию в BUILD-МАРКЕРЕ первой строки, не трогая пояснение."""
    lines = text.split('\n')
    if not lines:
        return text
    if MARKER_PREFIX not in lines[0]:
        return text
    lines[0] = re.sub(MARKER_PREFIX + r' v\d+\.\d+', MARKER_PREFIX + ' ' + version, lines[0], count=1)
    return '\n'.join(lines)


def report(found):
    versions = {item['current'] for item in found if item['current']}
    print('Найдено мест с версией: %d' % len(found))
    for item in found:
        print('  %-38s %s' % (item['where'], item['current'] or '— НЕ НАЙДЕНО'))
    missing = [i for i in found if not i['current']]
    if missing:
        print('\n✗ версия не найдена в: %s' % ', '.join(i['where'] for i in missing))
    if len(versions) > 1:
        print('\n✗ РАССИНХРОН: %s' % ', '.join(sorted(versions)))
        for v in sorted(versions):
            print('   %s: %s' % (v, ', '.join(i['where'] for i in found if i['current'] == v)))
        return 1
    if missing:
        return 1
    print('\n✓ все места на версии %s' % versions.pop())
    return 0


def main(argv):
    if '--check' in argv:
        return report(collect())
    args = [a for a in argv[1:] if not a.startswith('-')]
    if not args:
        print(__doc__)
        return report(collect())
    version = args[0]
    if not version.startswith('v'):
        version = 'v' + version
    result = apply_version(version)
    print('Проставлена версия %s: index.html=%d, CACHE_NAME=%d, модулей=%d'
          % (version, result['index'], result['cache'], result['modules']))
    return report(collect())


if __name__ == '__main__':
    sys.exit(main(sys.argv))
