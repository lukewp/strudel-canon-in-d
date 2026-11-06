// @title Canon in D (live-coding arrangement)
// @by Johann Pachelbel (c. 1680, public domain), arranged for strudel-canon-in-d
//
// One cycle = 8 beats = one pass of the ground bass (two bars of 4/4).
// Play it from the control panel: set a value, re-run (Cmd+Enter; Ctrl+Enter on Windows/Linux). The machinery below the panel
// makes every change land musically; the words are defined in CONTEXT.md at the root of the repo.
//
// Suggested order: cello -> strings -> v1 -> v2 -> v3, up through the sections, then the
// electronic voices. Leaving section 6 slows into the Kanon's final chord (bar 57); section 7 is the
// Gigue; section 0 ends the piece (from 6, on that final chord).
//
// Check it offline: node tools/check.mjs patterns/02-canon-in-d.strudel.js
// and the Kanon's notes against the ground bass (the Gigue has its own harmony):
//   node tools/check.mjs patterns/02-canon-in-d.strudel.js --sections 1-6 --harmony "d f# a|c# e a|b d f#|a c# f#|b d g|a d f#|b d g|a c# e"
// It flags eight on-beat notes in violin 1's line, all Pachelbel's: the suspended d over A (bars 10,
// 40), d over F# (17, 23, 43), the f# appoggiatura over A (43), the tied a over G (48), e over G (54).
// Seiffert's chords (strings 1, harpsichord 1, and so flute 2) are flagged where his realization
// reads the figures: e over G, a 6 chord (bars 2, 12, 14, 18, 24, 26, 34, 36, 40, 42, 54, 56), d over
// F# (17, 19, 21, 23, 25, 27, 39, 41, 43, 45, 53), and his suspensions over A (40, 42-45).

// ---- control panel ----
const master = 1         // the whole mix's level, 0..1

const play = {           // a variant per voice: 0 silent
  cello: 1,              // the ground bass (in the Gigue, its bass line)
  strings: 0,            // held chords: 1 Seiffert's, 2 the old block chords (sideways; 2 rests in the Gigue)
  v1: 1,                 // violin 1: the canon subject
  v2: 1,                 // violin 2: the canon, one cycle behind
  v3: 1,                 // violin 3: two cycles behind (each plays its own part in the Gigue)
  o1: 0,                 // organ: a fourth canon voice, through a Leslie (rests in the Gigue)
  harpsichord: 0,        // 1 Seiffert's cembalo part, 2 random arpeggio (sideways; 2 rests in the Gigue)
  flute: 0,              // 1 the triplet solo, 2 random triplets on Seiffert's chords (sideways; both rest in the Gigue)
  kit: 0,                // 1 four on the floor … 4 more structure
  shaker: 0,             // 1 and 2 sideways alternatives
  hats: 0,               // 1 off-beat, 2 with fast fills
  ebass: 0,              // sawtooth bass, an octave under the cello
  elead: 0,              // filtered saw lead on violin 1's line
  siren: 0,
  funksynth: 0,          // walking sub-bass (rests in the Gigue)
  kit2: 0,               // a Casio RZ-1, loose against the 909
  beep: 0,               // 1 short high blips, 2 the scanner's three notes, 3 the same on a vibraphone (sideways; on random beats)
}
const section = 1        // the Kanon in the score's order: 1 opening, 2 sixteenths, 3 thirty-seconds,
                         // 4 the busiest, 5 lyrical, 6 the close (rall. into the final chord when
                         // left); 7 the Gigue; 0 the end
const bars = {           // where the pass is, a mark per bar, lit as the bars play
  1: "I I I I I I I I I I",
  2: "I I I I I I I I",
  3: "I I I I I I I I",
  4: "I I I I I I I I I I I I",
  5: "I I I I I I I I I I",
  6: "I I I I I I I I",
  7: "I I I I I I I I I I I I I I I I I I I I I I I I I I I I I I I I I I I I I I I I",
}

