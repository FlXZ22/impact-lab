import { readFile, writeFile } from 'node:fs/promises';
import { prepareReport, MODEL } from '../lib/claude.js';
const cases = JSON.parse(await readFile(new URL('./cases.json', import.meta.url), 'utf8'));
const results = [];
console.log(`SegnalaMi live routing evaluation · ${MODEL()} · ${cases.length} synthetic cases`);
if (!process.env.ANTHROPIC_API_KEY?.trim()) {
  console.error('BLOCKED: ANTHROPIC_API_KEY is not set. No Claude calls were made; routing accuracy is unavailable (0/15 evaluated).');
  process.exitCode = 1;
} else {
  for (const item of cases) {
    try {
      const report = await prepareReport(item);
      const correct = report.competence === item.expected_competence;
      results.push({ id: item.id, expected: item.expected_competence, actual: report.competence, correct, confidence: report.confidence, missing_info: report.missing_info });
      console.log(`${correct ? 'PASS' : 'FAIL'} ${item.id}: expected=${item.expected_competence} actual=${report.competence}`);
    } catch (error) {
      results.push({ id: item.id, expected: item.expected_competence, error: error.code || 'ERROR' });
      console.log(`ERROR ${item.id}: ${error.code || 'ERROR'} — ${error.message}`);
    }
  }
  const completed = results.filter(r => !r.error).length, correct = results.filter(r => r.correct).length;
  const summary = { model: MODEL(), timestamp: new Date().toISOString(), total: cases.length, completed, correct, errors: cases.length-completed, accuracy: completed ? correct/completed : null, end_to_end_accuracy: correct/cases.length, results };
  await writeFile(new URL('./results.json', import.meta.url), JSON.stringify(summary, null, 2));
  console.log(`Routing accuracy: ${completed ? `${(correct/completed*100).toFixed(1)}% (${correct}/${completed} completed)` : 'unavailable'}; completion ${completed}/${cases.length}; end-to-end ${correct}/${cases.length}.`);
  if (completed !== cases.length || correct !== cases.length) process.exitCode = 1;
}
