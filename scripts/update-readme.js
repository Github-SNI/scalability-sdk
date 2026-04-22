#!/usr/bin/env node
// Rewrites the CDN snippet blocks in README.md with new tag + SRI hashes.
// Invoked by scripts/release.sh — not meant for manual use.
//
// Usage: node scripts/update-readme.js <tag> <sdkSri> <sdkMinSri> <anaSri> <anaMinSri>

'use strict';

const fs = require('fs');
const path = require('path');

const [, , tag, sdkSri, sdkMinSri, anaSri, anaMinSri] = process.argv;

if (!tag || !sdkSri || !sdkMinSri || !anaSri || !anaMinSri) {
  console.error('Usage: update-readme.js <tag> <sdkSri> <sdkMinSri> <anaSri> <anaMinSri>');
  process.exit(1);
}

const m = tag.match(/^v(\d+)\.(\d+)\.(\d+)$/);
if (!m) {
  console.error(`Tag must look like vX.Y.Z, got: ${tag}`);
  process.exit(1);
}
const majorMinor = `v${m[1]}.${m[2]}`; // e.g., "v2.1"

const REPO = 'Github-SNI/scalability-sdk';
const baseExact = `https://cdn.jsdelivr.net/gh/${REPO}@${tag}/sdk`;
const baseFloat = `https://cdn.jsdelivr.net/gh/${REPO}@${majorMinor}/sdk`;

// Primary drop-in snippet — floating major.minor, no SRI (auto-patches).
const simpleSnippet = `\`\`\`html
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
<script src="${baseFloat}/scale-analytics.min.js"></script>
<script src="${baseFloat}/scale-sdk-v2.min.js" defer></script>
\`\`\``;

// Advanced snippet — exact pin + SRI (raw files).
const rawSnippet = `\`\`\`html
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
  src="${baseExact}/scale-analytics.js"
  integrity="sha384-${anaSri}"
  crossorigin="anonymous"></script>
<script
  src="${baseExact}/scale-sdk-v2.js"
  integrity="sha384-${sdkSri}"
  crossorigin="anonymous"
  defer></script>
\`\`\``;

// Advanced snippet — exact pin + SRI (minified).
const minSnippet = `\`\`\`html
<script
  src="${baseExact}/scale-analytics.min.js"
  integrity="sha384-${anaMinSri}"
  crossorigin="anonymous"></script>
<script
  src="${baseExact}/scale-sdk-v2.min.js"
  integrity="sha384-${sdkMinSri}"
  crossorigin="anonymous"
  defer></script>
\`\`\``;

const readmePath = path.join(__dirname, '..', 'README.md');
let readme = fs.readFileSync(readmePath, 'utf8');

readme = replaceBetween(readme, '<!-- CDN-SIMPLE-SNIPPET:START -->', '<!-- CDN-SIMPLE-SNIPPET:END -->', simpleSnippet);
readme = replaceBetween(readme, '<!-- CDN-SNIPPET:START -->', '<!-- CDN-SNIPPET:END -->', rawSnippet);
readme = replaceBetween(readme, '<!-- CDN-MIN-SNIPPET:START -->', '<!-- CDN-MIN-SNIPPET:END -->', minSnippet);

// Refresh references outside the snippet blocks (version-pinning table,
// self-hosting URLs, download ZIP filenames, prose mentions of the pinned tag).
readme = readme.replace(/@v\d+\.\d+\.\d+/g, `@${tag}`);
readme = readme.replace(/releases\/download\/v\d+\.\d+\.\d+/g, `releases/download/${tag}`);
readme = readme.replace(/Scalability-SDK-v\d+\.\d+\.\d+\.zip/g, `Scalability-SDK-${tag}.zip`);

// Refresh the floating major.minor references outside the snippet block
// (pinning table first column and prose). This is idempotent: v2.1 → v2.1.
// Only touches the `@vX.Y` pattern, never `@vX.Y.Z`.
readme = readme.replace(/@v\d+\.\d+(?=[^\d.])/g, `@${majorMinor}`);

fs.writeFileSync(readmePath, readme);
console.log(`README.md updated (exact=${tag}, float=${majorMinor}).`);

function replaceBetween(text, startMarker, endMarker, replacement) {
  const re = new RegExp(
    `(${escapeReg(startMarker)})[\\s\\S]*?(${escapeReg(endMarker)})`,
  );
  if (!re.test(text)) {
    throw new Error(`Markers not found: ${startMarker} / ${endMarker}`);
  }
  return text.replace(re, `$1\n${replacement}\n$2`);
}

function escapeReg(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