// #region machinery v3
// Plays the piece as the control panel says. The same in every piece: copy it from
// patterns/_template.strudel.js rather than editing it here (tools/check.mjs flags a copy that differs).
// Sections switch at their exit points, leaving with their handover shape and then their close;
// section 0 is the end, at the end of the pass. A section with `then` plays one pass and moves on
// by itself. The panel's section is acted on when it changes, so a re-run doesn't call back a
// section that has moved on.
// On a piece's first run, every variant's sounds play once, silently, so their samples are fetched
// before they're needed. Voices change variant at their own entry and exit points (or when the
// section changes); a value naming no section or variant is ignored and logged. The bar meter
// plays the current section's line from the panel silently, so Strudel VS's highlighting shows
// where the pass is. State lives in globalThis.machinery between runs.
const ahead = 1 / 8      // cycles: Strudel has already scheduled this far, so no handover is planned sooner
const meter = 'fill'     // 'fill': each mark stays lit from its bar to the end of the pass; 'step': only during its bar
let thisPiece = { name: 'piece', bpm: 60, beats: 4, bar: 4 }, sectionDefs = {}, voiceDefs = {}
function piece(name, { bpm = 60, beats = 4, bar = 4 } = {}) { thisPiece = { name, bpm, beats, bar } }
function sections(defs) { sectionDefs = defs }
function voices(defs) { voiceDefs = defs }
all(mix => {
  const now = getTime(), say = msg => console.log('[machinery] ' + msg)
  let soon = now + ahead   // the earliest cycle a plan can change: Strudel has already scheduled up to it
  let m = globalThis.machinery
  if (m?.version !== 3 || now < m.now) m = globalThis.machinery = { version: 3, now, pieces: {} }
  m.now = now
  const lines = typeof bars === 'undefined' ? {} : bars
  m.last = { piece: thisPiece, sections: sectionDefs, voices: voiceDefs, bars: lines }   // what this run defined (tools/check.mjs reads it)

  // Music time within a section (cycles from its first beat) and back to the clock's cycles.
  const integral = { linear: s => s * s / 2, ease: s => s ** 3 - s ** 4 / 2 }   // of the tempo curve
  const musicAt = (g, r) => {
    const k = g.ramp
    if (!k || r <= k.r0) return (r - g.from) * g.rate
    if (r >= k.r0 + k.D) return k.x0 + k.L + (r - k.r0 - k.D) * k.rate
    const t = r - k.r0
    return k.x0 + g.rate * t + (k.rate - g.rate) * k.D * integral[k.curve](t / k.D)
  }
  const realAt = (g, x) => {
    const k = g.ramp
    if (!k || x <= k.x0) return g.from + x / g.rate
    if (x >= k.x0 + k.L) return k.r0 + k.D + (x - k.x0 - k.L) / k.rate
    let lo = k.r0, hi = k.r0 + k.D
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (musicAt(g, mid) < x) lo = mid; else hi = mid }
    return (lo + hi) / 2
  }

  // ---- other pieces: the file run last comes in last. Every other piece, playing or waiting its turn,
  // ends in turn as if set to 0, at its section's next exit point, with its handover shape and close
  // (or at its end, if it is on its way there); then this one starts ----
  let handover = 0
  for (let [name, q] of Object.entries(m.pieces)) {
    if (name === thisPiece.name) {
      if (q.until === undefined) continue                            // run again while it plays: as the panel says
      delete m.pieces[name]                                          // on its way out: it finishes, and starts afresh after
      m.pieces[name += ' (leaving at ' + q.until + ')'] = q
    }
    q.until ??= q.handOver(now + ahead)
    if (q.until <= now) delete m.pieces[name]
    else handover = Math.max(handover, q.until)
  }

  const { bpm, beats } = thisPiece
  let p = m.pieces[thisPiece.name], soonest = now + ahead
  if (!p) {
    soonest = Math.max(handover, now <= 0 ? 0 : Math.ceil(now + ahead))   // a piece starts on a downbeat, every voice with it
    // the clock in cycles per minute: set by the piece that started it, kept by the pieces that follow
    p = m.pieces[thisPiece.name] = { clock: handover ? m.clock : bpm / beats, sections: [], voices: {} }
    if (!handover) setcpm(m.clock = bpm / beats)   // with another piece playing, this one is stretched to its tempo instead
  }
  const bpmOf = n => sectionDefs[n]?.bpm ?? bpm

  // ---- sections ----
  // The timeline: a section's passes; once it is left, its close; then the next section, or the end
  // (section 0). A section with `then` leaves after one pass for that section. Fresh copies each
  // run: the last run's pattern keeps its own.
  const secs = p.sections = p.sections.filter(g => g.to > now).map(g => ({ ...g, cache: undefined, meter: undefined }))
  const fixed = secs.filter(g => g.from <= now + ahead), cur = fixed.at(-1)
  const planned = secs.at(-1)?.n
  let next = secs.length && section === p.asked ? planned : section   // unchanged: no new request
  p.asked = section
  if (next !== 0 && !sectionDefs[next]) {
    const keep = planned ?? Object.keys(sectionDefs)[0]
    say('there is no section ' + next + ' (sections: ' + Object.keys(sectionDefs).join(', ') + ', and 0 to end), so section ' + keep + ' plays on')
    next = keep
  }
  const segment = (n, from) => n === 0
    ? { n, part: 'end', def: { cycles: 1 }, from, to: Infinity, rate: 1 }
    : { n, part: 'pass', def: sectionDefs[n], from, to: Infinity, rate: bpmOf(n) / beats / p.clock }
  if (!secs.length) arrive(next, soonest)
  else if (!cur) {                                   // waiting its turn: a new destination keeps the turn
    if (next !== planned) { const from = secs[0].from; secs.length = 0; arrive(next, from) }
  }
  else if (next !== planned) {
    secs.length = fixed.length                       // what was waiting goes: a new destination
    if (cur.part === 'close') arrive(next, cur.to)
    else if (cur.part === 'end') {
      if (next === 0) cur.to = Infinity
      else arrive(next, cur.to = Math.ceil(now + ahead))   // start again on a downbeat
    } else {
      const started = cur.ramp?.r0 <= now + ahead   // a ramp under way can't be taken back
      if (next === cur.n && !started) {
        delete cur.ramp; delete cur.exitAt; cur.to = Infinity
        if (thenOf(cur) !== undefined) moveOn(cur)   // a then-section stays on its way
      } else {
        // a change already waiting keeps its exit point; the end waits for the end of the pass
        if (next === 0 && !started) cur.exitAt = nextExit(cur, now + ahead, true)
        else cur.exitAt ??= nextExit(cur, now + ahead)
        depart(cur, next, !started)
      }
    }
  }
  // Section n from cycle `from`; with `then`, one pass and on to the next.
  function arrive(n, from, seen = new Set()) {
    const g = segment(n, from)
    secs.push(g)
    if (n !== 0 && thenOf(g) !== undefined && !seen.has(n)) moveOn(g, seen.add(n))
  }
  function moveOn(g, seen) {
    g.exitAt = Math.max(g.def.cycles ?? 1, nextExit(g, soon))   // the end of its first pass, or of this one
    depart(g, thenOf(g), true, seen)
  }
  // g leaves at g.exitAt for section n: its handover shape (unless one is under way), its close, then n.
  function depart(g, n, shape, seen) {
    if (shape) leave(g, n)
    let from = g.to
    if (g.def.close) {                               // the close: played once, at the tempo the shape ended on
      const rate = g.ramp?.rate ?? g.rate
      secs.push({ n: g.n, part: 'close', def: g.def, from, to: from + g.def.close / rate, rate })
      from = secs.at(-1).to
    }
    arrive(n, from, seen)
  }
  function thenOf(g) {
    const n = g.def.then
    if (n === undefined || n === 0 || sectionDefs[n]) return n
    say('section ' + g.n + ' has then: ' + n + ', which names no section, so it plays on')
  }
  // Plan g's handover to section n at g.exitAt, with g's handover shape. A ritardando or accelerando
  // moves the tempo along a curve (linear or ease) to its `to` bpm (default: section n's tempo, or a
  // quarter slower or faster when that isn't), over its last `beats` before the exit point (default:
  // the rest of the pass), so every voice stretches together and the ramp ends on the exit point.
  function leave(g, n) {
    delete g.ramp
    const how = typeof g.def.leave === 'string' ? { shape: g.def.leave } : g.def.leave ?? {}
    const slower = how.shape === 'ritardando', faster = how.shape === 'accelerando'
    if (slower || faster) {
      const here = g.rate * p.clock * beats, there = n === 0 ? here : bpmOf(n), beat = 1 / beats
      const target = how.to ?? (slower ? (there < here ? there : here * 3 / 4) : (there > here ? there : here * 4 / 3))
      const start = Math.max(0, g.exitAt - (how.beats ?? Infinity) * beat, Math.ceil(musicAt(g, soon) / beat - 1e-9) * beat)
      if (start < g.exitAt) {
        const rate = target / beats / p.clock, L = g.exitAt - start
        g.ramp = { r0: realAt(g, start), x0: start, L, D: 2 * L / (g.rate + rate), rate, curve: how.curve ?? 'linear' }
      }
    }
    g.to = realAt(g, g.exitAt)
  }
  // How this piece ends when another piece's file is run at cycle r: as if section 0 were chosen, but at
  // the section's next exit point (a piece still waiting its turn plays to its first). Kept with the
  // piece, so it is planned with its own sections and tempo; returns the cycle its end comes.
  p.handOver = r => {
    const at = soon = Math.max(r, secs[0]?.from ?? r)   // a piece still waiting its turn plays to its first exit point
    try {
      const fixed = secs.filter(g => g.from <= at), cur = fixed.at(-1)
      if (!cur) return at
      if (!secs.some(g => g.part === 'end')) {      // not on its way to its end already
        secs.length = fixed.length
        if (cur.part === 'close') arrive(0, cur.to)
        else {
          cur.exitAt ??= nextExit(cur, at)
          depart(cur, 0, !(cur.ramp?.r0 <= at))
        }
      }
      return secs.find(g => g.part === 'end').from
    } finally { soon = now + ahead }
  }
  function nextExit(g, r, passOnly = false) {
    const x = musicAt(g, r), cycles = g.def.cycles ?? 1
    const points = [...(passOnly ? [] : g.def.exits ?? []).filter(e => e > 0 && e < cycles), cycles]
    const pass = Math.floor(x / cycles)
    return Math.min(...[pass, pass + 1].flatMap(k => points.map(e => k * cycles + e)).filter(e => e >= x))
  }

  // ---- voices ----
  // the next entry or exit point after cycle r: [every, offset] in section cycles, or a section start
  const nextPoint = ([every, offset], r) => {
    for (const g of secs) {
      if (g.to <= r) continue
      if (g.from >= r) return g.from
      const at = realAt(g, Math.ceil((musicAt(g, r) - offset) / every - 1e-9) * every + offset)
      if (at < g.to) return at
    }
  }
  const timing = t => Array.isArray(t) ? t : [t ?? 1, 0]
  const variantsOf = def => Object.keys(def ?? {}).filter(k => /^[1-9]\d*$/.test(k)).map(Number)
  for (const name of Object.keys(play)) if (!voiceDefs[name]) say('there is no voice ' + name + ' (voices: ' + Object.keys(voiceDefs).join(', ') + ')')
  for (const name of new Set([...Object.keys(p.voices), ...Object.keys(voiceDefs)])) {
    const def = voiceDefs[name]
    const vs = p.voices[name] = (p.voices[name] ?? []).filter(v => v.to > now).map(v => ({ ...v }))
    const live = vs.filter(v => v.from <= now + ahead), curV = live.at(-1), pend = vs[live.length]
    let want = def ? play[name] ?? 0 : 0
    if (want !== 0 && !variantsOf(def).includes(want)) {
      const keep = pend?.variant ?? curV?.variant ?? 0
      say('there is no ' + name + ' variant ' + want + ' (variants: ' + variantsOf(def).join(', ') + '), so ' + name + (keep ? ' plays variant ' + keep + ' on' : ' stays silent'))
      want = keep
    }
    if (!want && !curV?.variant && !pend?.variant) continue
    const at = nextPoint(curV?.variant ? curV.exit : timing(def?.enter), soonest)
    if (pend) vs.pop()
    if (curV) curV.to = at
    vs.push({ variant: want, def: def?.[want], exit: timing(def?.exit ?? curV?.exit), from: at, to: Infinity })
  }

  // ---- what plays ----
  const sound = (v, g) => {
    const cache = g.cache ??= new WeakMap()
    if (!cache.has(v)) {
      const pat = g.part === 'end' ? silence : typeof v.def === 'function' ? v.def(g.n, g.part) : v.def
      cache.set(v, pat instanceof Pattern
        ? pat.withQueryTime(t => musicAt(g, Number(t))).withHapTime(t => realAt(g, Number(t)))
        : silence)
    }
    return cache.get(v)
  }
  const voicePattern = (vs, q) => new Pattern(state => vs.flatMap(v => !v.variant ? [] : q.sections.flatMap(g => {
    const a = Math.max(v.from, g.from), b = Math.min(v.to, g.to, q.until ?? Infinity)
    const span = state.span.withTime(t => t < a ? a : t > b ? b : t)
    return span.begin < span.end ? sound(v, g).query(state.setSpan(span)) : []
  })))
  // The preload: Strudel fetches a sample the first time a note asks for it and skips notes whose
  // sample is still loading. So on its first run a piece plays one silent note of every sound of
  // every variant (the first cycle of each section), as soon as possible: during the outgoing
  // piece's last pass, if there is one. Found in the background, a variant at a time, so the run
  // isn't held up; each sound once per set.
  if (!p.preload) {
    p.preload = []
    const fetched = m.fetched ??= new Set(), synth = /^(sine|sawtooth|square|triangle|white|pink|brown|supersaw|pulse)$/
    const jobs = Object.values(voiceDefs).flatMap(def => variantsOf(def).map(k => def[k]))
    const step = () => {
      const material = jobs.shift()
      if (material === undefined) return
      const at = getTime() + ahead
      for (const [n, def] of Object.entries(sectionDefs)) for (const part of def.close ? ['pass', 'close'] : ['pass']) {
        try {
          const pat = typeof material === 'function' ? material(Number(n), part) : material
          for (const h of pat instanceof Pattern ? pat.queryArc(0, 1) : []) {
            const { s: name, bank, n: index, note } = typeof h.value === 'object' ? h.value : {}
            if (!h.hasOnset() || typeof name !== 'string' || synth.test(name)) continue
            const key = [name, bank, index, name.startsWith('gm_') ? '' : note].join('|')   // a soundfont is one fetch
            if (fetched.has(key)) continue
            fetched.add(key)
            p.preload.push({ at, value: Object.fromEntries(Object.entries({ s: name, bank, n: index, note }).filter(([, v]) => v !== undefined)) })
          }
        } catch (err) {}
      }
      setTimeout(step, 0)
    }
    setTimeout(step, 0)
  }
  const preloadPattern = q => new Pattern(state => (q.preload ?? [])
    .filter(({ at }) => at >= Number(state.span.begin) && at < Number(state.span.end))
    .map(({ at, value }) => new Hap(new TimeSpan(at, at + 1 / 16), new TimeSpan(at, Math.min(at + 1 / 16, Number(state.span.end))), { ...value, gain: 0, preload: true })))
  // the bar meter: the panel's line for the section playing, one mark per bar, silent
  const marks = g => {
    const line = g.part === 'pass' && lines[g.n]
    if (!(line instanceof Pattern)) return silence
    const steps = line.queryArc(0, 1).filter(h => h.hasOnset()), cycles = g.def.cycles ?? 1, bar = cycles / steps.length
    return new Pattern(state => {
      const out = [], x0 = Number(state.span.begin), x1 = Number(state.span.end)
      for (let k = Math.floor(x0 / cycles); k * cycles < x1; k++) steps.forEach((h, i) => {
        const whole = new TimeSpan(k * cycles + i * bar, meter === 'step' ? k * cycles + (i + 1) * bar : (k + 1) * cycles)
        const part = whole.intersection(state.span)
        if (part) out.push(new Hap(whole, part, { gain: 0, meter: true }, h.context))
      })
      return out
    })
  }
  const meterPattern = new Pattern(state => secs.flatMap(g => {
    const span = state.span.withTime(t => t < g.from ? g.from : t > g.to ? g.to : t)
    if (!(span.begin < span.end)) return []
    g.meter ??= marks(g).withQueryTime(t => musicAt(g, Number(t))).withHapTime(t => realAt(g, Number(t)))
    return g.meter.query(state.setSpan(span))
  }))
  let level = m.master ?? 1
  if (typeof master === 'number' && master >= 0 && master <= 1) level = m.master = master
  else say('master ' + master + ' should be a number from 0 to 1, so it stays at ' + level)
  const out = stack(...Object.values(m.pieces).flatMap(q => Object.values(q.voices).map(vs => voicePattern(vs, q))),
    ...Object.values(m.pieces).map(preloadPattern), meterPattern, ...(mix instanceof Pattern ? [mix] : []))
  return out.withValue(v => typeof v === 'object' ? { ...v, postgain: (v.postgain ?? 1) * level } : v)
})
// #endregion

