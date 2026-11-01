/* Проверка порядка «Регулярных» (распорядок дня) перед выкладкой.
   Как запустить: открыть приложение, вставить этот файл в консоль. Данные приложения будут сброшены. */
(async () => {
  localStorage.removeItem('rockdo-demo');
  if (!sessionStorage.getItem('order-test')) { sessionStorage.setItem('order-test', '1'); location.reload(); return console.log('Перезагрузка со стартовыми данными — вставь скрипт ещё раз.'); }
  sessionStorage.removeItem('order-test');

  const results = [];
  const check = (name, ok) => results.push({ сценарий: name, итог: ok ? 'OK' : 'ОШИБКА' });
  const today = new Date().setHours(0, 0, 0, 0), at = (h, m = 0, days = 0) => new Date(today + days * DAY).setHours(h, m, 0, 0);
  const tomorrowOnly = 'days:' + isoDay(new Date(today + DAY)); // дело, чей день — только завтра
  const add = (title, due, rep, extra = {}) => db.tasks.push({ id: newId(), title, due, rep, pos: db.tasks.length, ...extra });
  db.tasks = [];
  add('Вечерняя прогулка', at(19), 'daily');
  add('Ждёт завтра', at(9, 0, 1), tomorrowOnly);
  add('Без времени Б', today, 'daily', { allDay: true });
  add('Обед ровно в 13', at(13), 'daily');
  add('Зарядка', at(7, 30), 'daily');
  add('Без времени А', today, 'daily', { allDay: true, pos: -5 });
  add('Пропущено вчера', at(9, 0, -1), 'daily');
  add('Созвон в 12', at(12), 'daily');
  add('Ждёт послезавтра', at(8, 0, 2), 'days:' + isoDay(new Date(today + 2 * DAY)));
  save(); renderTasks();
  const order = [...document.querySelectorAll('#reg-list .card.task b')].map((b) => b.textContent);
  const want = ['Пропущено вчера', 'Зарядка', 'Созвон в 12', 'Обед ровно в 13', 'Без времени А', 'Без времени Б', 'Вечерняя прогулка', 'Ждёт завтра', 'Ждёт послезавтра'];
  check('распорядок: пропущенное → утро → 12:00 → 13:00 → без времени → вечер → ждущие своего дня', JSON.stringify(order) === JSON.stringify(want));
  check('без времени — между ними порядок, в котором расставили (А раньше Б)', order.indexOf('Без времени А') < order.indexOf('Без времени Б'));
  check('счётчик «Регулярных» — без ждущих своего дня', document.querySelector('#reg-list .sec-h b').textContent === '7');
  if (JSON.stringify(order) !== JSON.stringify(want)) console.log('получилось:', order);

  localStorage.removeItem('rockdo-demo');
  console.table(results);
})();
