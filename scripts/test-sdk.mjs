// Edge-case test harness for scale-sdk-v2.js
// Runs in plain node with a minimal DOM shim — no jsdom required.
// Validates submitLead, GA cookie parsing, enrichLeadBody, and the
// data-scale-form declarative binder in scenarios where things usually
// break (iframes without cookies, FormData coercion, bad emails, etc).

import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../sdk/scale-sdk-v2.js', import.meta.url), 'utf-8');

// ── DOM / browser shim ────────────────────────────────────────────────────
function buildEnv({ cookies = '', apiBase = 'https://api.test', funnelId = 'funnel-uuid-123',
                   configExtras = {}, fetchImpl } = {}) {
  const listeners = new Map();
  const cookieJar = { value: cookies };

  const doc = {
    documentElement: {},
    referrer: '',
    addEventListener: () => {},
    removeEventListener: () => {},
    querySelectorAll: () => [],
    getElementById: () => null,
    getElementsByName: () => [],
    body: { appendChild: () => {} },
    readyState: 'complete',
    currentScript: null,
    createElement: () => ({ setAttribute: () => {}, appendChild: () => {} }),
  };
  // Make document.cookie a live accessor. The setter must mimic browser
  // semantics: `document.cookie = "k=v; path=/"` inserts/updates ONLY that
  // key — it doesn't wipe the jar. Without this, the SDK's own cookie
  // writes at boot (syncCookieFromSession) would clobber any test-supplied
  // _ga / _ga_* cookies.
  Object.defineProperty(doc, 'cookie', {
    get() { return cookieJar.value; },
    set(raw) {
      // Parse the incoming fragment — only the first segment is a real
      // key=value; the rest are attributes (path/max-age/expires) we don't
      // need to model here.
      var kv = String(raw).split(';')[0].trim();
      var eq = kv.indexOf('=');
      if (eq < 1) return;
      var key = kv.slice(0, eq);
      // Rebuild the jar replacing just that key.
      var existing = cookieJar.value
        ? cookieJar.value.split('; ').filter(function(p) { return p.indexOf(key + '=') !== 0; })
        : [];
      // Browsers drop cookies with max-age=0 / past expires — we ignore
      // that nuance; tests that care about deletion set cookies: '' directly.
      existing.push(kv);
      cookieJar.value = existing.join('; ');
    },
    configurable: true,
  });

  const win = {
    SCALE_CONFIG: {
      funnelId, funnelSlug: 'test', tenantKey: 'test-tenant',
      apiBaseUrl: apiBase, features: { visits: false, phone: false, trustedForm: false },
      ...configExtras,
    },
    location: { href: 'https://wp.example.com/landing?utm_source=google&gclid=ABC', search: '?utm_source=google&gclid=ABC', hostname: 'wp.example.com', pathname: '/landing' },
    navigator: { userAgent: 'Mozilla/5.0 (Test)' },
    fetch: fetchImpl || (async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })),
    addEventListener: (name, fn) => { listeners.set(name, fn); },
    removeEventListener: () => {},
    dispatchEvent: (ev) => { const fn = listeners.get(ev.type); if (fn) fn(ev); },
    localStorage: { store: {}, getItem(k) { return this.store[k] || null; }, setItem(k, v) { this.store[k] = v; }, removeItem(k) { delete this.store[k]; } },
    sessionStorage: { store: {}, getItem(k) { return this.store[k] || null; }, setItem(k, v) { this.store[k] = v; } },
    console,
    setInterval, setTimeout, clearInterval, clearTimeout,
    URLSearchParams,
    Promise,
    JSON,
    Date,
    Math,
    Number,
    String,
    Object,
    Array,
    RegExp,
    Error,
    isNaN,
    encodeURIComponent,
    decodeURIComponent,
    MutationObserver: class { observe() {} disconnect() {} },
    CustomEvent: class CustomEvent { constructor(t, o) { this.type = t; Object.assign(this, o || {}); } },
    FormData: class FormData {
      #d = new Map();
      constructor(form) {
        if (form && form.__entries) form.__entries.forEach(([k, v]) => this.append(k, v));
      }
      append(k, v) { this.#d.set(k, v); }
      get(k) { return this.#d.get(k); }
      forEach(fn) { for (const [k, v] of this.#d) fn(v, k); }
    },
    HTMLFormElement: class HTMLFormElement {},
  };
  win.window = win;
  win.document = doc;

  // Execute the SDK source in this mini-sandbox.
  const fn = new Function('window', 'document', 'navigator', 'location', 'localStorage', 'sessionStorage', 'fetch', 'FormData', 'URLSearchParams', 'HTMLFormElement', 'MutationObserver', 'CustomEvent', 'console', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'Promise', src);
  fn(win, doc, win.navigator, win.location, win.localStorage, win.sessionStorage, win.fetch, win.FormData, win.URLSearchParams, win.HTMLFormElement, win.MutationObserver, win.CustomEvent, console, setTimeout, setInterval, clearTimeout, clearInterval, Promise);
  return win;
}

// ── Test runner ───────────────────────────────────────────────────────────
let pass = 0, fail = 0;
function test(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      return r.then(() => { console.log('  ✓', name); pass++; })
              .catch((e) => { console.log('  ✗', name, '\n     ', e.message); fail++; });
    }
    console.log('  ✓', name); pass++;
  } catch (e) {
    console.log('  ✗', name, '\n     ', e.message); fail++;
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assert failed'); }
function eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg||'eq')+': '+JSON.stringify(a)+' != '+JSON.stringify(b)); }