// ---- material: the score ----

// Pachelbel's Kanon und Gigue für 3 Violinen mit Generalbaß, from Max Seiffert's edition (Organum III/24,
// Kistner & Siegel 1929), read in Jawher Matmati's 2016 engraving of it and checked against the 1929
// print; both are in research/scores/pachelbel-canon-gigue/ (see SOURCE.md).
// One string per cycle (two bars). Each [ ] is one beat (in the Gigue, a dotted-quarter beat);
// @n stretches a note to n beats, or within a beat to n parts of it. Notes and rhythms only: the
// trills, dynamics, slurs and Seiffert's tempo words are left out.
const kanon = [   // violin 1 from bar 3: the canon subject, which violins 2 and 3 play two and four bars later
  "f#5 e5 d5 c#5 b4 a4 b4 c#5",   // 3-4
  "d5 c#5 b4 a4 g4 f#4 g4 e4",   // 5-6
  "[d4 f#4] [a4 g4] [f#4 d4] [f#4 e4] [d4 b3] [d4 a4] [g4 b4] [a4 g4]",   // 7-8
  "[f#4 d4] [e4 c#5] [d5 f#5] [a5 a4] [b4 g4] [a4 f#4] [d4 d5] [d5@3 c#5]",   // 9-10
  "[d5 c#5 d5 d4] [c#4 a4 e4 f#4] [d4 d5 c#5 b4] [c#5 f#5 a5 b5] [g5 f#5 e5 g5] [f#5 e5 d5 c#5] [b4 a4 g4 f#4] [e4 g4 f#4 e4]",   // 11-12
  "[d4 e4 f#4 g4] [a4 e4 a4 g4] [f#4 b4 a4 g4] [a4 g4 f#4 e4] [d4 b3 b4 c#5] [d5 c#5 b4 a4] [g4 f#4 e4 b4] [a4 b4 a4 g4]",   // 13-14
  "[f#4 f#5] e5 [~ d5] f#5 b5 a5 b5 c#6",   // 15-16
  "d6@2 d5@2 c#5@4 ~@2 b4@2 d5@4 d5@6 d5@2 d5@2 g5@2 e5@2 a5@2",   // 17-18
  "[a5@2 f#5 g5 a5@2 f#5 g5] [a5 a4 b4 c#5 d5 e5 f#5 g5] [f#5@2 d5 e5 f#5@2 f#4 g4] [a4 b4 a4 g4 a4 f#4 g4 a4] [g4@2 b4 a4 g4@2 f#4 e4] [f#4 e4 d4 e4 f#4 g4 a4 b4] [g4@2 b4 a4 b4@2 c#5 d5] [a4 b4 c#5 d5 e5 f#5 g5 a5]",   // 19-20
  "[f#5@2 d5 e5 f#5@2 e5 d5] [e5 c#5 d5 e5 f#5 e5 d5 c#5] [d5@2 b4 c#5 d5@2 d4 e4] [f#4 g4 f#4 e4 f#4 d5 c#5 d5] [b4@2 d5 c#5 b4@2 a4 g4] [a4 g4 f#4 g4 a4 b4 c#5 d5] [b4@2 d5 c#5 d5@2 c#5 b4] [c#5 d5 e5 d5 c#5 d5 b4 c#5]",   // 21-22
  "[d5 ~] [c#5 ~] [b4 ~] [d5 ~] [d4 ~] [d4 ~] [d4 ~] [e4 ~]",   // 23-24
  "[~ a4] [~ a4] [~ f#4] [~ a4] [~ g4] [~ f#4] [~ g4] [~ e5]",   // 25-26
  "[f#5 f#4 g4 f#4] [e4 e5 f#5 e5] [d5 f#4 d4 b4] [a4 a3 g3 a3] [b3 b4 c#5 b4] [a4 a3 g3 a3] [b3 b4 a4 b4] [c#5 c#4 b3 c#4]",   // 27-28
  "[d4 d5 e5 d5] [c#5 c#4 d4 c#4] [b3 b4 a4 b4] [c#5 c#4 f#4 e4] [d4 d5 e5 g5] [f#5 f#4 a4 f#5] [d5 g5 f#5 g5] [e5 a4 g4 a4]",   // 29-30
  "[f#4 a4 a4 a4] [a4 a4 a4 a4] [f#4 f#4 f#4 f#4] [f#4 f#4 a4 a4] [g4 g4 g4 d5] [d5 d5 d5 d5] [d5 d5 b4 b4] [a4 a4 e5 c#5]",   // 31-32
  "[a4 f#5 f#5 f#5] [e5 e5 e5 e5] [d5 d5 d5 d5] [a5 a5 a5 a5] [b5 b5 b5 b5] [a5 a5 a5 a5] [b5 b5 b5 b5] [c#6 c#5 c#5 c#5]",   // 33-34
  "[d5@2 d4 e4 f#4@2 d4@2] [c#4@2 c#5 d5 e5@2 c#5@2] [b4@2 b3 c#4 d4@2 b3@2] [c#4@2 a4 g4 f#4@2 e4@2] [d4@2 g4 f#4 e4@2 g4@2] [f#4@2 d4 e4 f#4@2 a4@2] [g4@2 b4 a4 g4@2 f#4@2] [e4@2 a4 g4 f#4@2 e4@2]",   // 35-36
  "[f#4@2 d5 c#5 d5@2 f#4@2] [a4@2 a4 b4 c#5@2 a4@2] [f#4@2 d5 e5 f#5@2 d5@2] [f#5@2 f#5 e5 d5@2 c#5@2] [b4@2 b4 a4 b4@2 c#5@2] [d5@2 f#5 e5 d5@2 f#5@2] [g5@2 d5 c#5 b4@2 b4@2] [a4 e4 a4 a4]",   // 37-38
  "a4@6 a4@2 d4@6 a4@2 g4@4 a4@4 g4@2 d4@2 d4@3 c#4",   // 39-40
  "[d4 d5] c#5 b4 a4 [d4@3 e4] f#4 b4 [e4@3 e4]",   // 41-42
  "[f#4@3 f#5] [f#5 g5 f#5 e5] [d5@3 d5] [d5 e5 d5 c#5] b4 d5 [d5 c5 b4 c5] [a4@3 a4]",   // 43-44
  "[a4@3 a5] [a5 b5 a5 g5] [f#5@3 f#5] [f#5 g5 f#5 e5] [d5 c5 b4 c5] [a4@3 a4] [g4 d5] [c#5@3 c#5]",   // 45-46
  "d5@2 d5@4 c#5@4 b4@4 a4@4 g4@4 f#4@5 e4 e4@4",   // 47-48
  "f#4@2 f#5@4 e5@2 d5@2 d6@4 c6@2 b5@4 d6@2 a5@2 b5@4 a5@4",   // 49-50
  "a5@4 a4@3 g4 f#4@4 f#5@3 e5 d5@6 d5@2 d5@4 c#5@4",   // 51-52
  "[d5 d4] [c#4 c#5] [b4 b3] [a3 a4] [g4 g5] [f#5 f#4] [e4 b4] [e4 e5]",   // 53-54
  "[f#5 f#4] [e4 e5] [d5 d4] [c#4 c#5] [b4 b5] [a5 a4] [g4@3 e5] [a4 a4]",   // 55-56
]
const gigueV1 = [
  "~@8",   // 1-2
  "~@2 [d6@2 c#6] [b5 c#6 a5] [g5 a5 f#5] [e5 f#5 d5] c#5 [d5@2 e5]",   // 3-4
  "[f#5 g5 e5] [d5 e5 c#5] [b4 a4 b4] e4 e4 ~@3",   // 5-6
  "[a5@2 g5] [f#5 g5 e5] [d5 e5 c#5] [b4 c#5 a4] [g#4 e4 g#4] [a4 f#4 a4] [b4 g#4 b4] [c#5 a4 c#5]",   // 7-8
  "[b4 g#4 b4] [c#5 a4 c#5] [b4 g#4 c#5] b4 [c#5 a4 d5] [c#5@2 b4] c#5@2",   // 9-10
  "~@8",   // 11-12
  "~@4 [d5@2 a5] [f#5@3 e5 f#5@2] [d5 a4 d5] [f#5 d5 f#5]",   // 13-14
  "[g5@2 f#5] [e5@2 d5] [c#5 f#4 d5] c#5 b4 [b4@2 e5] [c#5@3 b4 c#5@2] d5",   // 15-16
  "[d5@2 g5] [e5@3 d5 e5@2] f#5 a5 a5 [c#6 a5 c#6] [d6 b5 d6] [c#6 a5 c#6]",   // 17-18
  "[d6 b5 d6] [c#6 a5 c#6] [d6 b5 d6] [d6@2 c#6] d6 [d6@2 c#6] d6@2",   // 19-20
]
const gigueV2 = [
  "~@4 [a5@2 g5] [f#5 g5 e5] [d5 e5 c#5] [b4 c#5 a4]",   // 1-2
  "g#4 [a4 b4 g4] [f#4 g4 a4] [b4@2 c#5] [d5@2 d5] b4 a4 [a4@2 g4]",   // 3-4
  "f#4 ~ [e5@2 d5] [c#5 d5 b4] [a4 b4 g4] [f#4 g4 e4] [d4 e4 f#4] [e4 f#4 d4]",   // 5-6
  "[c#4 d4 e4] [d4 d5 c#5] [b4@2 c#5] [d5 e5 c#5] [b4 g#4 b4] [c#5 a4 c#5] [g#4 e4 g#4] [a4 f#4 a4]",   // 7-8
  "[g#4 e4 g#4] [a4 f#4 a4] [g#4 e4 a4] [a4@2 g#4] a4 [a4@2 g#4] a4@2",   // 9-10
  "[a4@2 e5] [c#5@3 b4 c#5@2] [a4 e4 a4] [c#5 a4 c#5] [d5@2 e5] [d5@2 e5] [f#5@2 g5] [a5@2 a4]",   // 11-12
  "[b4 e5 b4] [a4 d5 a4] [b4@2 a4] [b4 a4 g4] [f#4@2 g4] a4 a4 a4",   // 13-14
  "b4 [c#5@2 b4] [a#4@2 b4] [c#5@2 f#5] [d#5@3 c#5 d#5@2] e5 [e5@2 a5] [f#5@3 e5 f#5@2]",   // 15-16
  "[g5@2 b5] a5 [a5@2 d6] [c#6@3 b5 c#6@2] [a5 e5 a5] [e5 c#5 e5] [f#5 d5 f#5] [e5 c#5 e5]",   // 17-18
  "[f#5 d5 f#5] [e5 c#5 e5] [f#5 d5 f#5] e5 [f#5 d5 g5] [f#5@2 e5] f#5@2",   // 19-20
]
const gigueV3 = [
  "[d5@2 c#5] [b4 c#5 a4] [g4 a4 f#4] [e4 f#4 d4] c#4 [d4 d5 c#5] [b4 c#5 a4] [g4 a4 f#4]",   // 1-2
  "[e4 f#4 d4] c#4 [d4 e4 f#4] [g4@2 a4] [b4@2 a4] g#4 [a4@2 g4] [f#4 g4 e4]",   // 3-4
  "[d4 e4 c#4] [b3 c#4 a3] g#3 [a3@2 b3] c#4 [d4 e4 c#4] [b3 c#4 d4] b3",   // 5-6
  "a3 [a4@2 g4] [f#4@2 e4] f#4 [b3@2 e4] e4 [e4 b3 e4] e4",   // 7-8
  "[e4 b3 e4] e4 e4 e4 [e4@2 f#4] [e4@2 d4] e4@2",   // 9-10
  "~@4 [d4@2 a4] [f#4@3 e4 f#4@2] [d4 a3 d4] [f#4 d4 f#4]",   // 11-12
  "[g4 e4 g4] [f#4 d4 f#4] [g4@2 f#4] [g4 f#4 e4] [d4@2 e4] d4 f#4 d4",   // 13-14
  "d4 [a4@2 f#4] [f#4@2 b4] [b4@2 a#4] [b4 f#4 b4] [g#4@3 f#4 g#4@2] a4 [a4@2 d5]",   // 15-16
  "[b4@3 a4 b4@2] [c#5@3 b4 c#5@2] d5 e5 c#5 [a4 a3 a4] [a4 a3 a4] [a4 a3 a4]",   // 17-18
  "[a4 a3 a4] [a4 a3 a4] [a4 a3 a4] [a4 a3 a4] [a4@2 b4] [a4@2 g4] a4@2",   // 19-20
]
const gigueCello = [
  "d3 [g3@2 f#3] [e3@2 d3] [c#3@2 b2] a2 d2 g2 b2",   // 1-2
  "e3 a2 d3 g2 [g2@2 d2] e2 a2 [d3@2 g2]",   // 3-4
  "d3 d3 [e3@2 b2] a2 a2 d3 [g3@2 d3] g#2",   // 5-6
  "[a2 b2 c#3] d3 d2 d2 e2 e2 e2 e2",   // 7-8
  "e2 e2 e2 e2 a2 a2 a2@2",   // 9-10
  "[a2@2 g#2] a2 a2 a2 [d3@2 c#3] d3 d3 d3",   // 11-12
  "g2 d3 [g2@2 d3] [g2@2 a2] [d3@2 c#3] d3 d3 d3",   // 13-14
  "g2 [a2@2 b2] f#2 f#2 b2 e3 a2 d3",   // 15-16
  "g2 a2 d3 a2 a2 a2 a2 a2",   // 17-18
  "a2 a2 a2 a2 d2 d2 d2@2",   // 19-20
]

