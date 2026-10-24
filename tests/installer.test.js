'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const source = path.resolve(__dirname, '..');
const installer = path.join(source, 'scripts/install.js');
const installedFiles = [
  'AGENTS.md', 'LICENSE', 'docs/loopkit.md', 'examples/demo-cli.js', 'examples/task.demo.json',
  'run.sh', 'scripts/loopkit-runner.js', 'template/loopkit.task.json',
];
function temp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loopkit install '));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function execute(cwd, cmd, args) {
  const result = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: 20000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result;
}
function files(dir, prefix = '') {
  return fs.readdirSync(dir).flatMap(name => {
    const rel = path.join(prefix, name);
    return fs.statSync(path.join(dir, name)).isDirectory() ? files(path.join(dir, name), rel) : [rel];
  }).sort();
}
function demo(dir) {
  fs.copyFileSync(path.join(dir, 'examples/task.demo.json'), path.join(dir, 'loopkit.task.json'));
  execute(dir, 'git', ['init', '-q']);
  execute(dir, 'git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'add', '.']);
  execute(dir, 'git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgSign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'fixture']);
  const result = execute(dir, 'sh', ['./run.sh']);
  assert.match(result.stdout, /VERIFIED [a-f0-9]{64}/);
  assert.equal(fs.readFileSync(path.join(dir, 'greeting.txt'), 'utf8'), 'hello\n');
}
test('cold installer copies the complete minimal runtime and runs the offline demo', t => {
  const dir = temp(t);
  execute(dir, process.execPath, [installer]);
  assert.deepEqual(files(dir), installedFiles);
  for (const file of installedFiles) assert.deepEqual(fs.readFileSync(path.join(dir, file)), fs.readFileSync(path.join(source, file)), file);
  assert.ok(fs.statSync(path.join(dir, 'run.sh')).mode & 0o111);
  demo(dir);
});
test('dry-run output matches real installation without writes or overwriting user files', t => {
  const dir = temp(t);
  const emptyPreview = execute(dir, process.execPath, [installer, '--dry-run']);
  assert.deepEqual(fs.readdirSync(dir), []);
  assert.match(emptyPreview.stdout, /8 would be written, 0 would be skipped/);
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), 'user contract');
  const preview = execute(dir, process.execPath, [installer, '--dry-run']);
  assert.deepEqual(fs.readdirSync(dir), ['AGENTS.md']);
  assert.match(preview.stdout, /^skip\s+AGENTS\.md$/m);
  for (const file of installedFiles.slice(1)) assert.ok(preview.stdout.includes(`write     ${file}\n`), file);
  assert.match(preview.stdout, /7 would be written, 1 would be skipped/);
  const result = execute(dir, process.execPath, [installer]);
  assert.match(result.stdout, /7 files written, 1 skipped/);
  assert.deepEqual(files(dir), installedFiles);
  assert.equal(fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8'), 'user contract');
  const again = execute(dir, process.execPath, [installer]);
  assert.match(again.stdout, /0 files written, 8 skipped/);
  assert.equal(fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8'), 'user contract');
});
test('source archive is cold-installable and fails if a required runtime artifact is missing', t => {
  const packDir = temp(t); const extracted = temp(t); const dest = temp(t);
  const result = execute(source, 'npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', packDir, '--cache', path.join(packDir, 'cache')]);
  const packed = JSON.parse(result.stdout)[0];
  assert.deepEqual(packed.files.map(file => file.path).sort(), [...installedFiles, 'README.md', 'package.json', 'scripts/install.js'].sort());
  execute(extracted, 'tar', ['-xzf', path.join(packDir, packed.filename)]);
  const packagedInstaller = path.join(extracted, 'package/scripts/install.js');
  execute(dest, process.execPath, [packagedInstaller]);
  assert.deepEqual(files(dest), installedFiles);
  demo(dest);
  fs.unlinkSync(path.join(extracted, 'package/scripts/loopkit-runner.js'));
  const missing = spawnSync(process.execPath, [packagedInstaller], { cwd: temp(t), encoding: 'utf8' });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /Required install artifact missing: .*loopkit-runner\.js/);
});
test('help and invalid arguments do not write files', t => {
  const dir = temp(t);
  assert.match(execute(dir, process.execPath, [installer, '--help']).stdout, /Existing files are never overwritten/);
  const result = spawnSync(process.execPath, [installer, '--unknown'], { cwd: dir, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.deepEqual(fs.readdirSync(dir), []);
});
test('installer refuses symlink files and parent directories without changing their targets', t => {
  const outside = temp(t);
  for (const target of ['AGENTS.md', 'scripts', 'docs', 'examples']) {
    const dir = temp(t);
    fs.symlinkSync(outside, path.join(dir, target));
    const result = spawnSync(process.execPath, [installer], { cwd: dir, encoding: 'utf8' });
    assert.notEqual(result.status, 0, `Expected ${target} symlink refusal`);
    assert.match(result.stderr, /Refusing symlink install target/);
    assert.deepEqual(fs.readdirSync(outside), []);
  }
});
