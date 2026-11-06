// Tests for the machinery in patterns/_template.strudel.js: each test builds a small piece from
// a control panel, the template's machinery block and some material, runs it through Strudel's
// real transpiler at chosen cycles (as if re-run with Ctrl+Enter then) and checks what plays.
//
//   node --test tools/*.test.mjs

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRepl } from './repl.mjs'

const template = readFileSync(new URL('../patterns/_template.strudel.js', import.meta.url), 'utf8')
const machinery = template.match(/\/\/ #region machinery v\d+\n[\s\S]*?\n\/\/ #endregion/)?.[0]
const repl = await createRepl()

const panel = ({ section = 1, play = {}, master = 1, bars }) => `
const section = ${section}
const play = { ${Object.entries(play).map(([name, v]) => `${name}: ${v}`).join(', ')} }
const master = ${master}
${bars ? `const bars = { ${Object.entries(bars).map(([n, line]) => `${n}: "${line}"`).join(', ')} }` : ''}
`
// Run a piece at cycle `at`, the way the performer re-runs the file.
const run = (controls, material, at) => repl.run(`${panel(controls)}\n${machinery}\n${material}`, { at })

// Every note that starts in [from, to): [cycle, sound], in order (the bar meter's and the preload's
// silent notes aside).
const onsets = (pattern, from, to) => pattern.queryArc(from, to)
  .filter(h => h.hasOnset() && !h.value.meter && !h.value.preload)
  .map(h => [Math.round(Number(h.whole.begin) * 1e9) / 1e9, h.value.s])
  .sort((a, b) => a[0] - b[0] || String(a[1]).localeCompare(String(b[1])))

const near = (actual, expected, label) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${label}: expected ${expected}, got ${actual}`)

// A fresh Strudel page: nothing playing, nothing remembered.
test.beforeEach(() => { delete globalThis.machinery; globalThis.heard = new Set() })

test('the template has a machinery block', () => {
  assert.ok(machinery, 'no // #region machinery vN … // #endregion block in the template')
})

const twoSections = `
piece('test', { bpm: 60, beats: 4 })
sections({ 1: { cycles: 3 }, 2: { cycles: 2 } })
voices({ v: { 1: sec => sec === 1 ? s("a") : s("<x y>") } })
`

test('a section change waits for the end of the pass, then the new section starts from its first beat', async () => {
  await run({ section: 1, play: { v: 1 } }, twoSections, 0)
  const { pattern } = await run({ section: 2, play: { v: 1 } }, twoSections, 1.5)
  assert.deepEqual(onsets(pattern, 0, 6), [[0, 'a'], [1, 'a'], [2, 'a'], [3, 'x'], [4, 'y'], [5, 'x']])
})

const withExits = `
piece('test', { bpm: 60, beats: 4 })
sections({ 1: { cycles: 4, exits: [2] }, 2: { cycles: 4 }, 3: { cycles: 4 } })
voices({ v: { 1: sec => s(['', 'a', 'b', 'c'][sec]) } })
`
// The cycle at which section 2 (sound b) takes over.
const handover = (pattern, until = 12) => onsets(pattern, 0, until).find(([, sound]) => sound !== 'a')

test('a section change lands at the next declared exit point', async () => {
  await run({ section: 1, play: { v: 1 } }, withExits, 0)
  assert.deepEqual(handover((await run({ section: 2, play: { v: 1 } }, withExits, 0.5)).pattern), [2, 'b'])
})

test('past the last declared exit point, a section change waits for the end of the pass', async () => {
  await run({ section: 1, play: { v: 1 } }, withExits, 0)
  assert.deepEqual(handover((await run({ section: 2, play: { v: 1 } }, withExits, 2.5)).pattern), [4, 'b'])
})

test('an exit point Strudel has already scheduled past is too late; the change waits for the next', async () => {
  await run({ section: 1, play: { v: 1 } }, withExits, 0)
  assert.deepEqual(handover((await run({ section: 2, play: { v: 1 } }, withExits, 1.95)).pattern), [4, 'b'])
})

test('re-running while a section change is pending keeps it where it was, even with exit points edited', async () => {
  const edited = withExits.replace('exits: [2]', 'exits: [2, 3]')
  await run({ section: 1, play: { v: 1 } }, withExits, 0)
  await run({ section: 2, play: { v: 1 } }, withExits, 2.5)
  await run({ section: 2, play: { v: 1 } }, edited, 2.6)
  const { pattern } = await run({ section: 2, play: { v: 1 } }, edited, 3.5)
  assert.deepEqual(handover(pattern), [4, 'b'])
})

test('choosing another section while a change is pending sends it there at the same exit point', async () => {
  await run({ section: 1, play: { v: 1 } }, withExits, 0)
  await run({ section: 2, play: { v: 1 } }, withExits, 2.5)
  const { pattern } = await run({ section: 3, play: { v: 1 } }, withExits, 3.5)
  assert.deepEqual(handover(pattern), [4, 'c'])
})

test('choosing the current section again before the exit point calls the change off', async () => {
  await run({ section: 1, play: { v: 1 } }, withExits, 0)
  await run({ section: 2, play: { v: 1 } }, withExits, 2.5)
  const { pattern } = await run({ section: 1, play: { v: 1 } }, withExits, 3)
  assert.equal(handover(pattern), undefined)
})

const phrased = (exit = '[4, 1]') => `
piece('test', { bpm: 60, beats: 4 })
sections({ 1: { cycles: 8 }, 2: { cycles: 8 } })
voices({
  v: { enter: [4, 1], exit: ${exit}, 1: s("one"), 2: s("two") },
  w: { 1: s("w") },
})
`
const soundsOf = (pattern, voice, from, to) => onsets(pattern, from, to).filter(([, s]) => s !== 'w')

test('a variant change waits for the voice\'s next exit point', async () => {
  await run({ play: { v: 1 } }, phrased(), 0)
  const { pattern } = await run({ play: { v: 2 } }, phrased(), 2)
  assert.deepEqual(soundsOf(pattern, 'v', 0, 7), [[0, 'one'], [1, 'one'], [2, 'one'], [3, 'one'], [4, 'one'], [5, 'two'], [6, 'two']])
})

test('0 silences a voice at its next exit point, and the rest play on', async () => {
  await run({ play: { v: 1, w: 1 } }, phrased(), 0)
  const { pattern } = await run({ play: { v: 0, w: 1 } }, phrased(), 2)
  assert.deepEqual(soundsOf(pattern, 'v', 2, 8), [[2, 'one'], [3, 'one'], [4, 'one']])
  assert.equal(onsets(pattern, 2, 8).filter(([, s]) => s === 'w').length, 6)
})

test('a silent voice comes in at its next entry point', async () => {
  await run({ play: { v: 0 } }, phrased(), 0)
  const { pattern } = await run({ play: { v: 1 } }, phrased(), 1.5)
  assert.deepEqual(soundsOf(pattern, 'v', 0, 7), [[5, 'one'], [6, 'one']])
})

test('a section change on the way is an exit and entry point for every voice', async () => {
  const material = `
piece('test', { bpm: 60, beats: 4 })
sections({ 1: { cycles: 6 }, 2: { cycles: 8 } })
voices({ v: { exit: [8, 0], 1: s("one"), 2: s("two") } })
`
  await run({ section: 1, play: { v: 1 } }, material, 0)
  await run({ section: 2, play: { v: 1 } }, material, 2)     // section 2 from cycle 6, the end of the pass
  const { pattern } = await run({ section: 2, play: { v: 2 } }, material, 2.5)   // v's own exit point is 8
  assert.deepEqual(onsets(pattern, 4, 8), [[4, 'one'], [5, 'one'], [6, 'two'], [7, 'two']])
})

test('re-running while a variant change is pending keeps it where it was, even with the voice\'s exit points edited', async () => {
  await run({ play: { v: 1 } }, phrased(), 0)
  await run({ play: { v: 2 } }, phrased(), 2)                // waits for 5
  await run({ play: { v: 2 } }, phrased('1'), 3)             // the sounding version keeps the exit points it came in with
  const { pattern } = await run({ play: { v: 2 } }, phrased('1'), 4)
  assert.deepEqual(soundsOf(pattern, 'v', 2, 7), [[2, 'one'], [3, 'one'], [4, 'one'], [5, 'two'], [6, 'two']])
})

test('a variant change waiting for the voice\'s exit point goes with a section change planned before it', async () => {
  const material = `
piece('test', { bpm: 60, beats: 4 })
sections({ 1: { cycles: 6 }, 2: { cycles: 8 } })
voices({ v: { exit: [8, 0], 1: s("one"), 2: s("two") } })
`
  await run({ section: 1, play: { v: 1 } }, material, 0)
  await run({ section: 1, play: { v: 2 } }, material, 2)     // waits for v's exit point, 8
  const { pattern } = await run({ section: 2, play: { v: 2 } }, material, 3)   // section 2 from 6
  assert.deepEqual(onsets(pattern, 4, 8), [[4, 'one'], [5, 'one'], [6, 'two'], [7, 'two']])
})

// Ramps: section 1 leaves over its last 4 beats (one cycle) into section 2 at a different tempo.
// The tempo moves along the curve in time; the expected times below come from the worked examples
// in the comments (linear: quadratic formula; ease: numerical integration of the tempo curve).
const ramp = (leave, bpm2) => `
piece('test', { bpm: 60, beats: 4 })
sections({ 1: { cycles: 2, leave: ${leave} }, 2: { cycles: 2, bpm: ${bpm2} } })
voices({
  v: { 1: sec => sec === 1 ? s("a*4") : s("b*4") },
  w: { 1: sec => sec === 1 ? s("c*4") : s("d*4") },
})
`
const rampTimes = async (leave, bpm2) => {
  await run({ section: 1, play: { v: 1, w: 1 } }, ramp(leave, bpm2), 0)
  const { pattern } = await run({ section: 2, play: { v: 1, w: 1 } }, ramp(leave, bpm2), 0.5)
  const all = onsets(pattern, 0, 5)
  return { a: all.filter(([, s]) => s === 'a').map(([t]) => t), c: all.filter(([, s]) => s === 'c').map(([t]) => t),
           b: all.filter(([, s]) => s === 'b').map(([t]) => t) }
}
const expectTimes = (actual, expected, label) => {
  assert.equal(actual.length, expected.length, `${label}: ${actual}`)
  expected.forEach((t, i) => near(actual[i], t, `${label} note ${i}`))
}

test('a linear ritardando stretches the last beats, every voice together, and lands on the exit point', async () => {
  // tempo 1 → 0.5 (cycles per clock cycle) over 1 cycle of music takes D = 2/(1 + 0.5) = 4/3 cycles;
  // music x(t) = t - (3/16)t², so music x lands at t = (16 - √(256 - 192x)) / 6:
  const { a, b, c } = await rampTimes(`{ shape: 'ritardando', beats: 4 }`, 30)
  const ramped = [1, 1 + (16 - Math.sqrt(208)) / 6, 1 + (16 - Math.sqrt(160)) / 6, 1 + (16 - Math.sqrt(112)) / 6]
  expectTimes(a, [0, 0.25, 0.5, 0.75, ...ramped], 'a')
  expectTimes(c, [0, 0.25, 0.5, 0.75, ...ramped], 'c')
  const exit = 1 + 4 / 3
  near(b[0], exit, 'section 2 starts at the exit point')
  near(b[1] - b[0], 0.5, 'section 2 plays at half the clock tempo')
})

test('a linear accelerando squeezes the last beats and lands on the exit point', async () => {
  // tempo 1 → 2 over 1 cycle of music: D = 2/3; x(t) = t + (3/4)t², so 3t² + 4t - 4x = 0
  const { a, b } = await rampTimes(`{ shape: 'accelerando', beats: 4 }`, 120)
  expectTimes(a.slice(4), [1, 1 + (-4 + Math.sqrt(28)) / 6, 1 + (-4 + Math.sqrt(40)) / 6, 1 + (-4 + Math.sqrt(52)) / 6], 'a')
  near(b[0], 1 + 2 / 3, 'section 2 starts at the exit point')
  near(b[1] - b[0], 0.125, 'section 2 plays at twice the clock tempo')
})

test('an eased ritardando changes tempo slowly at first and last, and lands on the same exit point', async () => {
  const { a, b } = await rampTimes(`{ shape: 'ritardando', beats: 4, curve: 'ease' }`, 30)
  expectTimes(a.slice(4), [1, 1.254178349, 1.534304516, 1.877502674], 'a')
  near(b[0], 1 + 4 / 3, 'section 2 starts at the exit point')
})

test('an eased accelerando', async () => {
  const { a, b } = await rampTimes(`{ shape: 'accelerando', beats: 4, curve: 'ease' }`, 120)
  expectTimes(a.slice(4), [1, 1.227915329, 1.399514409, 1.539577492], 'a')
  near(b[0], 1 + 2 / 3, 'section 2 starts at the exit point')
})

test('a ramp with no length given takes the rest of the pass, from the next beat', async () => {
  // changed at 0.5: the ramp runs from beat 0.75 to the exit point at 2, 1.25 cycles of music
  // at tempo 1 → 0.5, so it takes 2·1.25/1.5 = 5/3 cycles
  const { a, b } = await rampTimes(`'ritardando'`, 30)
  near(a[3], 0.75, 'the ramp starts on a beat')
  near(b[0], 0.75 + 5 / 3, 'section 2 starts at the exit point')
})

test('a ritardando into a section at the same tempo slows by a quarter, then the section starts a tempo', async () => {
  // tempo 1 → 0.75 over the last cycle: D = 2/1.75 = 8/7
  const { b } = await rampTimes(`{ shape: 'ritardando', beats: 4 }`, 60)
  near(b[0], 1 + 8 / 7, 'section 2 starts at the exit point')
  near(b[1] - b[0], 0.25, 'section 2 plays at its own tempo')
})

test('each section plays at its own tempo, against the piece\'s clock', async () => {
  const { b } = await rampTimes(`'plain'`, 90)
  near(b[0], 2, 'a plain handover lands on the exit point')
  near(b[1] - b[0], 0.25 * 60 / 90, 'section 2 plays at 90 bpm against a 60 bpm clock')
})

test('a ramp already under way can\'t be called off: choosing the current section again restarts it after the ramp', async () => {
  const material = ramp(`{ shape: 'ritardando', beats: 4 }`, 30)
  await run({ section: 1, play: { v: 1, w: 1 } }, material, 0)
  await run({ section: 2, play: { v: 1, w: 1 } }, material, 0.5)
  const { pattern } = await run({ section: 1, play: { v: 1, w: 1 } }, material, 1.5)
  const a = onsets(pattern, 1, 4).filter(([, s]) => s === 'a').map(([t]) => t)
  near(a[3], 1 + (16 - Math.sqrt(112)) / 6, 'the ramp goes on')
  near(a[4], 1 + 4 / 3, 'section 1 starts again at the exit point')
  near(a[5] - a[4], 0.25, 'at its own tempo')
})

// ---- slips ----

const slips = `
piece('test', { bpm: 60, beats: 4 })
sections({ 1: { cycles: 2 }, 2: { cycles: 2 } })
voices({ v: { 1: sec => s(sec === 1 ? "a" : "b"), 2: s("c") } })
`
const allA = [0, 1, 2, 3, 4, 5, 6, 7].map(t => [t, 'a'])

test('an unknown variant changes nothing audible and says why in the console', async () => {
  await run({ play: { v: 1 } }, slips, 0)
  const after = await run({ play: { v: 7 } }, slips, 0.5)
  assert.deepEqual(onsets(after.pattern, 0, 8), allA)
  assert.match(after.logs.join('\n'), /no v variant 7.*variants: 1, 2.*v plays variant 1 on/)
})

test('an unknown section changes nothing audible and says why in the console', async () => {
  await run({ section: 1, play: { v: 1 } }, slips, 0)
  const after = await run({ section: 9, play: { v: 1 } }, slips, 0.5)
  assert.deepEqual(onsets(after.pattern, 0, 8), allA)
  assert.match(after.logs.join('\n'), /no section 9.*sections: 1, 2.*section 1 plays on/)
})

test('a control panel entry naming no voice is reported', async () => {
  const { logs } = await run({ play: { v: 1, vv: 1 } }, slips, 0)
  assert.match(logs.join('\n'), /no voice vv/)
})

test('master scales every voice', async () => {
  const material = `
piece('test', { bpm: 60, beats: 4 })
sections({ 1: { cycles: 1 } })
voices({ v: { 1: s("a") }, w: { 1: s("b").postgain(0.5) } })
`
  const { pattern } = await run({ play: { v: 1, w: 1 }, master: 0.5 }, material, 0)
  const level = Object.fromEntries(pattern.queryArc(0, 1).map(h => [h.value.s, h.value.postgain]))
  assert.deepEqual(level, { a: 0.5, b: 0.25 })
})

test('a master outside 0..1 is ignored and reported', async () => {
  const material = `
piece('test', { bpm: 60, beats: 4 })
sections({ 1: { cycles: 1 } })
voices({ v: { 1: s("a") } })
`
  await run({ play: { v: 1 }, master: 0.5 }, material, 0)
  const { pattern, logs } = await run({ play: { v: 1 }, master: 5 }, material, 0.5)
  assert.equal(pattern.queryArc(1, 2)[0].value.postgain, 0.5)
  assert.match(logs.join('\n'), /master 5/)
})

// ---- memory ----

// Each run's material is a fresh pattern; these count which run's patterns still get played.
const counted = `
const run_ = globalThis.runs = (globalThis.runs ?? 0) + 1
const heard = pat => new Pattern(state => { globalThis.heard.add(run_); return pat.query(state) })
piece('test', { bpm: 60, beats: 4 })
sections({ 1: { cycles: 2, exits: [1] }, 2: { cycles: 2, leave: 'ritardando' } })
voices({ v: { 1: heard(s("a")), 2: heard(s("b")) }, w: { enter: [2, 1], exit: [2, 1], 1: heard(s("c")) } })
`
const longSet = async () => {
  globalThis.runs = 0
  let at = 0
  for (let i = 0; i < 300; i++, at += 0.7) {
    await run({ section: 1 + (i % 3 === 0), play: { v: 1 + (i % 2), w: i % 5 ? 1 : 0 } }, counted, at)
    const p = globalThis.machinery.pieces.test
    for (const kept of [p.sections, ...Object.values(p.voices)]) {
      // at most one finishing its handover, the current one, and one waiting for its point
      assert.ok(kept.length <= 3 && kept.every(k => k.to > at), `run ${i} at ${at}: kept ${JSON.stringify(kept.map(k => [k.from, k.to]))}`)
    }
  }
  return at
}

test('re-running for a long set keeps nothing whose handover has passed', async () => {
  // Settled: one section, and per voice the version playing plus the one this run queued for its
  // next exit point (a re-run's material, edited or not, takes over there).
  let at = await longSet()
  await run({ section: 1, play: { v: 1, w: 1 } }, counted, at += 10)
  await run({ section: 1, play: { v: 1, w: 1 } }, counted, at += 10)
  const p = globalThis.machinery.pieces.test
  assert.deepEqual([p.sections, ...Object.values(p.voices)].map(kept => kept.length), [1, 2, 2])
})

test('after a long set, only the latest runs\' patterns are still played', async () => {
  const at = await longSet()
  const { pattern } = await run({ section: 1, play: { v: 1, w: 1 } }, counted, at + 10)
  globalThis.heard = new Set()
  pattern.queryArc(at + 10, at + 20)
  assert.deepEqual([...globalThis.heard].sort((a, b) => a - b), [300, 301])
})

test('stopping and starting Strudel (time back at 0) starts the piece afresh', async () => {
  await run({ section: 1, play: { v: 1 } }, slips, 0)
  await run({ section: 2, play: { v: 2 } }, slips, 7)
  const { pattern } = await run({ section: 1, play: { v: 1 } }, slips, 0)
  assert.deepEqual(onsets(pattern, 0, 2), [[0, 'a'], [1, 'a']])
})

// ---- from one piece to the next (ADR 0001) ----

const pieceOne = `
piece('one', { bpm: 60, beats: 4 })
sections({ 1: { cycles: 4 } })
voices({ v: { 1: s("a") } })
`
const pieceTwo = (bpm = 60) => `
piece('two', { bpm: ${bpm}, beats: 4 })
sections({ 1: { cycles: 2 } })
voices({ w: { 1: s("b") } })
`

test('running the next piece\'s file lets the outgoing piece finish its pass, then the new one starts', async () => {
  await run({ play: { v: 1 } }, pieceOne, 0)
  const { pattern } = await run({ play: { w: 1 } }, pieceTwo(), 1.5)
  assert.deepEqual(onsets(pattern, 0, 7), [[0, 'a'], [1, 'a'], [2, 'a'], [3, 'a'], [4, 'b'], [5, 'b'], [6, 'b']])
})

test('once the handover has passed, the outgoing piece is forgotten', async () => {
  await run({ play: { v: 1 } }, pieceOne, 0)
  await run({ play: { w: 1 } }, pieceTwo(), 1.5)
  await run({ play: { w: 1 } }, pieceTwo(), 5)
  assert.deepEqual(Object.keys(globalThis.machinery.pieces), ['two'])
})

test('the file run last comes in last: the outgoing piece run again comes back afresh after the incoming one', async () => {
  // one plays to 4; two, run at 1.5, plays its pass to its first exit point (6); one, run again at 2, then
  await run({ play: { v: 1 } }, pieceOne, 0)
  await run({ play: { w: 1 } }, pieceTwo(), 1.5)
  const { pattern } = await run({ play: { v: 1 } }, pieceOne, 2)
  assert.deepEqual(onsets(pattern, 2, 8), [[2, 'a'], [3, 'a'], [4, 'b'], [5, 'b'], [6, 'a'], [7, 'a']])
})

test('running a piece again while it waits its turn changes nothing: it still starts once, after the other', async () => {
  // Strudel VS runs the file twice for one Cmd+Enter, a few milliseconds apart
  await run({ play: { v: 1 } }, pieceOne, 0)
  await run({ play: { w: 1 } }, pieceTwo(), 1.5)
  const { pattern } = await run({ play: { w: 1 } }, pieceTwo(), 1.502)
  assert.deepEqual(onsets(pattern, 1.5, 7), [[2, 'a'], [3, 'a'], [4, 'b'], [5, 'b'], [6, 'b']])
})

test('the next piece plays at its own tempo against the running clock', async () => {
  await run({ play: { v: 1 } }, pieceOne, 0)
  const { pattern } = await run({ play: { w: 1 } }, pieceTwo(120), 1.5)
  assert.deepEqual(onsets(pattern, 4, 6).map(([t]) => t), [4, 4.5, 5, 5.5])
})

test('the next piece plays at its own tempo even with a different number of beats in a cycle', async () => {
  // piece one: 60 bpm, 4 beats a cycle, so a clock cycle is 4 seconds; piece two: 60 bpm, 8 beats a
  // cycle, so each of its cycles takes two clock cycles
  await run({ play: { v: 1 } }, pieceOne, 0)
  const { pattern } = await run({ play: { w: 1 } }, pieceTwo().replace('beats: 4', 'beats: 8'), 1.5)
  assert.deepEqual(onsets(pattern, 4, 8).map(([t]) => t), [4, 6])
})

test('a piece run again after it has handed over starts afresh, once the playing piece reaches its exit point', async () => {
  await run({ play: { v: 1 } }, pieceOne, 0)
  await run({ play: { w: 1 } }, pieceTwo(), 1.5)        // one plays to 4, then two
  const { pattern } = await run({ play: { v: 1 } }, pieceOne, 5)
  assert.deepEqual(onsets(pattern, 5, 8), [[5, 'b'], [6, 'a'], [7, 'a']])
})

const toTheEnd = `
piece('interlude', { bpm: 60, beats: 4 })
sections({ 1: { cycles: 2, then: 3 }, 3: { cycles: 1, then: 0 } })
voices({ x: { 1: sec => s(sec === 1 ? "r" : "i") } })
`

test('a piece run while another is on its way to its end waits for that end', async () => {
  await run({ play: { x: 1 } }, toTheEnd, 0)
  const { pattern } = await run({ play: { w: 1 } }, pieceTwo(), 0.5)
  assert.deepEqual(onsets(pattern, 0, 6), [[0, 'r'], [1, 'r'], [2, 'i'], [3, 'b'], [4, 'b'], [5, 'b']])
})

test('a piece set to end (section 0) plays out its pass before the next piece starts', async () => {
  await run({ play: { v: 1 } }, pieceOne.replace('cycles: 4', 'cycles: 4, exits: [2]'), 0)
  await run({ section: 0, play: { v: 1 } }, pieceOne.replace('cycles: 4', 'cycles: 4, exits: [2]'), 0.5)
  const { pattern } = await run({ play: { w: 1 } }, pieceTwo(), 1)
  assert.deepEqual(onsets(pattern, 1, 6), [[1, 'a'], [2, 'a'], [3, 'a'], [4, 'b'], [5, 'b']])
})

test('handing over, the outgoing piece leaves as if ended: its handover shape, its close, then the next piece', async () => {
  // a ritardando over the last cycle, 1 -> 3/4 (a quarter slower, as there is no next section): the
  // exit point comes at 1 + 8/7; the half cycle of close then takes 2/3 of a clock cycle
  const slowing = `
piece('one', { bpm: 60, beats: 4 })
sections({ 1: { cycles: 2, close: 0.5, leave: { shape: 'ritardando', beats: 4 } } })
voices({ v: { 1: (sec, part) => part === 'close' ? s("fin ~") : s("a") } })
`
  await run({ play: { v: 1 } }, slowing, 0)
  const { pattern } = await run({ play: { w: 1 } }, pieceTwo(), 0.5)
  const all = onsets(pattern, 0, 5)
  near(all.find(([, s]) => s === 'fin')[0], 1 + 8 / 7, 'the close comes after the slowed exit point')
  near(all.find(([, s]) => s === 'b')[0], 1 + 8 / 7 + 2 / 3, 'the next piece starts after the close')
})

test('a round trip through an interlude: the piece run again waits for the interlude\'s end, then starts afresh', async () => {
  // one plays to 4, the interlude 4-7 (r r i), then one again, run before its own handover
  await run({ play: { v: 1 } }, pieceOne, 0)
  await run({ play: { x: 1 } }, toTheEnd, 1.5)
  const { pattern } = await run({ play: { v: 1 } }, pieceOne, 2)
  assert.deepEqual(onsets(pattern, 2, 9), [[2, 'a'], [3, 'a'], [4, 'r'], [5, 'r'], [6, 'i'], [7, 'a'], [8, 'a']])
})

// ---- v2: a section's close, the end of a piece (section 0), the bar meter ----

const closing = (extra = '') => `
piece('test', { bpm: 60, beats: 4 })
sections({
  1: { cycles: 2, close: 0.5${extra} },
  2: { cycles: 2, bpm: 30 },
  3: { cycles: 2 },
})
voices({ v: { 1: (sec, part) => part === 'close' ? s("fin ~") : s(['', 'a', 'b', 'c'][sec]) } })
`

test('staying on a section never plays its close: pass follows pass', async () => {
  const { pattern } = await run({ section: 1, play: { v: 1 } }, closing(), 0)
  assert.deepEqual(onsets(pattern, 0, 6), [0, 1, 2, 3, 4, 5].map(t => [t, 'a']))
})

test('leaving a section plays its close after the exit point, then the next section', async () => {
  await run({ section: 1, play: { v: 1 } }, closing(), 0)
  const { pattern } = await run({ section: 3, play: { v: 1 } }, closing(), 0.5)
  assert.deepEqual(onsets(pattern, 0, 5), [[0, 'a'], [1, 'a'], [2, 'fin'], [2.5, 'c'], [3.5, 'c'], [4.5, 'c']])
})

test('the close plays at the tempo its section\'s handover shape ended on', async () => {
  // a ritardando over the last cycle, 1 -> 0.5 (section 2's tempo): it ends at 1 + 4/3; the half
  // cycle of close then takes a whole clock cycle at half speed
  const material = closing(", leave: { shape: 'ritardando', beats: 4 }")
  await run({ section: 1, play: { v: 1 } }, material, 0)
  const { pattern } = await run({ section: 2, play: { v: 1 } }, material, 0.5)
  const all = onsets(pattern, 0, 5)
  near(all.find(([, s]) => s === 'fin')[0], 1 + 4 / 3, 'the close starts at the exit point')
  near(all.find(([, s]) => s === 'b')[0], 1 + 4 / 3 + 1, 'the next section starts after the slowed close')
})

test('choosing another section while the close plays keeps the close and changes what follows it', async () => {
  await run({ section: 1, play: { v: 1 } }, closing(), 0)
  await run({ section: 2, play: { v: 1 } }, closing(), 0.5)
  const { pattern } = await run({ section: 3, play: { v: 1 } }, closing(), 2.1)
  assert.deepEqual(onsets(pattern, 2, 4), [[2, 'fin'], [2.5, 'c'], [3.5, 'c']])
})

test('choosing the current section again before its exit point calls off the close as well', async () => {
  await run({ section: 1, play: { v: 1 } }, closing(), 0)
  await run({ section: 3, play: { v: 1 } }, closing(), 0.5)
  const { pattern } = await run({ section: 1, play: { v: 1 } }, closing(), 1)
  assert.deepEqual(onsets(pattern, 1, 5), [1, 2, 3, 4].map(t => [t, 'a']))
})

test('section 0 ends the piece: the section leaves with its close, then silence', async () => {
  await run({ section: 1, play: { v: 1 } }, closing(), 0)
  const { pattern, logs } = await run({ section: 0, play: { v: 1 } }, closing(), 0.5)
  assert.deepEqual(onsets(pattern, 0, 8), [[0, 'a'], [1, 'a'], [2, 'fin']])
  assert.deepEqual(logs, [])
})

test('section 0 waits for the end of the pass, past the section\'s exit points: the piece plays out', async () => {
  await run({ section: 1, play: { v: 1 } }, withExits, 0)
  await run({ section: 2, play: { v: 1 } }, withExits, 0.5)     // waiting for the exit point at 2…
  const { pattern } = await run({ section: 0, play: { v: 1 } }, withExits, 1)
  assert.deepEqual(onsets(pattern, 1, 8), [1, 2, 3].map(t => [t, 'a']))
})

test('after the end, choosing a section starts it on the next cycle, from its first beat', async () => {
  await run({ section: 1, play: { v: 1 } }, closing(), 0)
  await run({ section: 0, play: { v: 1 } }, closing(), 0.5)
  const ended = await run({ section: 0, play: { v: 1 } }, closing(), 3)
  assert.deepEqual(onsets(ended.pattern, 3, 6), [], 'silence after the end')
  const { pattern } = await run({ section: 3, play: { v: 1 } }, closing(), 4.3)
  assert.deepEqual(onsets(pattern, 4.3, 7), [[5, 'c'], [6, 'c']])
})

test('a piece run with section 0 plays nothing', async () => {
  const { pattern } = await run({ section: 0, play: { v: 1 } }, closing(), 0)
  assert.deepEqual(onsets(pattern, 0, 4), [])
})

// The bar meter: one step per bar of the current section's pass, silent, carrying the panel line's
// own source positions so Strudel VS's highlighting lights its marks (an ASCII letter: ▮ isn't mini-notation, and VS Code boxes look-alike characters such as ǀ in orange).
const metered = `
piece('test', { bpm: 60, beats: 4, bar: 2 })
sections({ 1: { cycles: 2, close: 0.5 }, 2: { cycles: 1 } })
voices({ v: { 1: s("a") } })
`
const meterSteps = (pattern, from, to) => pattern.queryArc(from, to)
  .filter(h => h.hasOnset() && h.value.meter)
  .map(h => [Number(h.whole.begin), Number(h.whole.end), h.context.locations?.[0]?.start, h.value.gain])

test('the bar meter fills its line from the left, each step lasting from its bar to the end of the pass', async () => {
  const { pattern } = await run({ section: 1, play: { v: 1 }, bars: { 1: 'I I I I', 2: 'I I' } }, metered, 0)
  const steps = meterSteps(pattern, 0, 4)
  assert.deepEqual(steps.map(([a, b]) => [a, b]), [[0, 2], [0.5, 2], [1, 2], [1.5, 2], [2, 4], [2.5, 4], [3, 4], [3.5, 4]])
  assert.ok(steps.every(([, , , gain]) => gain === 0), 'the meter is silent')
  const starts = steps.slice(0, 4).map(([, , start]) => start)
  assert.ok(starts.every(Number.isFinite) && new Set(starts).size === 4, `each step carries its own mark's position: ${starts}`)
})