// Seiffert's cembalo: his keyboard realization of Pachelbel's figured bass, right hand and left
// hand, read from the 1929 print (Matmati's engraving leaves it out). Mostly a chord per beat;
// where one hand has two voices in different rhythms (the Kanon from bar 38, much of the Gigue)
// a cycle is two layers joined by a comma, and a note tied over the bar line is one note held
// across it. The Gigue's [ ] beats are dotted quarters, three eighths each, as above.
const kanonRH = [
  "[f#4,a4,d5] [c#4,e4,a4,c#5] [b3,d4,f#4,b4] [a3,c#4,f#4,a4] [b3,d4,g4] [a3,d4,f#4,a4] [b3,d4,e4,b4] [a3,c#4,e4,a4]",   // 1-2
  "[a3,d4,f#4,a4] [e4,a4,c#5] [d4,f#4,b4] [c#4,f#4,a4] [b3,d4,g4] [a3,d4,f#4] [b3,d4,g4] [a3,c#4,e4]",   // 3-4
  "[a3,d4,f#4] [c#4,e4,a4] [d4,f#4] [a3,c#4,f#4] [b3,d4] [a3,d4,f#4] [b3,d4,g4] [a3,c#4,e4]",   // 5-6
  "[a3,d4,f#4] [c#4,e4,a4] [d4,f#4] [a3,c#4,f#4] [b3,d4] [a3,d4,f#4] [b3,d4,g4] [a3,c#4,e4]",   // 7-8
  "[a3,d4,f#4] [c#4,e4,a4] [d4,f#4] [a3,c#4,f#4] [b3,d4] [a3,d4,f#4] [b3,d4,g4] [a3,c#4,e4]",   // 9-10
  "[a3,d4,f#4] [c#4,e4,a4] [d4,f#4] [c#4,f#4,a4] [b3,d4,b4] [d4,f#4,a4] [d4,e4,b4] [c#4,e4,a4]",   // 11-12
  "[d4,f#4,a4] [e4,a4,c#5] [d4,f#4,b4] [c#4,f#4,a4] [b3,d4,g4] [a3,d4,f#4] [b3,d4,e4] [a3,c#4,e4]",   // 13-14
  "[a3,d4,f#4] [c#4,e4,a4] [d4,f#4] [a3,c#4,f#4] [b3,d4] [a3,d4,f#4] [b3,d4,g4] [a3,c#4,e4]",   // 15-16
  "[a3,d4,f#4] [c#4,e4,a4] [d4,f#4] [d4,a4] [d4,g4,b4] [d4,f#4,a4] [d4,e4,b4] [c#4,e4,a4]",   // 17-18
  "[d4,f#4,a4] [e4,a4,c#5] [d4,f#4,b4] [d4,a4] [d4,g4,b4] [d4,f#4,a4] [d4,g4,b4] [c#4,e4,a4]",   // 19-20
  "[d4,f#4,a4] [c#4,e4,a4] [b3,d4,f#4] [a3,d4,a4] [b3,d4,g4] [a3,d4,f#4] [b3,d4,g4] [c#4,e4]",   // 21-22
  "[a3,d4,f#4] [c#4,e4,a4] [d4,f#4] [a3,d4,a4] [b3,d4,g4] [a3,d4,f#4] [b3,d4,e4] [a3,c#4,e4]",   // 23-24
  "[a3,d4,f#4] [c#4,e4,a4] [d4,f#4] [a3,d4,a4] [b3,d4,g4] [a3,d4,f#4] [b3,d4,e4] [a3,c#4,e4]",   // 25-26
  "[a3,d4,f#4] [c#4,e4,a4] [d4,f#4] [d4,a4] [d4,g4,b4] [d4,f#4,a4] [d4,g4,b4] [c#4,e4,a4]",   // 27-28
  "[d4,f#4,a4] [e4,a4,c#5] [d4,f#4,b4] [c#4,f#4,a4] [b3,d4,g4] [a3,d4,f#4] [b3,d4,g4] [a3,c#4,e4]",   // 29-30
  "[a3,d4,f#4] [c#4,e4,a4] [b3,d4,f#4] [a3,c#4,f#4] [b3,d4] [a3,d4,f#4] [b3,d4,g4] [a3,c#4,e4]",   // 31-32
  "[a3,d4,f#4] [c#4,e4,a4] [d4,f#4] [c#4,f#4,a4] [b3,d4,g4] [d4,f#4,a4] [d4,e4,b4] [c#4,e4,a4]",   // 33-34
  "[d4,f#4,a4] [e4,a4,c#5] [d4,f#4,b4] [c#4,f#4,a4] [b3,d4,b4] [d4,f#4,a4] [d4,e4,b4] [c#4,e4,a4]",   // 35-36
  "[d4,f#4,a4] [e4,a4,c#5] [d4,f#4,b4] [c#4,f#4,a4] b4 [d4,f#4,a4] [d4,g4,b4] [c#4,e4,a4], ~@4 [[b3,d4] [c#4,e4]] ~@3",   // 37-38
  "[d4,f#4,a4] [c#4,e4,a4] [d4,f#4] [c#4,d4,a4] [b3,d4,g4] [a3,d4,f#4] [b3,d4,e4] [a3,e4], ~@7 [d4@3 c#4]",   // 39-40
  "[a3,d4,f#4] [c#4,e4,a4] [b3,d4,f#4] [a3,d4,a4] [b3,d4,g4] [a3,d4,f#4] [b3,d4,e4] [a3,e4], ~@7 [d4@3 c#4]",   // 41-42
  "[a3,d4,f#4] [c#4,a4] [b3,d4,f#4] [d4,a4] [b3,d4,g4] [d4,f#4,a4] [d4,g4,b4] [e4,a4], ~ [f#4@3 e4] ~ [a3@3 c#4] ~@3 [d4@3 c#4]",   // 43-44
  "[d4,f#4,a4] c#5 [d4,f#4,b4] a4 [b3,d4,g4] [a3,d4,f#4] [b3,d4,g4] [a3,c#4,e4], ~ [[c#4,f#4]@3 [e4,g4]] ~ [[d4,f#4]@3 [c#4,e4]] ~@4",   // 45-46
  "[a3,d4,f#4] [f#4,a4,d5]@2 c#5@2 b4@2 a4@2 g4@2 f#4@2 e4 [a3,c#4,e4]@2, ~@3 [e4,g4] [d4,f#4]@3 [c#4,e4] [b3,d4]@2 [a3,d4]@2 [b3,d4]@2 ~@2",   // 47-48
  "[a3,d4,f#4] [f#4,a4,d5]@2 c#5@2 b4@2 a4@2 g4@2 f#4@2 e4 [a3,c#4,e4]@2, ~@3 [e4,a4] [d4,f#4]@3 [c4,e4] [b3,d4]@2 [a3,d4]@2 [b3,d4]@2 ~@2",   // 49-50
  "[a3,d4,f#4] [f#4,a4,d5]@2 c#5@2 b4@2 a4@2 g4@2 f#4@2 e4 [a3,c#4,e4]@2, ~@3 [e4,a4] [d4,f#4]@3 [c4,e4] [b3,d4]@2 [a3,d4]@2 [b3,d4]@2 ~@2",   // 51-52
  "[a3,d4,f#4] f#4@2 [e4,g4] [d4,f#4,b4]@2 [d4,a4]@2 [d4,g4,b4]@2 [d4,f#4,a4]@2 [d4,e4,b4]@2 [c#4,e4,a4]@2, [~ [a4,d5]] [a4,c#5] ~@6",   // 53-54
  "[d4,f#4,a4] [e4,a4,c#5] [d4,f#4,b4] [c#4,f#4,a4] [b3,d4,g4] [a3,d4,f#4,a4] [b3,d4,e4,b4] [a3,c#4,e4,a4]",   // 55-56
  "[a3,d4,f#4,a4] ~@7",   // 57
]
const kanonLH = [
  "[d3,a3,d4] [a2,e3,a3] [b2,f#3] [f#2,c#3,f#3] [g2,d3,g3] [d2,d3] [g2,g3] [a2,e3,g3]",   // 1-2
  "[d3,f#3] a2 b2 f#2 g2 d2 g2 a2",   // 3-4
  ...Array(25).fill("d3 a2 b2 f#2 g2 d2 g2 a2"),   // 5-54: the ground bass, as the cello has it
  "d3 [a2,a3] [b2,f#3] [f#2,f#3] [g2,d3] [d2,d3] [g2,e3,g3] [a2,e3,g3]",   // 55-56
  "[d2,a2,f#3] ~@7",   // 57
]
const gigueRH = [
  "[d4,f#4,a4] [[d4,g4,b4]@2 [d4,a4,d5]] [[e4,g4,c#5]@2 [f#4,b4]] [[e4,a4]@2 [d4,g#4]] [c#4,e4,a4] [d4,f#4,a4] [d4,g4,b4] [d4,g4,d5]",   // 1-2
  "[e4,g#4,b4]@3 [e4,a4,c#5]@3 [f#4,a4,d5]@3 [g4,b4,d5]@5 [f#4,a4,d5] [e4,g#4,b4]@3 [a4,c#5]@3 [f#4,a4,d5]@2 [g4,b4,e5], ~@6 [e4@2 g4] ~",   // 3-4
  "[f#4,a4,d5] f#4 [[b3,e4,g#4]@2 [d4,g#4]] [c#4,e4,a4] [e4,a4,c#5] a4 [[d4,g4,b4]@2 [f#4,a4]] [e4,b4], ~ [[d4,b4]@2 [c#4,a4]] ~@3 [[f#4,d5]@2 [e4,c#5]] ~@2",   // 5-6
  "[[e4,a4,c#5]@2 [g4,a4,e5]] [f#4,a4,d5] b4 f#4 [b3,e4,g#4] [c#4,e4,a4] [d4,g#4,b4] [c#4,e4,a4], ~@2 [[f#4,d5]@2 [e4,c#5]] [[d4,b4]@2 [c#4,a4]] ~@4",   // 7-8
  "[b3,e4,g#4]@3 [c#4,e4,a4]@3 e4@3 [b3,e4]@3 a4@3 [c#4,e4,a4]@2 [b3,d4,g#4] [c#4,e4,a4]@6, ~@2 [[b3,g#4]@2 [c#4,a4]] [a4@2 g#4] [[c#4,e4]@2 [d4,f#4]] ~@3",   // 9-10
  "c#4 [c#4,e4,a4] [c#4,e4,a4] [[c#4,e4,a4]@2 [e4,a4,c#5]] a4 [f#4,a4,d5] [f#4,a4,d5] [f#4,a4,d5], [[e4,a4]@2 [b3,b4]] ~@3 [[f#4,d5]@2 [e4,e5]] ~@3",   // 11-12
  "[e4,b4,d5] [f#4,a4,d5] d5 g4 a4 [f#4,a4,d5] [f#4,a4,d5] [f#4,a4,d5], ~@2 [[g4,b4]@2 [f#4,a4]] [[b4,d5]@2 [a4,c#5]] [[f#4,d5]@2 [e4,e5]] ~@3",   // 13-14
  "[g4,b4,d5] [[e4,a4,c#5]@2 [d4,f#4,b4]] f#4 [c#4,f#4] [d#4,f#4,b4] [e4,g#4,b4] [e4,a4,c#5] [f#4,a4,d5], ~@2 [[c#4,a#4]@2 [d4,b4]] [b4@2 a#4] ~@4",   // 15-16
  "[g4,b4,d5] [e4,a4,c#5] [f#4,a4,d5] [e4,a4,c#5] [e4,a4,c#5] [a4,c#5,e5] [a4,d5,f#5] [a4,c#5,e5]",   // 17-18
  "[a4,d5,f#5]@3 [a4,c#5,e5]@3 [a4,d5,f#5]@3 [a4,e5]@3 d5@3 [a4,d5,f#5]@2 [g4,c#5,e5] [f#4,a4,d5,f#5]@6, ~@3 [d5@2 c#5] [[a4,f#5]@2 [b4,g5]] ~@3",   // 19-20
]
const gigueLH = [
  "d3 [g3@2 f#3] [e3@2 d3] [c#3@2 b2] a2 d2 g2 b2",   // 1-2
  "e3@3 a2@3 d3@3 g2@5 d2 e2@3 a2@3 d3@2 g2",   // 3-4
  "d3 d3 [e3@2 b2] a2 a2 d3 [g3@2 d3] g#2",   // 5-6
  "[a2 b2 c#3] d3 d2 d2 e2 e2 e2 e2",   // 7-8
  "e2 e2 e2 e2 a2 a2 [a2,e3,a3]@2",   // 9-10
  "[a2@2 g#2] a2 a2 a2 [d3@2 c#3] d3 d3 d3",   // 11-12
  "g2 d3 [g2@2 d3] [g2@2 a2] [d3@2 c#3] d3 d3 d3",   // 13-14
  "g2 [a2@2 b2] f#2 f#2 b2 e3 a2 d3",   // 15-16
  "g2 a2 d3 a2 a2 a2 a2 a2",   // 17-18
  "a2 a2 a2 a2 [d2,d3] [d2,d3] [d2,d3]@2",   // 19-20
]