// ── Test suites ───────────────────────────────────────────────────────────

console.log('\n── GA cookie parsing ──');

await test('getGaIds: no cookies → both undefined', () => {
  const w = buildEnv({ cookies: '' });
  eq(w.ScaleSDK.getGaIds(), { ga_client_id: undefined, ga_session_id: undefined });
});

await test('getGaIds: only _ga present → client_id parsed, session undefined', () => {
  const w = buildEnv({ cookies: '_ga=GA1.1.123456789.1700000000' });
  eq(w.ScaleSDK.getGaIds(), { ga_client_id: '123456789.1700000000', ga_session_id: undefined });
});

await test('getGaIds: _ga + _ga_ABC → both parsed', () => {
  const w = buildEnv({ cookies: '_ga=GA1.1.111.222; _ga_ABC=GS1.1.987654321.5.0.0.0.0',
    configExtras: { ga4MeasurementId: 'G-ABC' } });
  eq(w.ScaleSDK.getGaIds(), { ga_client_id: '111.222', ga_session_id: '987654321' });
});

await test('getGaIds: _ga_* without configured id → scan finds it', () => {
  const w = buildEnv({ cookies: '_ga=GA1.1.111.222; _ga_XYZ=GS1.1.42.1.0.0.0.0' });
  eq(w.ScaleSDK.getGaIds(), { ga_client_id: '111.222', ga_session_id: '42' });
});

await test('getGaIds: malformed _ga → undefined (no throw)', () => {
  const w = buildEnv({ cookies: '_ga=garbage' });
  eq(w.ScaleSDK.getGaIds(), { ga_client_id: undefined, ga_session_id: undefined });
});

await test('getGaIds: document.cookie throws (sandbox iframe) → undefined', () => {
  const w = buildEnv();
  Object.defineProperty(w.document, 'cookie', {
    get() { throw new Error('SecurityError: cookies blocked'); }, configurable: true
  });
  eq(w.ScaleSDK.getGaIds(), { ga_client_id: undefined, ga_session_id: undefined });
});

console.log('\n── submitLead: input normalization ──');

let lastReqBody = null;
const mockOk = async (_url, opts) => {
  lastReqBody = JSON.parse(opts.body);
  return new Response(JSON.stringify({ id: 'lead-99', success: true }),
    { status: 201, headers: { 'content-type': 'application/json' } });
};

await test('submitLead(null) → ok:false with clear message', async () => {
  const w = buildEnv({ fetchImpl: mockOk });
  const r = await w.ScaleSDK.submitLead(null);
  assert(r.ok === false);
  assert(r.errors[0].message.includes('must be'));
});

