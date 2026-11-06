# Strudel explorations

A performance kit for live-coded music in Strudel: a repertoire of pieces, played live from code, built so that the performer has a lot of control and the audience never hears a halting exit, an abrupt entry, overlapping movements or voices out of sync.

## Performance

**Set**:
A live performance: a running order of pieces played one after another without stopping.
_Avoid_: Show, gig, session

**Running order**:
The planned sequence of pieces in a set, with notes on how each one arrives.
_Avoid_: Setlist, playlist

**Piece**:
One musical work, arranged for performance; one file, playable on its own.
_Avoid_: Song, track, pattern (a pattern is Strudel's building block, not a whole work)

**Handover**:
The moment one version of the music gives way to the next — a voice changing, or one piece giving way to another — timed so nothing is cut off or comes in mid-phrase.
_Avoid_: Crossfade, switch, cut

**Handover shape**:
How a section gives way to the next — plain, ritardando or accelerando — written into the section being left, so it happens the same way every time.
_Avoid_: Transition, effect

**Tempo ramp**:
A gradual change from the current tempo to a target, over a number of beats, along a curve (linear or ease). Within a piece it is a handover shape (ritardando, accelerando); between pieces it would be how the next piece arrives (not built: each piece arrives at its own tempo at once, ADR 0003).
_Avoid_: Tempo change, slide

**Interlude**:
A small piece of its own, run between two pieces whose keys or tempos are too far apart to ramp: a riser ending in an impact, then silence, after which the next piece starts fresh.
_Avoid_: Break (in dance music a break is a stripped-down passage), transition, bridge (a part of a song)

**Riser**:
The accelerating, building voice of an interlude (a kick roll, a shaker, a cowbell…), chosen as a variant.
_Avoid_: Sweep, uplifter, chopper

**Impact**:
The single hit that ends an interlude's riser (a boom, timpani, a square-wave honk, a cash register…), chosen as a variant.
_Avoid_: Drop, boom, hit

**Control panel**:
The block at the top of a piece, one screen high, where the performer steers the whole piece by setting values. It always shows what is playing, or about to: its values persist from section to section until the performer changes them.
_Avoid_: Config, settings, header

**Bar meter**:
A line per section in the control panel, one mark per bar of its pass, lit by Strudel VS's highlighting as the bars play, so the performer sees where the pass is and how far its next exit point is.
_Avoid_: Progress bar, playhead, timeline

**Machinery**:
The shared code every piece carries below its control panel — section switching, handovers, closes, variants, tempo ramps, slip warnings, master, the bar meter, the preload of every sound's samples — identical in every piece and folded out of sight while performing.
_Avoid_: Helper, library, framework, boilerplate

**Master**:
The control panel value that scales the whole mix's level — the one-touch way to bring everything down.
_Avoid_: Volume, gain (gain is per voice)

## Music

**Voice**:
One independently controllable part of a piece (a bass line, a violin, a drum kit).
_Avoid_: Track, channel, layer, instrument

**Variant**:
One of the numbered alternatives a voice can play (1, 2, 3…), chosen in the control panel; 0 silences the voice. By convention a higher number is more intense, unless the voice's comment says its variants are sideways alternatives.
_Avoid_: Version, preset, mode, level, flavour

**Section**:
A numbered part of a piece that every voice plays together; the performer chooses it with one value in the control panel, and the whole piece moves to it at once. Section 0 is the end: the playing section plays out its pass, past any exit points, leaves (with its handover shape and close) and the piece falls silent. A section may instead move on by itself after one pass (an interlude's build moves on to its impact, the impact to the end); choosing another section before then takes precedence.
_Avoid_: Movement (keep for the composer's own divisions), part, scene

**Close**:
A short passage a section plays once when it is left — after its exit point and handover shape, before what comes next — and never while it repeats pass after pass (Canon in D: bar 57's final chord, closing section 6).
_Avoid_: Ending, outro, coda (keep for the composer's own)

**Cycle**:
Strudel's unit of musical time; in this kit one cycle is the piece's natural harmonic unit (in Canon in D, one pass of the ground bass).
_Avoid_: Bar, loop (a cycle may span several bars)

**Entry point**:
A cycle at which a voice may start sounding, so it comes in at the top of its phrase.

**Exit point**:
A cycle at which a voice may stop sounding, or a section may give way to the next, so the phrase finishes first. A section with none declared can only be left at the end of its pass.

**Pass**:
One complete play-through of a section; a section repeats pass after pass until the performer moves on.
_Avoid_: Loop, repeat, iteration
