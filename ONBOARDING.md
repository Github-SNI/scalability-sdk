# Onboarding — Scale SDK

Step-by-step guide for bringing a new client onto the SDK. Covers the data the backend must expose, what the client pastes in their site, and how to verify the integration.

---

## 1. Backend prerequisites

Before a client can start loading the SDK, these records must exist:

| Record | Purpose | Where it's used |
|---|---|---|
| **Tenant** (with `tenant_slug`) | Identifies the organization | `GET /api/sdk/config?tenant=<slug>` |
| **Funnel** (with `id` UUID + `slug`) | The journey the SDK tracks | `POST /api/visits`, phone fetch, business hours |
| **Tenant SDK config** | Runtime feature flags, phone_swap, endpoint overrides | Returned by `/api/sdk/config` |
| **Funnel business hours** | When to show the phone number | `GET /api/funnels/public/<slug>/business-hours` |
| **Phone pool** (if using dynamic DNI) | Available numbers to assign per visit | `POST /api/calls/phone/assign` |

Optional per tenant:
- `recaptcha` site key (if they have forms posting to `/api/contacts/public`)
- GTM container ID (they provide theirs)
- GA4 measurement ID (they provide theirs)

### Do I need funnel steps / pages?

**No — not for self-hosted sites** (WordPress, Webflow, custom, etc.). The
SDK only requires the parent **Funnel** record (for `funnel_id` + `funnel_slug`).
Individual pages on the client's site don't need matching `funnel_steps` rows —
visits are tracked per `session_id` and carry `page_url` for per-page analytics.

`funnel_steps` records (and the `stepId` field in `SCALE_CONFIG`) are only
required when the pages themselves are **hosted by the SaaS** (Scale-rendered
funnels) — each step then represents a page Scale serves. Client-hosted sites
own their own routing and can skip this entirely.

## 2. Backend API endpoints

The SDK calls these — each must be implemented and CORS-enabled for the client's domain(s):

| Method | Path | When | Expected response |
|---|---|---|---|
| `POST` | `/api/visits` | Page load (if `features.visits`) | `{ data: { visit_id, session_id, phone?, ... } }` |
| `POST` | `/api/visits/{sessionId}` | Exit / unload (via `sendBeacon`) | 204 / 200 |
| `GET` | `/api/sdk/config?tenant=<slug>` | SDK boot (if `tenantKey` set) | See §5 |
| `GET` | `/api/funnels/public/<slug>/business-hours` | Before showing phone | `{ data: { is_open: boolean, ... } }` |
| `POST` | `/api/calls/phone/assign` | Fallback DNI fetch | `{ data: { phone_number: "+18001234567" } }` |
| `POST` | `/api/leads` | Lead form — via `ScaleSDK.submitLead()`, `data-scale-form`, or raw fetch (all auto-enriched). See §4.1. | Tenant-defined |
| `POST` | `/api/contacts/public` | Contact form (enriched with `recaptcha_token`) | Tenant-defined |
| `POST` | `/api/events` | `ScaleSDK.track(name, props)` | `{ data: ok }` |
| `POST` | `/api/log-performance` | Web Vitals / perf reports | 200 |
| `GET` | `/api/sdk/tenant-bootstrap?slug=<tenant>` | One-tag install (optional, see §4 Pattern B) | See §6 |

## 3. What the client needs (handoff)

Hand the client three values:

```
Tenant slug:    acme
Funnel ID:      7b7a9c9a-2f63-4a6a-9d1e-40a7a8b72f10
Funnel slug:    acme-main
API base URL:   https://api.scaledigital.com
```

Plus their own: `GTM container ID`, `GA4 measurement ID`, `reCAPTCHA site key` (if applicable).

## 4. Install patterns

### Pattern A — Static config (works today, no backend changes)

Client pastes in `<head>`:

```html
<script>
  window.SCALE_CONFIG = {
    funnelId: '7b7a9c9a-2f63-4a6a-9d1e-40a7a8b72f10',
    funnelSlug: 'acme-main',
    tenantKey: 'acme',
    apiBaseUrl: 'https://api.scaledigital.com',
    gtmId: 'GTM-XXXXXXX',
    ga4MeasurementId: 'G-XXXXXXX',
    features: { visits: true, phone: true, trustedForm: true }
  };
</script>
<script src="https://cdn.jsdelivr.net/gh/Github-SNI/scalability-sdk@v2.1/sdk/scale-analytics.min.js"></script>
<script src="https://cdn.jsdelivr.net/gh/Github-SNI/scalability-sdk@v2.1/sdk/scale-sdk-v2.min.js" defer></script>
```

