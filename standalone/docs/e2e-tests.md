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

---

## Interactive map

Browser-driven checks for the interactive-map surface: fly-to menu,
locate-me button, tent marker, user-location marker, compass rose.

### Setup

```bash
cd standalone && npm start   # http://localhost:8767/
```

Open the app, tap **Festival Map** in the sidebar, wait for the map to
mount. Every recipe assumes `window.__festivalMap` exists (assigned
inside `renderInteractiveMap` when the map instance is ready) and the
control layer is up (`.festival-map-flyto-btn`,
`.festival-map-locate-btn`, `.festival-map-compass` in the DOM).

### Known caveats

- **Popover state is DOM-and-WeakMap.** If a test tears down the
  popover via `.remove()` instead of `closeFlyToMenu()`, the WeakMap
  keyed on the stage element still thinks it's open — the next button
  click will read as "toggle-close". Prefer `closeFlyToMenu` from
  `js/views/map-flyto.js`, or click the same button twice, or remount
  the map view between recipes.
- **User-location marker persists across errors** (line 216 of
  `js/views/user-location.js`). A `denied` / `timeout` locationchange
  is a no-op — the marker keeps the last-known position. Recipe M-O
  documents this as an intentional-for-now behaviour.

### M-A. POI catalogue resolves to valid coords for every entry

```js
(async () => {
  const { POI_LIST } = await import('/js/helpers/festival-pois.js');
  const { store } = await import('/js/store.js');
  store.userLocation = { longitude: 14.494663, latitude: 52.276211, accuracy: 8, error: null };
  const userPos = [store.userLocation.longitude, store.userLocation.latitude];
  const results = POI_LIST.map(poi => {
    let target = null, err = null;
    try { target = poi.resolve(userPos); } catch (e) { err = e.message; }
    const ok = Array.isArray(target) && target.length === 2
            && Number.isFinite(target[0]) && Number.isFinite(target[1])
            && Math.abs(target[0]) < 180 && Math.abs(target[1]) < 90;
    return { id: poi.id, target, ok, err };
  });
  console.table(results);
  return { allValid: results.every(r => r.ok) };
})();
```

Expected: `allValid: true`. Every row has a valid `target`.

### M-B. Nearest-picker falls back correctly when user is off-site

```js
(async () => {
  const { POI_LIST } = await import('/js/helpers/festival-pois.js');
  const toilet = POI_LIST.find(p => p.id === 'toilet');
  return {
    nearNW:      toilet.resolve([14.494668, 52.278198]),
    nearSW:      toilet.resolve([14.482172, 52.271978]),
    offSite:     toilet.resolve([13.404954, 52.520008]),  // Berlin
    nullUser:    toilet.resolve(null),                    // GPS denied
  };
})();
```

Expected: `offSite` and `nullUser` both equal the first entry in
`TOILET_COORDS` (`[14.494186, 52.278280]`). `nearNW` / `nearSW` pick
different, closer coords.

### M-C. Fly-to menu opens with the expected entries

```js
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  document.querySelector('.festival-map-flyto-btn').click();
  await sleep(400);
  const entries = [...document.querySelectorAll('.festival-map-flyto-entry')]
    .map(e => e.dataset.poiId);
  return {
    popoverOpen: !!document.querySelector('.festival-map-flyto'),
    entries,
    tentIsLast: entries[entries.length - 1] === 'tent',
  };
})();
```

Expected: 5 entries in order `[toilet, first-aid, info, eclipse, tent]`,
`tentIsLast: true`.

### M-D. Picking a fly-to entry moves the camera + closes the popover

Reload the map view first so the popover WeakMap is fresh.

