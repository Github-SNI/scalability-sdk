# Scale SDK

Distribución oficial del SDK de Scale. Descarga la última versión desde [Releases](https://github.com/Github-SNI/scale-sdk/releases/latest).

## Archivos

| Archivo | Descripción |
|---|---|
| `sdk/scale-sdk-v2.js` | SDK principal — visits, DNI phone, TrustedForm, Fetch Interceptor |
| `sdk/scale-analytics.js` | Módulo de analytics — GTM lazy-load + event tracking |
| `docs/Scale-SDK-API-Docs-EN.docx` | Documentación técnica |

## Descarga

### Última versión (siempre actualizada)
```
https://github.com/Github-SNI/scale-sdk/releases/latest
```

### Versión específica
```
https://github.com/Github-SNI/scale-sdk/releases/download/v2.1.0/Scale-SDK-Pack-v2.1.0.zip
```

### Archivo individual
```
https://github.com/Github-SNI/scale-sdk/releases/download/v2.1.0/scale-sdk-v2.js
```

## Publicar una nueva versión

```bash
# 1. Hacer los cambios en sdk/
git add .
git commit -m "feat: update SDK to vX.Y.Z"

# 2. Crear el tag — esto dispara el release automáticamente
git tag vX.Y.Z
git push origin vX.Y.Z
```

GitHub Actions empaqueta los archivos y crea el release con el ZIP adjunto.

## Versiones

| Versión | Fecha | Notas |
|---|---|---|
| v2.1.0 | 2026-04-07 | Phone desde visit response, Fetch Interceptor, optimización de timings |
| v2.0.0 | 2026-03-19 | Versión inicial |