Phone markup in the body:

```html
<a href="tel:+18001234567">(800) 123-4567</a>
<div data-show-phone style="display:none">Call us: <a href="tel:+18001234567">Call Now</a></div>
```

### Pattern B — Bootstrap loader (one tag, requires backend endpoint)

Client pastes exactly ONE tag. All config comes from the backend:

```html
<script src="https://cdn.jsdelivr.net/gh/Github-SNI/scalability-sdk@v2/sdk/scale-bootstrap.min.js"
        data-tenant="acme"
        data-funnel="main"
        data-api="https://api.scaledigital.com"
        defer></script>
```

`data-funnel` is optional. If omitted, the backend picks the oldest
active funnel for the tenant — fine for single-funnel tenants. Set it
when the tenant has multiple funnels (e.g. a WordPress side-site plus
a Scale-hosted main funnel) so the SDK targets the right one.

Requires `GET /api/sdk/tenant-bootstrap?slug=<tenant>[&funnel=<slug>]` to be implemented (§6). The loader:
1. Reads `data-tenant`, `data-funnel` (optional), and `data-api` from its own tag.
2. Fetches `{api}/api/sdk/tenant-bootstrap?slug={tenant}` (+ `&funnel=…` if set).
3. Assigns the response `data` to `window.SCALE_CONFIG`.
4. Injects `scale-analytics.min.js` and `scale-sdk-v2.min.js` from the same CDN version as the bootstrap.

Benefit: future config changes (GTM swap, new funnel ID, feature flag toggle, etc.) happen in the backend — no client redeploy.

Tradeoff: one extra round-trip before tracking starts. Acceptable for almost all use cases.

## 4.1 Lead form submission (v2.5.0+)

The SDK handles `POST /api/leads` end-to-end: the client doesn't need to know the endpoint URL, the body shape, or which attribution fields to attach. Two patterns — pick whichever fits the site:

### (A) Declarative — `data-scale-form="lead"` (zero JS)

Tag a `<form>` and the SDK intercepts its submit:

```html
<form data-scale-form="lead"
      data-success-url="/thank-you"
      data-reset-on-success="true">
  <input name="email"      type="email" required>
  <input name="phone"      type="tel"   required>
  <input name="first_name"              required>
  <input name="last_name"               required>
  <input name="state"      maxlength="2" required>
  <input name="zip"                     required>
  <button type="submit">Submit</button>
</form>
```

- Inputs map to `body.data` by their `name=` attribute.
- Unknown names (e.g. `name="utm_campaign"`, `name="coverage_amount"`) land in `body.metadata`.
- FormData strings are coerced to the right type: `age:"42"` → `42`, `current_coverage="on"` → `true`.
- Re-binds automatically when forms are injected dynamically (SPAs, Elementor live editor) — no `bindForms()` call needed.

Form-level data attributes:

| Attribute | Effect |
|---|---|
| `data-success-url="/thank-you"` | Redirects on success |
| `data-on-success="myGlobalFn"` | Calls `window.myGlobalFn(result, form)` on success |
| `data-on-error="myGlobalFn"` | Calls `window.myGlobalFn(result, form)` on failure |
| `data-reset-on-success="true"` | Resets the form after a successful submit |
| `data-skip-validation="true"` | Bypass client-side validation (let the backend decide) |
| `data-auto-track="false"` | Don't auto-fire the `form_submit` event (opt-out for tenants using GTM's own form tracking) |

### (B) Imperative — `ScaleSDK.submitLead(fields)`

For custom UX (multi-step, React/Vue, per-field error UI):

```js
document.querySelector('#myForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const result = await ScaleSDK.submitLead(new FormData(e.target));
  // Also accepts: plain object, URLSearchParams, HTMLFormElement
  if (result.ok) {
    window.location = '/thank-you';
  } else {
    result.errors.forEach(({ field, message }) => {
      // { field: 'data.email', message: 'Invalid email address' }
      showFieldError(field, message);
    });
  }
});
```

