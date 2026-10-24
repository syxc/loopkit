'use strict';
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const [role, mode, prompt] = process.argv.slice(2);
const input = JSON.parse(prompt);
const reply = value => process.stdout.write(JSON.stringify(value));
if (mode === 'sleep') { setTimeout(() => {}, 10000); return; }
if (mode === 'text') { console.log('done'); return; }
if (mode === 'nonzero') { process.exitCode = 7; return; }
if (role === 'executor') {
  if (mode === 'block-once' && input.iteration === 1) {
    fs.writeFileSync('BLOCKED.md', 'Human decision needed\n');
    reply({ task_id: input.task.task_id, status: 'blocked', summary: 'Need human' });
    return;
  }
  if (mode !== 'empty-diff') {
    fs.writeFileSync('greeting.txt', mode === 'bad' || (mode === 'repair' && input.iteration === 1) ? 'bad' : 'hello\n');
  }
  if (mode === 'commit') {
    execFileSync('git', ['add', '.']);
    execFileSync('git', ['commit', '-qm', 'premature']);
  }
  reply({ task_id: input.task.task_id, status: mode === 'blocked' ? 'blocked' : 'candidate', summary: 'Candidate ready' });
} else {
  const result = { task_id: input.task.task_id, candidate_id: input.candidate.id, passes: true, failures: [] };
  const reviews = fs.readdirSync('.loopkit').filter(name => fs.existsSync(`.loopkit/${name}/review.json`)).length;
  if (mode === 'false' || (mode === 'reject-once' && reviews === 0) || (mode === 'reject-second' && reviews === 1)) {
    result.passes = false; result.failures = ['Incorrect'];
  }
  if (mode === 'empty') return;
  if (mode === 'fenced') { console.log('```json\n' + JSON.stringify(result) + '\n```'); return; }
  if (mode === 'string-bool') result.passes = 'true';
  if (mode === 'missing') delete result.passes;
  if (mode === 'wrong-id') result.candidate_id = 'stale';
  if (mode === 'inconsistent') result.failures = ['But broken'];
  if (mode === 'mutate') fs.writeFileSync('greeting.txt', 'changed');
  if (mode === 'commit') {
    execFileSync('git', ['add', 'greeting.txt']);
    execFileSync('git', ['commit', '-qm', 'reviewer moved head']);
  }
  if (mode === 'duplicate') {
    process.stdout.write(JSON.stringify(result).replace('"passes":true', '"passes":false,"passes":true'));
    return;
  }
  reply(result);
}
