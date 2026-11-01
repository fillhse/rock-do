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
  const fresh = seedDb(); for (const k of Object.keys(db)) delete db[k]; // новое устройство — с чистого листа
  Object.assign(db, fresh); takeSnap(); cloudKeys = {};
  await cloudSync();
  check('новое устройство: облако целиком, стартовые примеры не смешались',
    JSON.stringify(remote()) === cloudBefore && titles('tasks').includes('С компьютера (правка на телефоне)') && !db.fresh);

  // 7б. второе устройство со СТАРЫМИ данными (сохранены прежней версией: без учёта правок и отметки о сверке).
  // Так было на компьютере: его примеры объединились с телефоном — выполненное «воскресло», появились дубли
  const cloudNow = JSON.stringify(remote());
  const legacy = seedDb(); delete legacy.fresh; delete legacy.deleted;
  legacy.tasks[0].due = null; legacy.done = [{ id: 5, title: 'Старое сделанное', at: Date.now() - 86400e3 }]; // не просто примеры
  localStorage.setItem('rockdo-demo', JSON.stringify(legacy));
  const loaded = loadDb();
  for (const k of Object.keys(db)) delete db[k];
  Object.assign(db, loaded); takeSnap(); cloudKeys = {};
  await cloudSync();
  const dupes = (list) => list.length !== new Set(list).size;
  check('устройство со старыми данными берёт облако целиком: без дублей и «воскресших» дел, своё — в резервной копии',
    JSON.stringify(remote()) === cloudNow && JSON.stringify(db.tasks) === JSON.stringify(remote().tasks) &&
    !dupes(titles('tasks')) && !!localStorage.getItem('rockdo-demo-before-cloud') && db.synced === true);
  // обратный порядок: облако пустое, первым сверяется устройство со старыми нетронутыми примерами — их не отправляем
  const storeSaved = store; store = {}; cloudKeys = {};
  localStorage.setItem('rockdo-demo', JSON.stringify((() => { const d = seedDb(); delete d.fresh; return d; })()));
  const old = loadDb();
  for (const k of Object.keys(db)) delete db[k];
  Object.assign(db, old); takeSnap();
  await cloudSync();
  check('старые нетронутые примеры в пустое облако не уходят', old.fresh === true && Object.keys(store).length === 0);
  store = storeSaved; cloudKeys = {};
  for (const k of Object.keys(db)) delete db[k];
  Object.assign(db, remote(), { synced: true, fresh: false, guideNote: true, seedOrder: true }); takeSnap();

  // 8. без сети: ничего не ломается, данные на месте; сеть вернулась — догоняет
  offline = true;
  await userAction(() => { db.tasks.push({ id: newId(), title: 'Без сети', due: null, rep: 'never', pos: -70 }); });
  const keptOffline = titles('tasks').includes('Без сети') && JSON.parse(localStorage.getItem('rockdo-demo')).tasks.some((t) => t.title === 'Без сети');
  offline = false; await cloudSync();
  check('без сети: локально сохранено; сеть вернулась — ушло в облако', keptOffline && remote().tasks.some((t) => t.title === 'Без сети'));

  // 9. данные уменьшились — лишние куски из облака удалены
  const keysBefore = Object.keys(store).length;
  await userAction(() => { db.notes = db.notes.filter((n) => n.title !== 'Большая'); });
  check('удалили большую заметку — лишние куски убраны из облака', Object.keys(store).length < keysBefore && Object.keys(store).every((k) => k === 'idx' || k === 'rev' || /^[tndm]\d+$/.test(k)));

  // 10. облако повреждено (кусок записан наполовину): локальные данные не теряются, со второй попытки облако чинится
  const localBefore = JSON.stringify(db.tasks);
  delete store.t0;
  await cloudSync();
  const intact = JSON.stringify(db.tasks) === localBefore;
  for (let i = 0; i < 8 && !store.t0; i++) await cloudSync(); // даём «чужой записи» шанс долететь, потом чиним своей копией
  check('повреждённое облако: локальное цело, облако восстановлено', intact && JSON.stringify(remote().tasks) === JSON.stringify(db.tasks));

  // 11. id не совпадают между устройствами
  const ids = [newId(), newId(), newId()];
  check('новые id уникальны и не меньше текущего времени', new Set(ids).size === 3 && ids.every((i) => i >= Date.now() - 1000));

  // 12. живая сверка: пока Rocky открыт, правка с другого устройства появляется сама
  let revReads = 0, fullReads = 0;
  const getItem0 = mock.getItem, getItems0 = mock.getItems;
  mock.getItem = (k, cb) => { if (k === 'rev') revReads++; getItem0(k, cb); };
  mock.getItems = (ks, cb) => { fullReads++; getItems0(ks, cb); };
  pollDelay = POLL_MS; schedulePoll();
  await sleep(1300);
  const idleFull = fullReads, idleRev = revReads;
  const t0 = Date.now();
  fromDevice2((d) => { d.tasks.push({ id: Date.now(), title: 'Живая правка', due: null, rep: 'never', pos: -80, upd: Date.now() }); });
  store.rev = 'dev2-' + Date.now(); // другое устройство обновило метку
  let seenAfter = null;
  while (Date.now() - t0 < 3000) {
    if ([...document.querySelectorAll('#task-list b')].some((b) => b.textContent === 'Живая правка')) { seenAfter = Date.now() - t0; break; }
    await sleep(25);
  }
  check(`живая сверка: правка с другого устройства появилась на экране сама (${seenAfter} мс)`, seenAfter !== null && seenAfter < 1200);
  check(`без изменений читается только метка (${idleRev} раз за 1,3 с), данные не перечитываются`, idleFull === 0 && idleRev >= 2);
  // 13. облако не отвечает — проверки реже, потом снова часто
  offline = true; revReads = 0; await sleep(3000);
  const offlineReads = revReads;
  offline = false; await sleep(9000); revReads = 0; await sleep(1100);
  check(`облако не отвечает — проверки реже (${offlineReads} за 3 с вместо 6), ожило — снова каждые полсекунды`, offlineReads <= 4 && revReads >= 2);
  clearTimeout(pollTimer); pollTimer = null;
  mock.getItem = getItem0; mock.getItems = getItems0;

  check('лимиты Telegram ни разу не нарушены', violations.length === 0);

  cloud = null; localStorage.removeItem('rockdo-demo');
  console.table(results);
  const failed = results.filter((r) => r.итог !== 'OK').length;
  console.log(failed ? `❌ ошибок: ${failed}` + (violations.length ? ' · ' + violations.join('; ') : '') : `✅ все ${results.length} сценариев прошли (версия ${APP_VERSION})`);
})();
