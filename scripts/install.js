#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: node /path/to/loopkit/scripts/install.js [--dry-run]\nInstall into the current directory. Existing files are never overwritten.');
  process.exit(0);
}
if (args.some(arg => arg !== '--dry-run')) {
  console.error('Only --dry-run or --help is supported. Run from the target project directory.');
  process.exit(1);
}
const dry = args.includes('--dry-run');
const source = path.resolve(__dirname, '..');
const destination = process.cwd();
const files = [
  'AGENTS.md',
  'LICENSE',
  'run.sh',
  'scripts/loopkit-runner.js',
  'template/loopkit.task.json',
  'docs/loopkit.md',
  'examples',
];
let wrote = 0;
let skipped = 0;

function copy(src, dst) {
  for (let target = dst; target !== destination; target = path.dirname(target)) {
    if (fs.lstatSync(target, { throwIfNoEntry: false })?.isSymbolicLink()) {
      throw new Error(`Refusing symlink install target: ${target}`);
    }
  }
  if (fs.statSync(src).isDirectory()) {
    if (!dry) fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src)) copy(path.join(src, entry), path.join(dst, entry));
    return;
  }
  const exists = fs.existsSync(dst);
  if (dry) console.log(`${(exists ? 'skip' : 'write').padEnd(9)} ${path.relative(destination, dst)}`);
  if (exists) {
    skipped++;
    return;
  }
  if (!dry) {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    if (src.endsWith('.sh')) fs.chmodSync(dst, 0o755);
  }
  wrote++;
}

for (const file of files) {
  const src = path.join(source, file);
  if (!fs.existsSync(src)) throw new Error(`Required install artifact missing: ${src}`);
  copy(src, path.join(destination, file));
}
if (dry) {
  console.log(`\n[dry-run] ${wrote} would be written, ${skipped} would be skipped`);
} else {
  console.log(`loopkit: ${wrote} files written, ${skipped} skipped`);
  console.log('Read docs/loopkit.md. Approve and commit a task and executable checks before ./run.sh.');
  if (skipped) console.log('Review kept files before use; mixed versions are not validated. Nothing was overwritten.');
}
