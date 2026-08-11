# E2E test recipes

Browser-driven checks that can't run in Node (they need the fetched
geojson polygons + rendered grid DOM). Each recipe is copy-pasteable
into DevTools or a `browser_evaluate` call from an agent harness.

Node unit tests still live under `tests/*.test.mjs` — this file is for
things that require a real page load.

---

## Stage auto-scroll: GPS fix → timetable grid pulses the right row

Validates the full chain:

1. `locationchange` CustomEvent dispatched with `{longitude, latitude, accuracy}`.
2. `handleLocationChange` (timetable-grid.js) calls `getStage()` against the loaded polygons.
3. `stage-hysteresis` commits and dispatches `stagechange`.
4. `applyStagePulseClasses` adds `.gtt-current-stage` to the row whose `[data-stage]` matches.
5. `handleStageChangeForScroll` smooth-scrolls the grid.

### Setup

```bash
cd standalone && npm start   # http://localhost:8767/
```

Open the app, open the menu, click **Timetable** (slug `grid`). Wait for the grid to mount (rows with `[data-stage]` present).

### Fixtures (one coordinate per stage polygon)

| longitude   | latitude    | expected slug             |
|-------------|-------------|---------------------------|
| 14.4841672  | 52.2759043  | atlantis                  |
| 14.4825145  | 52.2717685  | waldtraut                 |
| 14.4828831  | 52.2726403  | unterholz                 |
| 14.4832394  | 52.2745696  | porto-loco                |
| 14.4832568  | 52.2751972  | schlupfloch               |
| 14.4839849  | 52.2752764  | stroboklo                 |
| 14.4855378  | 52.2765342  | neustockland              |
| 14.4932603  | 52.2762246  | strandflitzer             |
| 14.4965329  | 52.2763963  | zirkus-mond-zelt          |
| 14.4973838  | 52.2763290  | zirkus-mond-turmbuehnchen |
| 14.5010112  | 52.2757074  | seeblick                  |
| 14.5028759  | 52.2754843  | mirage-glimmer            |
| 14.5032790  | 52.2754172  | mirage-arco               |

Each coord was captured by clicking on the interactive map with the temporary
click-to-copy helper in `js/views/map-interactive.js` (search for `TEMP:` there;
strip once fixtures stop growing).

### A. Fast polygon check (no hysteresis, no DOM)

Confirms every fixture resolves to the expected slug via `getStage()` alone.
~50 ms, no waits.

```js
(async () => {
  const { getStage } = await import('/js/helpers/get-stage.js');
  const cases = [
    { lng: 14.4841672, lat: 52.2759043, expected: 'atlantis' },
    { lng: 14.4825145, lat: 52.2717685, expected: 'waldtraut' },
    { lng: 14.4828831, lat: 52.2726403, expected: 'unterholz' },
    { lng: 14.4832394, lat: 52.2745696, expected: 'porto-loco' },
    { lng: 14.4832568, lat: 52.2751972, expected: 'schlupfloch' },
    { lng: 14.4839849, lat: 52.2752764, expected: 'stroboklo' },
    { lng: 14.4855378, lat: 52.2765342, expected: 'neustockland' },
    { lng: 14.4932603, lat: 52.2762246, expected: 'strandflitzer' },
    { lng: 14.4965329, lat: 52.2763963, expected: 'zirkus-mond-zelt' },
    { lng: 14.4973838, lat: 52.2763290, expected: 'zirkus-mond-turmbuehnchen' },
    { lng: 14.5010112, lat: 52.2757074, expected: 'seeblick' },
    { lng: 14.5028759, lat: 52.2754843, expected: 'mirage-glimmer' },
    { lng: 14.5032790, lat: 52.2754172, expected: 'mirage-arco' },
  ];
  const rows = cases.map(c => {
    const got = getStage({ longitude: c.lng, latitude: c.lat, accuracy: 5 });
    return { expected: c.expected, got: got === false ? null : got, ok: got === c.expected };
  });
  console.table(rows);
  return { allOk: rows.every(r => r.ok) };
})();
```

Expected: `allOk: true`, every row `ok: true`.

### B. Full pipeline (dispatch → hysteresis → pulse class)

Confirms each fixture drives the grid to pulse the right row. Uses the
test-only helper `__resetAutoScrollStateForTests()` to hard-reset
hysteresis, pending timers, and the manual-scroll grace between runs
so every case takes the instant null→stage path (~50 ms), not the 3 s
hysteresis path. Total runtime: a few seconds.

Prereq: **Timetable view must be mounted** so the module-scoped
`locationchange` listener in timetable-grid.js is registered and the
`[data-stage]` rows exist.

