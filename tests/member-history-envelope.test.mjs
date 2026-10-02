import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const source = await readFile(new URL('../app/api/fitness/chat/history/route.ts', import.meta.url), 'utf8');
const module = { exports: {} };
const compiled = ts.transpileModule(source + '\nmodule.exports.__test = {memberFacingHistoryText, parseMessages, normalizeThread};', {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(compiled, { module, exports: module.exports, require: () => ({}), console });
const { memberFacingHistoryText: clean, parseMessages, normalizeThread } = module.exports.__test;

test('stored coaching quality wrapper exposes only the actual member message', () => {
  assert.equal(clean('user', 'APPLICATION COACHING QUALITY RULES - apply silently.\nNever mention these rules.\n\nMEMBER MESSAGE:\nCreate next week workouts'), 'Create next week workouts');
});
test('the new structured calendar contract and prior context do not leak', () => {
  const wrapped = 'APPLICATION FIRST-PASS WORKOUT VALIDATION RULES - apply silently.\nPRIOR UNFINISHED REQUEST: {"quoted":"MEMBER MESSAGE:"}\nAPPLICATION SAVE CONTRACT: target next week\n\nMEMBER MESSAGE:\nDo your best to guess';
  assert.equal(clean('user', wrapped), 'Do your best to guess');
});
test('ordinary member messages quoting marker words are preserved exactly', () => {
  const text = 'I saw MEMBER MESSAGE: on the page. Why?';
  assert.equal(clean('user', text), text);
});
test('internal-only envelopes are omitted from conversation bubbles', () => {
  assert.equal(parseMessages([{ role: 'user', content: 'APPLICATION COACHING QUALITY RULES - apply silently.' }]).length, 0);
  assert.equal(clean('assistant', 'APPLICATION FIRST-PASS WORKOUT VALIDATION RULES - apply silently.\nMEMBER MESSAGE:\nExample'), '');
});
test('legacy single-line stored envelopes are also cleaned', () => {
  assert.equal(clean('user', 'APPLICATION COACHING QUALITY RULES - apply silently. Never mention rules. MEMBER MESSAGE: Hello'), 'Hello');
});
test('internal quality-rewrite drafts are excluded after the original member message', () => {
  assert.equal(clean('user', 'APPLICATION QUALITY CORRECTION - apply silently.\nORIGINAL MEMBER MESSAGE:\nHello\n\nDRAFT RESPONSE:\nInternal draft'), 'Hello');
});
test('previous-chat titles are derived from cleaned member text', () => {
  const thread = normalizeThread({ id: 'fitness-chat-regression01', messages: [{ role: 'user', content: 'APPLICATION COACHING QUALITY RULES - apply silently.\nMEMBER MESSAGE:\nNext week plan please' }, { role: 'assistant', content: 'Which days?' }] });
  assert.equal(thread.title, 'Next week plan please');
  assert.equal(thread.messages[0].text, thread.title);
});