```js
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const map = window.__festivalMap;
  map.jumpTo({ center: [14.482, 52.272], zoom: 15 });
  await sleep(300);
  document.querySelector('.festival-map-flyto-btn').click();
  await sleep(300);
  document.querySelector('.festival-map-flyto-entry[data-poi-id="info"]').click();
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline && map.isMoving()) await sleep(100);
  await sleep(200);
  const c = map.getCenter();
  const distMeters = Math.round(Math.hypot(c.lng - 14.494663, c.lat - 52.276211) * 111000);
  return {
    popoverClosed: !document.querySelector('.festival-map-flyto'),
    distMeters,           // should be 0 (or a few m)
    finalZoom: map.getZoom(),
  };
})();
```

Expected: `popoverClosed: true`, `distMeters: 0`, `finalZoom: 18`.

### M-E. Escape key closes the fly-to menu

```js
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  document.querySelector('.festival-map-flyto-btn').click();
  await sleep(300);
  const opened = !!document.querySelector('.festival-map-flyto');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  await sleep(300);
  return { opened, closedAfterEscape: !document.querySelector('.festival-map-flyto') };
})();
```

Expected: both booleans `true`.

### M-F. Outside click closes the fly-to menu

```js
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  document.querySelector('.festival-map-flyto-btn').click();
  await sleep(400);
  const opened = !!document.querySelector('.festival-map-flyto');
  document.querySelector('.festival-map').dispatchEvent(
    new MouseEvent('click', { bubbles: true, clientX: 100, clientY: 300 })
  );
  await sleep(400);
  return { opened, closedAfterOutside: !document.querySelector('.festival-map-flyto') };
})();
```

Expected: both booleans `true`.

### M-G. Tent-position persistence round-trip

```js
(async () => {
  const KEY = 'bucht-tent-position';
  const pre = localStorage.getItem(KEY);
  const { getTentPosition, hasStoredTentPosition, TENT_INITIAL_POSITION } =
    await import('/js/views/tent.js');

  localStorage.removeItem(KEY);
  const empty  = getTentPosition();
  const emptyIsInitial = empty[0] === TENT_INITIAL_POSITION[0]
                      && empty[1] === TENT_INITIAL_POSITION[1];

  localStorage.setItem(KEY, JSON.stringify({ lng: 14.500, lat: 52.275 }));
  const stored = getTentPosition();
  const storedOk = stored[0] === 14.500 && stored[1] === 52.275
                && hasStoredTentPosition();

  localStorage.setItem(KEY, 'not json');
  const corrupt = getTentPosition();
  const corruptFellBack = corrupt[0] === TENT_INITIAL_POSITION[0]
                       && corrupt[1] === TENT_INITIAL_POSITION[1];

  if (pre) localStorage.setItem(KEY, pre); else localStorage.removeItem(KEY);
  return { emptyIsInitial, storedOk, corruptFellBack };
})();
```

Expected: all three booleans `true`.

**Known bug (BUCHT-TENT-01):** `isValidPos()` only checks
`Number.isFinite` — it accepts `{lng: 999, lat: 999}` and returns
those as the tent position. Range-clamp missing (`|lng| ≤ 180`,
`|lat| ≤ 90`). Not reachable from the normal `dragend → save` path
(MapLibre always hands us valid coords), so it hasn't blown up in
production. Fix candidate: extend `isValidPos` in `js/views/tent.js`.

### M-H. Tent marker mounts and reflects the stored position

```js
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const KEY = 'bucht-tent-position';
  const pre = localStorage.getItem(KEY);
  const target = { lng: 14.4970, lat: 52.2770 };
  localStorage.setItem(KEY, JSON.stringify(target));

  // Re-mount /map so tent.js runs against the new storage
  document.querySelector('[data-action="load-page"][data-page="2"]').click();
  await sleep(500);
  document.querySelector('[data-action="load-page"][data-page="5"]').click();
  await sleep(2500);
  document.querySelector('[data-action="close-tent-intro"], [data-action="tent-intro-not-now"], [data-action="tent-intro-skip"]')?.click();
  await sleep(500);

  const map  = window.__festivalMap;
  const el   = document.querySelector('.tent-marker.maplibregl-marker');
  const box  = el.getBoundingClientRect();
  const cbox = map.getContainer().getBoundingClientRect();
  const pt   = map.unproject([box.left + box.width/2 - cbox.left,
                              box.top  + box.height     - cbox.top]);
  const matches = Math.abs(pt.lng - target.lng) < 0.0002
               && Math.abs(pt.lat - target.lat) < 0.0002;

  if (pre) localStorage.setItem(KEY, pre); else localStorage.removeItem(KEY);
  return { tentMounted: !!el, matches };
})();
```

