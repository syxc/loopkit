#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: ./run.sh [--task loopkit.task.json] [--resume] [--verify-only]\nNo commits or cleanup. See docs/portability.md.');
  process.exit(0);
}
let taskPath = 'loopkit.task.json';
let resume = false;
let verifyOnly = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--task' && args[i + 1]) taskPath = args[++i];
  else if (args[i] === '--resume') resume = true;
  else if (args[i] === '--verify-only') { verifyOnly = true; resume = true; }
  else { console.error(`Unknown or incomplete option: ${args[i]}`); process.exit(1); }
}
const root = process.cwd();
const dir = path.join(root, '.loopkit');
const statePath = path.join(dir, 'state.json');
const lockPath = path.join(dir, 'owner.lock');
const paths = ['--', '.', ':(exclude).loopkit', ':(exclude)BLOCKED.md'];
let state;
let task;
let contractHash;
let locked = false;
let interrupted = false;
let stopChild = () => {};

function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function atomic(file, value) {
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(`${file}.tmp`, file);
}
function save() { atomic(statePath, state); }
function event(type, detail) {
  fs.appendFileSync(path.join(dir, 'events.jsonl'), JSON.stringify({ at: new Date().toISOString(), type, ...detail }) + '\n', { mode: 0o600 });
}
function assert(ok, message) { if (!ok) throw new Error(message); }
function object(value, keys, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label}: expected object`);
  assert(Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)), `${label}: unexpected or missing fields`);
}
function decode(source) {
  const value = JSON.parse(source);
  const stack = [];
  for (const token of source.match(/"(?:\\.|[^"\\])*"|[{}\[\],]/g) || []) {
    if (token === '{') stack.push({ keys: new Set(), key: true });
    else if (token === '[') stack.push(null);
    else if (token === '}' || token === ']') stack.pop();
    else {
      const frame = stack[stack.length - 1];
      if (token === ',' && frame) frame.key = true;
      else if (token.startsWith('"') && frame?.key) {
        const key = JSON.parse(token);
        assert(!frame.keys.has(key), `Duplicate JSON field: ${key}`);
        frame.keys.add(key); frame.key = false;
      }
    }
  }
  return value;
}
function text(value) { return typeof value === 'string' && value.trim().length > 0; }
function argv(value) { return Array.isArray(value) && value.length > 0 && value.every(v => typeof v === 'string' && !v.includes('\0')) && text(value[0]); }
function validateTask(value) {
  object(value, ['version', 'task_id', 'goal', 'acceptance', 'executor', 'reviewer', 'limits'], 'task');
  assert(value.version === 1 && text(value.task_id) && /^[a-zA-Z0-9_-]+$/.test(value.task_id) && text(value.goal), 'Invalid task version, id or goal');
  assert(argv(value.executor) && argv(value.reviewer), 'executor and reviewer must be nonempty argv arrays');
  assert(Array.isArray(value.acceptance) && value.acceptance.length > 0, 'At least one executable acceptance check is required');
  const ids = new Set();
  for (const check of value.acceptance) {
    object(check, ['id', 'description', 'argv'], 'acceptance');
    assert(text(check.id) && !ids.has(check.id) && text(check.description) && argv(check.argv), 'Invalid or duplicate acceptance check');
    ids.add(check.id);
  }
  object(value.limits, ['max_iterations', 'command_timeout_seconds', 'run_timeout_seconds'], 'limits');
  assert(Object.values(value.limits).every(v => Number.isSafeInteger(v) && v > 0 && v <= 86400), 'Limits must be positive integers <= 86400');
}
function git(args, env = {}) {
  const remaining = state && task ? state.started_at + task.limits.run_timeout_seconds * 1000 - Date.now() : 10000;
  assert(remaining > 0, 'Total run timeout reached');
  const result = spawnSync('git', args, {
    cwd: root, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...env }, encoding: 'utf8',
    timeout: Math.min(10000, remaining), killSignal: 'SIGKILL', maxBuffer: 64 * 1024 * 1024,
  });
  assert(result.status === 0 && !result.error, `Git failed: ${args[0]}: ${result.error?.message || result.stderr}`);
  return result.stdout;
}
function head() { return git(['rev-parse', 'HEAD']).trim(); }
function markers() {
  assert(!fs.existsSync(path.join(root, 'BLOCKED.md')), 'BLOCKED.md requires human action; preserve it, then remove it explicitly to resume');
  assert(!(fs.existsSync(path.join(root, 'SPEC-PENDING.md')) && !fs.existsSync(path.join(root, 'SPEC-APPROVED.md'))), 'Spec approval is pending');
}
function guard() {
  assert(!interrupted, 'Run interrupted');
  markers();
  assert(Date.now() < state.started_at + task.limits.run_timeout_seconds * 1000, 'Total run timeout reached');
  assert(hash(fs.readFileSync(taskPath)) === contractHash, 'Task contract changed during run');
}
function candidate(evidence) {
  const index = path.join(dir, 'candidate.index');
  const env = { GIT_INDEX_FILE: index };
  try {
    git(['read-tree', 'HEAD'], env);
    git(['add', '-A', ...paths], env);
    const tree = git(['write-tree'], env).trim();
    const revision = head();
    const diff = git(['diff', '--binary', '--no-ext-diff', '--no-textconv', state.base, tree]);
    const result = { base: state.base, head: revision, tree, diff_sha256: hash(diff) };
    result.id = hash(JSON.stringify({ ...result, contract_sha256: contractHash }));
    if (evidence) {
      fs.writeFileSync(path.join(evidence, 'candidate.diff'), diff);
      atomic(path.join(evidence, 'candidate.json'), result);
      state.candidate = result;
      save();
    }
    assert(!/^160000 /m.test(git(['ls-tree', '-r', tree])), 'Submodules/nested Git repositories are unsupported: a Git link cannot bind dirty nested contents');
    assert(revision === state.base, 'Executor/check/reviewer committed or moved HEAD; candidate evidence retained, no automatic reset');
    assert(diff.length > 0, 'Empty candidate diff cannot be reviewed');
    return result;
  } finally {
    for (const file of [index, `${index}.lock`]) if (fs.existsSync(file)) fs.unlinkSync(file);
  }
}
function unchanged(expected) {
  guard();
  const current = candidate();
  guard();
  assert(current.id === expected.id, 'Candidate changed during checks/review or since persisted verification');
}
function parse(file, label) {
  assert(fs.statSync(file).size <= 1024 * 1024, `${label}: JSON output exceeds 1 MiB`);
  try { return decode(fs.readFileSync(file, 'utf8')); }
  catch { throw new Error(`${label}: invalid JSON (one object only, no prose or fences)`); }
}
async function command(commandArgv, name, evidence, prompt) {
  guard();
  const actual = prompt === undefined ? commandArgv : [...commandArgv, JSON.stringify(prompt)];
  const out = fs.openSync(path.join(evidence, `${name}.stdout`), 'w', 0o600);
  const err = fs.openSync(path.join(evidence, `${name}.stderr`), 'w', 0o600);
  const start = Date.now();
  const timeout = Math.min(task.limits.command_timeout_seconds * 1000, state.started_at + task.limits.run_timeout_seconds * 1000 - start);
  let timedOut = false;
  let killTimer;
  let timer;
  event('command-start', { name, argv: commandArgv, evidence: state.evidence });
  const result = await new Promise(resolve => {
    const child = spawn(actual[0], actual.slice(1), { cwd: root, stdio: ['ignore', out, err], detached: true });
    const kill = signal => {
      if (child.pid) {
        try { process.kill(-child.pid, signal); } catch (error) { if (error.code !== 'ESRCH') throw error; }
      }
    };
    stopChild = () => {
      kill('SIGTERM');
      killTimer = setTimeout(() => kill('SIGKILL'), 200);
    };
    timer = setTimeout(() => { timedOut = true; stopChild(); }, timeout);
    child.once('error', error => resolve({ exit_code: null, error: error.message }));
    child.once('close', (code, signal) => {
      // Stop any descendants still in the command's process group.
      kill('SIGKILL');
      resolve({ exit_code: code, signal });
    });
  });
  clearTimeout(timer);
  clearTimeout(killTimer);
  stopChild = () => {};
  fs.closeSync(out);
  fs.closeSync(err);
  const record = { ...result, timed_out: timedOut, elapsed_ms: Date.now() - start, argv: commandArgv };
  atomic(path.join(evidence, `${name}.result.json`), record);
  event('command-end', { name, ...record });
  guard();
  assert(!timedOut, `${name} timeout`);
  return record;
}
function nextEvidence() {
  state.sequence++;
  state.evidence = `.loopkit/attempt-${String(state.sequence).padStart(5, '0')}`;
  const evidence = path.join(root, state.evidence);
  fs.mkdirSync(evidence);
  save();
  return evidence;
}
function rejectCandidate(expected, reason) {
  if (!state.rejected_candidates.includes(expected.id)) state.rejected_candidates.push(expected.id);
  state.reason = reason; save();
  return reason;
}
async function verify(evidence, expected) {
  assert(!state.rejected_candidates.includes(expected.id), 'Candidate unchanged after failed verification; repair is required before another review');
  state.status = 'checking'; save();
  const checks = [];
  for (let i = 0; i < task.acceptance.length; i++) {
    const check = task.acceptance[i];
    const result = await command(check.argv, `check-${i + 1}`, evidence);
    unchanged(expected);
    checks.push({ id: check.id, ...result });
    atomic(path.join(evidence, 'checks.json'), checks);
    if (result.exit_code !== 0 || result.error) return rejectCandidate(expected, `Acceptance ${check.id} failed; see ${state.evidence}`);
  }
  state.status = 'reviewing'; save();
  const result = await command(task.reviewer, 'reviewer', evidence, {
    role: 'independent-static-reviewer', task, candidate: expected, diff_path: `${state.evidence}/candidate.diff`, checks,
    instructions: 'Fresh static review only. Read the full candidate diff and connected source against every acceptance criterion. Check weakened tests, errors, scope, invented APIs and off-spec completion. Do not modify files, run application code, commit, or reuse executor sessions. Executable acceptance is separate evidence, not proof of correctness. Return ONLY JSON with exactly task_id, candidate_id, passes (boolean), failures (array of nonempty strings). passes=true requires failures=[]; passes=false requires at least one failure. Copy task_id and candidate_id exactly.',
  });
  unchanged(expected);
  assert(result.exit_code === 0 && !result.error, 'Reviewer CLI failed; exit success is also not a pass verdict');
  const verdict = parse(path.join(evidence, 'reviewer.stdout'), 'reviewer');
  object(verdict, ['task_id', 'candidate_id', 'passes', 'failures'], 'reviewer');
  assert(verdict.task_id === task.task_id && verdict.candidate_id === expected.id, 'Reviewer verdict identifies a different task/candidate');
  assert(typeof verdict.passes === 'boolean' && Array.isArray(verdict.failures) && verdict.failures.every(text), 'Reviewer JSON has invalid verdict types');
  assert(verdict.passes ? verdict.failures.length === 0 : verdict.failures.length > 0, 'Reviewer verdict is inconsistent');
  const failure = verdict.passes ? null : rejectCandidate(expected, `Static review failed: ${verdict.failures.join('; ')}`);
  atomic(path.join(evidence, 'review.json'), verdict);
  return failure;
}
function complete(expected) {
  unchanged(expected);
  state.status = 'verified'; state.reason = ''; save();
  event('verified', { candidate_id: expected.id, evidence: state.evidence });
  console.log(`VERIFIED ${expected.id} (checks + fresh static review, not committed)`);
}
async function main() {
  assert(git(['rev-parse', '--show-toplevel']).trim() === fs.realpathSync(root), 'Run from the Git worktree root');
  assert(!fs.existsSync(dir) || !fs.lstatSync(dir).isSymbolicLink(), '.loopkit must not be a symlink');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try { fs.writeFileSync(lockPath, String(process.pid) + '\n', { flag: 'wx', mode: 0o600 }); locked = true; }
  catch { throw new Error('Local run owner lock exists. If its process is dead, inspect evidence and remove .loopkit/owner.lock manually'); }
  if (!fs.existsSync(path.join(dir, '.gitignore'))) fs.writeFileSync(path.join(dir, '.gitignore'), '*\n');
  markers();
  taskPath = path.resolve(taskPath);
  assert(taskPath.startsWith(root + path.sep) && !taskPath.startsWith(dir + path.sep), 'Task contract must be inside the worktree, outside .loopkit');
  git(['ls-files', '--error-unmatch', '--', path.relative(root, taskPath)]);
  assert(fs.lstatSync(taskPath).isFile(), 'Task contract must be a tracked regular file, not a symlink');
  const bytes = fs.readFileSync(taskPath);
  task = decode(bytes.toString('utf8')); validateTask(task); contractHash = hash(bytes);
  assert(git(['ls-files', '--', '.loopkit', 'BLOCKED.md']).trim() === '', '.loopkit and BLOCKED.md are reserved untracked runtime paths');
  if (resume) {
    state = decode(fs.readFileSync(statePath, 'utf8'));
    object(state, ['version', 'task_id', 'contract_sha256', 'base', 'started_at', 'iterations', 'sequence', 'status', 'candidate', 'evidence', 'reason', 'rejected_candidates'], 'state');
    assert(state.version === 1 && state.task_id === task.task_id && state.contract_sha256 === contractHash, 'Persisted task contract does not match');
    assert(/^[a-f0-9]{40,64}$/.test(state.base) && Number.isSafeInteger(state.started_at) && state.started_at > 0 && ['executing', 'checking', 'reviewing', 'verified', 'blocked', 'ready'].includes(state.status), 'Invalid persisted state');
    assert(Number.isSafeInteger(state.iterations) && state.iterations >= 0 && Number.isSafeInteger(state.sequence) && state.sequence >= 0, 'Invalid persisted counters');
    assert(Array.isArray(state.rejected_candidates) && state.rejected_candidates.every(id => typeof id === 'string' && /^[a-f0-9]{64}$/.test(id)) && new Set(state.rejected_candidates).size === state.rejected_candidates.length, 'Invalid persisted rejection ledger');
    guard();
    assert(head() === state.base, 'HEAD moved since run began; no automatic reset');
    if (state.status === 'verified' || verifyOnly || ['checking', 'reviewing'].includes(state.status)) {
      const old = state.candidate;
      const evidence = nextEvidence();
      const expected = candidate(evidence);
      if (old) assert(old.id === expected.id, 'Candidate changed since persisted verification; no stale success');
      const failure = await verify(evidence, expected);
      assert(!failure, failure);
      complete(expected);
      return;
    }
  } else {
    assert(!fs.existsSync(statePath), 'State exists; use --resume, not a new run');
    assert(git(['status', '--porcelain=v1', '--untracked-files=all', ...paths]).trim() === '', 'Unsafe dirty start refused; preserve and commit/stash user work yourself');
    state = { version: 1, task_id: task.task_id, contract_sha256: contractHash, base: head(), started_at: Date.now(), iterations: 0, sequence: 0, status: 'ready', candidate: null, evidence: null, reason: '', rejected_candidates: [] };
    save(); event('run-start', { base: state.base, contract_sha256: contractHash });
  }
  while (state.iterations < task.limits.max_iterations) {
    guard();
    assert(head() === state.base, 'HEAD moved since run began; no automatic reset');
    state.iterations++;
    const evidence = nextEvidence();
    state.status = 'executing'; save();
    const result = await command(task.executor, 'executor', evidence, {
      role: 'executor', task, iteration: state.iterations, base: state.base, feedback: state.reason,
      instructions: 'Implement only this task in one small verifiable slice. Read AGENTS.md and prior evidence. Do not commit, move HEAD, edit the task contract, change .loopkit runtime files, weaken checks, or claim completion. The runner owns verification and progress. If blocked, write BLOCKED.md with the needed human action. Return ONLY JSON with exactly task_id, status (candidate or blocked), summary (nonempty string).',
    });
    const expected = candidate(evidence);
    assert(result.exit_code === 0 && !result.error, 'Executor CLI failed');
    const output = parse(path.join(evidence, 'executor.stdout'), 'executor');
    object(output, ['task_id', 'status', 'summary'], 'executor');
    assert(output.task_id === task.task_id && ['candidate', 'blocked'].includes(output.status) && text(output.summary), 'Invalid executor response');
    assert(output.status !== 'blocked', `Executor blocked: ${output.summary}`);
    const failure = await verify(evidence, expected);
    if (!failure) {
      complete(expected);
      return;
    }
    state.reason = failure; state.status = 'ready'; save();
  }
  throw new Error(`Iteration cap reached (${state.iterations}/${task.limits.max_iterations}). ${state.reason}`);
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { interrupted = true; stopChild(); });
main().catch(error => {
  const reason = error.message;
  console.error(`BLOCKED: ${reason}`);
  if (locked) {
    if (state) { state.status = 'blocked'; state.reason = reason; save(); }
    const file = path.join(root, 'BLOCKED.md');
    if (!fs.existsSync(file)) fs.writeFileSync(file, `# Loop blocked\n\n${reason}\n\nInspect .loopkit/state.json and attempt evidence. Preserve all candidate work. Resolve the cause, remove this marker explicitly, then use ./run.sh --resume. Caps and the original deadline remain in force.\n`, { flag: 'wx' });
    event('blocked', { reason });
  }
  process.exitCode = 2;
}).finally(() => { if (locked) fs.unlinkSync(lockPath); });
