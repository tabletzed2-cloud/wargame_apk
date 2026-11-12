"""Embed diagnostic-only movement review in a self-contained HTML artifact."""
import json
from pathlib import Path

def enhance(html,metadata):
    header='''<section id="movement-review"><b>Проверка переходов — черновая модель, НЕ правила игры</b>
<p>Нажмите на карту: проверяются шесть соседних гексов. Зелёный — разрешён в модели; красный — запрещён; оранжевый — требует проверки. Линии ведут к проверенным точкам входа; на дороге это схема связи, а не буквальный путь вдоль трассы. Розовая дорога — исходная трасса.</p>
<label>Подразделение: <select id="movement-profile"><option value="foot">Пехота</option><option value="wheeled">Колёсная техника</option><option value="tracked">Бронетехника / гусеничная</option><option value="amphibious">Амфибийная техника</option><option value="daf">DAF MC-V (амфибия + болота)</option></select></label>
<label><input type="checkbox" id="movement-anchor">Талреп-якорь (уровень 1 · 15 м)</label>
<button id="movement-clear" type="button">Снять выбор</button>
<p>Техника вне дороги не проходит высоты и оба типа болот. Якорь открывает уровень 1, но не 2/3. Амфибии проходят воду; DAF MC-V также оба болота с большим штрафом скорости. Дорожная связь даёт полную дорожную скорость даже на высотах; мост через воду не предполагается. Если центр недоступен, ищется доступная часть гекса с прямым входом. Точные численные скорости ещё не заданы. Гусеничная бронетехника проходит лес; колёсная вне дороги — нет. Лес не отменяет запреты болот и высот.</p>
<div id="movement-summary" role="status">Выберите гекс на карте.</div><div id="movement-results"></div></section>'''
    html=html.replace('</header>',header+'</header>')
    html=html.replace('</svg>','<g id="movement-rays" pointer-events="none"></g></svg>',1)
    payload=json.dumps(metadata,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')
    script=Path(__file__).with_name('terrain_diagnostics.js').read_text()
    html+=f'<script id="terrain-review-data" type="application/json">{payload}</script><script>{script}</script>'
    html=html.replace('header{padding:16px;position:sticky;top:0;', 'header{padding:16px;')
    html=html.replace('</style>','''#movement-review{border-top:1px solid #6c8299;margin-top:10px;padding-top:10px}select{font:inherit;padding:5px;background:#263746;color:white}#movement-results{display:flex;gap:6px;flex-wrap:wrap}#movement-results>div{border-left:4px solid;padding:6px;background:#243140;font-size:13px;max-width:290px}svg{cursor:crosshair} </style>''')
    return html
