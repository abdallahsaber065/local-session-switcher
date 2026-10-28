#!/usr/bin/env node
// Inspect the WXT zip and fail if it is not a clean Chrome Web Store package.
//
//   pnpm zip && node scripts/verify-store-zip.mjs
//
// Checks: zip exists and is < 10 MB, manifest is MV3, required files present,
// no source maps / seed files / node_modules, host_permissions stay on loopback,
// optional_host_permissions are declared but not granted as defaults.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;

const outputDir = path.join(root, '.output');
const zips = fs.existsSync(outputDir)
  ? fs.readdirSync(outputDir).filter((name) => name.endsWith('.zip'))
  : [];
if (zips.length === 0) {
  console.error('FAIL: no .output/*.zip — run `pnpm zip` first');
  process.exit(1);
}

const zipPath = path.join(outputDir, zips.sort().at(-1));
const stat = fs.statSync(zipPath);
const maxBytes = 10 * 1024 * 1024;
if (stat.size > maxBytes) {
  console.error(`FAIL: ${zipPath} is ${(stat.size / 1e6).toFixed(1)} MB (limit 10 MB)`);
  process.exit(1);
}

const listing = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' })
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

const banned = listing.filter((file) =>
  /\.(map|seed\.json)$/i.test(file) ||
  /(^|\/)node_modules\//.test(file) ||
  /(^|\/)\.git\//.test(file) ||
  /(^|\/)web-ext-artifacts\//.test(file),
);
if (banned.length) {
  console.error('FAIL: zip contains files that must not ship:\n  ' + banned.join('\n  '));
  process.exit(1);
}

for (const required of ['manifest.json', 'icon/128.png']) {
  if (!listing.includes(required)) {
    console.error(`FAIL: zip is missing ${required}`);
    process.exit(1);
  }
}

const tmp = fs.mkdtempSync(path.join(root, '.output', 'store-verify-'));
try {
  execFileSync('unzip', ['-qq', zipPath, 'manifest.json', '-d', tmp]);
  const manifest = JSON.parse(fs.readFileSync(path.join(tmp, 'manifest.json'), 'utf8'));
  if (manifest.manifest_version !== 3) {
    console.error(`FAIL: manifest_version is ${manifest.manifest_version}, expected 3`);
    process.exit(1);
  }
  if (manifest.version !== version) {
    console.error(`FAIL: manifest.version ${manifest.version} != package.json ${version}`);
    process.exit(1);
  }
  const hosts = manifest.host_permissions ?? [];
  const allowed = new Set([
    'http://localhost/*',
    'https://localhost/*',
    'http://127.0.0.1/*',
    'https://127.0.0.1/*',
    'http://[::1]/*',
    'https://[::1]/*',
  ]);
  const extra = hosts.filter((pattern) => !allowed.has(pattern));
  if (extra.length) {
    console.error('FAIL: default host_permissions must stay on loopback, found:\n  ' + extra.join('\n  '));
    process.exit(1);
  }
  const optional = manifest.optional_host_permissions ?? [];
  if (!optional.includes('http://*/*') || !optional.includes('https://*/*')) {
    console.error('FAIL: optional_host_permissions must declare http(s)://*/* for per-origin grants');
    process.exit(1);
  }
  const csMatches = (manifest.content_scripts ?? []).flatMap((entry) => entry.matches ?? []);
  if (csMatches.includes('http://*/*') || csMatches.includes('https://*/*') || csMatches.includes('<all_urls>')) {
    console.error('FAIL: content_scripts must not match the whole web; keep explicit local patterns');
    process.exit(1);
  }
  const perms = new Set(manifest.permissions ?? []);
  for (const needed of ['storage', 'cookies']) {
    if (!perms.has(needed)) {
      console.error(`FAIL: missing permission ${needed}`);
      process.exit(1);
    }
  }
  for (const forbidden of ['tabs', 'scripting', 'webRequest', 'debugger', 'identity', '<all_urls>']) {
    if (perms.has(forbidden) || hosts.includes(forbidden)) {
      console.error(`FAIL: unexpected permission ${forbidden}`);
      process.exit(1);
    }
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

const storeDir = path.join(root, 'store');
fs.mkdirSync(storeDir, { recursive: true });
const dest = path.join(storeDir, `local-session-switcher-${version}.zip`);
fs.copyFileSync(zipPath, dest);

console.log(`OK ${path.relative(root, zipPath)} (${(stat.size / 1024).toFixed(0)} KB, ${listing.length} files)`);
console.log(`copied to ${path.relative(root, dest)}`);