```js
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const mod = await import('/js/views/timetable-grid.js');
  const { store } = await import('/js/store.js');
  const festival = await import('/js/festival.js');
  mod.__resetAutoScrollStateForTests();
  // Force gridDay to today so the day-guard doesn't block the scroll
  // (recipes D and E cover the gated case explicitly).
  store.gridDay = festival.getEffectiveFestivalDay();
  const cases = [
    { lng: 14.4841672, lat: 52.2759043, expected: 'atlantis' },
    { lng: 14.4825145, lat: 52.2717685, expected: 'waldtraut' },
    { lng: 14.4828831, lat: 52.2726403, expected: 'unterholz' },
    { lng: 14.4832394, lat: 52.2745696, expected: 'porto-loco' },
    { lng: 14.4832568, lat: 52.2751972, expected: 'schlupfloch' },
    { lng: 14.4839849, lat: 52.2752764, expected: 'stroboklo' },
    { lng: 14.4855378, lat: 52.2765342, expected: 'neustockland' },
    { lng: 14.4932603, lat: 52.2762246, expected: 'strandflitzer' },
    { lng: 14.4965329, lat: 52.2763963, expected: 'zirkus-mond-zelt' },
    { lng: 14.4973838, lat: 52.2763290, expected: 'zirkus-mond-turmbuehnchen' },
    { lng: 14.5010112, lat: 52.2757074, expected: 'seeblick' },
    { lng: 14.5028759, lat: 52.2754843, expected: 'mirage-glimmer' },
    { lng: 14.5032790, lat: 52.2754172, expected: 'mirage-arco' },
  ];
  const events = [];
  const listener = e => events.push(e.detail);
  document.addEventListener('stagechange', listener);
  const results = [];
  for (const c of cases) {
    events.length = 0;
    document.dispatchEvent(new CustomEvent('locationchange', {
      detail: { longitude: c.lng, latitude: c.lat, accuracy: 5 },
    }));
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline && !events.some(d => d.current === c.expected)) {
      await sleep(100);
    }
    const committed = events.find(d => d.current === c.expected);
    const pulseEl = document.querySelector(`.gtt-current-stage[data-stage="${c.expected}"]`);
    results.push({
      expected: c.expected,
      committed: committed?.current ?? '(none)',
      pulseClassLanded: !!pulseEl,
      ok: !!committed && !!pulseEl,
    });
  }
  document.removeEventListener('stagechange', listener);
  console.table(results);
  return { allOk: results.every(r => r.ok) };
})();
```

Expected: `allOk: true`, every row `committed === expected`,
`pulseClassLanded: true`.

### Adding fixtures

1. Uncomment the click-to-copy handler in `js/views/map-interactive.js`
   (search for `Click-to-copy lat/lng helper`). It logs the coord pair
   and copies it to the clipboard on every map click.
2. Open `/map`, click on the polygon, paste the clipboard line into
   the fixtures table above with the expected slug.
3. Re-run recipe A to sanity-check, then extend recipe B if the new
   stage isn't already covered by the polygon walk.