// Each Kanon voice from bar 1, one cycle per line above; the last is bar 57's final chord, which
// section 6 plays as its close.
const ground = "d3 a2 b2 f#2 g2 d2 g2 a2"   // the ground bass: D A B F# G D G A
const kanonParts = {
  v1: ["~", ...kanon, "a4@1 ~@7"],                              // enters at bar 3
  v2: ["~", "~", ...kanon.slice(0, -1), "f#5@1 ~@7"],           // two bars later (this is what makes it a canon)
  v3: ["~", "~", "~", ...kanon.slice(0, -2), "d5@1 ~@7"],       // four bars later
  o1: ["~", "~", "~", "~", ...kanon.slice(0, -3), "a5@1 ~@7"],  // the organ: a fourth voice six bars later (not in the score)
  cello: [...Array(28).fill(ground), "d3@1 ~@7"],
  rh: kanonRH, lh: kanonLH,                                     // Seiffert's cembalo
}
const giguePart = { v1: gigueV1, v2: gigueV2, v3: gigueV3, cello: gigueCello, rh: gigueRH, lh: gigueLH }

// Sections 1-6 are stretches of the Kanon (bars from-to, every voice as the score has it there);
// section 7 is the Gigue with both halves repeated.
const kanonBars = { 1: [1, 10], 2: [11, 18], 3: [19, 26], 4: [27, 38], 5: [39, 48], 6: [49, 56] }
const cyclesIn = sec => (kanonBars[sec][1] - kanonBars[sec][0] + 1) / 2
const gigueOrder = [0, 1, 2, 3, 4, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 5, 6, 7, 8, 9]   // ||: bars 1-10 :||: 11-20 :||
// a voice's line in the score, for any section and section 6's close (silence where it has none)
const score = voice => (sec, part) => part === 'close' ? note(kanonParts[voice]?.at(-1) ?? "~")
  : sec === 7
  ? (giguePart[voice] ? note(cat(...gigueOrder.map(i => giguePart[voice][i]))) : silence)
  : note(cat(...kanonParts[voice].slice((kanonBars[sec][0] - 1) / 2, kanonBars[sec][1] / 2)))
