/* Проверка «Речки» (камушек дня) перед выкладкой.
   Как запустить: открыть приложение, вставить этот файл в консоль. Данные приложения будут сброшены.
   Время суток подменяется (утро/вечер), чтобы пройти весь день за несколько секунд. */
(async () => {
  localStorage.removeItem('rockdo-demo');
  if (!sessionStorage.getItem('river-test')) { sessionStorage.setItem('river-test', '1'); location.reload(); return console.log('Перезагрузка со стартовыми данными — вставь скрипт ещё раз.'); }
  sessionStorage.removeItem('river-test');

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const results = [];
  const check = (name, ok) => results.push({ сценарий: name, итог: ok ? 'OK' : 'ОШИБКА' });
  const realHours = Date.prototype.getHours;
  const at = (h) => { Date.prototype.getHours = function () { return h; }; };
  const body = () => document.getElementById('rv-body');
  const title = () => document.getElementById('rv-title').textContent;
  const streakTxt = () => { const s = document.getElementById('rv-streak'); return s.hidden ? '' : s.textContent; };

  try {
    // утро: выбор камушка дня
    at(8); go('river'); await sleep(50);
    const pebs = body().querySelectorAll('.rv-peb');
    check('утро: «Камушек дня» — список дел с камня, бросить нельзя, пока не выбран',
      title() === 'Камушек дня' && pebs.length === riverOpen().length && pebs.length > 0 && document.getElementById('throw-btn').disabled);
    const pickId = riverOpen()[0].id, pickTitle = riverOpen()[0].title;
    body().querySelector('.rv-peb').click(); await sleep(30);
    check('выбрал дело — оно подсвечено, бросить можно', body().querySelector('.rv-peb.on') && !document.getElementById('throw-btn').disabled);
    document.getElementById('throw-btn').click();
    await sleep(1050); // всплеск — на 0,9 с, круги живут 1,5 с
    const ripples = document.querySelectorAll('#s-river .rv-ripple').length;
    await sleep(300);
    check('бросок: камушек летит, по воде круги, после — карточка «в пути» и совет',
      ripples > 0 && db.river.taskId === pickId && db.river.date === localDay() &&
      body().querySelector('.rv-today .st').textContent === 'в пути' && body().querySelector('.rv-text').textContent.length > 20);
    check('кнопки «Донёс — отметить» нет', !/отметить/i.test(body().textContent));

    // днём отметил кружком на карточке — донёс, серия 1
    body().querySelector('.rv-today .hit').click();
    await sleep(700);
    check('кружок на карточке: дело выполнено, камушек «донёс», серия «1 день подряд»',
      !db.tasks.some((t) => t.id === pickId && !isRepeating(t)) && body().querySelector('.rv-today.done') && /^1 день/.test(streakTxt()));

    // вечер: итог
    at(19); renderRiver(); await sleep(30);
    check('вечер: «Донёс!»', title() === 'Донёс!' && body().textContent.includes(pickTitle));

    // отменил выполнение — «донёс» честно пропал, вечером предлагают перенести или отпустить
    const rec = db.done.find((d) => d.taskId === pickId);
    restoreDone(rec.id); await sleep(30);
    save(); // как в приложении: сохранение снимает отметку об удалении
    check('вернул сделанное — то же дело: прежний id, отметки об удалении нет', db.tasks.some((t) => t.id === pickId && t.title === pickTitle) && !db.deleted['t:' + pickId]);
    renderRiver(); await sleep(30);
    check('отменил выполнение — серии нет, вечером: «на завтра» или «отпустить»',
      !streakTxt() && body().querySelector('.rv-today .st').textContent === 'в пути' && /На завтра/.test(body().textContent));
    [...body().querySelectorAll('button')].find((b) => /На завтра/.test(b.textContent)).click(); await sleep(30);
    check('«На завтра» — камушек ждёт утром', /ждёт утром/.test(body().textContent) && db.river.carry === pickId);

    // следующее утро: перенесённый выбран заранее
    db.river.date = '2000-01-01'; save();
    at(8); riverPick = null; renderRiver(); await sleep(30);
    check('следующее утро: перенесённый камушек уже выбран', body().querySelector('.rv-peb.on b').textContent === pickTitle);

    // дело удалено с камня — не пишем «Отпустили», этого никто не делал
    at(8); db.river = { ...db.river, date: localDay(), taskId: pickId, carry: null, released: false }; db.tasks = db.tasks.filter((t) => t.id !== pickId); save(); renderAll();
    at(19); renderRiver(); await sleep(30);
    check('дело удалено с камня — вечером «Дела больше нет на камне», а не «Отпустили»', /Дела больше нет на камне/.test(body().textContent) && !/Отпустили/.test(body().textContent));
    db.river = null; at(8);

    // всё сделано — бросать нечего, совет про отдых
    db.tasks = []; save(); renderAll(); renderRiver(); await sleep(30);
    check('всё сделано: списка нет, совет из «отдыха»', !body().querySelector('.rv-peb') && ADVICE.clear.some((t) => body().textContent.includes(t.split('\n')[0])));
  } finally {
    Date.prototype.getHours = realHours;
  }
  localStorage.removeItem('rockdo-demo');
  console.table(results);
})();
