#!/usr/bin/env node
// Rasterize public/icon/icon.svg to the PNG sizes Chrome needs, plus the store 128.
// Uses Chrome headless (no extra image libraries).

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = fs.readFileSync(path.join(root, 'public/icon/icon.svg'), 'utf8');
const chrome = process.env.CHROME_BIN ?? 'google-chrome';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lss-icon-'));
const htmlPath = path.join(tmp, 'icon.html');

fs.writeFileSync(
  htmlPath,
  `<!doctype html><html><head><style>
    html,body{margin:0;width:128px;height:128px;background:transparent}
    svg{display:block;width:128px;height:128px}
  </style></head><body>${svg}</body></html>`,
);

const raw = path.join(tmp, 'raw.png');
execFileSync(
  'timeout',
  [
    '20',
    chrome,
    `--user-data-dir=${path.join(tmp, 'profile')}`,
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--default-background-color=00000000',
    `--screenshot=${raw}`,
    '--window-size=128,128',
    '--force-device-scale-factor=1',
    `file://${htmlPath}`,
  ],
  { stdio: 'inherit' },
);

const sizes = [16, 32, 48, 96, 128];
for (const size of sizes) {
  const dest = path.join(root, 'public/icon', `${size}.png`);
  execFileSync('ffmpeg', ['-y', '-i', raw, '-vf', `scale=${size}:${size}:flags=lanczos`, dest], { stdio: 'inherit' });
  console.log('wrote', dest);
}

fs.mkdirSync(path.join(root, 'store'), { recursive: true });
fs.copyFileSync(path.join(root, 'public/icon/128.png'), path.join(root, 'store/icon-128.png'));
fs.rmSync(tmp, { recursive: true, force: true });
console.log('store/icon-128.png');
