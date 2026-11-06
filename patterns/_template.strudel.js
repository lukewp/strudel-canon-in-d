// @title New piece (copy this file to start one: patterns/NN-name.strudel.js)
// @by Composer (year, public domain), arranged for strudel-canon-in-d
//
// Play it by changing a value in the control panel and re-running (Cmd+Enter; Ctrl+Enter on Windows/Linux): the machinery
// below makes every change land musically. The words (section, voice, variant, exit point…)
// are defined in CONTEXT.md at the root of the repo.
//
// Quotes matter: "double quotes" are mini-notation (notes, rhythms, sample names);
// 'single quotes' are plain JavaScript strings.
//
// Check it offline before playing: node tools/check.mjs patterns/NN-name.strudel.js

// ---- control panel ----
const master = 1         // the whole mix's level, 0..1

const play = {           // a variant per voice: 0 silent, 1, 2… more
  bass: 1,
  pad: 1,
  lead: 0,               // 1 the tune, 2 an octave up (twice as fast in section 2)
  kit: 0,                // 1 straight, 2 busier
}
const section = 1        // 1 calm, 2 lively, 0 the end (after the pass); the piece moves at the section's next exit point
const bars = {           // where the pass is: a mark per bar, lit by Strudel VS as the bars play
  1: "I I I I",
  2: "I I I I",
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

// ---- material: write it once, build the voices from it ----

// the harmony, one chord per slot of the cycle
const chords = note("[c4,e4,g4] [a3,c4,e4] [f3,a3,c4] [g3,b3,d4]")

// the tune
const melody = note("e5 g5 a5 e5 f5 c5 d5 b4")

// ---- the piece ----
// piece(name, { bpm, beats, bar }): the tempo it arrives at, the beats in a cycle and in a bar
//   (default 4). Running another piece's file ends this one as if set to 0, but at its section's
//   next exit point (with its handover shape and close); then that one starts. The file run last
//   always comes in last, even this one run again on its way out.
// sections({ n: { … } }), every value but cycles optional:
//   cycles   the length of a pass
//   exits    cycles within the pass where the section may also be left for another (the end of a pass
//            always is); section 0, the end, ignores them and lets the pass play out
//   bpm      its tempo (default: the piece's); the music is stretched to it, the clock stays put
//   leave    its handover shape: 'plain' (default), 'ritardando' or 'accelerando', or
//            { shape, beats, curve: 'linear' | 'ease', to: bpm } (defaults: the rest of the pass,
//            linear, the next section's tempo or a quarter slower/faster)
//   close    cycles of music played once when the section is left, after its exit point and its
//            handover shape (at the tempo that ended on), before what comes next; never while it
//            plays on pass after pass. Section 0 in the panel leaves with it too, then silence.
//   then     the section it moves on to by itself after one pass (0: the end), leaving with its
//            handover shape and close, unless the panel asks for another section first
// voices({ name: { … } }):
//   1, 2…    its variants: a pattern, or (sec, part) => pattern for material that differs by
//            section; part is 'pass', or 'close' for the section's close (a plain pattern plays
//            its first cycles there)
//   enter    entry points, [every, offset] in cycles from the section's first beat (default: every cycle)
//   exit     exit points, the same way. A section change is an entry and exit point for every voice.

piece('template', { bpm: 60, beats: 4 })      // arrives at 60 beats per minute, 4 beats per cycle

sections({
  1: { cycles: 4, exits: [2] },                // calm: can be left halfway or at the end of its pass
  2: { cycles: 4, bpm: 72, leave: 'ritardando', close: 0.5 },  // lively, faster; slows into a final chord
})

voices({
  bass: {                                      // the chord roots
    1: (sec, part) => note(part === 'close' ? "c2" : "c2 a1 f1 g1").s("gm_acoustic_bass").gain(0.25),
  },
  pad: {                                       // the chords, held
    1: (sec, part) => (part === 'close' ? note("[c4,e4,g4]") : chords).s("gm_string_ensemble_1").gain(0.08),
  },
  lead: {                                      // the tune, from the top of its phrase
    enter: [2, 0], exit: [2, 0],
    1: melody.s("gm_flute").gain(0.2).room(0.3),
    2: sec => melody.add(note(12)).s("gm_flute").gain(0.2).room(0.3).fast(sec === 2 ? 2 : 1),
  },
  kit: {
    1: s("bd*4, [~ sd]*2, hh*8").bank("RolandTR909").gain(0.1),
    2: s("bd*4, [~ sd]*2, hh*16").bank("RolandTR909").gain(0.1),
  },
})