// in section 6's close (bar 57) the other voices sound only with the final chord, on its first beat
const closing = pat => (sec, part) => part === 'close' ? pat.mask("[1 0@7]") : pat
// voices built on the ground bass's harmony rest in the Gigue, which has its own
const overGround = pat => (sec, part) => sec === 7 ? silence : closing(pat)(sec, part)

// ---- material: the arrangement ----

// the arrangement's own block chords, D A Bm F#m G D G A, from before it had Seiffert's cembalo:
// strings 2 and harpsichord 2 play them
const chords = note("[d4,f#4,a4] [c#4,e4,a4] [b3,d4,f#4] [a3,c#4,f#4] [b3,d4,g4] [a3,d4,f#4] [b3,d4,g4] [a3,c#4,e4]")

// triplet flute solo: each [a b c] squeezes three notes into one beat
// two phrases, one per cycle; ~ leaves a gap inside the triplet, _ holds the note before it
const fluteSolo = note(cat(
  "[f#5 e5 d5] [c#5 e5 a5] [b5 ~ f#5] [a5 f#5 c#5] [d5 ~ b5] [a5 f#5 d5] [g5 b5 d6] [c#6 a5 e5]",
  "[d6 _ a5] [c#6 b5 a5] [b5 ~ f#5] [a5 f#5 e5] [d5 _ g5] [f#5 e5 d5] [b4 d5 g5] [e5 _ c#5]"
))

