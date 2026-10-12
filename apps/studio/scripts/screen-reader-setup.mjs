// Sets up NVDA for the Studio's screen-reader tests (test/screen-reader.test.ts): Guidepup's portable NVDA in
// %LOCALAPPDATA%\guidepup (no installer, no administrator rights, nothing in the registry), with the silent voice,
// so a test run captures what NVDA says without speaking aloud. --voice keeps NVDA's normal voice (to listen along).
// Run from apps/studio: node scripts/screen-reader-setup.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

if (process.platform !== 'win32') { console.log('screen readers: NVDA runs on Windows only; nothing to do here'); process.exit(0); }
const require = createRequire(import.meta.url);
const bin = join(require.resolve('@guidepup/setup/package.json'), '..', 'bin', 'guidepup');
execFileSync(process.execPath, [bin, 'install', 'nvda'], { stdio: 'inherit' });

const manifest = require('@guidepup/guidepup/manifest.json');
const version = manifest.screenReaders.find((r) => r.id === 'nvda').assets[0].version;
const root = process.env.GUIDEPUP_SCREEN_READERS_PATH ?? join(process.env.LOCALAPPDATA, 'guidepup');
const ini = join(root, 'nvda', 'all', version, 'extracted', 'userConfig', 'nvda.ini');
if (!existsSync(ini)) { console.error(`screen readers: ${ini} not found`); process.exit(1); }
let text = readFileSync(ini, 'utf8').replace(/\r\n/g, '\n');
// NVDA's own [speech] section: the silent voice (or none: NVDA's default voice)
text = text.replace(/\n\[speech\]\n(\t[^\n]*\n)*/g, '\n');
if (!process.argv.includes('--voice')) text = `${text.trimEnd()}\n[speech]\n\tsynth = silence\n`;
writeFileSync(ini, text);
console.log(`screen readers: NVDA ${version} ready (${process.argv.includes('--voice') ? 'with its voice' : 'silent'}): ${ini}`);