Expected: both `true`.

### M-I. Locate-me — no fix triggers the GPS toast

```js
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const { store } = await import('/js/store.js');
  const map = window.__festivalMap;
  const pre = store.userLocation;
  store.userLocation = null;
  const before = { c: { ...map.getCenter() }, z: map.getZoom() };
  document.querySelector('.festival-map-locate-btn').click();
  await sleep(1200);
  const after = { c: { ...map.getCenter() }, z: map.getZoom() };
  const moved = Math.abs(before.c.lng - after.c.lng) > 0.00001;
  const toast = document.querySelector('[class*="toast"]');
  store.userLocation = pre;
  return { cameraDidNotMove: !moved, toastFired: !!toast, toastText: toast?.textContent };
})();
```

Expected: `cameraDidNotMove: true`, `toastFired: true`,
`toastText`: "GPS is needed…".

### M-J. Locate-me — off-site fix triggers the "not-at-festival" toast

```js
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const { store } = await import('/js/store.js');
  const map = window.__festivalMap;
  const pre = store.userLocation;
  store.userLocation = { longitude: 13.404954, latitude: 52.520008, accuracy: 20, error: null };
  const before = { c: { ...map.getCenter() } };
  document.querySelector('.festival-map-locate-btn').click();
  await sleep(1200);
  const after = { c: { ...map.getCenter() } };
  const moved = Math.abs(before.c.lng - after.c.lng) > 0.00001;
  const toast = document.querySelector('[class*="toast"]');
  store.userLocation = pre;
  return { cameraDidNotMove: !moved, toastText: toast?.textContent };
})();
```

Expected: `cameraDidNotMove: true`, `toastText`: "You're not at the festival yet."

### M-K. Locate-me — on-site fix flies the camera to the user

```js
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const { store } = await import('/js/store.js');
  const map = window.__festivalMap;
  map.jumpTo({ center: [14.482, 52.272], zoom: 15 });
  await sleep(300);
  const pre = store.userLocation;
  const target = { longitude: 14.4949, latitude: 52.2764, accuracy: 6, error: null };
  store.userLocation = target;
  document.querySelector('.festival-map-locate-btn').click();
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline && map.isMoving()) await sleep(100);
  await sleep(200);
  const c = map.getCenter();
  const distMeters = Math.round(Math.hypot(c.lng - target.longitude, c.lat - target.latitude) * 111000);
  store.userLocation = pre;
  return { distMeters, landedOnUser: distMeters === 0, finalZoom: map.getZoom() };
})();
```

Expected: `distMeters: 0`, `landedOnUser: true`, `finalZoom: 18`.

### M-L. Fly-to → tent lands on the STORED position, not the initial

```js
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const map = window.__festivalMap;
  const KEY = 'bucht-tent-position';
  const pre = localStorage.getItem(KEY);
  const stored = { lng: 14.4990, lat: 52.2755 };
  localStorage.setItem(KEY, JSON.stringify(stored));
  map.jumpTo({ center: [14.482, 52.272], zoom: 15 });
  await sleep(300);
  document.querySelector('.festival-map-flyto-btn').click();
  await sleep(300);
  document.querySelector('.festival-map-flyto-entry[data-poi-id="tent"]').click();
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline && map.isMoving()) await sleep(100);
  await sleep(200);
  const c = map.getCenter();
  const distMeters = Math.round(Math.hypot(c.lng - stored.lng, c.lat - stored.lat) * 111000);
  if (pre) localStorage.setItem(KEY, pre); else localStorage.removeItem(KEY);
  return { landedOnTent: distMeters === 0, distMeters, finalZoom: map.getZoom() };
})();
```

