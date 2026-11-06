// Canon in D on the machinery: what the performer hears when staying on, leaving and ending section 6.
// Runs patterns/02-canon-in-d.strudel.js itself, with the control panel set by each test.
//
//   node --test tools/*.test.mjs
//   CANON=<file> node --test tools/canon.test.mjs     (the same tests against another copy)

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRepl } from './repl.mjs'

const file = process.env.CANON ?? new URL('../patterns/02-canon-in-d.strudel.js', import.meta.url).pathname
const source = readFileSync(file, 'utf8')
const repl = await createRepl()

// the file as the performer would have it: one section, and these voices playing
const panel = (section, voices) => source
  .replace(/^const section = \d+/m, `const section = ${section}`)
  .replace(/^const play = \{[\s\S]*?^\}/m, `const play = { ${voices.map(v => `${v}: 1`).join(', ')} }`)
const run = (section, voices, at) => repl.run(panel(section, voices), { at })
const onsets = (pattern, from, to, s) => pattern.queryArc(from, to)
  .filter(h => h.hasOnset() && !h.value.meter && !h.value.preload && (!s || h.value.s === s))
  .map(h => Number(h.whole.begin))

test.beforeEach(() => { delete globalThis.machinery })

test('staying on section 6 plays pass after pass with no gap (the bug Luke heard)', async () => {
  const { pattern } = await run(6, ['cello'], 0)
  const cello = onsets(pattern, 0, 12, 'gm_cello')
  const gaps = cello.slice(1).map((t, i) => t - cello[i])
  assert.ok(gaps.every(g => g <= 0.125 + 1e-9), `the cello stops for ${Math.max(...gaps)} cycles at ${cello[gaps.indexOf(Math.max(...gaps))]}`)
})

test('leaving section 6 slows into the final chord, then the Gigue starts', async () => {
  await run(6, ['cello', 'v1'], 0)
  const { pattern } = await run(7, ['cello', 'v1'], 1)
  const notes = pattern.queryArc(3.9, 8).filter(h => h.hasOnset() && !h.value.meter && !h.value.preload)
    .map(h => [Number(h.whole.begin), h.value.s, h.value.note])
  const chord = notes.filter(([, , n]) => n === 'd3' || n === 'a4')
  assert.ok(chord.length >= 2, `bar 57's chord (cello d3, violin a4) sounds: ${JSON.stringify(notes.slice(0, 6))}`)
  const gigue = notes.find(([t, s, n]) => s === 'gm_cello' && t > chord[0][0])
  assert.ok(gigue && gigue[0] - chord[0][0] > 0.4, 'the Gigue starts after the chord and a breath')
})

test('section 0 from section 6 ends the piece on bar 57\'s final chord', async () => {
  await run(6, ['cello', 'v1', 'v2'], 0)
  const { pattern } = await run(0, ['cello', 'v1', 'v2'], 1)
  const last = Math.max(...onsets(pattern, 1, 40))
  assert.ok(last < 6, `the piece ends at the end of this pass, not at ${last}`)
  const final = pattern.queryArc(last, last + 0.01).filter(h => h.hasOnset()).map(h => h.value.note).sort()
  assert.deepEqual(final, ['a4', 'd3', 'f#5'])
})