// random flute: segment(24) = three notes per beat, an octave above Seiffert's chords.
// Each beat ("r") randomly picks one of the first five triplet shapes: all three notes,
// a held middle (_) or a gap (~). Repeat a shape to make it more likely.
// The last shape is a trill: the final third of the triplet becomes four quick notes
// alternating with the next note up the scale. It can only happen on beat 4, the end of the
// first phrase: [r|r|r|trill] picks one of the four at random each cycle, so a 1-in-4 chance.
// Change the odds by changing the list ([r|trill] = 1 in 2), or put another one on beat 8
// for a trill on the A chord leading back to D.
// early(1000) just gives the shape choice different random numbers from the note choice,
// so the two don't move together.
// Keep both lists the same length and in the same order: fluteupper says which notes
// step up the scale (1) for each shape.
const flutetriplets = ["[x x x]", "[x x x]", "[x x x]", "[x _ x]", "[x ~ x]", "[x x [x x x x]]"]
const fluteupper    = ["0",       "0",       "0",       "0",       "0",       "[0 0 [0 1 0 1]]"]
const fluteshape = "r r r [r|r|r|trill] r r r r".pick({
  r: irand(5).early(1000).segment(8),   // 5 = how many shapes before the trill
  trill: pure(5).segment(8),            // 5 = position of the trill in the lists (counting from 0)
})

// funk walking sub-bass, after the Minimoog bass lines on Parliament records.
// Every beat starts on the ground-bass note, so it always lands on the chord; the rest of the
// beat is a random cell, counted in steps up the D major scale from that note:
// 0 = the ground-bass note, 4 = its fifth, 7 = an octave up, 6 = the note just under that, -1 = one below.
// Repeat a cell to make it more likely; add your own as [a b c d] (four sixteenths per beat).
const funkcells = ["[0 ~ ~ 0]", "[0 ~ 7 ~]", "[0 ~ ~ 7]", "[0 7 ~ 4]", "[0@3 -1]", "[0 ~ 4 6]"]

// ---- the piece ----

piece('canon-in-d', { bpm: 56, beats: 8 })   // arrives at Seiffert's Sostenuto, quarter = 56; 8 beats per cycle

sections({
  1: { cycles: cyclesIn(1) },     // bars 1-10: the ground alone, then the canon in quarters and eighths
  2: { cycles: cyclesIn(2) },     // bars 11-18: sixteenths, then long high notes
  3: { cycles: cyclesIn(3) },     // bars 19-26: thirty-second runs, then staccato eighths
  4: { cycles: cyclesIn(4) },     // bars 27-38: arpeggios and repeated sixteenths, the busiest
  5: { cycles: cyclesIn(5) },     // bars 39-48: poco meno, lyrical again
  6: { cycles: cyclesIn(6), leave: { shape: 'ritardando', beats: 8 }, close: 0.5 },   // bars 49-56; when left, it slows through
                                  // bars 55-56 (rall. poco a poco) into its close, bar 57's final chord
  7: { cycles: 20, bpm: 100, exits: [5, 10, 15], leave: { shape: 'ritardando', beats: 4 } },   // the Gigue, dotted quarter = 100; poco rit. at the end of each half
})