test('the bar meter shows nothing during a close', async () => {
  const bars = { 1: 'I I I I', 2: 'I I' }
  await run({ section: 1, play: { v: 1 }, bars }, metered, 0)
  const { pattern } = await run({ section: 2, play: { v: 1 }, bars }, metered, 0.5)
  // section 1's pass ends at 2, its close runs to 2.5, then section 2's one-cycle pass
  assert.deepEqual(meterSteps(pattern, 2, 3).map(([a, b]) => [a, b]), [[2.5, 3.5]])
})

test('set to step, the bar meter lights one bar at a time', async () => {
  const stepping = machinery.replace("const meter = 'fill'", "const meter = 'step'")
  assert.notEqual(stepping, machinery, 'the machinery has a meter switch')
  const { pattern } = await repl.run(`${panel({ section: 1, play: { v: 1 }, bars: { 1: 'I I I I', 2: 'I I' } })}\n${stepping}\n${metered}`, { at: 0 })
  assert.deepEqual(meterSteps(pattern, 0, 2).map(([a, b]) => [a, b]), [[0, 0.5], [0.5, 1], [1, 1.5], [1.5, 2]])
})

// A section that moves on by itself: `then: n` plays one pass, leaves with its handover shape and
// close, and goes to section n, unless the panel asks for another section first (the interlude's
// build, then its impact, then silence).
const moving = (extra = '') => `
piece('test', { bpm: 60, beats: 4 })
sections({ 1: { cycles: 2, then: 3${extra} }, 2: { cycles: 1 }, 3: { cycles: 1, then: 0, close: 1 } })
voices({ v: { 1: (sec, part) => part === 'close' ? s("fin") : s(['', 'a', 'b', 'c'][sec]) } })
`

