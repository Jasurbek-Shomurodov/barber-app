import test from 'node:test'
import assert from 'node:assert/strict'
import { detectLang } from '../src/lib/lang.js'

test('a saved choice always wins', () => {
  assert.equal(detectLang({ saved: 'en', telegram: 'ru', browser: ['uz'] }), 'en')
})

test('platform language comes next: Telegram first, then the browser list in order', () => {
  assert.equal(detectLang({ telegram: 'uz', browser: ['ru-RU'] }), 'uz')
  assert.equal(detectLang({ browser: ['uz-Latn-UZ', 'ru'] }), 'uz')
  assert.equal(detectLang({ browser: ['de-DE', 'ru-RU', 'en'] }), 'ru')
  assert.equal(detectLang({ browser: ['en-US'] }), 'en')
})

test('unsupported or missing platform language falls back to Russian', () => {
  assert.equal(detectLang({ browser: ['kk-KZ', 'tr'] }), 'ru')
  assert.equal(detectLang({ saved: 'fr' }), 'ru')
  assert.equal(detectLang(), 'ru')
})
