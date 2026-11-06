// What the Strudel REPL does around a pattern file, offline: transpile it, run it in a scope
// with Strudel's functions, collect the labelled voices and apply all() (see repl.mjs in
// @strudel/core). Shared by check.mjs and the machinery tests.
//
//   const repl = await createRepl()
//   const { pattern } = await repl.run(source, { at: 2.5 })   // as if Ctrl+Enter at cycle 2.5
//
// Like the long-lived Strudel page, the scope and globalThis persist from one run to the next.

import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register('./stub-hooks.mjs', pathToFileURL(new URL('./', import.meta.url).pathname))
export const core = await import('@strudel/core')
const mini = await import('@strudel/mini')
const tonal = await import('@strudel/tonal')
const { transpiler } = await import('@strudel/transpiler')

export async function createRepl() {
  let pPatterns = {}, anonymous = 0, allTransforms = [], now = 0
  const repl = { cpm: undefined, logs: [] }
  // Plain strings stay plain, as in Strudel VS (it never calls miniAllStrings): only double-quoted and
  // backtick literals are mini-notation, via the transpiler. s('<a ~>') asks for a sound called '<a ~>'.
  core.setStringParser(undefined)
  core.setTime(() => now)
  const noop = () => core.silence
  Object.assign(globalThis, core, mini, tonal, {
    all: f => { allTransforms.push(f); return core.silence },
    each: noop, hush: noop, samples: noop, initHydra: noop, H: noop,
    setcps: cps => { repl.cpm = cps * 60; return core.silence },
    setcpm: cpm => { repl.cpm = cpm; return core.silence },
  })
  globalThis.setCps = globalThis.setcps
  globalThis.setCpm = globalThis.setcpm

  // run(source, { at, rewrite }): rewrite(transpiled code) lets check.mjs instrument the labels.
  repl.run = async (source, { at = 0, rewrite = code => code } = {}) => {
    now = at
    pPatterns = {}; anonymous = 0; allTransforms = []
    core.Pattern.prototype.p = function (id) {
      if (typeof id === 'string' && (id.startsWith('_') || id.endsWith('_'))) return core.silence
      if (id.includes('$')) id = `${id}${anonymous++}`
      pPatterns[id] = this
      return this
    }
    let output
    try { output = rewrite(transpiler(source, {}).output) } catch (err) { err.stage = 'transpile'; throw err }
    const logs = [], log = console.log
    console.log = (...args) => logs.push(args.join(' '))
    try {
      const value = await new Function(`return (async () => { ${output} })()`)()
      let pattern = Object.keys(pPatterns).length ? core.stack(...Object.values(pPatterns)) : value
      for (const f of allTransforms) pattern = f(pattern)
      return { pattern: core.isPattern(pattern) ? pattern : core.silence, logs }
    } finally {
      console.log = log
      repl.logs.push(...logs)
    }
  }
  return repl
}
