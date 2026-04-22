# Scale SDK

Official Scale SDK distribution. Reference it directly from the CDN (recommended) or download the latest version from [Releases](https://github.com/Github-SNI/scalability-sdk/releases/latest).

## Files

| File | Description |
|---|---|
| `sdk/scale-sdk-v2.js` | Core SDK — visits, DNI phone, TrustedForm, Fetch Interceptor |
| `sdk/scale-analytics.js` | Analytics module — GTM lazy-load + event tracking |
| `docs/Scale-SDK-API-Docs-EN.docx` | Technical documentation |

## Use via CDN (recommended)

The SDK is served globally via [jsDelivr](https://www.jsdelivr.com/) directly from this repository — no download or self-hosting required. Drop the snippet below in your site's `<head>`:

```html
<script>
  window.SCALE_CONFIG = {
    funnelId: 'your-funnel-uuid',
    funnelSlug: 'your-funnel-slug',
    apiBaseUrl: 'https://api.example.com',
    gtmId: 'GTM-XXXXXXX',
    features: { visits: true, phone: true, trustedForm: true }
  };
</script>
<script src="https://cdn.jsdelivr.net/gh/Github-SNI/scalability-sdk@v2.1.0/sdk/scale-analytics.js"></script>
<script src="https://cdn.jsdelivr.net/gh/Github-SNI/scalability-sdk@v2.1.0/sdk/scale-sdk-v2.js" defer></script>
```

### Version pinning

| URL pattern | Behavior | Use for |
|---|---|---|
| `@v2.1.0` | Immutable, specific version | **Production** |
| `@v2` | Latest `2.x.x` patch + minor | Staging / auto-updates within a major |
| `@latest` | Always the newest tagged release | Dev / internal only |

The `@v2.1.0` form is cached aggressively by jsDelivr (1 year) and is safe to pin in production. Update the tag in the URL when you want to upgrade.

### Minified variant

Append `.min.js` to the path and jsDelivr will serve a minified copy automatically:

```html
<script src="https://cdn.jsdelivr.net/gh/Github-SNI/scalability-sdk@v2.1.0/sdk/scale-sdk-v2.min.js" defer></script>
```

### Integrity (optional, for stricter security)

Pin a Subresource Integrity hash to guarantee the file never changes. Fetch the hash for any pinned version from:
```
https://cdn.jsdelivr.net/gh/Github-SNI/scalability-sdk@v2.1.0/sdk/scale-sdk-v2.js
```
Then add `integrity="sha384-..."` and `crossorigin="anonymous"` to the `<script>` tag.

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