Return shape:
```ts
{ ok: true,  status: 201, leadId: '<uuid>', response: {...} }
{ ok: false, status: 400, errors: [{ field, message }], response: {...} }
{ ok: false, status: 0,   errors: [{ field: null, message: 'network error' }], response: null }
```

### What the SDK attaches automatically

When either pattern fires, the SDK fills in the boilerplate:

**Top-level fields** (match the `/api/leads` schema):
- `funnel_id` ← `SCALE_CONFIG.funnelId`
- `funnel_step_id` ← `SCALE_CONFIG.stepId` (Scale-hosted funnels only)
- `session_id`, `visit_id` ← local session
- `trusted_form_url` ← `#xxTrustedFormCertUrl_0` hidden field (if TrustedForm is loaded)

**`metadata` fields** (only added when the client didn't explicitly set them):
- `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content` — from URL
- `gclid`, `fbclid`, `msclkid` — from URL
- `ga_client_id`, `ga_session_id` — from `_ga` / `_ga_<MEASUREMENT_ID>` cookies (absent = not sent; see below)
- `landing_page`, `referrer`, `user_agent`

### Required data fields (backend validation)

`body.data.*` — the 6 always-required fields:

| Field | Format | Notes |
|---|---|---|
| `email` | valid email | |
| `phone` | ≥ 10 digits | formatting like `(555) 123-4567` is fine |
| `first_name`, `last_name` | 1–100 chars | trimmed |
| `state` | 2 chars | uppercased server-side |
| `zip` | ≥ 5 chars | hyphens allowed (`12345-6789`) |

Optional `body.data.*` fields: `address`, `city`, `dob`, `age`, `gender`, `insurance_type`, `coverage_type`, `current_coverage`. Everything else lands in `body.metadata` and is preserved as-is.

### GA4 identity capture

The SDK reads `_ga` (client ID) and `_ga_<MEASUREMENT_ID>` (session ID) cookies on every lead submit and attaches them to `metadata`. This lets sales created from these leads upload via the GA4 Measurement Protocol with the right identity for Google to match back to the original session.

**If GA cookies are missing**, the fields are simply omitted — the request still succeeds. No failure mode:

- Client has no GA4 installed → no cookies → keys absent from `metadata`.
- Client has GA4 but page is in a sandboxed iframe (`document.cookie` throws) → SDK catches, returns undefined.
- Client blocks cookies → same as above.

The backend (`ga_client_id` / `ga_session_id` on `leadMetadataSchema` and `visitSchema`) treats both as `.optional()` — explicitly OK to leave out.

### Fallback for raw `fetch()` callers

If the site has its own `fetch('/api/leads', ...)` code (e.g. a pre-existing WordPress plugin), **the SDK intercepts it transparently** and runs the same enrichment (`enrichLeadBody`). No migration required.

## 5. `/api/sdk/config` response shape

Runtime config per tenant. The SDK caches this in `localStorage` (TTL 5 min) and refreshes in background.

```json
{
  "data": {
    "enabled": true,
    "funnel_id": "7b7a9c9a-2f63-4a6a-9d1e-40a7a8b72f10",
    "tracking": {
      "visits": true,
      "phone": true,
      "trustedForm": true
    },
    "endpoints": {
      "events": "/api/events"
    },
    "phone_swap": {
      "enabled": true,
      "mode": "static",
      "static_number": "+18001234567",
      "targets": [
        { "selector": "a.phone-link", "match": "800-123-4567" }
      ]
    },
    "event_catalog": [
      {
        "name": "video_played",
        "props_schema": {
          "video_id": { "type": "string", "required": true },
          "duration_s": { "type": "number" }
        },
        "auto_track": null
      },
      {
        "name": "cta_clicked",
        "props_schema": null,
        "auto_track": {
          "trigger": "click",
          "selector": "a.cta, button.cta",
          "debounce_ms": 500
        }
      },
      {
        "name": "scroll_50",
        "auto_track": { "trigger": "scroll", "threshold": 50 }
      },
      {
        "name": "engaged_30s",
        "auto_track": { "trigger": "time_on_page", "threshold": 30 }
      }
    ]
  }
}
```

Any field may be omitted; the SDK falls back to `SCALE_CONFIG` defaults. Set `enabled: false` as a kill switch to disable the SDK globally for this tenant without redeploying.

### Event catalog (v2.3.0+)

`event_catalog` is an optional array of event definitions the tenant has registered via the admin UI (`/dashboard/sdk-config` → Events tab). Each entry drives two SDK behaviors:

- **Validation**: when the site calls `ScaleSDK.track('<name>', props)`, if the event is in the catalog and has `props_schema`, the SDK validates props (type, `required`, `enum`) and logs a `console.warn` on mismatches (in debug mode). The event is still sent either way. Events not in the catalog are accepted and flagged `is_validated=false` server-side.
- **Auto-track**: entries with `auto_track` get wired to DOM listeners automatically — no call from the site's code needed. Supported triggers:
  - `click`, `submit` — event delegation on `selector`, with optional `debounce_ms`
  - `load` — fires once on page ready
  - `scroll` — fires once scroll % crosses `threshold` (0–100)
  - `time_on_page` — fires once after `threshold` seconds

Auto-track is idempotent (safe against re-init) and bypassed if `event_catalog` is absent.

## 6. `/api/sdk/tenant-bootstrap` response shape

Backend returns the full `SCALE_CONFIG` for a given tenant. Called by `scale-bootstrap.min.js` on page load.

```json
{
  "data": {
    "funnelId": "7b7a9c9a-2f63-4a6a-9d1e-40a7a8b72f10",
    "funnelSlug": "acme-main",
    "tenantKey": "acme",
    "apiBaseUrl": "https://api.scaledigital.com",
    "gtmId": "GTM-XXXXXXX",
    "ga4MeasurementId": "G-XXXXXXX",
    "recaptchaKey": "6Lxxxx",
    "features": { "visits": true, "phone": true, "trustedForm": true },
    "siteId": "optional",
    "vertical": "optional"
  }
}
```

If `apiBaseUrl` is omitted from the response, the bootstrap loader reuses the `data-api` attribute value as a fallback.

**Caching note**: this endpoint runs on every page load for bootstrap-pattern clients. Cache aggressively server-side (5-15 min) and set `Cache-Control: public, max-age=300` or use ETags.

**CORS**: must allow the client's origin and respond to preflight.

## 7. SCALE_CONFIG field reference

| Field | Required | Type | Notes |
|---|---|---|---|
| `funnelId` | ✅ | string (UUID) | Primary funnel identifier |
| `funnelSlug` | ✅ | string | Used for public endpoints (business hours, phone) |
| `apiBaseUrl` | ✅ | string | Base URL of the SaaS backend |
| `tenantKey` (or `tenantSlug`) | Required for remote config | string | Slug used by `/api/sdk/config` |
| `gtmId` | Optional | string | GTM container ID (no `GTM-` prefix: the SDK prepends it) |
| `ga4MeasurementId` | Optional | string | GA4 ID (`G-XXXXXXX`) |
| `recaptchaKey` | Optional | string | reCAPTCHA v3 site key |
| `siteId` | Optional | string | For multi-site tenants |
| `vertical` | Optional | string | Vertical type (industry) — forwarded to analytics |
| `stepId` | Optional | string | Only for Scale-hosted funnels (one `funnel_steps` row per page). Leave unset for WordPress / self-hosted sites. |
| `features.visits` | Optional | boolean | Default `true`. Set `false` to disable visit tracking. |
| `features.phone` | Optional | boolean | Default `true`. Disables DNI. |
| `features.trustedForm` | Optional | boolean | Default `true`. Disables TrustedForm. |
| `features.analytics` | Optional | boolean | In analytics SDK — default `true`. |
| `features.performance` | Optional | boolean | In analytics SDK — default `true`. |
| `debug` | Optional | boolean | Logs to `console.debug`. |
| `onVisitRegistered` | Optional | fn | Callback after `/api/visits` succeeds. |
| `onPhoneReady` | Optional | fn | Callback when phone is resolved. |
| `onPhoneLoaded` | Optional | fn | Callback after phone is displayed. |
| `onPhoneHidden` | Optional | fn | Callback when phone is hidden (outside business hours). |

## 8. Verification

After the client deploys the snippet:

### From the browser console on the client's site

```js
// Confirms config is parsed and backend is reachable. No side effects.
ScaleSDK.healthCheck().then(console.log);
```

Expected output (printed as a `console.table`):

| name | ok | detail |
|---|---|---|
| config.funnelId | ✅ | `7b7a9c9a-...` |
| config.funnelSlug | ✅ | `acme-main` |
| config.apiBaseUrl | ✅ | `https://api.scaledigital.com` |
| config.tenantKey | ✅ | `acme` |
| GET /api/sdk/config | ✅ | `HTTP 200` |
| GET /business-hours | ✅ | `HTTP 200` |

If any row fails, the `detail` column names the problem (missing field, CORS error, 404, timeout, etc.).

### Via network tab

After page load, you should see:
- `POST /api/visits` → 200, response has `visit_id` and `session_id`
- `GET /api/sdk/config?tenant=<slug>` → 200
- `GET /api/funnels/public/<slug>/business-hours` → 200
- If phone enabled and number returned: `<a href="tel:...">` elements updated in the DOM

### Confirm GA4 capture (if GA4 is installed on the page)

From the console:

```js
ScaleSDK.getGaIds()
// → { ga_client_id: "123456789.1700000000", ga_session_id: "1234567890" }
```

If either field is `undefined`, the `_ga` / `_ga_<MEASUREMENT_ID>` cookies aren't set on the page — GA4 isn't installed, hasn't run yet, or the site's CMP blocked it. The SDK still works; GA4 Measurement Protocol uploads just won't have identity.

### Confirm lead submission works

Submit a test form (via `data-scale-form` or `ScaleSDK.submitLead`) and check:

- Request to `POST /api/leads` returns `201` with a `lead.id`
- Request body's `metadata` contains `session_id`, `visit_id`, `ga_client_id`, `ga_session_id`, plus `utm_*` / `gclid` / `fbclid` if present in the URL
- `form_submit` event fired in `POST /api/events` (unless `data-auto-track="false"`)

### Enable debug logs

```js
window.SCALE_CONFIG.debug = true;  // before scripts load
// OR reload with ?scale_debug=1 if you wire that into SCALE_CONFIG server-side
```

Produces `[ScaleSDK]` and `[ScaleAnalytics]` logs in the console.

## 9. Rollout checklist

- [ ] Tenant record created, `tenant_slug` confirmed
- [ ] Funnel record created, UUID + slug confirmed
- [ ] Business hours configured for the funnel
- [ ] Tenant SDK config row present (even if mostly defaults)
- [ ] Phone pool provisioned (if DNI dynamic)
- [ ] CORS allowlist on backend includes the client's domain
- [ ] Snippet delivered to the client (Pattern A or B)
- [ ] Client has deployed to staging
- [ ] `ScaleSDK.healthCheck()` passes on staging
- [ ] `POST /api/visits` returns 200 with expected payload on staging
- [ ] Phone number displays correctly on staging (inside business hours)
- [ ] TrustedForm pixel present (if enabled)
- [ ] Client deploys to production

## 10. Common failures

| Symptom | Likely cause |
|---|---|
| `healthCheck` fails `config.*` | Missing field in `SCALE_CONFIG` — typo or not set before scripts load |
| `healthCheck` fails `/api/sdk/config` | Tenant slug wrong, or tenant record doesn't exist |
| `healthCheck` fails `/business-hours` | Funnel slug wrong, or business hours not configured |
| Phone never appears | `features.phone: false`, outside business hours, or no `<a href="tel:...">` / `[data-show-phone]` markup |
| `POST /api/visits` CORS error | Client domain not on backend CORS allowlist |
| Everything 404 | `apiBaseUrl` wrong (missing `https://`, trailing slash, wrong host) |
| Bootstrap pattern loads nothing | `/api/sdk/tenant-bootstrap` returns non-200 or empty `data` — check browser console |
| `data-scale-form` doesn't intercept submit | Form isn't tagged (check `data-scale-form="lead"`), or SDK failed to boot — look for `[ScaleSDK]` errors in console |
| `submitLead` returns `ok:false` with `funnel_id` error | `SCALE_CONFIG.funnelId` not set — typical with Pattern B if `tenant-bootstrap` response is missing `funnelId` |
| Lead `metadata` has no `ga_client_id` | GA4 not installed on the page, or cookies blocked — request still succeeds, just no GA identity to upload later |
| `submitLead` fails pre-validation on valid-looking data | One of the 6 required fields is empty / malformed — error shape is `{ field: 'email', message: 'invalid email format' }` |
