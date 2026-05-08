// Scale Digital - Bootstrap Loader v2.6.0
// One-tag install: fetches per-tenant config from the backend, sets
// window.SCALE_CONFIG, then loads scale-analytics.js and scale-sdk-v2.js.
//
// As of v2.6, the injected SDK <script> tags also receive data-tenant /
// data-funnel / data-api attributes so each SDK can self-bootstrap when
// SCALE_CONFIG is missing or incomplete (e.g. SDKs dropped on a page
// without the bootstrap).
//
// Usage — paste this single tag in <head>:
//
//   <script src="https://cdn.jsdelivr.net/gh/Github-SNI/scalability-sdk@v2/sdk/scale-bootstrap.min.js"
//           data-tenant="your-tenant-slug"
//           data-funnel="optional-funnel-slug"
//           data-api="https://api.example.com"
//           defer></script>
//
// Requires the backend to implement:
//   GET {api}/api/sdk/tenant-bootstrap?slug={tenant}[&funnel={funnel}]
//     → { data: { funnelId, funnelSlug, apiBaseUrl, tenantKey,
//                  gtmId?, ga4MeasurementId?, recaptchaKey?,
//                  features?, siteId?, vertical? } }
//
// data-funnel is optional. If omitted, the backend picks the oldest
// active funnel for the tenant. Set it on tenants with multiple funnels
// (e.g. WordPress side-site vs main Scale-hosted funnel) to target the
// right one.

(function() {
  'use strict';

  if (window.__scaleBootstrapLoaded) return;
  window.__scaleBootstrapLoaded = true;

  var self = document.currentScript;
  if (!self) {
    console.error('[ScaleBootstrap] cannot locate current <script> tag');
    return;
  }

  var tenant = self.getAttribute('data-tenant');
  var funnel = self.getAttribute('data-funnel');
  var apiBase = self.getAttribute('data-api');
  if (!tenant || !apiBase) {
    console.error('[ScaleBootstrap] data-tenant and data-api attributes are required');
    return;
  }

  var cdnBase = self.src.replace(/\/scale-bootstrap(\.min)?\.js.*$/, '');

  var bootstrapUrl = apiBase + '/api/sdk/tenant-bootstrap?slug=' + encodeURIComponent(tenant);
  if (funnel) bootstrapUrl += '&funnel=' + encodeURIComponent(funnel);

  fetch(bootstrapUrl, {
    method: 'GET',
    credentials: 'include'
  })
    .then(function(r) {
      if (!r.ok) throw new Error('tenant-bootstrap HTTP ' + r.status);
      return r.json();
    })
    .then(function(body) {
      var data = body && body.data;
      if (!data) throw new Error('tenant-bootstrap: missing data');
      if (!data.apiBaseUrl) data.apiBaseUrl = apiBase;
      window.SCALE_CONFIG = data;
      loadScript(cdnBase + '/scale-analytics.min.js', false);
      loadScript(cdnBase + '/scale-sdk-v2.min.js', true);
    })
    .catch(function(err) {
      console.error('[ScaleBootstrap] failed to load config:', err);
    });

  function loadScript(src, isDefer) {
    var s = document.createElement('script');
    s.src = src;
    if (isDefer) s.defer = true;
    s.crossOrigin = 'anonymous';
    // Propagate identity to the SDK so it can self-bootstrap if SCALE_CONFIG
    // ends up missing or incomplete (e.g. bootstrap fetch failed partially).
    s.setAttribute('data-tenant', tenant);
    if (funnel) s.setAttribute('data-funnel', funnel);
    s.setAttribute('data-api', apiBase);
    document.head.appendChild(s);
  }
})();
