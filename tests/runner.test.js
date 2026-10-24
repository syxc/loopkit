'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const runner = path.resolve(__dirname, '../run.sh');
const mock = path.resolve(__dirname, 'fixtures/agent.js');

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function project(t, executor = 'candidate', reviewer = 'pass', options = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'loopkit test '));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  git(cwd, 'init', '-q');
  git(cwd, 'config', 'user.email', 'test@example.invalid');
  git(cwd, 'config', 'user.name', 'Test');
  git(cwd, 'config', 'core.hooksPath', '.git/no-test-hooks');
  git(cwd, 'config', 'commit.gpgSign', 'false');
  const task = {
    version: 1, task_id: 'hello', goal: 'Create greeting.txt with hello',
    acceptance: [{ id: 'greeting', description: 'Exact greeting bytes', argv: [process.execPath, '-e', "require('node:assert/strict').equal(require('node:fs').readFileSync('greeting.txt','utf8'),'hello\\n')"] }],
    executor: [process.execPath, mock, 'executor', executor],
    reviewer: [process.execPath, mock, 'reviewer', reviewer],
    limits: { max_iterations: 1, command_timeout_seconds: 3, run_timeout_seconds: 30 },
    ...options,
  };
  fs.writeFileSync(path.join(cwd, 'loopkit.task.json'), JSON.stringify(task));
  git(cwd, 'add', '.');
  git(cwd, 'commit', '-qm', 'fixture');
  return { cwd, task, head: git(cwd, 'rev-parse', 'HEAD') };
}
function run(p, ...args) {
  return spawnSync('sh', [runner, ...args], { cwd: p.cwd, encoding: 'utf8', timeout: 15000 });
}
function state(p) { return JSON.parse(fs.readFileSync(path.join(p.cwd, '.loopkit/state.json'))); }
function blocked(p, result) {
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.ok(fs.existsSync(path.join(p.cwd, 'BLOCKED.md')), result.stderr);
  assert.doesNotMatch(result.stdout, /VERIFIED/);
}

test('actual success requires checks and a fresh exact-candidate review; never commits', t => {
  const p = project(t);
  const result = run(p);
  assert.equal(result.status, 0, result.stderr);
  const s = state(p);
  assert.equal(s.status, 'verified');
  assert.match(s.candidate.id, /^[a-f0-9]{64}$/);
  assert.equal(git(p.cwd, 'rev-parse', 'HEAD'), p.head);
  assert.equal(git(p.cwd, 'diff', '--cached'), '');
  const evidence = JSON.parse(fs.readFileSync(path.join(p.cwd, s.evidence, 'review.json')));
  assert.equal(evidence.candidate_id, s.candidate.id);
  assert.equal(evidence.passes, true);
  assert.match(fs.readFileSync(path.join(p.cwd, s.evidence, 'candidate.diff'), 'utf8'), /hello/);
});

