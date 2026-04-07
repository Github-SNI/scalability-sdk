Scale SDK Pack — v2.1.0
=======================

CONTENTS:
  sdk/
    scale-analytics.js   →  Analytics module (GTM lazy-load + event tracking)
    scale-sdk-v2.js      →  Core SDK (visits, DNI phone, TrustedForm, Fetch Interceptor)
  docs/
    Scale-SDK-API-Docs-EN.docx  →  Technical documentation in English

HOSTING DE LOS SCRIPTS / SCRIPT HOSTING:
  Upload the /sdk/ files to your server or CDN and reference
  them in your WordPress functions.php.

CHANGELOG v2.1.0:
  - Phone number now resolved directly from visit registration response
    (no separate /api/calls/phone/assign call needed)
  - Separate phone fetch kept as fallback if visit response has no phone
  - New Fetch Interceptor: auto-enriches outgoing API calls
      POST /api/leads          → session_id, visit_id, funnel_step_id, trusted_form_url
      POST /api/contacts/public → recaptcha_token
  - funnel_step_id included in visit tracking payload
  - Optimized phone fetch timings (faster display after LCP)

VERSION: SDK v2.1.0 | Docs v1.1 | 2026