test('a section with then plays one pass and moves on by itself, down a chain to the end', async () => {
  const { pattern } = await run({ section: 1, play: { v: 1 } }, moving(), 0)
  assert.deepEqual(onsets(pattern, 0, 8), [[0, 'a'], [1, 'a'], [2, 'c'], [3, 'fin']])
})

test('re-running with the panel unchanged doesn\'t call back a section that has moved on', async () => {
  await run({ section: 1, play: { v: 1 } }, moving(), 0)
  const { pattern, logs } = await run({ section: 1, play: { v: 1 } }, moving(), 2.5)
  assert.deepEqual(onsets(pattern, 2, 8), [[2, 'c'], [3, 'fin']])
  assert.deepEqual(logs, [])
})

test('choosing another section during a then-section\'s pass goes there instead, at the end of the pass', async () => {
  await run({ section: 1, play: { v: 1 } }, moving(), 0)
  const { pattern } = await run({ section: 2, play: { v: 1 } }, moving(), 0.5)
  assert.deepEqual(onsets(pattern, 0, 5), [[0, 'a'], [1, 'a'], [2, 'b'], [3, 'b'], [4, 'b']])
})

test('choosing a then-section again puts it back on its way', async () => {
  await run({ section: 1, play: { v: 1 } }, moving(), 0)
  await run({ section: 2, play: { v: 1 } }, moving(), 0.5)
  const { pattern } = await run({ section: 1, play: { v: 1 } }, moving(), 0.8)
  assert.deepEqual(onsets(pattern, 0, 8), [[0, 'a'], [1, 'a'], [2, 'c'], [3, 'fin']])
})