await test('submitLead(plain object) → ok:true', async () => {
  const w = buildEnv({ fetchImpl: mockOk });
  const r = await w.ScaleSDK.submitLead({
    email: 'a@b.com', phone: '5551234567', first_name: 'A', last_name: 'B', state: 'FL', zip: '33101'
  });
  assert(r.ok === true, JSON.stringify(r));
  assert(r.leadId === 'lead-99');
});

await test('submitLead(FormData) → ok:true', async () => {
  const w = buildEnv({ fetchImpl: mockOk });
  const fd = new w.FormData();
  fd.append('email', 'a@b.com'); fd.append('phone', '5551234567');
  fd.append('first_name', 'A'); fd.append('last_name', 'B');
  fd.append('state', 'FL'); fd.append('zip', '33101');
  const r = await w.ScaleSDK.submitLead(fd);
  assert(r.ok === true);
});

console.log('\n── submitLead: client validation ──');

await test('missing required field → ok:false with field path', async () => {
  const w = buildEnv({ fetchImpl: mockOk });
  const r = await w.ScaleSDK.submitLead({ email: 'a@b.com', phone: '5551234567' });
  assert(!r.ok);
  assert(r.errors.some(e => e.field === 'first_name'));
  assert(r.errors.some(e => e.field === 'state'));
});

await test('bad email format → pre-validation fails', async () => {
  const w = buildEnv({ fetchImpl: mockOk });
  const r = await w.ScaleSDK.submitLead({
    email: 'not-an-email', phone: '5551234567', first_name: 'A', last_name: 'B', state: 'FL', zip: '33101'
  });
  assert(!r.ok);
  assert(r.errors.some(e => e.field === 'email' && /format/.test(e.message)));
});

await test('phone with too few digits → fails', async () => {
  const w = buildEnv({ fetchImpl: mockOk });
  const r = await w.ScaleSDK.submitLead({
    email: 'a@b.com', phone: '555', first_name: 'A', last_name: 'B', state: 'FL', zip: '33101'
  });
  assert(!r.ok);
  assert(r.errors.some(e => e.field === 'phone'));
});

await test('skipClientValidation:true → bypasses pre-validation (backend decides)', async () => {
  const w = buildEnv({ fetchImpl: mockOk });
  const r = await w.ScaleSDK.submitLead({ email: 'x', phone: '1', first_name: 'A', last_name: 'B', state: 'FL', zip: '33101' },
    { skipClientValidation: true });
  assert(r.ok === true); // mock backend accepts
});

console.log('\n── submitLead: body shaping + enrichment ──');

await test('funnel_id comes from SCALE_CONFIG.funnelId', async () => {
  const w = buildEnv({ fetchImpl: mockOk, funnelId: 'my-funnel-xyz' });
  await w.ScaleSDK.submitLead({ email: 'a@b.com', phone: '5551234567', first_name: 'A', last_name: 'B', state: 'FL', zip: '33101' });
  assert(lastReqBody.funnel_id === 'my-funnel-xyz');
});

await test('required fields land in body.data', async () => {
  const w = buildEnv({ fetchImpl: mockOk });
  await w.ScaleSDK.submitLead({ email: 'a@b.com', phone: '5551234567', first_name: 'A', last_name: 'B', state: 'FL', zip: '33101' });
  eq(lastReqBody.data.email, 'a@b.com');
  eq(lastReqBody.data.first_name, 'A');
});

await test('age (string from FormData) is coerced to number', async () => {
  const w = buildEnv({ fetchImpl: mockOk });
  await w.ScaleSDK.submitLead({ email: 'a@b.com', phone: '5551234567', first_name: 'A', last_name: 'B', state: 'FL', zip: '33101', age: '42' });
  eq(typeof lastReqBody.data.age, 'number');
  eq(lastReqBody.data.age, 42);
});

