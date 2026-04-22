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

const REPO = 'Github-SNI/scalability-sdk';
const base = `https://cdn.jsdelivr.net/gh/${REPO}@${tag}/sdk`;

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
  src="${base}/scale-analytics.js"
  integrity="sha384-${anaSri}"
  crossorigin="anonymous"></script>
<script
  src="${base}/scale-sdk-v2.js"
  integrity="sha384-${sdkSri}"
  crossorigin="anonymous"
  defer></script>
\`\`\``;

const minSnippet = `\`\`\`html
<script
  src="${base}/scale-analytics.min.js"
  integrity="sha384-${anaMinSri}"
  crossorigin="anonymous"></script>
<script
  src="${base}/scale-sdk-v2.min.js"
  integrity="sha384-${sdkMinSri}"
  crossorigin="anonymous"
  defer></script>
\`\`\``;

const readmePath = path.join(__dirname, '..', 'README.md');
let readme = fs.readFileSync(readmePath, 'utf8');

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

readme = replaceBetween(readme, '<!-- CDN-SNIPPET:START -->', '<!-- CDN-SNIPPET:END -->', rawSnippet);
readme = replaceBetween(readme, '<!-- CDN-MIN-SNIPPET:START -->', '<!-- CDN-MIN-SNIPPET:END -->', minSnippet);

// Also refresh references to @vX.Y.Z in the "Version pinning" table and
// the "Download" section so the self-hosting URLs point to the latest tag.
readme = readme.replace(/@v\d+\.\d+\.\d+/g, `@${tag}`);
// The pinning table uses backticks around the version examples; same regex
// already handled those since they're inside backticks.
// Download URLs use a different path shape — update those too.
readme = readme.replace(
  /releases\/download\/v\d+\.\d+\.\d+/g,
  `releases/download/${tag}`,
);
readme = readme.replace(
  /Scalability-SDK-v\d+\.\d+\.\d+\.zip/g,
  `Scalability-SDK-${tag}.zip`,
);

fs.writeFileSync(readmePath, readme);
console.log('README.md updated.');
