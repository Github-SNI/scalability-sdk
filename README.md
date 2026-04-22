# Scale SDK

Official Scale SDK distribution. Reference it directly from the CDN (recommended) or download the latest version from [Releases](https://github.com/Github-SNI/scalability-sdk/releases/latest).

## Files

| File | Description |
|---|---|
| `sdk/scale-sdk-v2.js` | Core SDK — visits, DNI phone, TrustedForm, Fetch Interceptor |
| `sdk/scale-analytics.js` | Analytics module — GTM lazy-load + event tracking |
| `docs/Scale-SDK-API-Docs-EN.docx` | Technical documentation |

## Use via CDN (recommended)

The SDK is served globally via [jsDelivr](https://www.jsdelivr.com/) directly from this repository — no download, no self-hosting. Clients copy the snippet once; we push patch releases and they reach every site within seconds (the release workflow purges the jsDelivr cache on every tag).

### Drop-in snippet (recommended)

<!-- CDN-SIMPLE-SNIPPET:START -->
```html
<script>
  window.SCALE_CONFIG = {
    funnelId: 'your-funnel-uuid',
    funnelSlug: 'your-funnel-slug',
    tenantKey: 'your-tenant-slug',
    apiBaseUrl: 'https://api.example.com',
    gtmId: 'GTM-XXXXXXX',
    features: { visits: true, phone: true, trustedForm: true }
  };
</script>
<script src="https://cdn.jsdelivr.net/gh/Github-SNI/scalability-sdk@v2.1/sdk/scale-analytics.min.js"></script>
<script src="https://cdn.jsdelivr.net/gh/Github-SNI/scalability-sdk@v2.1/sdk/scale-sdk-v2.min.js" defer></script>
```
<!-- CDN-SIMPLE-SNIPPET:END -->

`@vX.Y` always resolves to the latest `vX.Y.*` — every patch release (bugfixes, timing improvements, etc.) reaches clients automatically. Minor bumps (`vX.Y+1.0`) and major bumps (`vX+1.0.0`) do **not** change the content at `@vX.Y`, so clients can safely stay on this URL until they explicitly opt into a newer line.

### Version pinning (choose your cadence)

| URL pattern | Auto-receives | Opt-in required for | Typical use |
|---|---|---|---|
| `@vX.Y` (the snippet above) | Patches within `X.Y` | Minors, majors | **Default for clients** |
| `@vX` | Patches + minors within `X` | Majors | Clients fine with new features landing automatically |
| `@vX.Y.Z` | Nothing — immutable | All updates | Strict change management / can be combined with SRI |
| `@latest` | Everything, including majors | Nothing | Dev / internal only |

### Advanced: pinned + SRI (strict change management)

For clients in regulated industries or with strict change-management policies, pin an exact version and combine with [Subresource Integrity](https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity). The browser computes the file's SHA-384 on load and refuses to execute it if the bytes don't match — so even a CDN-level compromise can't inject code:

<!-- CDN-SNIPPET:START -->
```html
<script>
  window.SCALE_CONFIG = {
    funnelId: 'your-funnel-uuid',
    funnelSlug: 'your-funnel-slug',
    tenantKey: 'your-tenant-slug',
    apiBaseUrl: 'https://api.example.com',
    gtmId: 'GTM-XXXXXXX',
    features: { visits: true, phone: true, trustedForm: true }
  };
</script>
<script
  src="https://cdn.jsdelivr.net/gh/Github-SNI/scalability-sdk@v2.1.1/sdk/scale-analytics.js"
  integrity="sha384-ATdZTGsaW1/CfOKOyZNcBcyrTaCXtdDI7JnHTWbgh5sKrz3RSqGYY4xlTQuYFMAL"
  crossorigin="anonymous"></script>
<script
  src="https://cdn.jsdelivr.net/gh/Github-SNI/scalability-sdk@v2.1.1/sdk/scale-sdk-v2.js"
  integrity="sha384-BFqwraYud/5EOnqa1NfXdbf64IlaGtoXO44tSj6UpoCqHLFxWgQ0ljgGItZpfiiy"
  crossorigin="anonymous"
  defer></script>
```
<!-- CDN-SNIPPET:END -->

Minified + SRI variant:

<!-- CDN-MIN-SNIPPET:START -->
```html
<script
  src="https://cdn.jsdelivr.net/gh/Github-SNI/scalability-sdk@v2.1.1/sdk/scale-analytics.min.js"
  integrity="sha384-C95tlgQf4ON9fdiOmJ1B1vee/4r8hmIlyNSODV1sBlXy2UBnhD5f9IS/IPdB1l2z"
  crossorigin="anonymous"></script>
<script
  src="https://cdn.jsdelivr.net/gh/Github-SNI/scalability-sdk@v2.1.1/sdk/scale-sdk-v2.min.js"
  integrity="sha384-6fU4LIP0cmQVOo3RIURyF6c482if/GlA0Ak7Q0/dcngQn2UgTZHkvOSuhTNVoDp7"
  crossorigin="anonymous"
  defer></script>
```
<!-- CDN-MIN-SNIPPET:END -->

SRI only works with immutable URLs (`@vX.Y.Z`), since floating tags serve different bytes after every release. Clients on SRI opt into each update by running the upgrade script and re-deploying.

### Content Security Policy

If your site enforces CSP, whitelist the hosts the SDK loads from and talks to. Minimum directives:

```
script-src  'self' https://cdn.jsdelivr.net
            https://www.googletagmanager.com
            https://api.trustedform.com;
connect-src 'self' https://api.example.com
            https://www.google-analytics.com
            https://region1.google-analytics.com;
img-src     'self' data: https://api.trustedform.com
            https://www.googletagmanager.com
            https://www.google-analytics.com;
frame-src   https://www.googletagmanager.com;
```

Replace `https://api.example.com` with your `apiBaseUrl`. Drop the `googletagmanager`/`google-analytics` hosts if you don't load Analytics. Drop `api.trustedform.com` if you disable TrustedForm (`features.trustedForm: false`).

### Why this is safe

- **Transport**: jsDelivr serves over HTTPS with HSTS and `cross-origin-resource-policy: cross-origin`; the file can't be tampered with in flight.
- **Origin**: git tags are immutable — once a specific `vX.Y.Z` is published, its bytes never change. The floating `@vX.Y` URL just points to the latest `vX.Y.*` tag, and that tag's content itself can't be rewritten.
- **CDN compromise (pinned)**: SRI protects against a malicious change at jsDelivr — the browser refuses to execute if the hash doesn't match. Use the "Advanced: pinned + SRI" variant when you need this.
- **CDN compromise (floating)**: the floating-tag variant trades SRI for automatic updates. The residual risk is a jsDelivr compromise between our purge and the next integrity signal we notice. Acceptable for most clients; clients needing belt-and-braces use the pinned variant.
- **SDK code**: no `innerHTML`, `eval`, `document.write`, or string-based timers. All DOM writes go through `textContent`/`nodeValue`; all external scripts (GTM, TrustedForm) use fixed, hardcoded hostnames.

## Download (self-hosting)

Prefer to host the SDK on your own server or CDN? Use any of the options below.

### Latest release (always up to date)
```
https://github.com/Github-SNI/scalability-sdk/releases/latest
```

### Specific version
```
https://github.com/Github-SNI/scalability-sdk/releases/download/v2.1.1/Scalability-SDK-v2.1.1.zip
```

### Individual file
```
https://github.com/Github-SNI/scalability-sdk/releases/download/v2.1.1/scale-sdk-v2.js
```

## Publishing a new release

Use the release script — it builds, hashes, updates docs, tags, and pushes in one shot:

```bash
# 1. Edit sdk/*.js and commit the source changes
git add sdk/
git commit -m "feat: <summary of SDK change>"

# 2. Add a Changelog row below for the new version (manual step)
#    (automation intentionally doesn't touch the changelog)

# 3. Run the release script — version-bumps package.json, builds minified,
#    recomputes SRI, rewrites the CDN snippets in this README, then
#    commits, tags, and pushes.
npm run release -- v2.2.0
```

The GitHub Actions workflow triggers on the tag push, generates the ZIP, and creates the release with all four files (raw + minified) attached as assets and SRI hashes embedded in the release notes.

### What the release script does

1. Preflight: on `main`, clean tree, tag doesn't exist yet.
2. `npm install && npm run build` → produces `sdk/*.min.js` via terser.
3. Computes SHA-384 SRI hashes for all four files.
4. Rewrites the `<!-- CDN-SNIPPET:START -->` and `<!-- CDN-MIN-SNIPPET:START -->` blocks in this file with the new version and hashes.
5. Bumps `version` in `package.json`.
6. Shows the diff and asks for confirmation.
7. Commits (`release: vX.Y.Z`), tags, pushes both `main` and the tag.

## Development

```bash
git clone https://github.com/Github-SNI/scalability-sdk.git
cd scalability-sdk
npm install   # installs terser + wires up the pre-commit hook
```

`npm install` runs a `prepare` step that points `core.hooksPath` at `scripts/hooks`. The pre-commit hook rebuilds `sdk/*.min.js` whenever you stage changes to `sdk/scale-sdk-v2.js` or `sdk/scale-analytics.js` and blocks the commit if the minified output drifts from the source. Bypass with `git commit --no-verify` — CI will still reject the PR.

CI (`.github/workflows/ci.yml`) runs on every PR and push to `main`: it re-runs `npm run build` and fails if the committed `.min.js` doesn't match what terser produces from the source. This keeps the CDN and the release artifacts in sync without trusting individual developer setups.

## Changelog

| Version | Date | Notes |
|---------|---|---|
| v2.1.0  | 2026-04-22 | Remote SDK config (`/api/sdk/config`), `phone_swap` driven by remote config, new `scaleTrack()` public API, TrustedForm snippet updated to ActiveProspect's current recommendation (noscript pixel + `use_tagged_consent`) |
| v2.0.1  | 2026-04-07 | Phone from visit response, Fetch Interceptor, timing optimizations |