Expected: `landedOnTent: true`.

### M-M. User-location marker appears on `locationchange` dispatch

```js
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  document.dispatchEvent(new CustomEvent('locationchange', {
    detail: { longitude: 14.4949, latitude: 52.2764, accuracy: 8 },
  }));
  await sleep(500);
  const m = document.querySelector('.user-location-marker');
  return {
    markerMounted: !!m,
    dotMounted:    !!m?.querySelector('.maplibregl-user-location-dot'),
    coneMounted:   !!m?.querySelector('.user-heading-cone'),
  };
})();
```

Expected: all three `true`.

### M-N. User-location marker updates on subsequent fixes

```js
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const map = window.__festivalMap;
  const measure = () => {
    const el = document.querySelector('.user-location-marker');
    if (!el) return null;
    const b = el.getBoundingClientRect();
    const c = map.getContainer().getBoundingClientRect();
    return map.unproject([b.left + b.width/2 - c.left, b.top + b.height/2 - c.top]);
  };
  document.dispatchEvent(new CustomEvent('locationchange', {
    detail: { longitude: 14.4949, latitude: 52.2764, accuracy: 8 },
  }));
  await sleep(500);
  const p1 = measure();
  document.dispatchEvent(new CustomEvent('locationchange', {
    detail: { longitude: 14.4820, latitude: 52.2720, accuracy: 8 },
  }));
  await sleep(500);
  const p2 = measure();
  return {
    p1: { lng: p1.lng, lat: p1.lat },
    p2: { lng: p2.lng, lat: p2.lat },
    movedFrom1To2:
      Math.abs(p1.lng - 14.4949) < 0.001 && Math.abs(p1.lat - 52.2764) < 0.001 &&
      Math.abs(p2.lng - 14.4820) < 0.001 && Math.abs(p2.lat - 52.2720) < 0.001,
  };
})();
```

Expected: `movedFrom1To2: true`.

### M-O. User-location marker on error (documents known behaviour)

```js
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  document.dispatchEvent(new CustomEvent('locationchange', {
    detail: { longitude: 14.4949, latitude: 52.2764, accuracy: 8 },
  }));
  await sleep(400);
  const before = !!document.querySelector('.user-location-marker');
  document.dispatchEvent(new CustomEvent('locationchange', { detail: { error: 'denied' } }));
  await sleep(400);
  const after = !!document.querySelector('.user-location-marker');
  return { before, after };
})();
```

Expected TODAY: `before: true`, `after: true`. The marker is kept
frozen at the last-known position on error — see the "Known bugs"
notes at the top. If we ever change that policy so the marker hides,
this recipe flips to `after: false`.

### M-P. Compass rose transform + click-to-reset

```js
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const map = window.__festivalMap;
  const compass = document.querySelector('.festival-map-compass');
  map.rotateTo(45, { duration: 0 });
  map.setPitch(20);
  await sleep(300);
  const transformAfterRotate = compass.style.transform;
  compass.click();
  await sleep(1200);
  return {
    transformAfterRotate,                 // has rotateX(20deg) rotate(-45deg)
    bearingAfterClick: map.getBearing(),  // should be near -73.1 (DEFAULT_BEARING)
    pitchAfterClick:   map.getPitch(),    // should be near 30.7  (DEFAULT_PITCH)
  };
})();
```

Expected: `transformAfterRotate` contains `rotateX(20deg) rotate(-45deg)`;
`bearingAfterClick` near `-73.1`; `pitchAfterClick` near `30.7`.

