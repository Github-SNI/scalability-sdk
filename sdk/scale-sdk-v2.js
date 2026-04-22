// Scale Digital - SDK v2.1.0
// Core SDK for the new SaaS backend (funnels, sessions, tenants)
// Multi-site infrastructure: session, cookie (SSR), visit registration, phone DNI, TrustedForm
// Everything else (forms, validation, analytics, content rendering) is site responsibility
//
// Usage: Set window.SCALE_CONFIG before loading this script
//
// <script>
//   window.SCALE_CONFIG = {
//     funnelId: 'uuid-del-funnel',
//     funnelSlug: 'mi-funnel',
//     apiBaseUrl: 'https://api.example.com',
//     debug: false,
//     features: {
//       visits: true,        // Visit tracking
//       phone: true,         // Dynamic Number Insertion (DNI)
//       trustedForm: true    // TrustedForm cert
//     }
//   };
// </script>
// <script src="/sdk/scale-analytics.js"></script>
// <script src="/sdk/scale-sdk-v2.js" defer></script>
//
// Phone elements (auto-updated when phone is fetched):
//   <a href="tel:+18001234567">(800) 123-4567</a>
//   <div data-show-phone style="display:none">Call us: <a href="tel:+18001234567">Call Now</a></div>

(function() {
  'use strict';

  // Prevent double initialization
  if (window.__scaleSDKv2Loaded) return;
  window.__scaleSDKv2Loaded = true;

  // ==================== Config ====================
  var cfg = window.SCALE_CONFIG || {};
  var features = cfg.features || {};
  var debug = cfg.debug || false;
  var apiBase = cfg.apiBaseUrl || '';
  var tenantKey = cfg.tenantKey || cfg.tenantSlug || null; // slug used for remote-config lookup
  var _remoteConfig = null; // populated async from /api/sdk/config; may stay null

  function featureEnabled(name, defaultVal) {
    // Remote config can override site-level features. Priority:
    // 1. SCALE_CONFIG.features[name] (explicit site override)
    // 2. _remoteConfig.tracking.<name> (boolean) OR .enabled (object)
    // 3. defaultVal
    if (features[name] !== undefined) return !!features[name];
    if (_remoteConfig && _remoteConfig.tracking && _remoteConfig.tracking[name] !== undefined) {
      var t = _remoteConfig.tracking[name];
      if (typeof t === 'boolean') return t;
      if (t && typeof t === 'object' && 'enabled' in t) return !!t.enabled;
    }
    return defaultVal !== false;
  }

  function log() {
    if (debug && console.debug) {
      console.debug.apply(console, ['[ScaleSDK]'].concat(Array.prototype.slice.call(arguments)));
    }
  }

  // ==================== Fetch with Timeout ====================
  var FETCH_TIMEOUT = 10000; // 10 seconds

  function fetchWithTimeout(url, options, timeout) {
    return new Promise(function(resolve, reject) {
      var timer = setTimeout(function() { reject(new Error('Request timeout')); }, timeout || FETCH_TIMEOUT);
      fetch(url, options).then(function(res) {
        clearTimeout(timer);
        resolve(res);
      }).catch(function(err) {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  // ==================== DOM Ready Helper ====================
  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  // ==================== Utilities ====================
  function generateId(prefix) {
    var timestamp = Date.now().toString(36);
    var random = Math.random().toString(36).substring(2, 10);
    return (prefix || 'id') + '_' + timestamp + '_' + random;
  }

  function getDeviceType() {
    var ua = navigator.userAgent;
    if (/tablet|ipad|playbook|silk/i.test(ua)) return 'tablet';
    if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) return 'mobile';
    return 'desktop';
  }

  function getBrowser() {
    var ua = navigator.userAgent;
    if (ua.indexOf('Firefox') > -1) return 'Firefox';
    if (ua.indexOf('SamsungBrowser') > -1) return 'Samsung Browser';
    if (ua.indexOf('Opera') > -1 || ua.indexOf('OPR') > -1) return 'Opera';
    if (ua.indexOf('Trident') > -1) return 'Internet Explorer';
    if (ua.indexOf('Edge') > -1) return 'Edge';
    if (ua.indexOf('Edg') > -1) return 'Edge Chromium';
    if (ua.indexOf('Chrome') > -1) return 'Chrome';
    if (ua.indexOf('Safari') > -1) return 'Safari';
    return 'Unknown';
  }

  function getOS() {
    var ua = navigator.userAgent;
    if (ua.indexOf('Win') > -1) return 'Windows';
    if (ua.indexOf('Mac') > -1) return 'macOS';
    if (ua.indexOf('Linux') > -1) return 'Linux';
    if (ua.indexOf('Android') > -1) return 'Android';
    if (ua.indexOf('iOS') > -1 || ua.indexOf('iPhone') > -1 || ua.indexOf('iPad') > -1) return 'iOS';
    return 'Unknown';
  }

  function formatPhoneNumber(phone) {
    if (!phone) return '';
    var cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return '(' + cleaned.slice(0,3) + ') ' + cleaned.slice(3,6) + '-' + cleaned.slice(6);
    }
    if (cleaned.length === 11 && cleaned[0] === '1') {
      cleaned = cleaned.slice(1);
      return '(' + cleaned.slice(0,3) + ') ' + cleaned.slice(3,6) + '-' + cleaned.slice(6);
    }
    return phone;
  }

  function getURLParams() {
    return new URLSearchParams(window.location.search);
  }

  function getUTMParams() {
    var params = getURLParams();
    return {
      utm_source: params.get('utm_source') || undefined,
      utm_medium: params.get('utm_medium') || undefined,
      utm_campaign: params.get('utm_campaign') || undefined,
      utm_term: params.get('utm_term') || undefined,
      utm_content: params.get('utm_content') || undefined
    };
  }

  function getTrackingParams() {
    var params = getURLParams();
    var result = {};
    var knownParams = ['gclid', 'fbclid', 'msclkid', 'ttclid', 'li_fat_id', 'ref', 'source', 'id', 'source_id'];
    knownParams.forEach(function(key) {
      var value = params.get(key);
      if (value) result[key] = value;
    });
    return Object.keys(result).length > 0 ? result : undefined;
  }

  // Extract source_id from URL params (supports aliases: source_id, id, source)
  function getSourceId() {
    var params = getURLParams();
    return params.get('source_id') || params.get('id') || params.get('source') || undefined;
  }

  function cleanObject(obj) {
    var result = {};
    Object.keys(obj).forEach(function(key) {
      if (obj[key] !== undefined && obj[key] !== null) {
        result[key] = obj[key];
      }
    });
    return result;
  }

  // ==================== Cookie Module (Astro SSR compat) ====================
  // Syncs essential data to a `data` cookie so Astro middleware can read it server-side
  var COOKIE_MAX_AGE = 60 * 60 * 4; // 4 hours
  var _cookieCache = null;

  function getCookieData() {
    if (_cookieCache) return _cookieCache;
    if (window.__scaleCookieData) {
      _cookieCache = window.__scaleCookieData;
      return _cookieCache;
    }
    try {
      var raw = document.cookie.split('; ').find(function(r) { return r.startsWith('data='); });
      if (!raw) return {};
      _cookieCache = JSON.parse(decodeURIComponent(raw.split('=').slice(1).join('=')));
      window.__scaleCookieData = _cookieCache;
      return _cookieCache;
    } catch (e) {
      return {};
    }
  }

  function updateCookie(data) {
    try {
      var merged = {};
      var current = _cookieCache || window.__scaleCookieData || {};
      for (var k in current) { if (current.hasOwnProperty(k)) merged[k] = current[k]; }
      for (var j in data) { if (data.hasOwnProperty(j) && data[j] !== undefined) merged[j] = data[j]; }
      document.cookie = 'data=' + encodeURIComponent(JSON.stringify(merged)) + '; path=/; max-age=' + COOKIE_MAX_AGE;
      _cookieCache = merged;
      window.__scaleCookieData = merged;
    } catch (e) {
      log('Cookie write error:', e);
    }
  }

  function syncCookieFromSession(session, visitData) {
    var cookieData = {
      is_mobile_device: getDeviceType() === 'mobile'
    };

    if (session) {
      cookieData.session_id = session.sessionId;
      if (session.visitId) cookieData.visit_id = session.visitId;
    }

    if (visitData) {
      if (visitData.partner_slug) cookieData.partner_slug = visitData.partner_slug;
      if (visitData.partner_id) cookieData.partner_id = visitData.partner_id;
      if (visitData.source_id) cookieData.source_id = visitData.source_id;
      if (visitData.vertical_type) cookieData.vertical_type = visitData.vertical_type;
    }

    updateCookie(cookieData);
    log('Cookie synced for SSR:', cookieData);
  }

  // ==================== Session Module ====================
  var SESSION_KEY = 'scale_session';
  var SESSION_MAX_AGE = 4 * 60 * 60 * 1000; // 4 hours

  function getSession() {
    try {
      var stored = localStorage.getItem(SESSION_KEY);
      if (stored) {
        var parsed = JSON.parse(stored);
        if (parsed.createdAt && (Date.now() - parsed.createdAt) < SESSION_MAX_AGE) {
          return parsed;
        }
      }
    } catch (e) {
      log('Session read error:', e);
    }
    return null;
  }

  function createSession() {
    var session = {
      sessionId: generateId('sess'),
      createdAt: Date.now(),
      funnelId: cfg.funnelId,
      visitId: null,
      converted: false
    };
    saveSession(session);
    return session;
  }

  function saveSession(session) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch (e) {
      log('Session save error:', e);
    }
  }

  function updateSession(data) {
    var session = getSession() || createSession();
    for (var k in data) { if (data.hasOwnProperty(k)) session[k] = data[k]; }
    saveSession(session);
    return session;
  }

  function clearSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
  }

  function getOrCreateSession() {
    return getSession() || createSession();
  }

  // ==================== Session Data Helper ====================
  function getSessionData() {
    var session = getSession();
    var cd = getCookieData();
    return {
      visit_id: (session && session.visitId) || cd.visit_id || '',
      session_id: (session && session.sessionId) || cd.session_id || '',
      partner_id: cd.partner_id || '',
      partner_slug: cd.partner_slug || '',
      source_id: cd.source_id || '',
      site_id: cd.site_id || cfg.siteId || '',
      funnel_id: cfg.funnelId || '',
      vertical_type: cd.vertical_type || cfg.vertical || '',
      posted_type: cd.posted_type || '',
      lead_masked_id: cd.lead_masked_id || '',
      is_mobile_device: cd.is_mobile_device || getDeviceType() === 'mobile'
    };
  }

  // ==================== Visit Registration Module ====================
  var _visitState = {
    registered: false,
    startTime: Date.now(),
    pageViews: 1,
    heartbeatInterval: null
  };

  function initVisitRegistration() {
    if (!featureEnabled('visits')) return;

    var funnelId = cfg.funnelId;
    if (!funnelId) {
      log('Warning: No funnelId, visit tracking disabled');
      return;
    }

    var session = getOrCreateSession();
    var utmParams = getUTMParams();
    var trackingParams = getTrackingParams();

    var payload = cleanObject({
      funnel_id: funnelId,
      funnel_step_id: cfg.stepId || undefined,
      session_id: session.sessionId,
      landing_page: window.location.href,
      referrer: document.referrer || undefined,
      device_type: getDeviceType(),
      browser: getBrowser(),
      os: getOS(),
      utm_source: utmParams.utm_source,
      utm_medium: utmParams.utm_medium,
      utm_campaign: utmParams.utm_campaign,
      utm_term: utmParams.utm_term,
      utm_content: utmParams.utm_content,
      params: trackingParams
    });

    log('Registering visit:', payload);

    var visitUrl = apiBase + '/api/visits';
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      visitUrl += '?skip_bh=true';
    }

    fetchWithTimeout(visitUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }, FETCH_TIMEOUT)
    .then(function(res) {
      if (!res.ok) throw new Error('Visit tracking failed: ' + res.status);
      return res.json();
    })
    .then(function(result) {
      if (result.success && result.data) {
        _visitState.registered = true;
        updateSession({ visitId: result.data.id });

        // Sync to cookie for Astro SSR
        syncCookieFromSession(getSession(), result.data);

        log('Visit registered, id:', result.data.id);

        window.dispatchEvent(new CustomEvent('visit-registered', {
          detail: result.data
        }));
        window.dispatchEvent(new CustomEvent('scale:visit-registered', {
          detail: { visitId: result.data.id, sessionId: session.sessionId }
        }));

        if (cfg.onVisitRegistered) cfg.onVisitRegistered(result.data);

        // If visit response includes phone (backend assigned it during visit registration),
        // populate state and display immediately — no separate /api/calls/phone/assign needed
        var visitPhone = result.data.phone;
        if (visitPhone && visitPhone.phone_number) {
          _phoneState.phoneNumber = visitPhone.phone_number;
          _phoneState.formattedPhone = visitPhone.formatted_phone || formatPhoneNumber(visitPhone.phone_number);
          _phoneState.isFallback = visitPhone.is_fallback || false;
          _phoneState.fetched = true;
          cachePhone({
            phoneNumber: _phoneState.phoneNumber,
            formattedPhone: _phoneState.formattedPhone,
            expiresAt: visitPhone.expires_at,
            isFallback: _phoneState.isFallback
          });
          try { localStorage.setItem('show_phone_number', 'true'); } catch(e) {}
          onReady(function() { setupPhoneDisplay(); });
          window.dispatchEvent(new CustomEvent('phone-loaded', {
            detail: { phone_number: visitPhone.phone_number }
          }));
          window.dispatchEvent(new CustomEvent('scale:phone-ready', {
            detail: { phoneNumber: _phoneState.phoneNumber, formattedPhone: _phoneState.formattedPhone }
          }));
        }
      }
    })
    .catch(function(error) {
      log('Visit registration error:', error);
    });

    // Heartbeat: update activity every 30s while page is visible
    _visitState.heartbeatInterval = setInterval(function() {
      if (_visitState.registered && document.visibilityState === 'visible') {
        updateVisitActivity();
      }
    }, 30000);

    // Update on visibility change
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'hidden' && _visitState.registered) {
        updateVisitActivity();
      }
    });

    // Beacon on unload
    window.addEventListener('beforeunload', function() {
      if (!_visitState.registered) return;
      var session = getSession();
      if (!session) return;
      var payload = JSON.stringify({
        exit_page: window.location.href,
        time_on_site: Math.round((Date.now() - _visitState.startTime) / 1000),
        pages_visited: _visitState.pageViews
      });
      if (navigator.sendBeacon) {
        var blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon(apiBase + '/api/visits/' + session.sessionId, blob);
      }
    });

    // SPA navigation support
    var lastUrl = window.location.href;
    var originalPushState = history.pushState;
    var originalReplaceState = history.replaceState;

    history.pushState = function() {
      originalPushState.apply(this, arguments);
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        _visitState.pageViews++;
      }
    };
    history.replaceState = function() {
      originalReplaceState.apply(this, arguments);
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        _visitState.pageViews++;
      }
    };
    window.addEventListener('popstate', function() {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        _visitState.pageViews++;
      }
    });
  }

  function updateVisitActivity(data) {
    var session = getSession();
    if (!session) return;

    var payload = {
      exit_page: (data && data.exitPage) || window.location.href,
      time_on_site: Math.round((Date.now() - _visitState.startTime) / 1000),
      pages_visited: _visitState.pageViews
    };

    fetchWithTimeout(apiBase + '/api/visits/' + session.sessionId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }, FETCH_TIMEOUT)
    .then(function(res) { return res.ok ? res.json() : null; })
    .catch(function(error) { log('Activity update error:', error); });
  }

  // ==================== Phone Module (DNI) ====================
  var _phoneState = {
    phoneNumber: null,
    formattedPhone: null,
    fetched: false,
    fetching: false,
    expiresAt: null,
    isFallback: false
  };

  var PHONE_STORAGE_KEY = 'scale_phone';
  var PHONE_CACHE_MS = 15 * 60 * 1000; // 15 minutes

  function getCachedPhone() {
    try {
      var stored = localStorage.getItem(PHONE_STORAGE_KEY);
      if (stored) {
        var parsed = JSON.parse(stored);
        if (parsed.expiresAt && new Date(parsed.expiresAt) > new Date()) {
          return parsed;
        }
        localStorage.removeItem(PHONE_STORAGE_KEY);
      }
    } catch (e) {}
    return null;
  }

  function cachePhone(data) {
    try {
      var expiry = data.expiresAt || new Date(Date.now() + PHONE_CACHE_MS).toISOString();
      localStorage.setItem(PHONE_STORAGE_KEY, JSON.stringify({
        phoneNumber: data.phoneNumber,
        formattedPhone: data.formattedPhone,
        expiresAt: expiry,
        isFallback: data.isFallback
      }));
    } catch (e) {}
  }

  function fetchPhone(options) {
    options = options || {};

    // Check cache first
    if (!options.noCache) {
      var cached = getCachedPhone();
      if (cached) {
        _phoneState.phoneNumber = cached.phoneNumber;
        _phoneState.formattedPhone = cached.formattedPhone;
        _phoneState.expiresAt = cached.expiresAt;
        _phoneState.isFallback = cached.isFallback;
        _phoneState.fetched = true;
        log('Phone loaded from cache:', _phoneState.formattedPhone);
        return Promise.resolve(_phoneState);
      }
    }

    // Prevent concurrent fetches
    if (_phoneState.fetching) {
      return new Promise(function(resolve) {
        var check = setInterval(function() {
          if (!_phoneState.fetching) { clearInterval(check); resolve(_phoneState); }
        }, 100);
      });
    }

    var funnelId = options.funnelId || cfg.funnelId;
    var funnelSlug = options.funnelSlug || cfg.funnelSlug;
    var session = getOrCreateSession();

    if (!funnelId && !funnelSlug) {
      log('Phone: No funnelId or funnelSlug configured');
      return Promise.resolve(null);
    }

    _phoneState.fetching = true;

    var utmParams = getUTMParams();
    var sourceId = getSourceId();
    var payload = cleanObject({
      funnel_id: funnelId,
      funnel_slug: funnelSlug,
      session_id: session.sessionId,
      utm_campaign: utmParams.utm_campaign,
      source_id: sourceId
    });

    log('Fetching phone number:', payload);

    return fetchWithTimeout(apiBase + '/api/calls/phone/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }, FETCH_TIMEOUT)
    .then(function(res) {
      if (!res.ok) throw new Error('Phone fetch failed: ' + res.status);
      return res.json();
    })
    .then(function(result) {
      _phoneState.fetching = false;

      if (result.success && result.data) {
        _phoneState.phoneNumber = result.data.phone_number;
        _phoneState.formattedPhone = result.data.formatted_phone || formatPhoneNumber(result.data.phone_number);
        _phoneState.expiresAt = result.data.expires_at;
        _phoneState.isFallback = result.data.is_fallback;
        _phoneState.fetched = true;

        cachePhone({
          phoneNumber: _phoneState.phoneNumber,
          formattedPhone: _phoneState.formattedPhone,
          expiresAt: _phoneState.expiresAt,
          isFallback: _phoneState.isFallback
        });

        log('Phone fetched:', _phoneState.formattedPhone, _phoneState.isFallback ? '(fallback)' : '');

        // Dispatch events
        window.dispatchEvent(new CustomEvent('phone-loaded', {
          detail: { phone_number: _phoneState.phoneNumber }
        }));
        window.dispatchEvent(new CustomEvent('scale:phone-ready', {
          detail: {
            phoneNumber: _phoneState.phoneNumber,
            formattedPhone: _phoneState.formattedPhone,
            isFallback: _phoneState.isFallback
          }
        }));

        if (cfg.onPhoneReady) cfg.onPhoneReady(_phoneState);

        return _phoneState;
      }

      throw new Error(result.error || 'Phone not available');
    })
    .catch(function(error) {
      _phoneState.fetching = false;
      log('Phone fetch error:', error);
      return null;
    });
  }

  // ==================== Phone Display Module ====================
  var _phoneDisplayInitialized = false;

  function updateAllPhoneLinks(cleanPhone, formattedPhone) {
    // Update ALL tel: links
    document.querySelectorAll('a[href^="tel:"]').forEach(function(link) {
      link.href = 'tel:+1' + cleanPhone;
      var text = (link.textContent || '').trim();
      if (!text || /^[\d\s\(\)\-\+\.]+$/.test(text) || text === 'Call Now' || text === 'Call Us') {
        link.textContent = formattedPhone;
      }
    });

    // Update #phone-link (call button) — href may be empty on first load
    var phoneLink = document.getElementById('phone-link');
    if (phoneLink) {
      phoneLink.href = 'tel:+1' + cleanPhone;
    }
  }

  function setupPhoneDisplay() {
    if (_phoneDisplayInitialized) return;
    _phoneDisplayInitialized = true;

    var phone = _phoneState.phoneNumber;
    var formattedPhone = _phoneState.formattedPhone;

    if (!phone || !formattedPhone) {
      // Hide phone elements
      document.querySelectorAll('[data-show-phone]').forEach(function(el) {
        el.style.display = 'none';
      });
      if (cfg.onPhoneHidden) cfg.onPhoneHidden();
      return;
    }

    var cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length === 11 && cleanPhone[0] === '1') cleanPhone = cleanPhone.slice(1);

    // Update all tel: links
    updateAllPhoneLinks(cleanPhone, formattedPhone);

    // Update data-attribute phone elements and #phone-number
    var selectors = '[data-phone],[data-scale-phone],.phone-number,.scale-phone,#phone-number,#text-phone-number';
    document.querySelectorAll(selectors).forEach(function(el) {
      if (el.tagName === 'A') {
        el.href = 'tel:+1' + cleanPhone;
        if (!el.getAttribute('data-phone-no-text')) {
          el.textContent = formattedPhone;
        }
      } else {
        el.textContent = formattedPhone;
      }
    });

    // Show phone containers
    document.querySelectorAll('[data-show-phone]').forEach(function(el) {
      el.style.display = '';
    });

    log('Phone displayed:', formattedPhone);

    if (cfg.onPhoneLoaded) cfg.onPhoneLoaded(phone);

    window.dispatchEvent(new CustomEvent('scale-phone-displayed', {
      detail: { phone: phone, formattedPhone: formattedPhone }
    }));
  }

  function refreshPhoneDisplay() {
    _phoneDisplayInitialized = false;
    setupPhoneDisplay();
  }

  // Listen for phone-loaded event
  window.addEventListener('phone-loaded', function() {
    _phoneDisplayInitialized = false;
    onReady(function() { setupPhoneDisplay(); });
  });

  // ==================== Business Hours Module ====================
  var BH_STORAGE_KEY = 'scale_business_hours';
  var BH_CACHE_MS = 5 * 60 * 1000; // 5 minutes

  function getCachedBusinessHours() {
    try {
      var raw = localStorage.getItem(BH_STORAGE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (new Date(data.expiresAt) <= new Date()) {
        localStorage.removeItem(BH_STORAGE_KEY);
        return null;
      }
      return data;
    } catch (e) { return null; }
  }

  function cacheBusinessHours(data) {
    try {
      localStorage.setItem(BH_STORAGE_KEY, JSON.stringify({
        is_open: data.is_open,
        has_schedule: data.has_schedule,
        expiresAt: new Date(Date.now() + BH_CACHE_MS).toISOString()
      }));
    } catch (e) { /* ignore */ }
  }

  function checkBusinessHours() {
    var cached = getCachedBusinessHours();
    if (cached !== null) {
      log('Business hours from cache:', cached.is_open ? 'OPEN' : 'CLOSED');
      return Promise.resolve(cached);
    }

    var slug = cfg.funnelSlug;
    var apiBase = cfg.apiBaseUrl;
    if (!slug || !apiBase) {
      // No slug configured, default to open
      return Promise.resolve({ is_open: true, has_schedule: false });
    }

    return fetchWithTimeout(apiBase + '/api/funnels/public/' + slug + '/business-hours', {
      method: 'GET'
    }, 2000)
    .then(function(res) { return res.json(); })
    .then(function(result) {
      if (result.success) {
        cacheBusinessHours(result);
        console.log('Business hours fetched:', result.is_open ? 'OPEN' : 'CLOSED');
        return result;
      }
      return { is_open: true, has_schedule: false };
    })
    .catch(function(error) {
      log('Business hours check error:', error);
      return { is_open: true, has_schedule: false }; // Default to open on error
    });
  }

  // ==================== Phone Fetcher (LCP-based) ====================
  function initPhoneFetcher() {
    if (!featureEnabled('phone')) return;

    var triggered = false;

    function doFetchPhone() {
      // If phone already loaded from visit response, just display it
      if (_phoneState.fetched) {
        onReady(function() { setupPhoneDisplay(); });
        return;
      }
      // Check business hours before fetching phone
      checkBusinessHours().then(function(bh) {
        if (!bh.is_open && bh.has_schedule) {
          log('Outside business hours — hiding phone');
          try { localStorage.setItem('show_phone_number', 'false'); } catch (e) { /* ignore */ }
          // Hide phone elements
          onReady(function() {
            document.querySelectorAll('[data-show-phone]').forEach(function(el) {
              el.style.display = 'none';
            });
          });
          return;
        }

        try { localStorage.setItem('show_phone_number', 'true'); } catch (e) { /* ignore */ }

        fetchPhone().then(function(result) {
          if (result && result.phoneNumber) {
            onReady(function() { setupPhoneDisplay(); });
          }
        });
      });
    }

    function triggerFetch() {
      if (triggered) return;
      triggered = true;
      doFetchPhone();
    }

    // Wait for LCP then fetch — no extra delay so phone appears as soon as possible
    if (window.PerformanceObserver) {
      try {
        var obs = new PerformanceObserver(function(list) {
          if (list.getEntries().length > 0) { obs.disconnect(); triggerFetch(); }
        });
        obs.observe({ entryTypes: ['largest-contentful-paint'] });
        setTimeout(function() { if (!triggered) triggerFetch(); }, 1500);
      } catch (e) { setTimeout(triggerFetch, 1000); }
    } else {
      window.addEventListener('load', function() { triggerFetch(); });
    }

    // Re-fetch phone after visit registration if no phone yet
    window.addEventListener('visit-registered', function(e) {
      var visitData = e.detail || {};
      if (!_phoneState.fetched && !visitData.phone) {
        doFetchPhone();
      }
    });
  }

  // ==================== TrustedForm Module ====================
  function initTrustedForm() {
    if (!featureEnabled('trustedForm')) return;

    var cd = getCookieData();
    if (cd.load_trusted_form === false) return;

    var loaded = false;
    var tfTriggered = false;

    function loadTF() {
      if (loaded) return;
      loaded = true;
      var preconnect = document.createElement('link');
      preconnect.rel = 'preconnect';
      preconnect.href = 'https://api.trustedform.com';
      preconnect.crossOrigin = 'anonymous';
      document.head.appendChild(preconnect);
      setTimeout(function() {
        var s = document.createElement('script');
        // Matches ActiveProspect's official recommended snippet:
        //  - use_tagged_consent=true → TF scans data-tf-element-role markers
        //  - l= timestamp+random → per-load cache buster (not daily)
        s.src = 'https://api.trustedform.com/trustedform.js?field=xxTrustedFormCertUrl&use_tagged_consent=true&l=' + new Date().getTime() + Math.random();
        s.async = true;
        s.defer = true;
        document.head.appendChild(s);

        // Insert the noscript pixel fallback if not already present. TF uses
        // this to record submissions when JS is disabled/blocked.
        if (!document.querySelector('img[src*="api.trustedform.com/ns.gif"]')) {
          var ns = document.createElement('noscript');
          var img = document.createElement('img');
          img.src = 'https://api.trustedform.com/ns.gif';
          img.alt = '';
          ns.appendChild(img);
          document.body.appendChild(ns);
        }

        log('TrustedForm script loaded');
      }, 100);
    }

    function triggerTF() {
      if (tfTriggered) return;
      tfTriggered = true;
      setTimeout(loadTF, 200);
    }

    function setupTFListeners() {
      if (tfTriggered) return;
      var handler = function() { triggerTF(); };
      ['click', 'touchstart', 'scroll', 'mousemove'].forEach(function(evt) {
        document.addEventListener(evt, handler, { once: true, passive: true });
      });
      setTimeout(triggerTF, 8000);
    }

    if (window.PerformanceObserver) {
      try {
        var lcpDone = false;
        var obs = new PerformanceObserver(function(list) {
          if (list.getEntries().length > 0) { lcpDone = true; obs.disconnect(); setupTFListeners(); }
        });
        obs.observe({ entryTypes: ['largest-contentful-paint'] });
        setTimeout(function() { if (!lcpDone) { lcpDone = true; setupTFListeners(); } }, 3000);
      } catch (e) { setTimeout(setupTFListeners, 3000); }
    } else {
      window.addEventListener('load', function() { setTimeout(setupTFListeners, 3000); });
    }
  }

  function getTrustedFormCertUrl() {
    var tfEl = document.getElementById('xxTrustedFormCertUrl_0');
    if (tfEl) return tfEl.getAttribute('value') || '';
    var tfEls = document.getElementsByName('xxTrustedFormCertUrl');
    if (tfEls[0]) return tfEls[0].getAttribute('value') || '';
    return '';
  }

  // ==================== Fetch Interceptor ====================
  // Automatically enriches outgoing API calls with session/tracking data:
  //   POST /api/leads          → session_id, funnel_step_id, trusted_form_url (if trustedForm enabled)
  //   POST /api/contacts/public → recaptcha_token (if recaptchaKey configured)
  function initFetchInterceptor() {
    var _fetch = window.fetch;
    window.fetch = function(url, options) {
      var urlStr = typeof url === 'string' ? url : (url && url.url) || '';
      var method = options && (options.method || '').toUpperCase();

      // Enrich lead submissions
      if (urlStr.indexOf('/api/leads') !== -1 && method === 'POST') {
        try {
          var body = JSON.parse(options.body);
          var sd = getSessionData();
          // session_id
          if (sd.session_id && !body.session_id) body.session_id = sd.session_id;
          // visit_id
          if (sd.visit_id && !body.visit_id) body.visit_id = sd.visit_id;
          // funnel_step_id
          var stepId = cfg.stepId;
          if (stepId && !body.funnel_step_id) body.funnel_step_id = stepId;
          // trusted_form_url
          if (featureEnabled('trustedForm') && !body.trusted_form_url) {
            var certUrl = getTrustedFormCertUrl();
            if (certUrl) body.trusted_form_url = certUrl;
          }
          options = Object.assign({}, options, { body: JSON.stringify(body) });
        } catch(e) {}
      }

      // Enrich contact form submissions with reCAPTCHA token
      if (urlStr.indexOf('/api/contacts/public') !== -1 && method === 'POST' && cfg.recaptchaKey) {
        return new Promise(function(resolve) {
          grecaptcha.ready(function() {
            grecaptcha.execute(cfg.recaptchaKey, { action: 'contact' }).then(function(token) {
              try {
                var body = JSON.parse(options.body);
                body.recaptcha_token = token;
                options = Object.assign({}, options, { body: JSON.stringify(body) });
              } catch(e) {}
              resolve(_fetch.call(window, url, options));
            }).catch(function() {
              resolve(_fetch.call(window, url, options));
            });
          });
        });
      }

      return _fetch.apply(window, arguments);
    };
  }

  // ==================== Remote SDK Config ====================
  // Fetches per-tenant config from /api/sdk/config?tenant=<slug>. Cached in
  // localStorage with a short TTL so config changes reach the field within
  // minutes without hammering the backend. Falls back to cached or defaults
  // on network failure — never blocks boot.
  var REMOTE_CFG_CACHE_KEY = 'scale_sdk_remote_cfg_v1';
  var REMOTE_CFG_TTL_MS = 5 * 60 * 1000; // 5 min

  function readCachedConfig() {
    try {
      var raw = localStorage.getItem(REMOTE_CFG_CACHE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (parsed && parsed.tenant === tenantKey && (Date.now() - parsed.at) < REMOTE_CFG_TTL_MS) {
        return parsed.cfg;
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  function writeCachedConfig(c) {
    try {
      localStorage.setItem(REMOTE_CFG_CACHE_KEY, JSON.stringify({ tenant: tenantKey, at: Date.now(), cfg: c }));
    } catch (e) { /* ignore */ }
  }

  function applyRemoteConfig(c) {
    if (!c || c.enabled === false) {
      log('Remote config disabled SDK — skipping features');
      _remoteConfig = c || null;
      return;
    }
    _remoteConfig = c;
    // If remote config says phone_swap with static number, seed the phone state.
    if (c.phone_swap && c.phone_swap.enabled && c.phone_swap.mode === 'static' && c.phone_swap.static_number) {
      _phoneState.phoneNumber = c.phone_swap.static_number;
      _phoneState.formattedPhone = formatPhoneNumber(c.phone_swap.static_number);
      _phoneState.fetched = true;
      onReady(function() { refreshPhoneDisplay(); });
    }
    // Replace any configured target strings/selectors once phone is known.
    if (c.phone_swap && c.phone_swap.targets && c.phone_swap.targets.length) {
      onReady(function() { applyPhoneSwapTargets(c.phone_swap.targets); });
    }
    window.dispatchEvent(new CustomEvent('scale-sdk-config-ready', { detail: c }));
  }

  function applyPhoneSwapTargets(targets) {
    var num = _phoneState.phoneNumber;
    if (!num) return;
    var formatted = _phoneState.formattedPhone || formatPhoneNumber(num);
    var tel = num.replace(/\D/g, '');
    if (tel.length === 11 && tel[0] === '1') tel = tel.slice(1);
    var telHref = 'tel:+1' + tel;

    targets.forEach(function(t) {
      if (t.selector) {
        document.querySelectorAll(t.selector).forEach(function(el) {
          if (el.tagName === 'A') el.href = telHref;
          // Replace the match string inside text if present, else replace all text.
          if (t.match && el.textContent.indexOf(t.match) !== -1) {
            el.textContent = el.textContent.split(t.match).join(formatted);
          } else if (!t.match) {
            el.textContent = formatted;
          }
        });
      } else if (t.match) {
        // Walk the DOM for matching strings and swap them (light-weight).
        var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
        var node;
        while ((node = walker.nextNode())) {
          if (node.nodeValue && node.nodeValue.indexOf(t.match) !== -1) {
            node.nodeValue = node.nodeValue.split(t.match).join(formatted);
          }
        }
      }
    });
    log('Applied phone_swap targets', targets.length);
  }

  function loadRemoteConfig() {
    if (!tenantKey || !apiBase) {
      log('tenantKey/apiBase missing — skipping remote config fetch');
      return Promise.resolve(null);
    }
    var cached = readCachedConfig();
    if (cached) {
      applyRemoteConfig(cached);
      // Still refresh in the background so the next page has the latest.
      fetchWithTimeout(apiBase + '/api/sdk/config?tenant=' + encodeURIComponent(tenantKey), { method: 'GET' }, 5000)
        .then(function(r) { return r.ok ? r.json() : null; })
        .then(function(body) { if (body && body.data) writeCachedConfig(body.data); })
        .catch(function() { /* ignore */ });
      return Promise.resolve(cached);
    }
    return fetchWithTimeout(apiBase + '/api/sdk/config?tenant=' + encodeURIComponent(tenantKey), { method: 'GET' }, 5000)
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(body) {
        if (body && body.data) {
          writeCachedConfig(body.data);
          applyRemoteConfig(body.data);
          return body.data;
        }
        return null;
      })
      .catch(function(err) { log('Remote config fetch failed', err); return null; });
  }

  // ==================== scaleTrack — fire events to backend ==================
  function scaleTrack(eventName, props) {
    if (!eventName) return;
    var session = getSession();
    var funnelId = cfg.funnelId || (_remoteConfig && _remoteConfig.funnel_id);
    if (!funnelId) { log('scaleTrack: no funnelId'); return; }
    var body = {
      funnel_id: funnelId,
      session_id: session.sessionId,
      event_name: eventName,
      event_data: props || {},
      page_url: window.location.href,
      timestamp: new Date().toISOString()
    };
    var endpoint = (_remoteConfig && _remoteConfig.endpoints && _remoteConfig.endpoints.events) || '/api/events';
    return fetchWithTimeout(apiBase + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }, 5000).then(function(r) {
      return r.ok ? r.json() : null;
    }).catch(function(err) {
      log('scaleTrack failed', eventName, err);
      return null;
    });
  }

  // ==================== Initialization ====================
  function init() {
    log('Initializing SDK v2', {
      funnelId: cfg.funnelId,
      funnelSlug: cfg.funnelSlug,
      apiBase: apiBase,
      tenantKey: tenantKey
    });

    // Kick off remote-config fetch (non-blocking). Applies when it resolves.
    loadRemoteConfig();

    // Sync initial cookie data for SSR
    syncCookieFromSession(getSession(), null);

    // Setup phone display on DOM ready (in case phone is already in cookie/cache)
    onReady(function() {
      // Check if phone was cached
      var cached = getCachedPhone();
      if (cached) {
        _phoneState.phoneNumber = cached.phoneNumber;
        _phoneState.formattedPhone = cached.formattedPhone;
        _phoneState.expiresAt = cached.expiresAt;
        _phoneState.isFallback = cached.isFallback;
        _phoneState.fetched = true;
        setupPhoneDisplay();
      }
    });

    // Initialize core modules
    initFetchInterceptor();
    initVisitRegistration();
    initPhoneFetcher();
    initTrustedForm();

    log('SDK v2 initialized');
  }

  // ==================== Public API ====================
  window.ScaleSDK = {
    version: '2.1.0',

    // --- Backward compatibility with SDK v1 public API ---
    getCookieData: getCookieData,
    updateCookie: updateCookie,
    getSessionData: getSessionData,
    getVisitData: function() { return getCookieData(); },
    getPhone: function() { return _phoneState.phoneNumber || ''; },
    formatPhoneNumber: formatPhoneNumber,
    refreshPhoneDisplay: refreshPhoneDisplay,
    getTrustedFormCertUrl: getTrustedFormCertUrl,
    registerVisit: initVisitRegistration,

    // --- v2 API ---

    // Session
    Session: {
      get: getSession,
      getSessionId: function() { var s = getSession(); return s ? s.sessionId : null; },
      update: updateSession,
      clear: clearSession
    },

    // Cookie (SSR compat)
    Cookie: {
      get: getCookieData,
      set: updateCookie
    },

    // Visits
    Visits: {
      isRegistered: function() { return _visitState.registered; },
      getState: function() {
        return {
          pageViews: _visitState.pageViews,
          timeOnSite: Math.round((Date.now() - _visitState.startTime) / 1000),
          registered: _visitState.registered
        };
      }
    },

    // Phone (DNI)
    Phone: {
      fetch: fetchPhone,
      getPhone: function() { return _phoneState.phoneNumber; },
      getFormattedPhone: function() { return _phoneState.formattedPhone; },
      getTelLink: function() {
        if (!_phoneState.phoneNumber) return '';
        var cleaned = _phoneState.phoneNumber.replace(/\D/g, '');
        if (cleaned.length === 11 && cleaned[0] === '1') cleaned = cleaned.slice(1);
        return 'tel:+1' + cleaned;
      },
      updatePhoneElements: refreshPhoneDisplay,
      getState: function() { return _phoneState; },
      isFetched: function() { return _phoneState.fetched; },
      checkBusinessHours: checkBusinessHours,
      isWithinBusinessHours: function() {
        try { return localStorage.getItem('show_phone_number') !== 'false'; } catch (e) { return true; }
      }
    },

    // TrustedForm
    TrustedForm: {
      getCertUrl: getTrustedFormCertUrl
    },

    // Utilities (exposed for site use)
    Utils: {
      formatPhone: formatPhoneNumber,
      getDeviceType: getDeviceType,
      getUTMParams: getUTMParams,
      getTrackingParams: getTrackingParams,
      generateId: generateId
    },

    // Configure
    configure: function(newConfig) {
      for (var k in newConfig) {
        if (newConfig.hasOwnProperty(k)) {
          if (k === 'features') {
            for (var f in newConfig.features) {
              if (newConfig.features.hasOwnProperty(f)) features[f] = newConfig.features[f];
            }
          } else {
            cfg[k] = newConfig[k];
          }
        }
      }
    },

    // Manual init
    init: init,

    // Remote config access (may be null if not loaded yet)
    getRemoteConfig: function() { return _remoteConfig; },
    reloadRemoteConfig: loadRemoteConfig,

    // Track a custom event → POST /api/events
    track: scaleTrack
  };

  // Also expose scaleTrack as a top-level alias for convenience.
  window.scaleTrack = scaleTrack;

  // Auto-initialize if configured
  if (cfg.funnelId || cfg.funnelSlug) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        init();
        window.dispatchEvent(new CustomEvent('scale-sdk-ready'));
      });
    } else {
      init();
      window.dispatchEvent(new CustomEvent('scale-sdk-ready'));
    }
  } else {
    log('No funnelId/funnelSlug configured, call ScaleSDK.init() manually');
    window.dispatchEvent(new CustomEvent('scale-sdk-ready'));
  }

})();
