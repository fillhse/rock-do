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
  const regOrder = () => [...document.querySelectorAll('#reg-list .card.task b')].map((b) => b.textContent);
  db.tasks = [];
  add('Вечерняя прогулка', at(19), 'daily');
  add('Ждёт завтра', at(9, 0, 1), tomorrowOnly);
  add('Без времени Б', today, 'daily', { allDay: true });
  add('Обед в 13', at(13), 'daily');
  add('Зарядка', at(7, 30), 'daily');
  add('Без времени А', today, 'daily', { allDay: true, pos: -5 });
  add('Пропущено вчера', at(9, 0, -1), 'daily');
  add('Встреча в 14:30', at(14, 30), 'daily');
  add('Ждёт послезавтра', at(8, 0, 2), 'days:' + isoDay(new Date(today + 2 * DAY)));
  save(); renderTasks();
  let order = regOrder();
  const want = ['Пропущено вчера', 'Зарядка', 'Обед в 13', 'Без времени А', 'Встреча в 14:30', 'Без времени Б', 'Вечерняя прогулка', 'Ждёт завтра', 'Ждёт послезавтра'];
  check('распорядок: пропущенное → утро → 13:00 → без времени А (14:00) → 14:30 → без времени Б (14:30) → вечер → ждущие', JSON.stringify(order) === JSON.stringify(want));
  if (JSON.stringify(order) !== JSON.stringify(want)) console.log('получилось:', order);
  check('счётчик «Регулярных» — без ждущих своего дня', document.querySelector('#reg-list .sec-h b').textContent === '7');

  // много дел без времени: через 30 минут до 18:00, остальные — в 18:00 (раньше дела в 18:30)
  db.tasks = [];
  for (let i = 0; i < 12; i++) add('Б/в ' + two(i), today, 'daily', { allDay: true, pos: i });
  add('В 16:10', at(16, 10), 'daily'); add('В 18:00', at(18), 'daily'); add('В 18:30', at(18, 30), 'daily');
  save(); renderTasks();
  order = regOrder();
  const idx = (x) => order.indexOf(x);
  check('без времени через 30 минут: 00 (14:00) … 04 (16:00), потом «В 16:10», потом 05 (16:30)',
    idx('Б/в 04') < idx('В 16:10') && idx('В 16:10') < idx('Б/в 05'));
  check('с 18:00 все остальные без времени — сразу после дела в 18:00 и до дела в 18:30',
    idx('В 18:00') < idx('Б/в 08') && ['Б/в 08', 'Б/в 09', 'Б/в 10', 'Б/в 11'].every((x) => idx(x) < idx('В 18:30')) && idx('Б/в 11') === idx('В 18:30') - 1);

  localStorage.removeItem('rockdo-demo');
  console.table(results);
})();
