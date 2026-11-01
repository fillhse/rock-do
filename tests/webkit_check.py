"""Проверка камня в WebKit — движке Safari и Telegram на Mac (там Rocky показывается через WebKit).

Запуск:  python3 tests/webkit_check.py [адрес]   (по умолчанию — локальная сборка http://127.0.0.1:8765/)
Нужен Playwright с WebKit:  python3 -m pip install --user playwright && python3 -m playwright install webkit

Что проверяет (окно как у Telegram на Mac):
- при открытии список не прыгает (положение «Моих дел» не меняется ни в одном кадре);
- прокрутка колесом/трекпадом: докрутка снизу до верха не открывает подсказку, слабый жест в самом
  верху — подсказка выглядывает и уходит, сильный — выезжает сама;
- во время всех жестов «Мои дела» не скачут туда-обратно (нет тряски, как на видео с Mac).
"""
import sys
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8765/'
results = []


def check(name, ok, info=''):
    results.append((name, ok))
    print(('OK     ' if ok else 'ОШИБКА ') + name + (f'  [{info}]' if info else ''))


# положение заголовка «Мои дела» на экране, кадр за кадром — по нему видна любая тряска
WATCH = """() => { window.__ys = []; const h = document.querySelector('#s-rock .count');
  const tick = () => { window.__ys.push(Math.round(h.getBoundingClientRect().top)); if (window.__ys.length < 4000) requestAnimationFrame(tick); };
  requestAnimationFrame(tick); }"""


def jumps(ys):  # смена направления движения — признак тряски (едет вниз, потом вверх, потом вниз…)
    d = [b - a for a, b in zip(ys, ys[1:]) if b != a]
    return sum(1 for a, b in zip(d, d[1:]) if (a > 0) != (b > 0))


with sync_playwright() as p:
    b = p.webkit.launch()
    pg = b.new_page(viewport={'width': 480, 'height': 820})
    pg.add_init_script("localStorage.removeItem('rockdo-demo')")
    pg.goto(URL + ('&' if '?' in URL else '?') + 'wk=1')
    pg.evaluate(WATCH)
    pg.wait_for_timeout(1500)
    ys = pg.evaluate('window.__ys')
    print('версия', pg.evaluate('APP_VERSION'), '| WebKit', b.version)
    check('при открытии «Мои дела» стоят на месте', len(set(ys)) == 1, f'положения: {sorted(set(ys))[:6]}')

    # много дел, чтобы было что листать
    pg.evaluate("""() => { for (let i = 0; i < 20; i++) db.tasks.push({ id: db.nextId++, title: 'Дело ' + i, due: null, rep: 'never', pos: 100 + i }); renderAll(); }""")
    hero = lambda: pg.evaluate("document.getElementById('hero-wrap') ? document.getElementById('hero-wrap').offsetHeight : Math.max(0, Math.round(document.getElementById('rock-hero').getBoundingClientRect().bottom - document.getElementById('s-rock').getBoundingClientRect().top))")
    pg.mouse.move(240, 400)

    # вниз, затем вверх одним потоком «с инерцией» до самого верха и дальше
    for _ in range(25): pg.mouse.wheel(0, 60); pg.wait_for_timeout(16)
    pg.wait_for_timeout(400)
    pg.evaluate(WATCH)
    for i in range(70): pg.mouse.wheel(0, -max(4, 60 - i)); pg.wait_for_timeout(16)
    pg.wait_for_timeout(900)
    ys = pg.evaluate('window.__ys')
    check('докрутили снизу до верха с инерцией — подсказка не открылась', hero() < 5, f'подсказка {hero()} px')
    check('…и без тряски', jumps(ys) <= 1, f'смен направления: {jumps(ys)}')

    # слабый отдельный жест в самом верху
    pg.wait_for_timeout(400)
    pg.evaluate(WATCH)
    for _ in range(6): pg.mouse.wheel(0, -30); pg.wait_for_timeout(16)
    pg.wait_for_timeout(40)
    peek = hero()
    pg.wait_for_timeout(1000)
    ys = pg.evaluate('window.__ys')
    check('слабый жест в самом верху — подсказка выглянула и ушла', 3 < peek < 80 and hero() < 5, f'выглянула {peek}, после {hero()}')
    check('…без тряски', jumps(ys) <= 1, f'смен направления: {jumps(ys)}')

    # сильный отдельный жест — перевалили через бугорок, выезжает сама
    pg.wait_for_timeout(400)
    pg.evaluate(WATCH)
    for _ in range(30): pg.mouse.wheel(0, -40); pg.wait_for_timeout(16)
    pg.wait_for_timeout(1200)
    ys = pg.evaluate('window.__ys')
    check('сильный жест в самом верху — подсказка открылась', hero() > 120, f'подсказка {hero()} px')
    check('…без тряски', jumps(ys) <= 2, f'смен направления: {jumps(ys)}')

    # нажатие на «Мои дела» прячет
    pg.click('#s-rock .count')
    pg.wait_for_timeout(1000)
    check('нажатие на «Мои дела» прячет подсказку', hero() < 5, f'подсказка {hero()} px')
    b.close()

bad = [n for n, ok in results if not ok]
print(f'\nИтог: {len(results) - len(bad)} из {len(results)}')
sys.exit(1 if bad else 0)
