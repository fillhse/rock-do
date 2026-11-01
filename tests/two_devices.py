"""Два «устройства» Rocky в одном браузере — проверка живой сверки через облако.

Одно и то же приложение отдаётся на двух портах: разные адреса — разная память браузера, как у телефона и Mac.
Вместо SDK Telegram подставляется его объект WebApp, у которого CloudStorage — общий для обоих портов
сервер (как облако Telegram у одного аккаунта). Код приложения работает как в Telegram: initTelegram,
облако, проверка изменений.

Запуск:  python3 tests/two_devices.py [--old-b ВЕРСИЯ]
Потом открыть http://127.0.0.1:8781/tests/two-devices.html — там слева «телефон», справа «Mac» и тесты.
--old-b 1.4.0 — «Mac» считает себя старой версией (проверка самообновления).
--b-index ФАЙЛ — «Mac» получает другой index.html (например, прошлую выкладку из git).
--a-index ФАЙЛ — то же для «телефона» (вместе с --b-index — сравнить старую выкладку целиком).
--delay 0.4 — каждый запрос к облаку отвечает с задержкой (как сеть до серверов Telegram).
"""
import argparse
import json
import os
import re
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLOUD, LOCK = {}, threading.Lock()
DELAY = 0.0  # задержка ответа облака, с

FAKE_TG = """<script>
/* подставной Telegram: всё, что приложение вызывает, плюс облако на общем сервере */
window.Telegram = { WebApp: {
  initData: 'test', platform: 'android', version: '8.0',
  isVersionAtLeast: () => true, ready() {}, expand() {}, disableVerticalSwipes() {},
  setHeaderColor() {}, setBackgroundColor() {}, setBottomBarColor() {},
  HapticFeedback: { impactOccurred() {}, notificationOccurred() {} },
  CloudStorage: {
    _c(op, body, cb, pick) {
      fetch('/cloud/' + op, { method: 'POST', body: JSON.stringify(body) }).then((r) => r.json())
        .then((r) => cb(null, pick ? pick(r) : r), (e) => cb(String(e)));
    },
    setItem(k, v, cb) { this._c('set', { k, v }, cb, () => true); },
    getItem(k, cb) { this._c('get', { keys: [k] }, cb, (r) => r[k] || ''); },
    getItems(ks, cb) { this._c('get', { keys: ks }, cb); },
    getKeys(cb) { this._c('keys', {}, cb); },
    removeItems(ks, cb) { this._c('remove', { keys: ks }, cb, () => true); },
  },
} };
/* команды от страницы с тестами */
addEventListener('message', (e) => {
  if (!e.data || !e.data.run) return;
  let res;
  try { res = (0, eval)(e.data.run); } catch (err) { res = 'ОШИБКА ' + err.message; }
  Promise.resolve(res).then((r) => e.source.postMessage({ id: e.data.id, res: r }, '*'),
                            (err) => e.source.postMessage({ id: e.data.id, res: 'ОШИБКА ' + err.message }, '*'));
});
</script>"""


def make_handler(old_version, index_file=''):
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=ROOT, **kw)

        def log_message(self, *a):
            pass

        def send(self, code, body, ctype):
            data = body.encode('utf-8')
            self.send_response(code)
            self.send_header('Content-Type', ctype)
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            path = self.path.split('?')[0]
            if path in ('/', '/index.html'):
                html = open(index_file or os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
                html = re.sub(r'<script async src="https://telegram.org/js/telegram-web-app.js"[^>]*></script>', FAKE_TG, html)
                if old_version:
                    html = re.sub(r"const APP_VERSION = '[^']*';", f"const APP_VERSION = '{old_version}';", html)
                return self.send(200, html, 'text/html; charset=utf-8')
            return super().do_GET()

        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))) or b'{}')
            op = self.path.rsplit('/', 1)[-1]
            if op != 'reset':
                time.sleep(DELAY)
            with LOCK:
                if op == 'set':
                    CLOUD[body['k']] = body['v']; res = True
                elif op == 'get':
                    res = {k: CLOUD.get(k, '') for k in body['keys']}
                elif op == 'keys':
                    res = list(CLOUD)
                elif op == 'remove':
                    for k in body['keys']:
                        CLOUD.pop(k, None)
                    res = True
                elif op == 'reset':
                    CLOUD.clear(); res = True
                else:
                    return self.send(404, '{}', 'application/json')
            return self.send(200, json.dumps(res, ensure_ascii=False), 'application/json')
    return Handler


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--old-b', default='', help='версия, которой притворяется второе устройство')
    ap.add_argument('--b-index', default='', help='index.html для второго устройства')
    ap.add_argument('--a-index', default='', help='index.html для первого устройства')
    ap.add_argument('--delay', type=float, default=0.0, help='задержка ответа облака, с')
    args = ap.parse_args()
    DELAY = args.delay
    a = ThreadingHTTPServer(('127.0.0.1', 8781), make_handler('', args.a_index))
    b = ThreadingHTTPServer(('127.0.0.1', 8782), make_handler(args.old_b, args.b_index))
    threading.Thread(target=b.serve_forever, daemon=True).start()
    print('телефон: http://127.0.0.1:8781/  Mac: http://127.0.0.1:8782/  тесты: http://127.0.0.1:8781/tests/two-devices.html', flush=True)
    a.serve_forever()
