/* Проверка окна «Когда сделать» (срок и повтор дела) перед выкладкой.
   Как запустить: открыть приложение, вставить этот файл в консоль. Данные приложения будут сброшены. */
(async () => {
  localStorage.removeItem('rockdo-demo');
  if (!sessionStorage.getItem('picker-test')) { sessionStorage.setItem('picker-test', '1'); location.reload(); return console.log('Перезагрузка со стартовыми данными — вставь скрипт ещё раз.'); }
  sessionStorage.removeItem('picker-test');

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const results = [];
  const check = (name, ok) => results.push({ сценарий: name, итог: ok ? 'OK' : 'ОШИБКА' });
  const shown = (id) => getComputedStyle(document.getElementById(id)).display !== 'none';
  const segOn = (id) => document.querySelector(`#${id} button.on`).textContent;
  const click = (sel, text) => [...document.querySelectorAll(sel)].find((b) => b.textContent === text).click();
  const dayStart = (ms) => new Date(ms).setHours(0, 0, 0, 0);
  async function newTask(title) { openTaskEditor(null); await sleep(50); document.getElementById('t-title').value = title; onTitleInput(); openPicker(); await sleep(60); }
  async function saveIt() { pickOk(); await sleep(30); saveTask(); await sleep(50); return db.tasks.find((t) => t.id === Math.max(...db.tasks.map((x) => x.id))); }

  // по умолчанию: один раз, ко времени — дата, часы и минуты
  await newTask('Разовое ко времени');
  check('по умолчанию: «Один раз», «Ко времени» — видны дата, часы, минуты; дней недели нет',
    segOn('p-rep') === 'Один раз' && segOn('p-time') === 'Ко времени' && shown('wd-day') && shown('wd-hour') && shown('wd-min') && !shown('days-row'));
  let t = await saveIt();
  check('сохранилось ко времени: срок завтра в 10:00', !t.allDay && new Date(t.due).getHours() === 10 && /Завтра 10:00/.test(fmtDue(t.due, t.allDay)));

  // весь день, один раз — без часов и минут; на камне без времени
  await newTask('Разовое на весь день');
  click('#p-time button', 'Весь день'); await sleep(40);
  check('«Весь день»: часы и минуты спрятаны, в заголовке «весь день»', !shown('wd-hour') && !shown('wd-min') && shown('wd-day') && /весь день/.test(document.getElementById('p-summary').textContent));
  t = await saveIt();
  check('сохранилось на весь день: без времени — «Завтра»', t.allDay && fmtDue(t.due, true) === 'Завтра' && document.getElementById('task-' + t.id).textContent.includes('Завтра') && !/Завтра \d/.test(document.getElementById('task-' + t.id).textContent));

  // по дням недели без времени — то, чего не хватало
  await newTask('Спортзал');
  click('#p-rep button', 'По дням'); await sleep(40);
  check('«По дням»: колесо даты спрятано, видны дни недели, один уже выбран', !shown('wd-day') && shown('days-row') && document.querySelectorAll('#days-row .day-chip.sel').length === 1);
  const wanted = [1, 3, 5]; // Пн, Ср, Пт
  document.querySelectorAll('#days-row .day-chip.sel').forEach((c) => c.click()); await sleep(20); // оставим один — последний снять нельзя
  wanted.forEach((d) => { if (!repDays(pickRep).includes(d)) toggleDay(d); });
  repDays(pickRep).filter((d) => !wanted.includes(d)).forEach((d) => toggleDay(d));
  click('#p-time button', 'Весь день'); await sleep(40);
  check('выбраны Пн, Ср, Пт, весь день — колёс нет, заголовок «Пн, Ср, Пт, весь день»', pickRep === 'days:1,3,5' && !shown('wd-hour') && document.getElementById('p-summary').textContent === 'Пн, Ср, Пт, весь день');
  t = await saveIt();
  const first = new Date(t.due);
  check('первый раз — ближайший из Пн/Ср/Пт начиная с сегодня, без времени',
    t.allDay && t.rep === 'days:1,3,5' && wanted.includes(isoDay(first)) && first.getHours() === 0 && dayStart(t.due) >= dayStart(Date.now()) && dayStart(t.due) - dayStart(Date.now()) < 4 * DAY);
  check('в разделе «Регулярные», срок без времени', document.querySelector('#reg-list #task-' + t.id) && !/\d\d:\d\d/.test(document.getElementById('task-' + t.id).textContent));

  // весь день сегодня — не «пропущено», пока день не кончился
  check('дело на весь день сегодня — «Сегодня», а не «пропущено»', fmtDue(new Date().setHours(0, 0, 0, 0), true) === 'Сегодня' && !isOverdue(new Date().setHours(0, 0, 0, 0), true));
  check('вчерашнее на весь день — «пропущено»', fmtDue(new Date().setHours(0, 0, 0, 0) - DAY, true) === 'пропущено');

  // каждый день ко времени, которое сегодня уже прошло, — с завтра
  await newTask('Каждый день в 00:00');
  click('#p-rep button', 'Каждый день'); await sleep(40);
  check('«Каждый день»: даты нет, время есть', !shown('wd-day') && shown('wd-hour'));
  pHour = 0; pMin = 0;
  t = await saveIt();
  check('каждый день в 00:00 — первый раз завтра', sameDay(t.due, Date.now() + DAY) && new Date(t.due).getHours() === 0 && !t.allDay);

  // отметили регулярное на весь день — следующий раз в следующий выбранный день, тоже без времени
  const gym = db.tasks.find((x) => x.title === 'Спортзал');
  if (!isWaiting(gym)) {
    completeTask(gym.id); await sleep(500);
    check('отметил «Спортзал» — следующий раз в другой из Пн/Ср/Пт, без времени', wanted.includes(isoDay(new Date(gym.due))) && new Date(gym.due).getHours() === 0 && dayStart(gym.due) > dayStart(Date.now()));
  }

  // ✕ — отмена всего выбранного в окне
  openTaskEditor(gym.id); await sleep(30); openPicker(); await sleep(40);
  click('#p-rep button', 'Один раз'); click('#p-time button', 'Ко времени'); await sleep(30);
  cancelPicker(); await sleep(20);
  check('✕ отменяет выбранное в окне: остаётся «по дням, весь день»', pickRep === 'days:1,3,5' && pickAllDay);
  closeOverlay('o-task');

  // старое «каждую неделю» открывается как «по дням» с тем же днём
  db.tasks.push({ id: newId(), title: 'Старое еженедельное', due: todayAt(9, 0) + 2 * DAY, rep: 'weekly', pos: topPos(db.tasks) }); save(); renderAll();
  openTaskEditor(db.tasks[db.tasks.length - 1].id); await sleep(30); openPicker(); await sleep(40);
  check('старое «каждую неделю» — это «По дням» с тем же днём недели', segOn('p-rep') === 'По дням' && pickRep === 'days:' + isoDay(new Date(todayAt(9, 0) + 2 * DAY)));
  cancelPicker(); closeOverlay('o-task');

  localStorage.removeItem('rockdo-demo');
  console.table(results);
})();
