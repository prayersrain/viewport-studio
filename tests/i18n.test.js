import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const root = new URL('../extension/', import.meta.url);
const read = async path => readFile(new URL(path, root), 'utf8');
const locales = await readdir(new URL('_locales/', root));
const messages = Object.fromEntries(await Promise.all(locales.map(async locale => [locale, JSON.parse(await read(`_locales/${locale}/messages.json`))])));

test('every message key used by the extension exists in every locale', async () => {
  const sources = await Promise.all(['studio.html', 'studio.js', 'background.js', 'core.js', 'manifest.json'].map(read));
  const used = new Set();
  for (const source of sources) {
    // Covers t('key', …) and t(flag?'a':'b').
    for (const [, args] of source.matchAll(/\bt\(([^)]*)\)/g))
      for (const [, key] of args.matchAll(/'([A-Za-z0-9_]+)'/g)) used.add(key);
    for (const [, key] of source.matchAll(/data-i18n(?:-[a-z-]+)?="([A-Za-z0-9_]+)"/g)) used.add(key);
    for (const [, key] of source.matchAll(/__MSG_([A-Za-z0-9_]+)__/g)) used.add(key);
  }
  assert.ok(used.size > 30, `scanner found only ${used.size} keys`);
  for (const [locale, table] of Object.entries(messages))
    for (const key of used) assert.ok(table[key]?.message, `${locale} is missing "${key}"`);
});

test('locales share the same keys and placeholders', () => {
  const [base, ...others] = Object.keys(messages);
  assert.ok(base && others.length, 'expected English and at least one translation');
  for (const locale of others) {
    assert.deepEqual(Object.keys(messages[locale]).sort(), Object.keys(messages[base]).sort(), `${locale} keys differ from ${base}`);
    for (const key of Object.keys(messages[base]))
      assert.deepEqual(messages[locale][key].message.match(/\$\d/g), messages[base][key].message.match(/\$\d/g), `${locale}.${key} placeholders`);
  }
});
