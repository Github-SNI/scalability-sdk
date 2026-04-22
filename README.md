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

### Version pinning

| URL pattern | Behavior | Use for |
|---|---|---|
| `@v2.1.0` | Immutable, specific version | **Production** (use with SRI) |
| `@v2` | Latest `2.x.x` patch + minor | Staging / auto-updates within a major |
| `@latest` | Always the newest tagged release | Dev / internal only |

The `@v2.1.0` form is cached immutably by jsDelivr (1 year) and is the only pattern safe to combine with SRI. Floating tags like `@v2` or `@latest` will break SRI the moment a new version is released — use them only without the `integrity` attribute.

### Upgrading

1. Bump the version in the two `src` URLs (e.g., `@v2.1.0` → `@v2.2.0`).
2. Recompute both SRI hashes for the new version:
   ```bash
   curl -sL https://cdn.jsdelivr.net/gh/Github-SNI/scalability-sdk@v2.2.0/sdk/scale-sdk-v2.js    | openssl dgst -sha384 -binary | openssl base64 -A
   curl -sL https://cdn.jsdelivr.net/gh/Github-SNI/scalability-sdk@v2.2.0/sdk/scale-analytics.js | openssl dgst -sha384 -binary | openssl base64 -A
   ```
3. Update both `integrity="sha384-..."` attributes with the new hashes.

### Minified variant

Append `.min.js` and jsDelivr minifies on the fly. Note that minified output **has a different SRI hash** than the raw file — recompute it if you switch.

```html
<script src="https://cdn.jsdelivr.net/gh/Github-SNI/scalability-sdk@v2.1.0/sdk/scale-sdk-v2.min.js" defer></script>
```

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

```bash
# 1. Make changes to sdk/
git add .
git commit -m "feat: update SDK to vX.Y.Z"

# 2. Create the tag — this triggers the release automatically
git tag vX.Y.Z
git push origin vX.Y.Z
```

GitHub Actions packages the files and creates the release with the ZIP attached.

## Changelog

| Version | Date | Notes |
|---------|---|---|
| v2.1.0  | 2026-04-22 | Remote SDK config (`/api/sdk/config`), `phone_swap` driven by remote config, new `scaleTrack()` public API, TrustedForm snippet updated to ActiveProspect's current recommendation (noscript pixel + `use_tagged_consent`) |
| v2.0.1  | 2026-04-07 | Phone from visit response, Fetch Interceptor, timing optimizations |
