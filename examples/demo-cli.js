'use strict';
// Offline protocol demonstration, not an independent code-quality reviewer.
const fs = require('node:fs');
const [role, prompt] = process.argv.slice(2);
const input = JSON.parse(prompt);
if (role === 'executor') {
  fs.writeFileSync('greeting.txt', 'hello\n');
  console.log(JSON.stringify({ task_id: input.task.task_id, status: 'candidate', summary: 'Wrote exact greeting' }));
} else if (role === 'reviewer') {
  const diff = fs.readFileSync(input.diff_path, 'utf8');
  const passes = diff.includes('+hello') && diff.includes('greeting.txt');
  console.log(JSON.stringify({ task_id: input.task.task_id, candidate_id: input.candidate.id, passes, failures: passes ? [] : ['Expected greeting diff missing'] }));
} else {
  process.exitCode = 1;
}