4. Re-comment the handler before merging (kept out of production so a
   stray tap doesn't log or hijack the clipboard).

### Known gates

- **Accuracy gate**: `getStage()` rejects fixes with `accuracy > 40 m`.
  Test fixtures use `accuracy: 5` so they always pass.
- **Auto-scroll day guard**: `handleStageChangeForScroll` only scrolls
  when `store.gridDay === getEffectiveFestivalDay()`. Recipe B forces
  `store.gridDay` to today so the guard passes; recipe D asserts it.
- **Manual-scroll grace**: any user-driven scroll on `#gttScroll`
  suppresses the next auto-scroll for `MANUAL_SCROLL_GRACE_MS` (8 s).
  The pulse class still fires. Recipe E asserts both halves.

### C. F1 — rapid stagechanges do not stack step-2 scrolls

Background: two `stagechange` events fired inside `SCROLL_FALLBACK_MS`
(1 s) used to schedule TWO overlapping `scrollGridToUserStage` fallback
timers, producing a visible jitter. This recipe asserts that after two
tight-back-to-back commits, `scrollTo` is called with the step-2 target
(row top only) exactly ONCE, and only for the WINNING stage.

```js
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const mod = await import('/js/views/timetable-grid.js');
  const { store } = await import('/js/store.js');
  const festival = await import('/js/festival.js');
  mod.__resetAutoScrollStateForTests();
  store.gridDay = festival.getEffectiveFestivalDay();
  const scroll = document.getElementById('gttScroll');
  scroll.scrollTop = 0; scroll.scrollLeft = 0;
  await sleep(50);

  const targets = [];
  const orig = scroll.scrollTo.bind(scroll);
  scroll.scrollTo = function (opts) { targets.push({ ...opts }); return orig(opts); };

  // Fire A, then reset (simulate hysteresis re-instant-commit), then B
  // within the fallback window.
  document.dispatchEvent(new CustomEvent('locationchange', { detail: { longitude: 14.4841672, latitude: 52.2759043, accuracy: 5 } })); // atlantis
  await sleep(50);
  mod.__resetAutoScrollStateForTests();
  document.dispatchEvent(new CustomEvent('locationchange', { detail: { longitude: 14.4825145, latitude: 52.2717685, accuracy: 5 } })); // waldtraut

  await sleep(2500);
  scroll.scrollTo = orig;

  const row = document.querySelector('.gtt-stagerow-wrap[data-stage="waldtraut"]');
  const header = document.getElementById('gttHeader')?.offsetHeight || 0;
  const expectedTop = Math.max(0, row.offsetTop - header - 20);
  const step2 = targets.filter(t => t.top === expectedTop);
  console.table({ step2Count: step2.length, expectedTop });
  return { noStackedStep2: step2.length === 1 };
})();
```

Expected: `noStackedStep2: true` (exactly one step-2 scroll, to the
winning stage).

### D. Day-guard blocks auto-scroll on non-today grids, pulse still fires

```js
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const mod = await import('/js/views/timetable-grid.js');
  const { store } = await import('/js/store.js');
  const festival = await import('/js/festival.js');
  mod.__resetAutoScrollStateForTests();
  // Force gridDay off today. Any date != today's effective festival day.
  const today = festival.getEffectiveFestivalDay();
  store.gridDay = today === '2026-08-14' ? '2026-08-15' : '2026-08-14';
  const scroll = document.getElementById('gttScroll');
  scroll.scrollTop = 0; scroll.scrollLeft = 0;

  const step2 = [];
  const orig = scroll.scrollTo.bind(scroll);
  scroll.scrollTo = function (opts) {
    if (opts && opts.top != null && opts.left == null) step2.push(opts);
    return orig(opts);
  };

  document.dispatchEvent(new CustomEvent('locationchange', { detail: { longitude: 14.4841672, latitude: 52.2759043, accuracy: 5 } }));
  await sleep(2000);
  scroll.scrollTo = orig;
  return {
    autoScrollBlocked: step2.length === 0,
    pulseStillLanded: !!document.querySelector('.gtt-current-stage[data-stage="atlantis"]'),
  };
})();
```

Expected: both `autoScrollBlocked` and `pulseStillLanded` are `true`.

### E. Manual-scroll grace suppresses next auto-scroll, pulse still fires

```js
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const mod = await import('/js/views/timetable-grid.js');
  const { store } = await import('/js/store.js');
  const festival = await import('/js/festival.js');
  mod.__resetAutoScrollStateForTests();
  store.gridDay = festival.getEffectiveFestivalDay();
  const scroll = document.getElementById('gttScroll');
  scroll.scrollTop = 0; scroll.scrollLeft = 0;

  const step2 = [];
  const orig = scroll.scrollTo.bind(scroll);
  scroll.scrollTo = function (opts) {
    if (opts && opts.top != null && opts.left == null) step2.push(opts);
    return orig(opts);
  };

  // Simulate a user finger-scroll: dispatch a synthetic scroll event on #gttScroll.
  scroll.dispatchEvent(new Event('scroll'));
  await sleep(100);

  document.dispatchEvent(new CustomEvent('locationchange', { detail: { longitude: 14.4841672, latitude: 52.2759043, accuracy: 5 } }));
  await sleep(2000);
  scroll.scrollTo = orig;
  return {
    autoScrollSuppressed: step2.length === 0,
    pulseStillLanded: !!document.querySelector('.gtt-current-stage[data-stage="atlantis"]'),
  };
})();
```

Expected: both booleans `true`.

### F. Vibration only fires on real stage-to-stage transitions

```js
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const mod = await import('/js/views/timetable-grid.js');
  const { store } = await import('/js/store.js');
  const festival = await import('/js/festival.js');
  mod.__resetAutoScrollStateForTests();
  store.gridDay = festival.getEffectiveFestivalDay();

  const calls = [];
  const origV = navigator.vibrate;
  navigator.vibrate = p => { calls.push(p); return true; };

  // null → atlantis: silent (first fix, previous is null).
  document.dispatchEvent(new CustomEvent('locationchange', { detail: { longitude: 14.4841672, latitude: 52.2759043, accuracy: 5 } }));
  await sleep(200);
  const c1 = calls.length;

  // atlantis → waldtraut: expect ONE vibrate on real transition (after 3 s hysteresis).
  document.dispatchEvent(new CustomEvent('locationchange', { detail: { longitude: 14.4825145, latitude: 52.2717685, accuracy: 5 } }));
  await sleep(3500);
  const c2 = calls.length;

  // waldtraut → null (bad fix, previous truthy but current null): silent.
  document.dispatchEvent(new CustomEvent('locationchange', { detail: { error: 'timeout' } }));
  await sleep(3500);
  const c3 = calls.length;

  navigator.vibrate = origV;
  return {
    firstFixSilent: c1 === 0,
    transitionVibrated: c2 - c1 === 1,
    transitionPattern: calls[calls.length - 1],
    clearSilent: c3 === c2,
  };
})();
```

Expected: `firstFixSilent: true`, `transitionVibrated: true`,
`transitionPattern: [50, 30, 50]`, `clearSilent: true`.
