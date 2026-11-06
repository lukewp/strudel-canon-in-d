// Tests for tools/check.mjs, run as the performer would: on a copy of the template with one slip.
//
//   node --test tools/*.test.mjs

import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

const templatePath = new URL('../patterns/_template.strudel.js', import.meta.url).pathname
const template = readFileSync(templatePath, 'utf8')
const dir = mkdtempSync(join(tmpdir(), 'check-'))
const version = template.match(/^\/\/ #region machinery (v\d+)$/m)[1]

const check = (source, name = 'piece.strudel.js') => {
  const file = join(dir, name)
  writeFileSync(file, source)
  const { status, stdout, stderr } = spawnSync(process.execPath, [new URL('./check.mjs', import.meta.url).pathname, file], { encoding: 'utf8' })
  return { status, output: stdout + stderr }
}
const edit = (from, to) => {
  assert.ok(template.includes(from), `the template no longer contains ${from}`)
  return template.replace(from, to)
}

test('the template passes', () => {
  const { status, output } = check(template)
  assert.equal(status, 0, output)
  assert.match(output, /No problems found/)
})

test('a panel value naming no variant is flagged', () => {
  const { status, output } = check(edit('  bass: 1,', '  bass: 4,'))
  assert.equal(status, 1, output)
  assert.match(output, /no bass variant 4/)
})

test('a panel value naming no section is flagged', () => {
  const { status, output } = check(edit('const section = 1 ', 'const section = 3 '))
  assert.equal(status, 1, output)
  assert.match(output, /no section 3/)
})

test('a panel entry naming no voice is flagged', () => {
  const { status, output } = check(edit('  kit: 0,', '  kit: 0,\n  drums: 1,'))
  assert.equal(status, 1, output)
  assert.match(output, /no voice drums/)
})

test('loud variants that could clip together are warned about, whatever the panel plays now', () => {
  const { status, output } = check(edit('.bank("RolandTR909").gain(0.1),\n    2:', '.bank("RolandTR909").gain(0.6),\n    2:'))
  assert.equal(status, 1, output)
  assert.match(output, /could clip/)
  assert.match(output, /kit 1\.8/)   // bd, sd and hh together at 0.6 each
})

test('voices that never play in the same section aren\'t added up together', () => {
  // the kit rests in section 2 and a boom as loud plays there instead: each section adds up to 1 or less
  const source = edit('  kit: {\n', '  boom: { 1: sec => sec === 2 ? s("bd").bank("RolandTR909").gain(0.3) : silence },\n  kit: {\n')
    .replace('1: s("bd*4, [~ sd]*2, hh*8")', '1: sec => sec === 2 ? silence : s("bd*4, [~ sd]*2, hh*8")')
    .replace('2: s("bd*4, [~ sd]*2, hh*16")', '2: sec => sec === 2 ? silence : s("bd*4, [~ sd]*2, hh*16")')
  const { status, output } = check(source)
  assert.equal(status, 0, output)
  const louder = check(source.replace('.gain(0.3) : silence', '.gain(0.4) : silence')).output
  assert.match(louder, /could clip in section 2: .* 1\.09 .*boom 0\.4/)
})

test('a machinery block that differs from the template\'s is flagged', () => {
  const { status, output } = check(edit('const ahead = 1 / 8', 'const ahead = 1 / 4'))
  assert.equal(status, 1, output)
  assert.match(output, new RegExp(`machinery ${version} differs from the template's`))
})

test('a machinery block from another version is flagged by version', () => {
  const { status, output } = check(edit(`// #region machinery ${version}`, '// #region machinery v0'))
  assert.equal(status, 1, output)
  assert.match(output, new RegExp(`machinery v0.*template has ${version}`))
})

const restsInSection2 = () => edit('2: sec => melody.add(note(12))', '2: sec => sec === 2 ? silence : melody.add(note(12))')

test('a variant that rests in some sections on purpose is not a problem', () => {
  const { status, output } = check(restsInSection2())
  assert.equal(status, 0, output)
  assert.match(output, /lead 2 \(section 2\): rests/)
})

test('a variant with no notes in any section is still flagged', () => {
  const { status, output } = check(edit('2: sec => melody.add(note(12))', '2: sec => silence.add(note(12))'))
  assert.equal(status, 1, output)
  assert.match(output, /lead 2.*no notes at all/)
})

test('--sections limits the check to the sections named', () => {
  const all = check(template).output
  const only2 = spawnSync(process.execPath, [new URL('./check.mjs', import.meta.url).pathname, join(dir, 'piece.strudel.js'), '--sections', '2'], { encoding: 'utf8' }).stdout
  assert.match(all, /\(section 1\)/)
  assert.match(only2, /lead 2 \(section 2\)/)
  assert.doesNotMatch(only2, /\(section 1\)/)
})

test('section 0, the end, is not a slip', () => {
  const { status, output } = check(edit('const section = 1 ', 'const section = 0 '))
  assert.equal(status, 0, output)
})

test('a bar meter line with the wrong number of marks for its section is flagged', () => {
  const { status, output } = check(edit('2: "I I I I"', '2: "I I I"'))
  assert.equal(status, 1, output)
  assert.match(output, /bar meter: section 2 has 4 bars, but its line has 3 marks/)
})

test('a sound name written as mini-notation in a plain string is flagged', () => {
  const { status, output } = check(edit('1: melody.s("gm_flute")', "1: melody.s('<gm_flute ~>')"))
  assert.equal(status, 1, output)
  assert.match(output, /sound names? .*<gm_flute ~>.*single quotes/)
})

test('a soundfont name Strudel VS doesn\'t have is flagged, with names it does have', () => {
  const { status, output } = check(edit('1: melody.s("gm_flute")', '1: melody.s("gm_acoustic_grand_piano")'))
  assert.equal(status, 1, output)
  assert.match(output, /gm_acoustic_grand_piano isn't one of Strudel VS's soundfonts/)
  assert.match(output, /gm_piano\b/)
})

// The list the checker uses was copied out of Strudel VS's bundle; if the installed extension's
// own list differs (a new version), copy it again. Skipped where Strudel VS isn't installed.
const extensions = join(homedir(), '.vscode', 'extensions')
const strudelVS = existsSync(extensions) && readdirSync(extensions).filter(d => d.startsWith('cmillsdev.strudelvs-')).sort().at(-1)
test('the soundfont list matches the installed Strudel VS', { skip: !strudelVS && 'Strudel VS is not installed' }, () => {
  const bundle = readFileSync(join(extensions, strudelVS, 'dist', 'strudel.js'), 'utf8')
  const from = bundle.indexOf('var gm = {')
  const installed = [...bundle.slice(from, bundle.indexOf('\n  };', from)).matchAll(/^\s*(gm_\w+):/gm)].map(m => m[1])
  const ours = JSON.parse(readFileSync(new URL('./gm-sounds.json', import.meta.url), 'utf8')).names
  assert.deepEqual(ours, installed, `tools/gm-sounds.json differs from ${strudelVS}'s soundfonts`)
})
