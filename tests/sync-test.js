/* Проверка облака Telegram перед выкладкой.
   Как запустить: открыть приложение в браузере (вне Telegram), вставить этот файл в консоль.
   Настоящий CloudStorage заменяется имитацией с теми же правилами и лимитами Telegram:
   ключ 1–128 символов A-Za-z0-9_-, значение до 4096 символов, не больше 1024 ключей.
   «Второе устройство» имитируется прямой правкой содержимого облака. Данные приложения будут сброшены. */
(async () => {
  localStorage.removeItem('rockdo-demo');
  if (!sessionStorage.getItem('sync-test')) { sessionStorage.setItem('sync-test', '1'); location.reload(); return console.log('Перезагрузка со стартовыми данными — вставь скрипт ещё раз.'); }
  sessionStorage.removeItem('sync-test');

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const results = [];
  const check = (name, ok) => results.push({ сценарий: name, итог: ok ? 'OK' : 'ОШИБКА' });

  // имитация CloudStorage
  let store = {}, offline = false, violations = [];
  const answer = (cb, err, val) => setTimeout(() => cb(err, val), 5);
  const mock = {
    setItem(k, v, cb) {
      if (offline) return answer(cb, 'NETWORK');
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(k)) violations.push('ключ ' + k);
      if (String(v).length > 4096) violations.push('длина ' + k + ' = ' + String(v).length);
      if (!(k in store) && Object.keys(store).length >= 1024) violations.push('больше 1024 ключей');
      store[k] = String(v); answer(cb, null, true);
    },
    getItem(k, cb) { offline ? answer(cb, 'NETWORK') : answer(cb, null, store[k] ?? ''); },
    getItems(ks, cb) { offline ? answer(cb, 'NETWORK') : answer(cb, null, Object.fromEntries(ks.map((k) => [k, store[k] ?? '']))); },
    getKeys(cb) { offline ? answer(cb, 'NETWORK') : answer(cb, null, Object.keys(store)); },
    removeItems(ks, cb) { if (offline) return answer(cb, 'NETWORK'); ks.forEach((k) => delete store[k]); answer(cb, null, true); },
  };
  const remote = () => cloudUnpack(store);                      // что лежит в облаке
  const fromDevice2 = (edit) => { const d = remote(); edit(d); store = cloudPack(d); }; // правка «с компьютера»
  const userAction = async (fn) => { fn(); save(); clearTimeout(cloudTimer); await cloudSync(); };
  const titles = (kind) => db[kind].map((x) => x.title);

  // 1. первая синхронизация: телефон с данными, облако пустое
  db.fresh = false;
  cloud = mock;
  await userAction(() => { db.tasks.push({ id: newId(), title: 'Купить хлеб', due: null, rep: 'never', pos: -50 }); });
  check('первая сверка: данные телефона ушли в облако', JSON.stringify(remote().tasks.map((t) => t.title).sort()) === JSON.stringify(titles('tasks').sort()));

  // 2. длинная заметка: режется на куски в пределах лимитов и собирается обратно
  const long = 'Длинный текст заметки с кириллицей. '.repeat(700); // ~25 000 символов
  await userAction(() => { db.notes.push({ id: newId(), title: 'Большая', body: long, at: Date.now(), pos: -50 }); });
  check('длинная заметка: куски ≤ 4096, собирается без потерь', violations.length === 0 && remote().notes.find((n) => n.title === 'Большая').body === long);

  // 3. правки с другого устройства подтягиваются
  await sleep(10);
  const later = Date.now(); // правка на компьютере — сейчас, позже правок на телефоне
  fromDevice2((d) => {
    d.tasks.push({ id: later, title: 'С компьютера', due: null, rep: 'never', pos: -60, upd: later });
    const q = d.notes.find((n) => n.title === 'Цитата'); q.title = 'Цитата (правка)'; q.upd = later;
    const bread = d.tasks.find((t) => t.title === 'Купить хлеб'); d.tasks = d.tasks.filter((t) => t !== bread); d.deleted['t:' + bread.id] = later;
  });
  await cloudSync();
  check('другое устройство: новое дело, правка и удаление пришли на телефон',
    titles('tasks').includes('С компьютера') && titles('notes').includes('Цитата (правка)') && !titles('tasks').includes('Купить хлеб') &&
    !!document.querySelector('#task-list') && [...document.querySelectorAll('#task-list b')].some((b) => b.textContent === 'С компьютера'));

  // 4. конфликт: более поздняя правка побеждает
  await sleep(10);
  await userAction(() => { db.tasks.find((t) => t.title === 'С компьютера').title = 'С компьютера (правка на телефоне)'; });
  check('конфликт: побеждает более поздняя правка, она же ушла в облако',
    titles('tasks').includes('С компьютера (правка на телефоне)') && remote().tasks.some((t) => t.title === 'С компьютера (правка на телефоне)'));

  // 5. удаление с «Отменить»
  const victim = db.tasks.find((t) => t.title === 'Позвонить маме');
  removeWithUndo('tasks', victim.id, 'Задача удалена'); clearTimeout(cloudTimer); await cloudSync();
  const goneInCloud = !remote().tasks.some((t) => t.id === victim.id);
  undoDelete(); clearTimeout(cloudTimer); await cloudSync();
  check('удаление уходит в облако, «Отменить» возвращает и там', goneInCloud && remote().tasks.some((t) => t.id === victim.id) && titles('tasks').includes('Позвонить маме'));

  // 6. выполнение регулярного и история
  const reg = db.tasks.find((t) => t.rep === 'daily');
  completeTask(reg.id); await sleep(500); clearTimeout(cloudTimer); await cloudSync();
  check('выполненное и новая дата регулярного — в облаке',
    remote().done.some((d) => d.taskId === reg.id) && remote().tasks.find((t) => t.id === reg.id).due === reg.due);

  // 7. новое устройство со стартовыми примерами получает облако целиком, примеры в облако не попадают
  const cloudBefore = JSON.stringify(remote());
  const fresh = seedDb(); Object.assign(db, fresh); takeSnap(); cloudKeys = {};
  await cloudSync();
  check('новое устройство: облако целиком, стартовые примеры не смешались',
    JSON.stringify(remote()) === cloudBefore && titles('tasks').includes('С компьютера (правка на телефоне)') && !db.fresh);

  // 8. без сети: ничего не ломается, данные на месте; сеть вернулась — догоняет
  offline = true;
  await userAction(() => { db.tasks.push({ id: newId(), title: 'Без сети', due: null, rep: 'never', pos: -70 }); });
  const keptOffline = titles('tasks').includes('Без сети') && JSON.parse(localStorage.getItem('rockdo-demo')).tasks.some((t) => t.title === 'Без сети');
  offline = false; await cloudSync();
  check('без сети: локально сохранено; сеть вернулась — ушло в облако', keptOffline && remote().tasks.some((t) => t.title === 'Без сети'));

  // 9. данные уменьшились — лишние куски из облака удалены
  const keysBefore = Object.keys(store).length;
  await userAction(() => { db.notes = db.notes.filter((n) => n.title !== 'Большая'); });
  check('удалили большую заметку — лишние куски убраны из облака', Object.keys(store).length < keysBefore && Object.keys(store).every((k) => k === 'idx' || /^[tndm]\d+$/.test(k)));

  // 10. облако повреждено (кусок записан наполовину): локальные данные не теряются, со второй попытки облако чинится
  const localBefore = JSON.stringify(db.tasks);
  delete store.t0;
  await cloudSync();
  const intact = JSON.stringify(db.tasks) === localBefore;
  await cloudSync();
  check('повреждённое облако: локальное цело, облако восстановлено', intact && JSON.stringify(remote().tasks) === JSON.stringify(db.tasks));

  // 11. id не совпадают между устройствами
  const ids = [newId(), newId(), newId()];
  check('новые id уникальны и не меньше текущего времени', new Set(ids).size === 3 && ids.every((i) => i >= Date.now() - 1000));

  check('лимиты Telegram ни разу не нарушены', violations.length === 0);

  cloud = null; localStorage.removeItem('rockdo-demo');
  console.table(results);
  const failed = results.filter((r) => r.итог !== 'OK').length;
  console.log(failed ? `❌ ошибок: ${failed}` + (violations.length ? ' · ' + violations.join('; ') : '') : `✅ все ${results.length} сценариев прошли (версия ${APP_VERSION})`);
})();
