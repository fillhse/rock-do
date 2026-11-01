/* Проверка окна срока (колёса «Дата», «Час», «Минуты» и «Повтор») перед выкладкой.
   Как запустить: открыть приложение, вставить этот файл в консоль. Данные приложения будут сброшены. */
(async () => {
  localStorage.removeItem('rockdo-demo');
  if (!sessionStorage.getItem('picker-test')) { sessionStorage.setItem('picker-test', '1'); location.reload(); return console.log('Перезагрузка со стартовыми данными — вставь скрипт ещё раз.'); }
  sessionStorage.removeItem('picker-test');

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const results = [];
  const check = (name, ok) => results.push({ сценарий: name, итог: ok ? 'OK' : 'ОШИБКА' });
  const summary = () => document.getElementById('p-summary').textContent;
  const dayStart = (ms) => new Date(ms).setHours(0, 0, 0, 0);
  // нажать на значение колеса (ближайшее к середине с таким текстом)
  function tapWheel(id, text) {
    const w = document.getElementById(id), mid = w.scrollTop + w.clientHeight / 2;
    const cells = [...w.querySelectorAll('.item')].filter((c) => c.textContent === text);
    cells.sort((a, b) => Math.abs(a.offsetTop - mid) - Math.abs(b.offsetTop - mid))[0].click();
  }
  async function newTask(title) { openTaskEditor(null); await sleep(50); document.getElementById('t-title').value = title; onTitleInput(); openPicker(); await sleep(80); }
  async function saveIt() { pickOk(); await sleep(30); saveTask(); await sleep(50); return db.tasks.find((t) => t.id === Math.max(...db.tasks.map((x) => x.id))); }

  // как раньше: дата, час, минуты — по умолчанию завтра 10:00
  await newTask('Ко времени');
  check('окно как раньше: колёса Дата/Час/Минуты и «Повтор», по умолчанию завтра 10:00',
    !!document.getElementById('w-day') && /10:00$/.test(summary()) && document.getElementById('p-rep-label').textContent === 'Никогда');
  let t = await saveIt();
  check('сохранилось ко времени: завтра 10:00', !t.allDay && /Завтра 10:00/.test(fmtDue(t.due, t.allDay)));

  // без времени — положение «—» на колесе часов
  await newTask('Без времени');
  check('на колесе часов есть «—» (без времени)', [...document.querySelectorAll('#w-hour .item')].some((c) => c.textContent === '—'));
  tapWheel('w-hour', '—'); await sleep(40);
  check('час «—»: в заголовке «без времени», минуты приглушены', /без времени$/.test(summary()) && document.getElementById('wd-min').classList.contains('idle'));
  t = await saveIt();
  check('сохранилось без времени: на камне «Завтра», без часов', t.allDay && fmtDue(t.due, true) === 'Завтра' && !/\d\d:\d\d/.test(document.getElementById('task-' + t.id).textContent));
  openTaskEditor(t.id); await sleep(30); openPicker(); await sleep(80);
  check('открыл дело без времени — колесо часов снова на «—»', document.querySelector('#w-hour .item.sel').textContent === '—' && /без времени$/.test(summary()));
  tapWheel('w-hour', '09'); await sleep(40);
  check('выбрал час — минуты снова доступны, время вернулось', !document.getElementById('wd-min').classList.contains('idle') && /09:\d\d$/.test(summary()));
  cancelPicker(); closeOverlay('o-task');

  // повтор по дням недели без времени — то, чего не хватало
  await newTask('Спортзал');
  tapWheel('w-hour', '—'); await sleep(30);
  openSheet('rep-sheet'); [1, 3, 5].forEach((d) => toggleDay(d)); closeSheet('rep-sheet'); await sleep(30);
  check('повтор Пн, Ср, Пт', document.getElementById('p-rep-label').textContent === 'Пн, Ср, Пт');
  t = await saveIt();
  check('сохранилось: Пн/Ср/Пт без времени, первый раз — ближайший из них, в «Регулярных»',
    t.allDay && t.rep === 'days:1,3,5' && [1, 3, 5].includes(isoDay(new Date(t.due))) && new Date(t.due).getHours() === 0 &&
    !!document.querySelector('#reg-list #task-' + t.id) && !/\d\d:\d\d/.test(document.getElementById('task-' + t.id).textContent));

  // без времени сегодня — не «пропущено», пока день не кончился
  check('без времени сегодня — «Сегодня», а не «пропущено»', fmtDue(new Date().setHours(0, 0, 0, 0), true) === 'Сегодня');
  check('без времени вчера — «пропущено»', fmtDue(new Date().setHours(0, 0, 0, 0) - DAY, true) === 'пропущено');

  // отметил регулярное без времени — следующий раз в следующий выбранный день, тоже без времени
  const gym = db.tasks.find((x) => x.title === 'Спортзал');
  if (!isWaiting(gym)) {
    completeTask(gym.id); await sleep(500);
    check('отметил «Спортзал» — следующий раз в другой из Пн/Ср/Пт, без времени',
      [1, 3, 5].includes(isoDay(new Date(gym.due))) && new Date(gym.due).getHours() === 0 && dayStart(gym.due) > dayStart(Date.now()));
  }

  // ✕ отменяет повтор, выбранный в окне
  openTaskEditor(gym.id); await sleep(30); openPicker(); await sleep(60);
  setRep('daily'); cancelPicker(); await sleep(20);
  check('✕ отменяет повтор, выбранный в окне', pickRep === 'days:1,3,5');
  closeOverlay('o-task');

  // рамка выбора стоит на месте посередине колеса
  openTaskEditor(null); await sleep(30); openPicker(); await sleep(60);
  const w = document.getElementById('w-day'), col = w.parentElement, band = () => parseFloat(getComputedStyle(col, '::before').top);
  const b0 = band(); w.scrollTop += 43 * 3; await sleep(200);
  check('рамка выбора не уезжает вместе с датой', band() === b0 && b0 > 0);
  cancelPicker(); closeOverlay('o-task');

  localStorage.removeItem('rockdo-demo');
  console.table(results);
})();
