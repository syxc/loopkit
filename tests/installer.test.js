'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const source = path.resolve(__dirname, '..');
function temp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loopkit install '));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function execute(cwd, cmd, args, env = {}) {
  const result = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: 20000, env: { ...process.env, ...env } });
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
test('cold Node installer includes AGENTS, contract, runtime, references and an executable offline demo', t => {
  const dir = temp(t);
  execute(dir, process.execPath, [path.join(source, 'bin/loopkit.js'), 'init']);
  for (const file of ['AGENTS.md', 'scripts/loopkit-runner.js', 'template/loopkit.task.json', '.claude/commands/loop.md', 'docs/checklists/red-flags.md']) {
    assert.ok(fs.existsSync(path.join(dir, file)), file);
  }
  const guide = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
  execute(dir, process.execPath, [path.join(source, 'bin/loopkit.js'), 'init']);
  assert.equal(fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8'), guide);
  demo(dir);
});
test('shell cold path matches Node installation and works with QUIET=1, no network or model calls', t => {
  const nodeDest = temp(t); const shellDest = temp(t); const tools = temp(t); const archiveDir = temp(t);
  execute(nodeDest, process.execPath, [path.join(source, 'bin/loopkit.js'), 'init']);
  const archive = path.join(archiveDir, 'source.tar.gz');
  execute(source, 'tar', ['-czf', archive, '--exclude=.git', '--exclude=node_modules', '--exclude=.loopkit', '.']);
  const curl = path.join(tools, 'curl');
  fs.writeFileSync(curl, '#!/bin/sh\ncat "$TEST_ARCHIVE"\n'); fs.chmodSync(curl, 0o755);
  execute(shellDest, 'bash', [path.join(source, 'install.sh')], { QUIET: '1', TEST_ARCHIVE: archive, PATH: tools + path.delimiter + process.env.PATH });
  assert.deepEqual(files(shellDest), files(nodeDest));
  for (const file of files(nodeDest)) assert.deepEqual(fs.readFileSync(path.join(shellDest, file)), fs.readFileSync(path.join(nodeDest, file)), file);
  demo(shellDest);
});
test('npm archive includes every required cold-install artifact', t => {
  const packDir = temp(t); const extracted = temp(t); const dest = temp(t);
  const result = execute(source, 'npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', packDir, '--cache', path.join(packDir, 'cache')]);
  const packed = JSON.parse(result.stdout)[0];
  execute(extracted, 'tar', ['-xzf', path.join(packDir, packed.filename)]);
  const modules = path.join(extracted, 'node_modules');
  const bin = path.join(modules, '.bin');
  fs.mkdirSync(bin, { recursive: true });
  fs.renameSync(path.join(extracted, 'package'), path.join(modules, 'claude-loopkit'));
  fs.symlinkSync('../claude-loopkit/bin/loopkit.js', path.join(bin, 'claude-loopkit'));
  fs.symlinkSync('../claude-loopkit/bin/loopkit-add', path.join(bin, 'loopkit-add'));
  execute(dest, path.join(bin, 'claude-loopkit'), ['init']);
  const skillDest = temp(t);
  execute(skillDest, path.join(bin, 'loopkit-add'), ['adversarial-verify']);
  assert.deepEqual(fs.readFileSync(path.join(skillDest, '.claude/skills/adversarial-verify/SKILL.md')), fs.readFileSync(path.join(source, 'skills/adversarial-verify/SKILL.md')));
  demo(dest);
});
test('single skill installation uses only bundled files and refuses traversal', t => {
  const dir = temp(t);
  execute(dir, 'sh', [path.join(source, 'bin/loopkit-add'), 'adversarial-verify']);
  assert.deepEqual(fs.readFileSync(path.join(dir, '.claude/skills/adversarial-verify/SKILL.md')), fs.readFileSync(path.join(source, 'skills/adversarial-verify/SKILL.md')));
  const result = spawnSync('sh', [path.join(source, 'bin/loopkit-add'), '../oops'], { cwd: dir, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.ok(!fs.existsSync(path.join(dir, '.claude/oops')));
});
test('installer dry-run does not write, default preserves existing files, and symlink targets are refused', t => {
  const dir = temp(t); const outside = temp(t);
  const cli = path.join(source, 'bin/loopkit.js');
  execute(dir, process.execPath, [cli, 'init', '--dry-run']);
  assert.deepEqual(fs.readdirSync(dir), []);
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), 'user contract');
  execute(dir, process.execPath, [cli, 'init']);
  assert.equal(fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8'), 'user contract');
  for (const target of ['.claude', 'scripts']) {
    const fresh = temp(t);
    fs.symlinkSync(outside, path.join(fresh, target));
    const result = spawnSync(process.execPath, [cli, 'init'], { cwd: fresh, encoding: 'utf8' });
    assert.notEqual(result.status, 0, `Expected ${target} symlink refusal`);
    assert.deepEqual(fs.readdirSync(outside), []);
  }
});