test('a then-section arriving later takes its whole pass for a handover shape of no given length', async () => {
  // section 2 is reached at cycle 1; its accelerando, 1 -> 4/3, runs over its two cycles from there
  const material = `
piece('test', { bpm: 60, beats: 4 })
sections({ 1: { cycles: 1 }, 2: { cycles: 2, then: 0, leave: 'accelerando' } })
voices({ v: { 1: sec => sec === 1 ? s("a") : s("b*4") } })
`
  await run({ section: 1, play: { v: 1 } }, material, 0)
  const { pattern } = await run({ section: 2, play: { v: 1 } }, material, 0.5)
  const b = onsets(pattern, 0, 6).filter(([, s]) => s === 'b')
  assert.equal(b.length, 8)
  near(b[0][0], 1, 'section 2 starts on its first beat')
  // music x = t + t² (4/3 - 1) / 2D over the ramp's D = 12/7 clock cycles: the second beat (x = 1/4) at
  const t = (-1 + Math.sqrt(1 + 4 * (7 / 72) / 4)) / (2 * 7 / 72)
  near(b[1][0] - b[0][0], t, 'speeding up from its first beat, not before it')
  assert.ok(b.at(-1)[0] < 1 + 12 / 7, `the squeezed pass ends by ${1 + 12 / 7}: ${b.at(-1)[0]}`)
})