for (const mode of ['false', 'text', 'fenced', 'empty', 'string-bool', 'missing', 'wrong-id', 'inconsistent', 'duplicate', 'nonzero']) {
  test(`review ${mode} cannot pass on CLI exit success or bad JSON`, t => {
    const p = project(t, 'candidate', mode);
    blocked(p, run(p));
    assert.equal(state(p).status, 'blocked');
  });
}
for (const mode of ['nonzero', 'text', 'blocked', 'empty-diff', 'commit']) {
  test(`executor ${mode} cannot bypass acceptance`, t => {
    const p = project(t, mode);
    blocked(p, run(p));
    assert.notEqual(state(p).status, 'verified');
    if (mode === 'commit') {
      assert.notEqual(git(p.cwd, 'rev-parse', 'HEAD'), p.head);
      const diff = fs.readFileSync(path.join(p.cwd, state(p).evidence, 'candidate.diff'), 'utf8');
      assert.match(diff, /greeting.txt/);
      assert.ok(!fs.existsSync(path.join(p.cwd, state(p).evidence, 'review.json')));
    }
  });
}
test('failed executable acceptance blocks even with a passing reviewer', t => {
  const p = project(t, 'bad');
  blocked(p, run(p));
  assert.ok(!fs.existsSync(path.join(p.cwd, state(p).evidence, 'review.json')));
  assert.ok(state(p).rejected_candidates.includes(state(p).candidate.id));
  fs.unlinkSync(path.join(p.cwd, 'BLOCKED.md'));
  blocked(p, run(p, '--resume', '--verify-only'));
  assert.match(state(p).reason, /unchanged after failed verification/);
});
test('bounded iterations include feedback and can repair without auto-commit', t => {
  const p = project(t, 'repair', 'pass', { limits: { max_iterations: 2, command_timeout_seconds: 3, run_timeout_seconds: 30 } });
  const result = run(p);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(state(p).iterations, 2);
});
test('BLOCKED marker is preserved; resume requires explicit human unblock', t => {
  const p = project(t, 'block-once', 'pass', { limits: { max_iterations: 2, command_timeout_seconds: 3, run_timeout_seconds: 30 } });
  blocked(p, run(p));
  const before = fs.readFileSync(path.join(p.cwd, 'BLOCKED.md'), 'utf8');
  blocked(p, run(p, '--resume'));
  assert.equal(fs.readFileSync(path.join(p.cwd, 'BLOCKED.md'), 'utf8'), before);
  fs.unlinkSync(path.join(p.cwd, 'BLOCKED.md'));
  const result = run(p, '--resume');
  assert.equal(result.status, 0, result.stderr);
});
test('dirty user work is preserved and refused', t => {
  const p = project(t);
  fs.writeFileSync(path.join(p.cwd, 'user.txt'), 'valuable');
  blocked(p, run(p));
  assert.equal(fs.readFileSync(path.join(p.cwd, 'user.txt'), 'utf8'), 'valuable');
  assert.ok(!fs.existsSync(path.join(p.cwd, 'greeting.txt')));
});
test('stale done prose and stale verified state do not skip verification', t => {
  const p = project(t);
  fs.writeFileSync(path.join(p.cwd, 'IMPLEMENTATION_PLAN.md'), 'STATUS: done\n');
  git(p.cwd, 'add', '.'); git(p.cwd, 'commit', '-qm', 'old prose');
  assert.equal(run(p).status, 0);
  fs.writeFileSync(path.join(p.cwd, 'greeting.txt'), 'broken');
  blocked(p, run(p, '--resume'));
  assert.equal(state(p).status, 'blocked');
});
test('unchanged verified resume re-runs both checks and reviewer', t => {
  const p = project(t);
  assert.equal(run(p).status, 0);
  const oldEvidence = state(p).evidence;
  const result = run(p, '--resume');
  assert.equal(result.status, 0, result.stderr);
  assert.notEqual(state(p).evidence, oldEvidence);
});
test('contract drift and corrupt persisted state fail closed', t => {
  const p = project(t);
  assert.equal(run(p).status, 0);
  fs.appendFileSync(path.join(p.cwd, 'loopkit.task.json'), ' ');
  blocked(p, run(p, '--resume'));
  fs.unlinkSync(path.join(p.cwd, 'BLOCKED.md'));
  fs.writeFileSync(path.join(p.cwd, '.loopkit/state.json'), '{');
  blocked(p, run(p, '--resume'));
});
for (const phase of ['executor', 'reviewer', 'check']) {
  test(`${phase} timeout has honest failure exit`, t => {
    const p = project(t, phase === 'executor' ? 'sleep' : 'candidate', phase === 'reviewer' ? 'sleep' : 'pass', {
      limits: { max_iterations: 1, command_timeout_seconds: 1, run_timeout_seconds: 10 },
      ...(phase === 'check' ? { acceptance: [{ id: 'sleep', description: 'Held check', argv: [process.execPath, '-e', 'setTimeout(()=>{},10000)'] }] } : {}),
    });
    blocked(p, run(p));
    assert.match(state(p).reason, /timeout/i);
  });
}
test('persisted total deadline cannot reset on resume', t => {
  const p = project(t);
  assert.equal(run(p).status, 0);
  const s = state(p); s.started_at = Date.now() - 60000;
  fs.writeFileSync(path.join(p.cwd, '.loopkit/state.json'), JSON.stringify(s));
  blocked(p, run(p, '--resume'));
  assert.match(state(p).reason, /time/i);
});
test('review cannot mutate its candidate and still pass', t => {
  const p = project(t, 'candidate', 'mutate');
  blocked(p, run(p));
  assert.match(state(p).reason, /changed/i);
});
test('check cannot mutate its candidate and still pass', t => {
  const p = project(t, 'candidate', 'pass', { acceptance: [{ id: 'mutate', description: 'Mutation', argv: [process.execPath, '-e', "require('fs').writeFileSync('greeting.txt','changed')"] }] });
  blocked(p, run(p));
});
test('rejected candidate cannot pass by asking again without a repair', t => {
  const p = project(t, 'candidate', 'false', { limits: { max_iterations: 2, command_timeout_seconds: 3, run_timeout_seconds: 30 } });
  blocked(p, run(p));
  assert.match(state(p).reason, /unchanged after failed verification/);
});
for (const resumeArgs of [['--resume'], ['--resume', '--verify-only']]) {
  test(`rejection survives unblock and ${resumeArgs.join(' ')} without another review`, t => {
    const p = project(t, 'candidate', 'reject-once', { limits: { max_iterations: 3, command_timeout_seconds: 3, run_timeout_seconds: 30 } });
    blocked(p, run(p));
    const rejectedId = state(p).candidate.id;
    fs.unlinkSync(path.join(p.cwd, 'BLOCKED.md'));
    blocked(p, run(p, ...resumeArgs));
    assert.equal(state(p).candidate.id, rejectedId);
    assert.ok(state(p).rejected_candidates.includes(rejectedId));
    const reviews = fs.readdirSync(path.join(p.cwd, '.loopkit')).filter(name => fs.existsSync(path.join(p.cwd, '.loopkit', name, 'review.json')));
    assert.equal(reviews.length, 1);
  });
}
test('a changed repair can pass after resume without erasing prior rejection', t => {
  const p = project(t, 'candidate', 'reject-once', { limits: { max_iterations: 3, command_timeout_seconds: 3, run_timeout_seconds: 30 } });
  blocked(p, run(p));
  const rejectedId = state(p).candidate.id;
  fs.writeFileSync(path.join(p.cwd, 'repair.txt'), 'Changed candidate for the rejected finding\n');
  fs.unlinkSync(path.join(p.cwd, 'BLOCKED.md'));
  const result = run(p, '--resume');
  assert.equal(result.status, 0, result.stderr);
  assert.notEqual(state(p).candidate.id, rejectedId);
  assert.ok(state(p).rejected_candidates.includes(rejectedId));
  assert.equal(run(p, '--resume', '--verify-only').status, 0);
});
test('verification-only rejection remains durable after a previously successful run', t => {
  const p = project(t, 'candidate', 'reject-second');
  assert.equal(run(p).status, 0);
  blocked(p, run(p, '--resume', '--verify-only'));
  const rejectedId = state(p).candidate.id;
  assert.ok(state(p).rejected_candidates.includes(rejectedId));
  fs.unlinkSync(path.join(p.cwd, 'BLOCKED.md'));
  blocked(p, run(p, '--resume', '--verify-only'));
  assert.match(state(p).reason, /unchanged after failed verification/);
  const reviews = fs.readdirSync(path.join(p.cwd, '.loopkit')).filter(name => fs.existsSync(path.join(p.cwd, '.loopkit', name, 'review.json')));
  assert.equal(reviews.length, 2);
});
test('resume refuses state without a rejection ledger rather than silently forgetting decisions', t => {
  const p = project(t);
  assert.equal(run(p).status, 0);
  const s = state(p); delete s.rejected_candidates;
  fs.writeFileSync(path.join(p.cwd, '.loopkit/state.json'), JSON.stringify(s));
  blocked(p, run(p, '--resume', '--verify-only'));
  assert.match(state(p).reason, /missing fields/);
});
test('executor iteration cap is cumulative across explicit unblock/resume', t => {
  const p = project(t, 'bad');
  blocked(p, run(p));
  fs.unlinkSync(path.join(p.cwd, 'BLOCKED.md'));
  blocked(p, run(p, '--resume'));
  assert.equal(state(p).iterations, 1);
  assert.match(state(p).reason, /Iteration cap/);
});
test('verify-only never invokes executor or repairs failing work', t => {
  const p = project(t);
  assert.equal(run(p).status, 0);
  fs.writeFileSync(path.join(p.cwd, 'greeting.txt'), 'broken');
  blocked(p, run(p, '--resume', '--verify-only'));
  assert.equal(fs.readFileSync(path.join(p.cwd, 'greeting.txt'), 'utf8'), 'broken');
  assert.equal(state(p).iterations, 1);
});
test('reviewer commit cannot return success and moved HEAD cannot resume', t => {
  const p = project(t, 'candidate', 'commit');
  blocked(p, run(p));
  assert.match(state(p).reason, /committed|HEAD/);
  fs.unlinkSync(path.join(p.cwd, 'BLOCKED.md'));
  blocked(p, run(p, '--resume'));
  assert.match(state(p).reason, /HEAD/);
});
for (const change of [task => { task.task_id = null; }, task => { task.acceptance = []; }, task => { task.limits.max_iterations = 0; }, task => { task.extra = true; }]) {
  test('invalid task schema is refused before executor', t => {
    const p = project(t); change(p.task);
    fs.writeFileSync(path.join(p.cwd, 'loopkit.task.json'), JSON.stringify(p.task));
    git(p.cwd, 'add', '.'); git(p.cwd, 'commit', '-qm', 'invalid contract');
    blocked(p, run(p));
    assert.ok(!fs.existsSync(path.join(p.cwd, 'greeting.txt')));
  });
}
test('ignored untracked task contract cannot bypass the clean-start approval boundary', t => {
  const p = project(t);
  git(p.cwd, 'rm', '--cached', 'loopkit.task.json');
  fs.writeFileSync(path.join(p.cwd, '.gitignore'), 'loopkit.task.json\n');
  git(p.cwd, 'add', '.gitignore'); git(p.cwd, 'commit', '-qm', 'untracked contract');
  blocked(p, run(p));
  assert.ok(!fs.existsSync(path.join(p.cwd, 'greeting.txt')));
});
test('overall deadline bounds a command even when its own timeout is longer', t => {
  const p = project(t, 'sleep', 'pass', { limits: { max_iterations: 2, command_timeout_seconds: 10, run_timeout_seconds: 1 } });
  const start = Date.now();
  blocked(p, run(p));
  assert.ok(Date.now() - start < 6000);
  assert.match(state(p).reason, /timeout/i);
});
test('staged user bytes are not restaged, reset or discarded on unsafe start', t => {
  const p = project(t);
  fs.writeFileSync(path.join(p.cwd, 'valuable.txt'), 'staged bytes');
  git(p.cwd, 'add', 'valuable.txt');
  fs.writeFileSync(path.join(p.cwd, 'valuable.txt'), 'working bytes');
  blocked(p, run(p));
  assert.equal(git(p.cwd, 'show', ':valuable.txt'), 'staged bytes');
  assert.equal(fs.readFileSync(path.join(p.cwd, 'valuable.txt'), 'utf8'), 'working bytes');
});
test('interrupted checking phase resumes with verification, not executor work', t => {
  const p = project(t);
  assert.equal(run(p).status, 0);
  const s = state(p); s.status = 'checking';
  fs.writeFileSync(path.join(p.cwd, '.loopkit/state.json'), JSON.stringify(s));
  const result = run(p, '--resume');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(state(p).iterations, 1);
  assert.equal(state(p).status, 'verified');
  assert.equal(git(p.cwd, 'ls-files', '.loopkit'), '');
});
test('nested Git contents cannot escape candidate identity through a gitlink', t => {
  const p = project(t);
  const nested = path.join(p.cwd, 'vendor'); fs.mkdirSync(nested);
  git(nested, 'init', '-q');
  git(nested, 'config', 'user.email', 'test@example.invalid');
  git(nested, 'config', 'user.name', 'Test');
  fs.writeFileSync(path.join(nested, 'file.txt'), 'nested');
  git(nested, 'add', '.'); git(nested, 'commit', '-qm', 'nested fixture');
  git(p.cwd, 'add', 'vendor'); git(p.cwd, 'commit', '-qm', 'embedded fixture');
  blocked(p, run(p));
  assert.match(state(p).reason, /Submodules/);
});
test('second owner cannot modify an existing run or marker', t => {
  const p = project(t);
  fs.mkdirSync(path.join(p.cwd, '.loopkit'));
  fs.writeFileSync(path.join(p.cwd, '.loopkit/owner.lock'), 'existing owner');
  const result = run(p);
  assert.notEqual(result.status, 0);
  assert.equal(fs.readFileSync(path.join(p.cwd, '.loopkit/owner.lock'), 'utf8'), 'existing owner');
  assert.ok(!fs.existsSync(path.join(p.cwd, 'BLOCKED.md')));
});
test('pending human spec approval blocks executor', t => {
  const p = project(t);
  fs.writeFileSync(path.join(p.cwd, 'SPEC-PENDING.md'), 'approve');
  blocked(p, run(p));
  assert.ok(!fs.existsSync(path.join(p.cwd, 'greeting.txt')));
});
