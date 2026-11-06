// Offline check for a pattern file: runs it through Strudel's own transpiler and engine (no
// audio) and reports every voice and variant, playing or not, so mistakes show up before you press play.
//
//   node tools/check.mjs patterns/_template.strudel.js
//   node tools/check.mjs <file> --cycles 16
//   node tools/check.mjs <file> --harmony "d f# a|c# e a|b d f#|a c# f#|b d g|a d f#|b d g|a c# e"
//   node tools/check.mjs <file> --sections 1-6      (a piece on the machinery: only these sections)
//
// --harmony lists the chord in each equal slot of a cycle (separated by |). Notes that start on
// a slot's first beat and aren't in its chord get flagged; passing notes in between are fine.
// For a piece on the machinery it also flags control panel values that name no section, voice or
// variant, warns when the loudest variants together could clip (section by section: a voice resting
// in a section adds nothing there), flags a bar meter line whose marks
// don't match its section's bars, and flags a machinery block that differs from the template's.
// It flags a gm_ soundfont name Strudel VS doesn't have (tools/gm-sounds.json).
// Not checked: whether samples and banks exist, and anything you can only hear (the mix, reverb tails).

import { readFileSync } from 'node:fs'
import { createRepl, core } from './repl.mjs'

const args = process.argv.slice(2)
const file = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'))
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const cycles = Number(opt('--cycles') ?? 8)
const onlySections = opt('--sections')?.split(',').flatMap(r => {
  const [a, b = a] = r.split('-').map(Number); return Array.from({ length: b - a + 1 }, (_, i) => String(a + i))
})
const harmony = opt('--harmony')?.split('|').map(c => c.trim().split(/\s+/).map(n => core.noteToMidi(n + '3') % 12))
if (!file) { console.error('usage: node tools/check.mjs <pattern file> [--cycles n] [--harmony "chord|chord|…"] [--sections 1-3,5]'); process.exit(2) }

const source = readFileSync(file, 'utf8')
const labelLines = [...source.matchAll(/^(_?[A-Za-z$][\w$]*_?):(?!:)/gm)]
  .map(m => ({ label: m[1], line: source.slice(0, m.index).split('\n').length }))