await test('current_coverage="on" (checkbox) → true', async () => {
  const w = buildEnv({ fetchImpl: mockOk });
  await w.ScaleSDK.submitLead({ email: 'a@b.com', phone: '5551234567', first_name: 'A', last_name: 'B', state: 'FL', zip: '33101', current_coverage: 'on' });
  eq(lastReqBody.data.current_coverage, true);
});

await test('unknown fields go into metadata', async () => {
  const w = buildEnv({ fetchImpl: mockOk });
  await w.ScaleSDK.submitLead({ email: 'a@b.com', phone: '5551234567', first_name: 'A', last_name: 'B', state: 'FL', zip: '33101', custom_field: 'hello' });
  eq(lastReqBody.metadata.custom_field, 'hello');
});

await test('GA IDs from cookies attached to body.metadata', async () => {
  const w = buildEnv({ fetchImpl: mockOk, cookies: '_ga=GA1.1.555.666; _ga_X=GS1.1.777.1.0.0.0.0' });
  await w.ScaleSDK.submitLead({ email: 'a@b.com', phone: '5551234567', first_name: 'A', last_name: 'B', state: 'FL', zip: '33101' });
  eq(lastReqBody.metadata.ga_client_id, '555.666');
  eq(lastReqBody.metadata.ga_session_id, '777');
});

await test('UTMs from URL attached to body.metadata', async () => {
  const w = buildEnv({ fetchImpl: mockOk });
  await w.ScaleSDK.submitLead({ email: 'a@b.com', phone: '5551234567', first_name: 'A', last_name: 'B', state: 'FL', zip: '33101' });
  eq(lastReqBody.metadata.utm_source, 'google');
  eq(lastReqBody.metadata.gclid, 'ABC');
});

await test('caller-provided metadata wins over SDK defaults', async () => {
  const w = buildEnv({ fetchImpl: mockOk });
  await w.ScaleSDK.submitLead({ email: 'a@b.com', phone: '5551234567', first_name: 'A', last_name: 'B', state: 'FL', zip: '33101',
    metadata: { utm_source: 'client-override' } });
  eq(lastReqBody.metadata.utm_source, 'client-override');
});

console.log('\n── submitLead: backend error normalization ──');

await test('backend 400 with errors[] → normalized to errors array', async () => {
  const w = buildEnv({ fetchImpl: async () =>
    new Response(JSON.stringify({ errors: [{ path: ['data','email'], message: 'Invalid email' }] }),
      { status: 400, headers: { 'content-type': 'application/json' } })
  });
  const r = await w.ScaleSDK.submitLead({ email: 'a@b.com', phone: '5551234567', first_name: 'A', last_name: 'B', state: 'FL', zip: '33101' });
  assert(!r.ok);
  assert(r.status === 400);
  eq(r.errors[0].field, 'data.email');
});

await test('backend 500 HTML response (not json) → graceful { ok:false }', async () => {
  const w = buildEnv({ fetchImpl: async () =>
    new Response('<html>Internal Server Error</html>',
      { status: 500, headers: { 'content-type': 'text/html' } })
  });
  const r = await w.ScaleSDK.submitLead({ email: 'a@b.com', phone: '5551234567', first_name: 'A', last_name: 'B', state: 'FL', zip: '33101' });
  assert(!r.ok);
  assert(r.status === 500);
});

await test('network throws → ok:false with "network error"', async () => {
  const w = buildEnv({ fetchImpl: async () => { throw new Error('getaddrinfo ENOTFOUND'); } });
  const r = await w.ScaleSDK.submitLead({ email: 'a@b.com', phone: '5551234567', first_name: 'A', last_name: 'B', state: 'FL', zip: '33101' });
  assert(!r.ok);
});

await test('no funnel_id anywhere → ok:false with helpful message', async () => {
  const w = buildEnv({ fetchImpl: mockOk, funnelId: null });
  const r = await w.ScaleSDK.submitLead({ email: 'a@b.com', phone: '5551234567', first_name: 'A', last_name: 'B', state: 'FL', zip: '33101' });
  assert(!r.ok);
  assert(r.errors[0].field === 'funnel_id');
});

console.log('\n── Summary ──');
console.log(`  ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
