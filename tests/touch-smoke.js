/* Проверка жестов пальцем перед выкладкой.
   Как запустить: открыть приложение в Chrome с эмуляцией телефона (DevTools → Toggle device toolbar),
   вставить этот файл в консоль. Данные приложения будут сброшены к стартовым.
   Касания имитируются так же, как их шлёт настоящий браузер:
   - тап: pointerdown → touchstart → touchend → click в элемент, который В ЭТОТ МОМЕНТ под пальцем
     (так ловится «призрачный клик», закрывавший меню сделанного дела);
   - перенос: все touch-события идут в ИСХОДНЫЙ элемент под пальцем, даже если его убрали из DOM
     (так ловится обрыв переноса при перерисовке списка). */
(async () => {
  localStorage.removeItem('rockdo-demo');
  if (!sessionStorage.getItem('touch-smoke')) { sessionStorage.setItem('touch-smoke', '1'); location.reload(); return console.log('Перезагрузка со стартовыми данными — вставь скрипт ещё раз.'); }
  sessionStorage.removeItem('touch-smoke');

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const T = (x, y, el) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
  const touchEv = (type, el, x, y) => new TouchEvent(type, { bubbles: true, cancelable: true,
    touches: type === 'touchend' ? [] : [T(x, y, el)], changedTouches: [T(x, y, el)] });
  const at = (el, dx) => { const r = el.getBoundingClientRect(); return [dx == null ? r.left + r.width / 2 : r.left + dx, r.top + r.height / 2]; };

  async function tap([x, y]) {
    const el = document.elementFromPoint(x, y);
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', clientX: x, clientY: y, button: 0 }));
    el.dispatchEvent(touchEv('touchstart', el, x, y));
    await sleep(80);
    el.dispatchEvent(touchEv('touchend', el, x, y));
    await sleep(20);
    document.elementFromPoint(x, y).dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y })); // у SVG нет .click()
    await sleep(350);
  }
  async function hold(el, [x0, y0], [x1, y1], holdEnd = 0) {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', clientX: x0, clientY: y0, button: 0 }));
    el.dispatchEvent(touchEv('touchstart', el, x0, y0));
    await sleep(HOLD_MS + 40);
    let x = x0, y = y0;
    for (let i = 1; i <= 15; i++) { x = x0 + (x1 - x0) * i / 15; y = y0 + (y1 - y0) * i / 15; el.dispatchEvent(touchEv('touchmove', el, x, y)); await sleep(16); }
    const t = Date.now(); while (Date.now() - t < holdEnd) { el.dispatchEvent(touchEv('touchmove', el, x, y)); await sleep(50); }
    el.dispatchEvent(touchEv('touchend', el, x, y));
    await sleep(20);
    document.elementFromPoint(x, y).dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y })); // у SVG нет .click()
    await sleep(350);
  }

  const results = [];
  const check = (name, ok) => results.push({ сценарий: name, итог: ok ? 'OK' : 'ОШИБКА' });
  const titles = () => [...document.querySelectorAll('#task-list .card.task b')].map((b) => b.textContent);
  const doneWrap = (title) => [...document.querySelectorAll('.done-wrap')].find((w) => w.querySelector('b').textContent === title);
  const sheet = document.getElementById('done-sheet');

  // дела
  const t0 = titles()[0];
  await tap(at(document.querySelector('#task-list .card.task .checkbox'))); await sleep(500);
  check('тап по кружку — дело выполнено', !titles().includes(t0) && !!doneWrap(t0));
  const opened = [];
  for (const dx of [80, 180, 300]) { await tap(at(doneWrap(t0), dx)); opened.push(sheet.classList.contains('on')); sheet.classList.remove('on'); }
  check('тап по сделанному — меню открывается и не закрывается', opened.every(Boolean));
  await tap(at(doneWrap(t0), 180)); await tap(at(document.getElementById('ds-restore')));
  check('меню → «Вернуть на камень»', titles().includes(t0) && !sheet.classList.contains('on'));
  const card0 = [...document.querySelectorAll('#task-list .card.task')].find((c) => c.querySelector('b').textContent === t0);
  await tap(at(card0.querySelector('.checkbox'))); await sleep(500);
  await tap(at(doneWrap(t0).querySelector('.checkbox')));
  check('тап по галочке сделанного — вернуть сразу', titles().includes(t0) && !doneWrap(t0));
  await tap(at(document.querySelector('#task-list .card.task b')));
  check('тап по делу — редактор', document.getElementById('o-task').classList.contains('on'));
  closeOverlay('o-task');

  // три раздела: «Мои дела», «Регулярные», «Сделанные»
  const regTitles = () => [...document.querySelectorAll('#reg-list .card.task b')].map((b) => b.textContent);
  const regCard = (title) => [...document.querySelectorAll('#reg-list .card.task')].find((c) => c.querySelector('b').textContent === title);
  const head = (sel) => (document.querySelector(sel + ' .sec-h') || {}).textContent || '';
  const reg0 = regTitles()[0]; // «Тренировка»: срок сегодня
  check('три раздела: регулярное — в «Регулярных», не в «Моих делах»',
    !!reg0 && head('#reg-list').startsWith('Регулярные') && !titles().includes(reg0));
  const doneBefore = db.done.length;
  await tap(at(regCard(reg0).querySelector('.checkbox'))); await sleep(500);
  check('регулярное: отметил — исчезает из «Регулярных» до конца дня, запись в «Сделанных»',
    !regTitles().includes(reg0) && !titles().includes(reg0) && db.done.length === doneBefore + 1 && !!doneWrap(reg0));
  check('регулярные все сделаны — раздел остаётся со счётчиком «Регулярные 0», без лишних надписей',
    head('#reg-list').replace(/\s+/g, ' ').trim() === 'Регулярные 0' && document.querySelector('#reg-list').textContent.replace(/\s+/g, ' ').trim() === 'Регулярные 0');
  await tap(at(doneWrap(reg0).querySelector('.checkbox')));
  check('регулярное: отмена выполнения возвращает его в «Регулярные»', regTitles().includes(reg0) && !doneWrap(reg0));
  await tap(at(regCard(reg0).querySelector('.checkbox'))); await sleep(500);
  db.done.find((d) => d.title === reg0).at -= 86400e3; renderTasks(); // наступил следующий день
  check('регулярное: на следующий день снова в «Регулярных»', regTitles().includes(reg0));
  db.tasks.push({ id: 800, title: 'Ждёт своего дня', due: Date.now() + 2 * 86400e3, rep: 'daily', pos: -100 }); renderTasks();
  const doneNow = db.done.length, waitTitle = 'Ждёт своего дня';
  await tap(at(regCard(waitTitle).querySelector('.checkbox')));
  check('ждущее своего дня не в счётчике: «Регулярные 0», карточка видна', head('#reg-list').replace(/\s+/g, ' ').trim() === 'Регулярные 0' && regTitles().includes(waitTitle));
  check('регулярное: заранее, до своего дня, не отмечается', regTitles().includes(waitTitle) && regCard(waitTitle).classList.contains('wait') && db.done.length === doneNow);
  const mine0 = titles()[0], m0 = document.querySelector('#task-list .card.task b'), pm = at(m0, 20);
  const pr = at(regCard(waitTitle));
  await hold(m0, pm, [pm[0], pr[1] + 10]);
  check('перенос не переводит дело в другой раздел', titles().includes(mine0) && !regTitles().includes(mine0) && regTitles().includes(waitTitle));

  // перенос
  for (let i = 1; i <= 14; i++) db.tasks.push({ id: 900 + i, title: 'Тест ' + i, due: null, rep: 'never', pos: 100 + i });
  renderTasks();
  const cards = () => document.querySelectorAll('#task-list .card.task');
  const step = cards()[1].getBoundingClientRect().top - cards()[0].getBoundingClientRect().top;
  const first = titles()[0], b0 = cards()[0].querySelector('b'), p0 = at(b0, 20);
  await hold(b0, p0, [p0[0], p0[1] + 3 * step]);
  check('удержание и перенос дела на 3 позиции вниз', titles().indexOf(first) === 3);
  const sc = document.getElementById('s-rock');
  const hotTop = document.getElementById('trash-btn').getBoundingClientRect().top - 46 - 12; // корзина пока спрятана на 46px ниже
  const second = titles()[1], b1 = cards()[1].querySelector('b'), p1 = at(b1, 20);
  await hold(b1, p1, [p1[0], hotTop - 30], 1500);
  check('автопрокрутка у нижнего края, корзина не срабатывает', sc.scrollTop > 0 && titles().indexOf(second) === titles().length - 1);
  sc.scrollTop = 0; await sleep(50);
  const third = titles()[0], b2 = cards()[0].querySelector('b'), tb = document.getElementById('trash-btn').getBoundingClientRect();
  await hold(b2, at(b2, 20), [tb.left + tb.width / 2, tb.top + tb.height / 2 - 46]);
  check('бросок в корзину + «Отменить»', !titles().includes(third) && document.getElementById('snack').classList.contains('on'));
  undoDelete();
  const c3 = cards()[2].querySelector('b'), [sx, sy] = at(c3, 20);
  c3.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', clientX: sx, clientY: sy, button: 0 }));
  c3.dispatchEvent(touchEv('touchmove', c3, sx, sy - 40));
  await sleep(HOLD_MS + 60);
  check('быстрый свайп — прокрутка, карточка не поднимается', !drag);
  c3.dispatchEvent(touchEv('touchend', c3, sx, sy - 40));
  // подсказка с Рокки: спрятана; лёгкое потягивание вниз её не открывает, тугое — открывает
  const heroH = () => document.getElementById('hero-wrap').offsetHeight;
  async function pullDown(dist) {
    sc.scrollTop = 0; await sleep(30);
    const el = cards()[0].querySelector('b'), [x, y] = at(el, 20);
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', clientX: x, clientY: y, button: 0 }));
    el.dispatchEvent(touchEv('touchstart', el, x, y));
    for (let i = 1; i <= 12; i++) { el.dispatchEvent(touchEv('touchmove', el, x, y + dist * i / 12)); await sleep(16); }
    el.dispatchEvent(touchEv('touchend', el, x, y + dist));
    await sleep(400);
  }
  go('notes'); go('rock'); sc.scrollTop = 0; await sleep(50);
  check('подсказка спрятана, камень начинается с «Моих дел»', heroH() === 0 && cards()[0].getBoundingClientRect().top < 120);
  await pullDown(70);
  check('лёгкое потягивание вниз — подсказка не открылась', heroH() === 0 && !drag);
  await pullDown(250);
  check('потянули на 250 px — ещё мало, подсказка не открылась', heroH() === 0 && !drag);
  await pullDown(380);
  check('тугое потягивание вниз (380 px) — подсказка открылась', heroH() > 100 && !drag);
  go('notes'); go('rock'); await sleep(50);
  check('ушли с камня и вернулись — подсказка снова спрятана', heroH() === 0);
  // палец коснулся в самом верху и дрогнул вниз, потом повёл вверх — браузеру прокрутку не запрещаем
  sc.scrollTop = 0; await sleep(30);
  { const el = cards()[0].querySelector('b'), [x, y] = at(el, 20);
    el.dispatchEvent(touchEv('touchstart', el, x, y));
    const free1 = el.dispatchEvent(touchEv('touchmove', el, x, y + 3)), free2 = el.dispatchEvent(touchEv('touchmove', el, x, y - 30));
    el.dispatchEvent(touchEv('touchend', el, x, y - 30)); await sleep(300);
    check('в самом верху палец дрогнул вниз, потом повёл вверх — прокрутка не запрещена', free1 && free2 && heroH() === 0); }
  // ноутбук: мышью или трекпадом — зажал и потянул вниз, так же туго, как пальцем; клик по делу после этого не срабатывает
  async function mousePull(dist) {
    document.querySelectorAll('.overlay.on').forEach((o) => o.classList.remove('on')); // синтетический click после броска в корзину попадает в «+»
    go('notes'); go('rock'); sc.scrollTop = 0; await sleep(50);
    const el = cards()[0].querySelector('b'), [x, y] = at(el, 20);
    const me = (type, yy, t = el) => t.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: yy, button: 0, buttons: type === 'mouseup' ? 0 : 1 }));
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse', clientX: x, clientY: y, button: 0 }));
    me('mousedown', y);
    for (let i = 1; i <= 12; i++) { const yy = y + dist * i / 12; me('mousemove', yy, document); document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse', clientX: x, clientY: yy })); await sleep(16); }
    me('mouseup', y + dist, document); document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse', clientX: x, clientY: y + dist }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y + dist }));
    await sleep(700);
  }
  await mousePull(200);
  check('ноутбук: потянул мышью на 200 px — мало, подсказка не открылась', heroH() === 0 && !document.getElementById('o-task').classList.contains('on'));
  await mousePull(380);
  check('ноутбук: потянул мышью на 380 px — подсказка открылась, редактор дела не открылся', heroH() > 100 && !document.getElementById('o-task').classList.contains('on'));
  go('notes'); go('rock'); sc.scrollTop = 0;
  // трекпад: докрутили снизу до «Моих дел» — инерция (тот же поток) подсказку не трогает;
  // отдельный жест в самом верху туго тянет её: мало — уходит обратно, на высоту экрана — открывается
  const wheel = (dy, t = sc) => t.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: dy }));
  go('notes'); go('rock'); sc.scrollTop = 600; await sleep(300);
  for (let i = 0; i < 60; i++) { wheel(-40); sc.scrollTop = Math.max(0, sc.scrollTop - 40); await sleep(16); }
  await sleep(500);
  check('трекпад: докрутили до верха по инерции — подсказка не вылезла', heroH() === 0 && sc.scrollTop === 0);
  for (let i = 0; i < 5; i++) { wheel(-80); await sleep(16); }
  await sleep(30); const partH = heroH();
  await sleep(900);
  check('трекпад: короткий жест в самом верху — подсказка туго показалась и ушла обратно', partH > 5 && partH < 80 && heroH() === 0);
  for (let i = 0; i < 20; i++) { wheel(-80); await sleep(16); }
  await sleep(900);
  check('трекпад: длинный жест в самом верху — подсказка открылась', heroH() > 100);
  go('notes'); go('rock'); sc.scrollTop = 0;
  // облако прислало правку, пока палец держит карточку (ждём удержания) — список не перерисовывается под пальцем
  { const card0 = cards()[0], el = card0.querySelector('b'), [x, y] = at(el, 20);
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', clientX: x, clientY: y, button: 0 }));
    el.dispatchEvent(touchEv('touchstart', el, x, y));
    const held = busy();
    el.dispatchEvent(touchEv('touchend', el, x, y)); await sleep(50);
    check('пока палец держит карточку, облако список не трогает (busy)', held && !busy() && card0.isConnected); }
  document.querySelectorAll('.overlay.on').forEach((o) => o.classList.remove('on')); // синтетический click после броска в корзину попадает в «+»
  sc.scrollTop = 0; await sleep(50);
  document.querySelector('.nav').dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 200 }));
  await sleep(50);
  check('Mac: колесо над нижней панелью тоже листает список', sc.scrollTop > 100);
  go('notes'); go('rock'); sc.scrollTop = 0;
  check('после жестов не осталось «призраков»', !drag && !document.querySelector('body > .card, body > .note-card, body > .done-wrap'));

  localStorage.removeItem('rockdo-demo');
  console.table(results);
  const failed = results.filter((r) => r.итог !== 'OK').length;
  console.log(failed ? `❌ ошибок: ${failed}` : `✅ все ${results.length} сценариев прошли (версия ${APP_VERSION})`);
})();
