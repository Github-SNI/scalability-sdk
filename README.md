# Scale SDK

Official Scale SDK distribution. Download the latest version from [Releases](https://github.com/Github-SNI/scalability-sdk/releases/latest).

## Files

| File | Description |
|---|---|
| `sdk/scale-sdk-v2.js` | Core SDK — visits, DNI phone, TrustedForm, Fetch Interceptor |
| `sdk/scale-analytics.js` | Analytics module — GTM lazy-load + event tracking |
| `docs/Scale-SDK-API-Docs-EN.docx` | Technical documentation |

## Download

### Latest release (always up to date)
```
https://github.com/Github-SNI/scalability-sdk/releases/latest
```

### Specific version
```
https://github.com/Github-SNI/scalability-sdk/releases/download/v2.1.0/Scale-SDK-Pack-v2.1.0.zip
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
| v2.0.1  | 2026-04-07 | Phone from visit response, Fetch Interceptor, timing optimizations |
