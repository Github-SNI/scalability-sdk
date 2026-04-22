# Scale SDK

Official Scale SDK distribution. Reference it directly from the CDN (recommended) or download the latest version from [Releases](https://github.com/Github-SNI/scalability-sdk/releases/latest).

## Files

| File | Description |
|---|---|
| `sdk/scale-sdk-v2.js` | Core SDK — visits, DNI phone, TrustedForm, Fetch Interceptor |
| `sdk/scale-analytics.js` | Analytics module — GTM lazy-load + event tracking |
| `docs/Scale-SDK-API-Docs-EN.docx` | Technical documentation |

## Use via CDN (recommended)

The SDK is served globally via [jsDelivr](https://www.jsdelivr.com/) directly from this repository — no download or self-hosting required. The snippet below is production-hardened with Subresource Integrity (SRI): if the file ever changes at the CDN, the browser rejects it. Drop it in your site's `<head>`:

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
  src="https://cdn.jsdelivr.net/gh/Github-SNI/scalability-sdk@v2.1.0/sdk/scale-analytics.js"
  integrity="sha384-ATdZTGsaW1/CfOKOyZNcBcyrTaCXtdDI7JnHTWbgh5sKrz3RSqGYY4xlTQuYFMAL"
  crossorigin="anonymous"></script>
<script
  src="https://cdn.jsdelivr.net/gh/Github-SNI/scalability-sdk@v2.1.0/sdk/scale-sdk-v2.js"
  integrity="sha384-BFqwraYud/5EOnqa1NfXdbf64IlaGtoXO44tSj6UpoCqHLFxWgQ0ljgGItZpfiiy"
  crossorigin="anonymous"
  defer></script>
```
<!-- CDN-SNIPPET:END -->

### Version pinning

| URL pattern | Behavior | Use for |
|---|---|---|
| `@v2.1.0` | Immutable, specific version | **Production** (use with SRI) |
| `@v2` | Latest `2.x.x` patch + minor | Staging / auto-updates within a major |
| `@latest` | Always the newest tagged release | Dev / internal only |

The `@v2.1.0` form is cached immutably by jsDelivr (1 year) and is the only pattern safe to combine with SRI. Floating tags like `@v2` or `@latest` will break SRI the moment a new version is released — use them only without the `integrity` attribute.

### Upgrading

Run the release script (see "Publishing a new release" below) — it builds the minified files, recomputes all SRI hashes, rewrites this section of the README, commits, tags, and pushes. Manual editing is not required.

### Minified variant

Pre-built minified files ship as part of every release (starting v2.1.1). They have their own SRI hashes and are served from the same jsDelivr path:

<!-- CDN-MIN-SNIPPET:START -->
```html
<script
  src="https://cdn.jsdelivr.net/gh/Github-SNI/scalability-sdk@v2.1.0/sdk/scale-analytics.min.js"
  integrity="sha384-<computed-on-release>"
  crossorigin="anonymous"></script>
<script
  src="https://cdn.jsdelivr.net/gh/Github-SNI/scalability-sdk@v2.1.0/sdk/scale-sdk-v2.min.js"
  integrity="sha384-<computed-on-release>"
  crossorigin="anonymous"
  defer></script>
```
<!-- CDN-MIN-SNIPPET:END -->

The minified bundle is ~50% smaller. Public API surface is identical — terser is configured to mangle locals only, never property names.

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
- **Origin**: immutable tags mean the file at `@v2.1.0` is byte-identical forever — GitHub will not let a tag be moved silently to point somewhere else.
- **CDN compromise**: SRI protects against the *one* residual risk — a malicious change at jsDelivr itself. If the bytes don't match the hash, the browser refuses to execute.
- **SDK code**: no `innerHTML`, `eval`, `document.write`, or string-based timers. All DOM writes go through `textContent`/`nodeValue`; all external scripts (GTM, TrustedForm) use fixed, hardcoded hostnames.

## Download (self-hosting)

Prefer to host the SDK on your own server or CDN? Use any of the options below.

### Latest release (always up to date)
```
https://github.com/Github-SNI/scalability-sdk/releases/latest
```

### Specific version
```
https://github.com/Github-SNI/scalability-sdk/releases/download/v2.1.0/Scalability-SDK-v2.1.0.zip
```

### Individual file
```
https://github.com/Github-SNI/scalability-sdk/releases/download/v2.1.0/scale-sdk-v2.js
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

## Changelog

| Version | Date | Notes |
|---------|---|---|
| v2.1.0  | 2026-04-22 | Remote SDK config (`/api/sdk/config`), `phone_swap` driven by remote config, new `scaleTrack()` public API, TrustedForm snippet updated to ActiveProspect's current recommendation (noscript pixel + `use_tagged_consent`) |
| v2.0.1  | 2026-04-07 | Phone from visit response, Fetch Interceptor, timing optimizations |