test('a then naming no section is ignored and reported', async () => {
  const material = moving().replace('then: 3', 'then: 9')
  const { pattern, logs } = await run({ section: 1, play: { v: 1 } }, material, 0)
  assert.deepEqual(onsets(pattern, 0, 4), [0, 1, 2, 3].map(t => [t, 'a']))
  assert.match(logs.join('\n'), /then: 9/)
})

// The preload: on a piece's first run, one silent note of every sound of every variant, as soon as
// possible, so Strudel has fetched its samples before they're needed. Found in the background.
const settle = () => new Promise(resolve => setTimeout(resolve, 50))
const preloads = (pattern, from, to) => pattern.queryArc(from, to)
  .filter(h => h.hasOnset() && h.value.preload)
  .map(h => [Math.round(Number(h.whole.begin) * 1e9) / 1e9, [h.value.bank, h.value.s].filter(Boolean).join('_'), h.value.gain])
  .sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
const kit = `
piece('kit', { bpm: 60, beats: 4 })
sections({ 1: { cycles: 2 }, 2: { cycles: 2, close: 1 } })
voices({
  v: { 1: s("a"), 2: (sec, part) => s(part === 'close' ? "fin" : sec === 1 ? "b" : "c") },
  w: { 1: s("d").bank("X") },
  tone: { 1: note("c e g").s("sine") },
})
`

