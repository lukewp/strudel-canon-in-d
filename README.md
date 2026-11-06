# Pachelbel's Canon, live-coded

Johann Pachelbel's *Kanon und Gigue* for three violins and continuo (c. 1680), transcribed in full and arranged for live performance in [Strudel](https://strudel.cc), the JavaScript port of TidalCycles. It's played from VS Code: you steer the whole piece by changing numbers in a control panel at the top of one file, and every change lands on a phrase boundary, so nothing is ever cut off mid-note or comes in mid-phrase.

[![Playing the Canon in VS Code: the code, the edits and re-runs, and the sound](https://i.vimeocdn.com/video/2222394046-fb869cff68619387f53fdb27d1b6d08cf52240cd340193e3814aa8e135293082-d_1280x720?region=us)](https://vimeo.com/1243772078)

**▶ [Watch it played](https://vimeo.com/1243772078)** (6 minutes, on Vimeo)

## Play it

1. Install [VS Code](https://code.visualstudio.com) and the [Strudel VS](https://marketplace.visualstudio.com/items?itemName=cmillsdev.strudelvs) extension (VS Code offers it when you open this folder).
2. Open `patterns/02-canon-in-d.strudel.js` and press **Cmd+Enter** (Ctrl+Enter on Windows and Linux). The cello starts alone with the ground bass, D A B F♯ G D G A, and the three violins enter two bars apart, as in the score.
3. Change a number in the control panel and press Cmd+Enter again. **Cmd+.** stops.

Play it in Strudel VS: that's where it was built and tested. It also runs pasted into [strudel.cc](https://strudel.cc), but there you'll hear a gap between sections that Strudel VS doesn't have. Why isn't known yet.

```js
const play = {           // a variant per voice: 0 silent
  cello: 1,              // the ground bass
  strings: 0,            // held chords: 1 Seiffert's, 2 the old block chords
  v1: 1,                 // violin 1: the canon subject
  v2: 1,                 // violin 2: the canon, one cycle behind
  v3: 1,                 // violin 3: two cycles behind
  ...
}
const section = 1        // 1 opening … 6 the close; 7 the Gigue; 0 the end
const bars = {           // where the pass is, a mark per bar, lit as the bars play
  1: "I I I I I I I I I I",
  ...
```

A good first run: let the canon build as each violin enters two bars behind the one before, then bring in `strings`. Then move `section` up through 2, 3 and 4 as the variations get busier. Leaving section 6 slows into the Kanon's final chord; 7 is the Gigue; 0 ends the piece. The marks under `bars` light up bar by bar, so you can see how far the current pass has to go.

### The riser

[The video](https://vimeo.com/1243772078) opens and closes with [`interludes/riser-impact.strudel.js`](interludes/riser-impact.strudel.js): a four-bar roll that rises into a single hit, then silence. It's a piece of its own file, with its own control panel, so it shows how one file hands over to another:

- **To open:** run the riser, then run the Canon while the riser is still building. The riser plays out to its silence, then the Canon starts on the next downbeat.
- **To close:** with the Canon playing, run the riser. The Canon plays on to its section's next exit point and leaves as it would for `section = 0` (from section 6, slowing into the final chord), then the riser builds.

In the riser's panel, `section = 2` holds the roll at full tilt until you set 3 for the hit; `riser`, `lift` and `impact` pick the roll, what rises under it, and the hit.

## What it does, and why

Live-coded sets are usually played by commenting lines in and out. That works, but on stage every slip is audible: a voice cut off mid-phrase, a section that can't be left as a whole, a tempo that jumps, a typo that silences everything. This piece is built so that the code steering it can be changed carelessly and still sound deliberate.

- **A control panel, not commented-out lines.** Each voice has numbered variants (0 is silent); one value picks the section. The panel is always the truth about what's playing or about to.
- **Changes wait for the music.** A voice changes at its own entry and exit points; a section change waits for the section's next exit point, and every voice moves with it.
- **Handover shapes.** A section can leave with a ritardando or accelerando, written into the section itself, so it slows the same way every time. Section 6 carries Seiffert's *rall. poco a poco* into bar 57's final chord, played once as the section's **close**, and never when the section just repeats.
- **Tempo by stretching, not by the clock.** Strudel has one global tempo that changes instantly; here each section's tempo is a stretch of the music against that clock, so a re-run can never jerk the tempo mid-ramp. The Kanon is at Seiffert's ♩ = 56, the Gigue at ♩. = 100.
- **A level budget.** Strudel has no limiter: voices add straight to the output. The gains are set so that the loudest variants of all 17 voices together stay under full scale.
- **A machinery block.** All of this lives in about 300 lines folded away below the panel (`// #region machinery`), copied unchanged into every piece so each file runs on its own. [`patterns/_template.strudel.js`](patterns/_template.strudel.js) holds the canonical copy and is the starting point for a new piece.

The words used here (section, pass, exit point, handover, variant, close…) are defined in [CONTEXT.md](CONTEXT.md); the reasoning behind the main choices is in [docs/adr/](docs/adr/). The full story of how it was built, including the bugs only the live instrument showed, is in **[docs/how-it-was-built.md](docs/how-it-was-built.md)**.

## The voices

| Voice | What it plays |
|---|---|
| cello | the ground bass; in the Gigue, its bass line |
| strings | 1: Seiffert's keyboard realization of the figured bass; 2: plain block chords |
| v1, v2, v3 | the three violins, a canon two and four bars apart, exactly as the score has them |
| o1 | a fourth canon voice (not in the score), on an organ through a rotating-speaker "Leslie" |
| harpsichord | 1: Seiffert's continuo part, both hands; 2: random arpeggios through the chords |
| flute | 1: a triplet solo; 2: random triplets on Seiffert's chords |
| kit, shaker, hats | a Roland 909 kit, a shaker and off-beat hats |
| ebass, elead | sawtooth bass under the cello; a filtered saw lead on violin 1's line |
| siren, funksynth, kit2, beep | an air-raid siren, a walking Minimoog-style sub-bass, a loose Casio RZ-1 kit, and, on random beats, short high blips, or three struck notes taken from a recording of a supermarket scanner (as a synth, or on a vibraphone) |

The chord-based voices rest in the Gigue, which has its own harmony; the drums play on.

## The score

Every note of the three violins and the continuo comes from **Max Seiffert's edition** (*Organum* III/24, Kistner & Siegel, Leipzig 1929; public domain), read with the help of **Jawher Matmati's 2016 engraving** of it. Both are in [research/scores/pachelbel-canon-gigue/](research/scores/pachelbel-canon-gigue/), with their provenance in `SOURCE.md`. Each pitch was checked against the engraving's notehead positions extracted from the PDF itself, then spot-checked against the 1929 print; how is in [docs/how-it-was-built.md](docs/how-it-was-built.md#3-transcribing-the-score). Seiffert's tempo and dynamic markings are his, not Pachelbel's; trills, slurs and dynamics are left out.

## Check it offline

The `tools/` folder runs a piece through Strudel's own transpiler and engine in Node, with no audio, so mistakes show up before you press play:

```bash
npm --prefix tools install
```

```bash
node tools/check.mjs patterns/02-canon-in-d.strudel.js
```

```bash
node --test tools/*.test.mjs
```

The checker lists every voice and variant with its notes, range and sounds, and flags code that won't run, General MIDI sound names Strudel VS doesn't have, control-panel values that name nothing, loud variants that could clip together in a section, and a machinery block that differs from the template's. The tests re-run small pieces at chosen moments, the way a performer re-runs the file, and check what plays; `canon.test.mjs` plays the Canon itself through staying on, leaving and ending its last section.

## Credits and licences

- **Music:** Johann Pachelbel (1653–1706), public domain.
- **Seiffert's 1929 edition:** public domain.
- **Matmati's engraving** (`IMSLP452042…pdf`): © 2016 Jawher Matmati, [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/), included unmodified.
- **Arrangement, riser, machinery and tools:** Luke Peterson, built with [Claude Code](https://claude.com/claude-code). [AGPL-3.0-or-later](LICENSE), the same as Strudel; the music and the scores in `research/` keep their own terms, listed here.
- **The video:** Luke Peterson, *strudel-pachelbel*, [Vimeo](https://vimeo.com/1243772078), 2026.
- **Inspiration:** the live-coded A/V set by NDA/ (Niki Scheijen and [Den Ree](https://github.com/den-ree)) at the Broncode Festival, KB, The Hague, 29 October 2026.
- **Strudel** is by the Strudel contributors, [AGPL-3.0](https://codeberg.org/uzu/strudel). Strudel VS is by cmillsdev.
