// Scale Digital - Analytics SDK
// Centralized analytics: dataLayer, GTM loading, GA4 events, auto-tracking, performance monitoring
// Usage: Set window.SCALE_CONFIG before loading, or use legacy window.GTM_ID
//
// <script>window.SCALE_CONFIG = { gtmId: 'GTM-XXXXXXX', ga4MeasurementId: 'G-XXXXX' };</script>
// <script src="/sdk/scale-analytics.js"></script>

(function() {
  'use strict';

  // ==================== Config ====================
  var cfg = window.SCALE_CONFIG || {};
  var features = cfg.features || {};
  var analyticsEnabled = features.analytics !== false;
  var performanceEnabled = features.performance !== false;

  // ==================== DataLayer Init ====================
  window.dataLayer = window.dataLayer || [];

  // ==================== Timestamps ====================
  var pageLoadTime = Date.now();

  // ==================== Cookie Data (cached) ====================
  var _cookieData = null;

  function getCookieData() {
    try {
      var raw = document.cookie.split('; ').find(function(r) { return r.startsWith('data='); });
      if (!raw) return {};
      return JSON.parse(decodeURIComponent(raw.split('=').slice(1).join('=')));
    } catch (e) {
      return {};
    }
  }

  function cookieData() {
    // Share parsed cookie between SDKs to avoid double-parsing
    if (window.__scaleCookieData) return window.__scaleCookieData;
    if (!_cookieData) {
      _cookieData = getCookieData();
      window.__scaleCookieData = _cookieData;
    }
    return _cookieData;
  }

  // ==================== Event Push Helper ====================
  function pushEvent(eventName, data) {
    var cd = cookieData();
    var payload = {
      event: eventName,
      visit_id: cd.visit_id || '',
      source_id: cd.source_id || '',
      site_id: cd.site_id || (cfg.siteId || ''),
      vertical: (cd.vertical_type || cfg.vertical || '').toLowerCase(),
      is_mobile: cd.is_mobile_device || false,
      partner_slug: cd.partner_slug || '',
      page_path: window.location.pathname
    };
    if (data) {
      for (var key in data) {
        if (data.hasOwnProperty(key)) {
          payload[key] = data[key];
        }
      }
    }
    window.dataLayer.push(payload);
  }

  // ==================== Public API ====================
  window.GAEvents = {
    pageView: function(data) { pushEvent('virtual_page_view', data); },
    formStart: function(data) { pushEvent('form_start', data); },
    formStepComplete: function(data) { pushEvent('form_step_complete', data); },
    formSubmit: function(data) { pushEvent('form_submit_attempt', data); },
    formSuccess: function(data) { pushEvent('form_submit_success', data); },
    formError: function(data) { pushEvent('form_submit_error', data); },
    formFieldError: function(data) { pushEvent('form_field_error', data); },
    formAbandon: function(data) { pushEvent('form_abandon', data); },
    phoneClick: function(data) { pushEvent('phone_click', data); },
    ctaClick: function(data) { pushEvent('cta_click', data); },
    zipSubmit: function(data) { pushEvent('zip_submit', data); },
    scrollDepth: function(data) { pushEvent('scroll_depth', data); },
    custom: function(eventName, data) { pushEvent(eventName, data); }
  };

  // ==================== Auto-tracking ====================
  if (analyticsEnabled) {

    // --- Phone link clicks (delegated) ---
    document.addEventListener('click', function(e) {
      var phoneLink = e.target.closest ? e.target.closest('a[href^="tel:"]') : null;
      if (phoneLink) {
        window.GAEvents.phoneClick({
          phone_number: phoneLink.href.replace('tel:', '').replace('+1', '')
        });
      }
    }, true);

    // --- CTA click tracking (delegated) ---
    document.addEventListener('click', function(e) {
      if (!e.target.closest) return;
      var cta = e.target.closest(
          'button[type="submit"], .btn-cta, [data-cta], a.cta-button, .cta-link, ' +
          'button.bg-primary, button.btn-primary, a.btn-primary'
      );
      if (cta && !cta.closest('a[href^="tel:"]')) {
        window.GAEvents.ctaClick({
          cta_text: (cta.textContent || '').trim().substring(0, 50),
          cta_position: cta.closest('header') ? 'header' : cta.closest('footer') ? 'footer' : 'body'
        });
      }
    }, true);

    // --- Form start + engagement timing ---
    var formStartFired = false;
    var formStartTime = 0;

    document.addEventListener('focusin', function(e) {
      if (formStartFired) return;
      var form = e.target.closest ? e.target.closest('#leadsForm, #form-lead, [data-scale-form]') : null;
      if (form) {
        formStartFired = true;
        formStartTime = Date.now();
        var formType = form.id === 'leadsForm' ? 'react' : 'html';
        var secondsToStart = Math.round((Date.now() - pageLoadTime) / 1000);
        window.GAEvents.formStart({
          form_type: formType,
          time_to_form_start_seconds: secondsToStart
        });
      }
    }, true);

    // --- Track last field touched (for abandonment reporting) ---
    var lastFieldTouched = '';
    document.addEventListener('focusin', function(e) {
      if (!e.target.closest) return;
      var form = e.target.closest('#leadsForm, #form-lead, [data-scale-form]');
      if (form && e.target.name) {
        lastFieldTouched = e.target.name;
      }
    }, true);

    // --- Form field completion tracking ---
    var NON_PII_FIELDS = {
      state: true, gender: true, policy_size: true,
      month: true, day: true, year: true,
      feets: true, inches: true, weight: true
    };
    var fieldCompletedMap = {};

    function handleFieldComplete(e) {
      var el = e.target;
      if (!el || !el.closest) return;
      var form = el.closest('#leadsForm, #form-lead, [data-scale-form]');
      if (!form) return;

      var fieldName = el.name || el.id || '';
      if (!fieldName) return;
      var val = (el.value || '').trim();
      if (!val) return;

      if (fieldCompletedMap[fieldName]) return;
      fieldCompletedMap[fieldName] = true;

      var data = {
        field_name: fieldName,
        form_type: form.id === 'leadsForm' ? 'react' : 'html'
      };

      if (NON_PII_FIELDS[fieldName]) {
        data.field_value = fieldName === 'zip' ? val.substring(0, 3) : val;
      }

      if (fieldName === 'year' || fieldName === 'month' || fieldName === 'day') {
        var m = form.querySelector('[name="month"]');
        var d = form.querySelector('[name="day"]');
        var y = form.querySelector('[name="year"]');
        if (m && d && y && m.value && d.value && y.value) {
          var birthYear = parseInt(y.value, 10);
          var age = new Date().getFullYear() - birthYear;
          var range = age < 30 ? 'under_30' : age < 40 ? '30-39' : age < 50 ? '40-49' :
              age < 60 ? '50-59' : age < 70 ? '60-69' : '70_plus';
          data.age_range = range;
        }
      }

      pushEvent('form_field_complete', data);
    }

    document.addEventListener('change', handleFieldComplete, true);
    document.addEventListener('blur', handleFieldComplete, true);

    // --- Form field error auto-detection ---
    document.addEventListener('click', function(e) {
      if (!e.target.closest) return;
      var submitBtn = e.target.closest('button[type="submit"]');
      if (!submitBtn) return;
      var form = submitBtn.closest('#leadsForm, #form-lead, [data-scale-form]');
      if (!form) return;

      setTimeout(function() {
        var errorFields = form.querySelectorAll('.error-border, [class*="error-border"], .error-message');
        var fieldNames = [];
        errorFields.forEach(function(el) {
          var name = el.name || el.id || el.getAttribute('data-field') || 'unknown';
          if (fieldNames.indexOf(name) === -1) fieldNames.push(name);
        });

        if (fieldNames.length > 0) {
          window.GAEvents.formFieldError({
            form_type: form.id === 'leadsForm' ? 'react' : 'html',
            error_fields: fieldNames.join(','),
            error_count: fieldNames.length
          });
        }
      }, 150);
    }, true);

    // --- Form abandonment detection ---
    var formSubmitted = false;

    var _originalFormSuccess = window.GAEvents.formSuccess;
    window.GAEvents.formSuccess = function(data) {
      formSubmitted = true;
      if (formStartTime > 0) {
        data = data || {};
        data.time_to_submit_seconds = Math.round((Date.now() - formStartTime) / 1000);
      }
      _originalFormSuccess(data);
    };

    window.addEventListener('beforeunload', function() {
      if (formStartFired && !formSubmitted) {
        var timeSpent = formStartTime > 0 ? Math.round((Date.now() - formStartTime) / 1000) : 0;
        var cd = cookieData();
        var payload = {
          event: 'form_abandon',
          visit_id: cd.visit_id || '',
          source_id: cd.source_id || '',
          site_id: cd.site_id || (cfg.siteId || ''),
          vertical: (cd.vertical_type || cfg.vertical || '').toLowerCase(),
          is_mobile: cd.is_mobile_device || false,
          partner_slug: cd.partner_slug || '',
          page_path: window.location.pathname,
          last_field_touched: lastFieldTouched,
          time_spent_seconds: timeSpent
        };
        window.dataLayer.push(payload);

        var measurementId = cfg.ga4MeasurementId || window.GA_MEASUREMENT_ID || '';
        if (navigator.sendBeacon && measurementId) {
          navigator.sendBeacon(
              'https://www.google-analytics.com/g/collect?v=2&tid=' + measurementId,
              JSON.stringify(payload)
          );
        }
      }
    });

    // --- Scroll depth tracking ---
    var scrollThresholds = [25, 50, 75, 100];
    var scrollFired = {};

    function getScrollPercent() {
      var docHeight = Math.max(
          document.body.scrollHeight, document.documentElement.scrollHeight,
          document.body.offsetHeight, document.documentElement.offsetHeight
      );
      var winHeight = window.innerHeight;
      var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      if (docHeight <= winHeight) return 100;
      return Math.round((scrollTop / (docHeight - winHeight)) * 100);
    }

    var scrollTimeout = null;
    window.addEventListener('scroll', function() {
      if (scrollTimeout) return;
      scrollTimeout = setTimeout(function() {
        scrollTimeout = null;
        var percent = getScrollPercent();
        for (var i = 0; i < scrollThresholds.length; i++) {
          var threshold = scrollThresholds[i];
          if (percent >= threshold && !scrollFired[threshold]) {
            scrollFired[threshold] = true;
            window.GAEvents.scrollDepth({ depth: threshold });
          }
        }
      }, 200);
    }, { passive: true });

    // --- GA4 User Properties ---
    var cd = cookieData();
    if (cd.source_id || cd.site_id) {
      window.dataLayer.push({
        event: 'set_user_properties',
        user_properties: {
          vertical: (cd.vertical_type || cfg.vertical || '').toLowerCase(),
          source_id: cd.source_id || '',
          site_id: cd.site_id || (cfg.siteId || ''),
          is_mobile: cd.is_mobile_device || false,
          partner_slug: cd.partner_slug || ''
        }
      });
    }

    // --- Virtual page view (auto-fire) ---
    var pageType = window.location.pathname === '/' ? 'home' : window.location.pathname.replace(/^\//, '').split('/')[0];
    window.GAEvents.pageView({ page_type: pageType });

  } // end analyticsEnabled

  // ==================== GTM Loading ====================
  var gtmId = cfg.gtmId || window.GTM_ID || '';

  function loadGTM() {
    if (window.__gtmLoaded || !gtmId) return;
    window.__gtmLoaded = true;

    window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });

    var f = document.getElementsByTagName('script')[0];
    var j = document.createElement('script');
    j.async = true;
    j.src = 'https://www.googletagmanager.com/gtm.js?id=GTM-' + gtmId;
    j.onload = function() {
      window.dataLayer.push({ event: 'gtm_loaded' });
    };
    f.parentNode.insertBefore(j, f);
  }

  if (gtmId && analyticsEnabled) {
    var isConversionPage = window.location.pathname.indexOf('/thanks') === 0;

    if (isConversionPage) {
      loadGTM();
    } else {
      var gtmTriggered = false;

      function triggerGTM() {
        if (gtmTriggered) return;
        gtmTriggered = true;
        var evts = ['mousedown', 'touchstart', 'keydown', 'scroll', 'mousemove'];
        evts.forEach(function(e) { document.removeEventListener(e, triggerGTM); });
        setTimeout(loadGTM, 100);
      }

      var evts = ['mousedown', 'touchstart', 'keydown', 'scroll', 'mousemove'];
      evts.forEach(function(e) {
        document.addEventListener(e, triggerGTM, { passive: true, once: true });
      });

      setTimeout(function() {
        if (!gtmTriggered) triggerGTM();
      }, 8000);
    }
  }

  window.loadGTM = loadGTM;

  // ==================== Performance Monitor ====================
  if (performanceEnabled && window.performance && window.PerformanceObserver) {

    var perfMetrics = {
      lcp: null,
      fid: null,
      cls: null,
      ttfb: null,
      fcp: null
    };

    try {
      var lcpObserver = new PerformanceObserver(function(list) {
        var entries = list.getEntries();
        var lastEntry = entries[entries.length - 1];
        perfMetrics.lcp = lastEntry.renderTime || lastEntry.loadTime;
      });
      lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
    } catch (e) {}

    try {
      var fidObserver = new PerformanceObserver(function(list) {
        var entries = list.getEntries();
        entries.forEach(function(entry) {
          if (!perfMetrics.fid || entry.processingStart - entry.startTime < perfMetrics.fid) {
            perfMetrics.fid = entry.processingStart - entry.startTime;
          }
        });
      });
      fidObserver.observe({ entryTypes: ['first-input'] });
    } catch (e) {}

    try {
      var clsValue = 0;
      var clsObserver = new PerformanceObserver(function(list) {
        var entries = list.getEntries();
        entries.forEach(function(entry) {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
            perfMetrics.cls = clsValue;
          }
        });
      });
      clsObserver.observe({ entryTypes: ['layout-shift'] });
    } catch (e) {}

    window.addEventListener('load', function() {
      setTimeout(function() {
        var navTiming = performance.getEntriesByType('navigation')[0];
        if (navTiming) {
          perfMetrics.ttfb = navTiming.responseStart - navTiming.requestStart;
        }

        var paintEntries = performance.getEntriesByType('paint');
        var fcpEntry = paintEntries.find(function(entry) { return entry.name === 'first-contentful-paint'; });
        if (fcpEntry) {
          perfMetrics.fcp = fcpEntry.startTime;
        }

        // Send metrics after page fully loaded
        sendPerfMetrics();
      }, 0);
    });

    function sendPerfMetrics() {
      if (!perfMetrics.lcp && !perfMetrics.fid && !perfMetrics.cls && !perfMetrics.ttfb && !perfMetrics.fcp) {
        return;
      }

      var currentPath = window.location.pathname;
      var isHomePage = currentPath === '/' || currentPath === '/index.html';
      var samplingRate = isHomePage ? 0.1 : 0.0001;

      if (Math.random() > samplingRate) return;

      var apiBase = cfg.apiBaseUrl || '';
      var payload = {
        url: window.location.pathname,
        metrics: perfMetrics,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString()
      };

      var endpoint = apiBase + '/api/log-performance';

      if (navigator.sendBeacon) {
        navigator.sendBeacon(endpoint, JSON.stringify(payload));
      } else {
        fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true
        }).catch(function() {});
      }
    }

    window.__performanceMetrics = perfMetrics;

  } // end performanceEnabled

})();