const voices = []                                    // every labelled line, captured before muting
core.Pattern.prototype.__voice = function (label) { voices.push({ label, pat: this }); return this }
const repl = await createRepl()
let mix, logs
try {
  ({ pattern: mix, logs } = await repl.run(source, { rewrite: code => code.replace(/\.p\('([^']*)'\)/g, ".__voice('$1').p('$1')") }))
} catch (err) {
  if (err.stage === 'transpile') {
    console.error(`✗ transpile failed: ${err.message}`)
    console.error('  (Double quotes and backticks are mini-notation in Strudel: use single quotes for plain JS strings.)')
  } else console.error(`✗ evaluation failed: ${err.message}`)
  process.exit(1)
}

const midiName = m => (m = Math.round(m), `${['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'][m % 12]}${Math.floor(m / 12) - 1}`)
const toMidi = v => typeof v === 'number' ? v : core.noteToMidi(String(v))
const round = x => +x.toFixed(2)
// Strudel VS's General MIDI soundfonts (copied from its bundle; check.test.mjs keeps the copy in step).
// A name it doesn't have only shows when played, as "sound … not found".
const soundfonts = JSON.parse(readFileSync(new URL('./gm-sounds.json', import.meta.url), 'utf8')).names
const words = name => name.split('_').slice(1)
const nearest = name => soundfonts       // most words shared, the instrument (the last word) counting most
  .map(n => [n, words(n).filter(w => words(name).includes(w)).length + 2 * (words(n).at(-1) === words(name).at(-1))])
  .filter(([, shared]) => shared)
  .sort((a, b) => b[1] - a[1] || a[0].length - b[0].length).slice(0, 4).map(([n]) => n)
let problems = 0
const problem = msg => { console.log(msg); problems++ }

// One voice (or variant): notes per cycle, range, sounds, and anything suspicious. Returns its peak
// level: the most its notes add up to at any one moment (superdough's default gain is 0.8), or
// undefined when it rests and resting is allowed (a variant silent in some sections on purpose).
function describe(label, pat, where = '', mayRest = false) {
  const warn = []
  let haps
  try {
    haps = pat.queryArc(0, cycles).filter(h => h.hasOnset())
  } catch (err) {
    problem(`✗ ${label}${where}: query failed: ${err.message}`); return 0
  }
  if (!haps.length && mayRest) { console.log(`  ${label}${where}: rests`); return undefined }
  const sounds = [...new Set(haps.map(h => [h.value.s, h.value.bank].filter(Boolean).join('@')).filter(Boolean))]
  const midis = haps.filter(h => h.value.note !== undefined).map(h => toMidi(h.value.note))
  if (!haps.length) warn.push('no notes at all')
  const miniNames = sounds.filter(n => /[\s<>[\]~*,]/.test(n))
  if (miniNames.length) warn.push(`sound name${miniNames.length > 1 ? 's' : ''} ${miniNames.join(', ')}: a string in single quotes isn't mini-notation, so Strudel looks for a sound called that; use double quotes`)
  for (const name of new Set(haps.map(h => String(h.value.s ?? '').split(':')[0]).filter(n => n.startsWith('gm_') && !soundfonts.includes(n)))) {
    const like = nearest(name)
    warn.push(`${name} isn't one of Strudel VS's soundfonts, so it won't play${like.length ? `; close names: ${like.join(', ')}` : ''} (all of them: tools/gm-sounds.json)`)
  }
  const pans = haps.map(h => h.value.pan).filter(p => typeof p === 'number')
  if (pans.some(p => p < 0 || p > 1)) warn.push(`pan outside 0..1 (${[...new Set(pans.filter(p => p < 0 || p > 1))].join(', ')}): 0 = left, 0.5 = centre, 1 = right`)
  if (midis.some(m => m < 24)) warn.push(`notes below c1 (lowest ${midiName(Math.min(...midis))}): most speakers can't play them`)
  if (harmony) {
    const slots = harmony.length
    const clashes = haps.filter(h => h.value.note !== undefined).filter(h => {
      const pos = Number(h.whole.begin) * slots
      return Number.isInteger(pos) && !harmony[pos % slots].includes(toMidi(h.value.note) % 12)
    })
    if (clashes.length) warn.push(`${clashes.length} slot-starting notes outside the chord, e.g. ${clashes.slice(0, 3)
      .map(h => `${h.value.note} at cycle ${Number(h.whole.begin)}`).join(', ')}`)
  }
  const range = midis.length ? `, ${midiName(Math.min(...midis))}–${midiName(Math.max(...midis))}` : ''
  console.log(`${warn.length ? '!' : '✓'} ${label}${where}: ${(haps.length / cycles).toFixed(1)} notes/cycle${range}${sounds.length ? `, ${sounds.join(' ')}` : ''}`)
  warn.forEach(w => console.log(`    ! ${w}`))
  problems += warn.length
  const level = h => (h.value.gain ?? 0.8) * (h.value.velocity ?? 1) * (h.value.postgain ?? 1)
  return Math.max(0, ...haps.map(h => haps
    .filter(o => o.whole.begin <= h.whole.begin && o.whole.end > h.whole.begin)
    .reduce((sum, o) => sum + level(o), 0)))
}

const machinery = src => src.match(/^\/\/ #region machinery (v\d+)\n[\s\S]*?^\/\/ #endregion/m)
const piece = globalThis.machinery?.last
if (piece) {
  // A piece on the machinery: every variant of every voice, in each section if it differs by section.
  const sections = Object.keys(piece.sections).filter(n => !onlySections || onlySections.includes(n))
  console.log(`${file}: ${piece.piece.name}, ${sections.length} sections, ${Object.keys(piece.voices).length} voices, checked over ${cycles} cycles\n`)
  const peaks = Object.fromEntries(sections.map(n => [n, {}]))   // per section, each voice's loudest variant
  for (const [name, def] of Object.entries(piece.voices)) {
    for (const variant of Object.keys(def).filter(k => /^[1-9]\d*$/.test(k))) {
      const material = def[variant]
      const runs = typeof material === 'function'
        ? sections.map(n => [material(Number(n)), ` (section ${n})`])
        : [[material, '']]
      const levels = runs.map(([pat, where]) => {
        if (!core.isPattern(pat)) { problem(`✗ ${name} ${variant}${where}: not a pattern`); return 0 }
        return describe(`${name} ${variant}`, pat, where, runs.length > 1)
      })
      if (levels.every(l => l === undefined)) problem(`! ${name} ${variant}: no notes at all, in any section`)
      sections.forEach((n, i) => {
        const level = (runs.length > 1 ? levels[i] : levels[0]) ?? 0
        peaks[n][name] = Math.max(peaks[n][name] ?? 0, level)
      })
    }
  }
  logs.filter(l => l.startsWith('[machinery] ')).forEach(l => problem(`✗ control panel: ${l.slice(12)}`))
  // voices that rest in a section add nothing there, so the loudest section is the one that counts
  const sum = n => Object.values(peaks[n]).reduce((a, b) => a + b, 0)
  const loudest = sections.reduce((a, n) => sum(n) > sum(a) ? n : a, sections[0])
  if (loudest !== undefined && sum(loudest) > 1) problem(`! the loudest variants together could clip in section ${loudest}: their notes add up to ${round(sum(loudest))} at full master (${
    Object.entries(peaks[loudest]).filter(([, peak]) => peak).map(([name, peak]) => `${name} ${round(peak)}`).join(', ')}). Bring gains down until they add up to 1 or less.`)
  // the bar meter: one mark per bar of each section's pass
  const barsPerCycle = (piece.piece.beats ?? 4) / (piece.piece.bar ?? 4)
  for (const [n, line] of Object.entries(piece.bars ?? {})) {
    if (!piece.sections[n]) { problem(`✗ bar meter: there is no section ${n} for its line`); continue }
    const marks = core.isPattern(line) ? line.queryArc(0, 1).filter(h => h.hasOnset()).length : 0
    const want = (piece.sections[n].cycles ?? 1) * barsPerCycle
    if (marks !== want) problem(`✗ bar meter: section ${n} has ${want} bars, but its line has ${marks} marks`)
  }
  const ours = machinery(source), canonical = machinery(readFileSync(new URL('../patterns/_template.strudel.js', import.meta.url), 'utf8'))
  if (ours && canonical && ours[1] !== canonical[1]) problem(`✗ machinery ${ours[1]}, but the template has ${canonical[1]}: copy the template's block in`)
  else if (ours && canonical && ours[0] !== canonical[0]) problem(`✗ machinery ${ours[1]} differs from the template's: copy the template's block back in (fix the template instead, if the change is meant for every piece)`)
} else {
  console.log(`${file}: ${voices.length} voices, checked over ${cycles} cycles\n`)
  voices.forEach((v, i) => {
    const line = labelLines.length === voices.length ? ` line ${labelLines[i].line}` : ''
    const muted = v.label.startsWith('_') || v.label.endsWith('_')
    describe(v.label, v.pat, `${muted ? ' (muted)' : ''}${line}`)
  })
}

let mixCount = '?'
try { mixCount = mix.queryArc(0, cycles).filter(h => h.hasOnset() && !h.value.meter && !h.value.preload).length } catch (err) { problem(`\n✗ the full mix failed: ${err.message}`) }
console.log(`\n${piece ? 'The mix as the control panel has it' : 'Unmuted mix, as it would play now'}: ${mixCount} notes over ${cycles} cycles.`)
console.log(problems ? `${problems} thing(s) to look at.` : 'No problems found.')
process.exit(problems ? 1 : 0)