// Gains are the arrangement's old mix scaled by 0.065, so that the loudest variants of all 17 voices
// together stay under 1 (there is no limiter: past 1 the output clips; tools/check.mjs warns).
// Seiffert's chords are fuller than the old ones (up to four notes in a hand, seven for both), so
// strings 1 and harpsichord 1 play each note softer, to peak where the old chords did.
// Turn up the monitors rather than these.
voices({
  // the ground bass in the Kanon, the Gigue's bass line in the Gigue
  cello: {
    1: (sec, part) => score('cello')(sec, part).s("gm_cello").gain(0.052),
  },
  // held chords: 1 the right hand of Seiffert's cembalo, in every section; 2 the arrangement's own
  // block chords, D A Bm F#m G D G A, which rest in the Gigue (sideways alternatives)
  strings: {
    1: (sec, part) => score('rh')(sec, part).s("gm_string_ensemble_1").gain(0.017),
    2: overGround(chords.s("gm_string_ensemble_1").gain(0.023)),
  },
  // The violins play their parts from the score, the canon voices a cycle apart. Every cycle is the
  // top of a phrase for each of them, so they come in and leave at any cycle (the default).
  v1: {
    1: (sec, part) => score('v1')(sec, part).s("gm_violin").gain(0.039).pan(0.5),
  },
  v2: {
    1: (sec, part) => score('v2')(sec, part).s("gm_violin").gain(0.033).pan(0),
  },
  v3: {
    1: (sec, part) => score('v3')(sec, part).s("gm_violin").gain(0.029).pan(1),
  },
  // organ 1: a fourth canon voice, a cycle behind violin 3, through a "Leslie": the spinning speaker
  // of a tonewheel organ. It rests in the Gigue.
  // tremolo = volume wobbles per second (depth 0-1), vib/vibmod = pitch wobbles per second and
  // how far (in semitones). Two copies wobbling in opposite phase, a little apart, make it swirl.
  // Fast Leslie: tremolo(6).vib(6). Slow "chorale": tremolo(0.8).vib(0.8).
  o1: {
    1: (sec, part) => score('o1')(sec, part).s("gm_rock_organ").gain(0.091).room(1)
      .tremolo(6).tremolodepth(0.3).vib(6).vibmod(0.1)
      .pan(0.25).superimpose(x => x.tremolophase(0.5).pan(0.75)),   // the pair sits around 0.75
  },
  // harpsichord (sideways alternatives): 1 Seiffert's cembalo part as he wrote it, both hands, in
  // every section; 2 a random arpeggio through the block chords, resting in the Gigue:
  // segment(32) = quarter-beats (8 = beats, 16 = half-beats); add .ribbon(0, 1) to loop one random
  // line, and change the 0 for a different one
  harpsichord: {
    1: (sec, part) => stack(score('rh')(sec, part), score('lh')(sec, part)).s("gm_harpsichord").gain(0.01),
    2: overGround(chords.arp(irand(3).segment(32)).s("gm_harpsichord").gain(0.033)),
  },
  // 2 picks its notes from Seiffert's right hand, a beat's chord at a time (segment(8)). Both rest
  // in the Gigue: the solo is written over the ground, and 2 steps up the D major scale, which
  // would flatten the Gigue's G#, A# and D#.
  flute: {
    1: overGround(fluteSolo.s("gm_flute").gain(0.039).room(0.4)),
    2: (sec, part) => overGround(score('rh')(sec, part).segment(8).arp(irand(3).segment(24))
      .struct(fluteshape.inhabit(flutetriplets))
      .transpose(12)
      .scale("D:major").scaleTranspose(fluteshape.inhabit(fluteupper))
      .s("gm_flute").gain(0.033).room(0.4).pan(0.25))(sec, part),
  },

  // ---- electronic ----
  // The drums play in the Gigue too: a cycle there is eight dotted-quarter beats.

  kit: {
    1: closing(s("[bd*8]").bank("RolandTR909").gain(0.052)),                                    // four on the floor
    2: closing(s("[bd*4!3 bd*8]").bank("RolandTR909").gain(0.052)),                             // a little more lively
    3: closing(s("<bd*8!3 [bd*4!3 bd*8]>").bank("RolandTR909").gain(0.052)),                    // an uptempo every 4th phrase
    4: closing(s("<<bd*8!3 [bd*4!3 bd*16]> [bd*4!3 bd*8]>").bank("RolandTR909").gain(0.052)),   // more structure, a little more fun
  },
  shaker: {
    1: closing(s("[sh:8 sh:0 ~ ~]*32").bank("RolandMC303").gain(0.013).late(.001)),
    2: closing(s("[sh:8]*32").bank("RolandMC303").gain(0.007)),
  },
  hats: {
    1: closing(s("[~ hh]*8").bank("RolandTR909").gain(0.033)),                       // off-beat hats
    2: closing(s("<[~ hh]*8!3 [hh*32]>").bank("RolandTR909").gain(0.033)),           // with occasional fast notes
  },
  ebass: {                                     // sawtooth bass, an octave under the cello
    1: (sec, part) => score('cello')(sec, part).transpose(-12).s("sawtooth").lpf(600).gain(0.052),
  },
  elead: {                                     // filtered saw lead on violin 1's line, with a slow filter sweep
    1: (sec, part) => score('v1')(sec, part).s("sawtooth").lpf(sine.range(400, 4000).slow(4)).gain(0.026).delay(0.3).pan(sine.range(0, 1)),
  },
  // air raid siren: one long sawtooth note per cycle, with a slow, very wide vibrato doing the wail.
  // vib = wails per second, vibmod = how far it swings (semitones either side)
  siren: {
    1: closing(note("d4").s("sawtooth").vib(0.0625).vibmod(12).attack(1).release(2)
      .lpf(2500).gain(0.033).room(2).pan(sine.slow(12))),
  },
  funksynth: {                                 // on the ground bass, so it rests in the Gigue
    1: overGround(n("0 -3 -2 -5 -4 -7 -4 -3"   // the ground bass as scale steps from D2: D A B F# G D G A
        .add.out(irand(funkcells.length).early(2000).segment(8).inhabit(funkcells)))
      .scale("D2:major")
      .s("sawtooth").lpf(12400).lpq(8).lpenv(3).lpdecay(0.15).lpsustain(0.2)  // resonant filter "squelch"
      .superimpose(x => x.s("sine"))                                          // pure sine underneath for weight
      .gain(0.046)),
  },
  // second drum kit: a cheap 1980s Casio RZ-1, played loose against the 909.
  // Each [ ... ]*2 is one bar of sixteenths, played twice per cycle (8 beats = 2 bars).
  // crush and coarse make it grittier, in opposite directions: crush is bit depth, 1 (harsh) to 16
  // (almost clean); coarse keeps every nth sample, 1 clean and higher rougher. rand and degradeBy
  // make every bar a bit different.
  kit2: {
    1: closing(stack(
      s("[~ ~ ~ ~ sd ~ ~ ~ ~ ~ ~ ~ sd ~ ~ ~]*2").gain(0.065),                                // backbeat on 2 and 4
      s("[~ ~ ~ sd ~ ~ sd ~ ~ sd ~ ~ ~ ~ ~ sd]*2").gain(0.065).degradeBy(0.4),             // ghost snares, some dropped
      s("[bd ~ ~ ~ ~ ~ bd ~ ~ ~ bd ~ ~ ~ ~ ~]*2").gain(0.065),                               // lazy kick
      s("hh*16").gain(rand.range(0.007, 0.026)).degradeBy(0.2),                             // uneven hats
      s("[~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ cb ~]").gain(0.026),                                   // a cowbell once a cycle
    ).bank("CasioRZ1").crush(10).coarse(4)),
  },
  // beep (sideways alternatives), all on random beats; degradeBy(0.8) skips about 8 in 10.
  // 1: a short, high electronic blip: a square wave (the buzzy one) on B6 that switches on
  //    instantly and stops after a tenth of a second. Higher: "b7"; softer: lower the lpf.
  // 2: the scanner: three rising struck notes, A4 C5 E5, measured from a phone recording of one
  //    (they start about 0.12 s and 0.14 s apart, and each rings on under the next). Like a
  //    vibraphone bar, each has an overtone two octaves up (A6 C7 E7) that is bright at the strike
  //    and gone within a tenth of a second; the note itself dies away over about a second
  //    (decay; clip lets it ring past the next note). Each [ ] is one beat: the notes fill its
  //    first half in the Kanon, more of it in the Gigue's quicker beat, so they take about the same
  //    time in both. The mask keeps or skips the whole figure together.
  // 3: the same figure on a sampled vibraphone. Or try gm_marimba, gm_xylophone, gm_glockenspiel.
  beep: {
    1: closing(note("b6*8").degradeBy(0.8)
      .s("square").attack(0.001).decay(0.1).sustain(0).release(0.01)
      .lpf(5000).gain(0.016)),
    2: (sec, part) => closing(stack(
      note(sec === 7 ? "[a4 c5 e5@2 ~]*8" : "[a4 c5 e5@2 ~@4]*8").gain(0.011).decay(1),
      note(sec === 7 ? "[a6 c7 e7@2 ~]*8" : "[a6 c7 e7@2 ~@4]*8").gain(0.005).decay(0.08))
      .mask("1*8".degradeBy(0.8))
      .s("sine").attack(0.002).sustain(0).release(0.05).clip(10))(sec, part),
    3: (sec, part) => closing(note(sec === 7 ? "[a4 c5 e5@2 ~]*8" : "[a4 c5 e5@2 ~@4]*8")
      .mask("1*8".degradeBy(0.8))
      .s("gm_vibraphone").clip(10).gain(0.016))(sec, part),
  },
})