test('on its first run a piece plays every variant\'s sounds once, silently, straight away', async () => {
  await run({ section: 1, play: { v: 1 } }, kit, 2.3)
  await settle()
  const { pattern } = await run({ section: 1, play: { v: 1 } }, kit, 2.3)
  const at = 2.3 + 1 / 8
  assert.deepEqual(preloads(pattern, 2, 4), ['X_d', 'a', 'b', 'c', 'fin'].map(name => [at, name, 0]))
})

test('the preload happens once: re-running the piece doesn\'t repeat it', async () => {
  await run({ section: 1, play: { v: 1 } }, kit, 0)
  await settle()
  const { pattern } = await run({ section: 1, play: { v: 2 } }, kit, 1)
  await settle()
  assert.deepEqual(preloads(pattern, 1, 4), [])
})

test('a piece handed over to preloads at once, not at the handover, and skips sounds already fetched', async () => {
  await run({ play: { v: 1 } }, pieceOne, 0)
  await settle()
  await run({ play: { w: 1 } }, pieceTwo().replace('s("b")', 's("a b")'), 1.5)
  await settle()
  const { pattern } = await run({ play: { w: 1 } }, pieceTwo().replace('s("b")', 's("a b")'), 1.5)
  assert.deepEqual(preloads(pattern, 1.5, 4), [[1.5 + 1 / 8, 'b', 0]])
})
