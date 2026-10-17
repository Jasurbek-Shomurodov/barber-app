import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

// Every key exists in all three languages, so no screen falls back to English by accident.
const src = fs.readFileSync(new URL('../src/lib/i18n.jsx', import.meta.url), 'utf8')
const keysOf = (lang) => {
  const start = src.indexOf(`\nconst ${lang} = {`)
  const end = src.indexOf('\n}\n', start)
  return new Set([...src.slice(start, end).matchAll(/^\s*([a-zA-Z_0-9]+):/gm)].map((m) => m[1]))
}
test('translation keys match across uz, ru and en', () => {
  const en = keysOf('en'), ru = keysOf('ru'), uz = keysOf('uz')
  assert.deepEqual([...ru].filter((k) => !en.has(k)), [], 'ru keys missing in en')
  assert.deepEqual([...en].filter((k) => !ru.has(k)), [], 'en keys missing in ru')
  assert.deepEqual([...en].filter((k) => !uz.has(k)), [], 'en keys missing in uz')
  assert.deepEqual([...uz].filter((k) => !en.has(k)), [], 'uz keys missing in en')
})
