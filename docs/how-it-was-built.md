# How it was built

This started after a live-coded set at the Broncode Festival (KB, The Hague, October 2026), where the music was played by commenting and uncommenting lines of prepared code. The first version of this Canon worked the same way: every voice was a labelled line, and a leading `_` muted it. It was fun to play and easy to fumble. A voice muted mid-phrase stopped mid-phrase; a voice brought in came in wherever the cycle happened to be; there was no way to move the whole piece on at once; and with nothing between the voices and the speakers, a few loud lines together clipped.

The rest of this page is how it turned into what's in this repository: a design, a machinery written test-first, a transcription checked note by note, and a run of bugs that only showed up when it was played for real.

## 1. The design

Before any code there was a long design conversation, recorded as a glossary ([CONTEXT.md](../CONTEXT.md)) and four decisions ([docs/adr/](adr/)). The ones that shaped everything:

- **Steer by value, not by commenting** ([ADR 0002](adr/0002-steer-voices-by-value-not-by-commenting.md)). A control panel at the top of the file holds a number per voice (its variant, 0 for silent), a section number and a master level. Named values are harder to fumble than finding the right line among dozens, and they read clearly to an audience watching the projected code.
- **Sections move together, at exit points.** A section is a stretch of the piece every voice plays together, repeating pass after pass. Changing `section` doesn't jump: the whole piece waits for the section's next *exit point*, by default the end of its pass, and the next section starts from its own first beat. Voices likewise change variant at their own *entry* and *exit points*, so a violin always comes in at the top of its phrase.
- **Tempo changes stretch the music** ([ADR 0003](adr/0003-tempo-changes-stretch-music-within-a-piece-ramp-clock-between-pieces.md)). Strudel has one global clock, and changing it is instant. So a ritardando doesn't touch the clock: it warps the music's own time, measured in beats, so it always ends exactly on the exit point and a re-run can never snap the tempo halfway through.
- **Every piece carries its own copy of the machinery** ([ADR 0004](adr/0004-each-piece-carries-a-copy-of-the-machinery.md)). Strudel VS can't import one file into another, and a piece that depends on a kit file loaded earlier fails the moment someone forgets it. So the code is copied into each piece between `// #region machinery` markers, which VS Code folds away, and the checker flags any copy that has drifted from the template's.
- **A file is a piece** ([ADR 0001](adr/0001-a-file-is-a-piece-sets-hand-over-between-files.md)). A set is played by running the next piece's file. The playing piece finishes to its next exit point, then the new one starts. This depends on Strudel VS keeping state from one file's run to the next, which was an open question until it was tested in the extension (it does).

## 2. The machinery, test-first

The machinery was written test-first, without audio. [tools/repl.mjs](../tools/repl.mjs) reproduces what the Strudel REPL does around a file: Strudel's real transpiler, the labelled-pattern bookkeeping, `all()`, and a clock you can set. Each test builds a small piece, "runs" it at one moment, edits the control panel, runs it again at a later moment, and checks which notes come out and when. That's exactly what a performer does with Cmd+Enter. The tests cover:

- section changes landing on exit points, and redirected or cancelled while waiting
- variant changes on each voice's own phrase boundaries
- ritardandos and accelerandos, linear and eased, checked against worked examples: the quadratic formula for a linear ramp, numerical integration of the tempo curve for an eased one
- slips: a value naming no section or variant changes nothing and says why in the console
- memory: an earlier helper wrapped the previous pattern on every re-run and never let go, so a long set leaked. After 300 simulated re-runs, the tests check that nothing already handed over is kept, and that only the last couple of runs' patterns are still played

Along the way, the engine turned out to have some sharp edges:

- In Strudel, **every double-quoted or backtick string is mini-notation**, Strudel's pattern language. Plain strings need single quotes, so the machinery uses only single-quoted strings.
- **Strudel has already scheduled a little past "now"** when you re-run. A change planned for the very next beat would lose that beat's notes, so nothing is planned less than an eighth of a cycle ahead.
- **There is no limiter.** Voices sum straight to the output, so the checker adds up the loudest moment of every voice's loudest variant, section by section, and warns past full scale. The arrangement's original mix added up to more than 14 times full scale; every gain was scaled by the same factor to keep the balance.
- **`master` is a post-gain.** It's applied after each voice's effects, so it brings reverb and delay tails down too.
- **Strudel VS runs a file twice per Cmd+Enter.** Found the hard way (see below).

## 3. Transcribing the score

The arrangement's original canon had four bars of the theme, written from memory. The rebuild uses the whole piece: 57 bars of Kanon and the 20-bar Gigue, from **Max Seiffert's 1929 edition**, which is now in the public domain.

The transcription was read from **Jawher Matmati's 2016 engraving** of Seiffert's edition, which is cleaner to read than the 1929 scan:

- **Rhythms by eye.** They were read from 300 and 600 dpi renders, bar by bar, and every bar's total was checked against the time signature.
- **Pitches by machine.** The engraving is a Sibelius PDF: every notehead, dot and flag is a font character, and the staff lines and barlines are drawn paths. A small script read the PDF's drawing instructions directly and turned each notehead's height on its staff into a pitch. It found one error in the hand transcription (a natural C written an octave low in bar 49). Otherwise every pitch of violin 1 matched in every bar, and violins 2 and 3 turned out to be exact copies of violin 1, two and four bars later. That is what makes it a canon, and it confirms the reading three times over. The cello is the ground bass in all 56 bars and then a final D. The Gigue's four parts matched in all 20 bars.
- **Against the original print.** The result was then compared with the 1929 scan itself: nearly all of the Kanon's violin lines (bars 13–28 and 31–57), the opening at overview resolution, and the whole Gigue. No differences.
- **Through Strudel's own parser.** The note data was turned into Strudel's mini-notation, one string per two bars, and parsed back with Strudel's own parser, onset by onset. Then each section of the finished file was played offline and compared with the transcription.

Seiffert also wrote out a full **keyboard realization of the figured bass**: chords Pachelbel only implied. That was transcribed from the 1929 scan for the strings and harpsichord. The scan has no text layer, so every bar was read by eye, and each bar's set of pitches was checked against a notehead detector run on the image.

Pachelbel's own dissonances (suspensions, appoggiaturas, the D over F♯ chords) are listed in the piece's header, so the offline harmony check doesn't read them as mistakes.

## 4. Sections from the score

The Kanon's variations get busier and then relax, so the sections follow the score's own order:

| Section | Bars | |
|---|---|---|
| 1 | 1–10 | the ground alone, then the canon in quarters and eighths |
| 2 | 11–18 | sixteenths, then long high notes |
| 3 | 19–26 | thirty-second runs, then staccato eighths |
| 4 | 27–38 | arpeggios and repeated sixteenths, the busiest |
| 5 | 39–48 | *poco meno*: lyrical again |
| 6 | 49–56 | the close; leaving it slows through bars 55–56 into bar 57's final chord |
| 7 | Gigue 1–20 | both halves repeated, at ♩. = 100 |

Each section is a slice of the actual score, every voice included. So a section entered from anywhere starts with the canon already in motion: the second and third violins are mid-theme, exactly as Pachelbel has them at that bar.

## 5. What only the live instrument showed

Some things can't be tested offline. They were heard in VS Code, reproduced in a test, and fixed:

- **Staying on section 6 dropped out.** The final chord and a bar's silence were written into section 6 itself, so every pass of it stopped dead, at full tempo, then went quiet for a whole cycle. The fix became a feature: a section's *close*, a passage played once when the section is left and never while it repeats. Section 6 now loops cleanly, and leaving it (for the Gigue, or for `section = 0`, the end) slows into the final chord.
- **The bar meter.** The meter puts a mark per bar in the panel and plays each mark as a silent note, so Strudel VS's live highlighting lights it as the bar goes by. It first looked as if it were working when it wasn't: the marks were a Unicode look-alike of `|`, which VS Code boxes in orange as a confusable character, hiding Strudel VS's thin white highlight. The marks are now a plain `I`.
- **Samples loading late.** Strudel skips a note whose sample hasn't loaded yet. So the first time a voice came in, it came in silent. On its first run, the piece now plays one silent note of every sound it might need, so they're fetched in the background before they're wanted.
- **Handing over to another file.** Played as part of a set (Canon section 6, then an interlude from its own file, then back to the Canon's Gigue), the outgoing Canon stopped at bar 56 instead of leaving with its ritardando and final chord. Now a piece being handed over leaves exactly as if its panel had been set to 0.
- **Two Canons, a fraction of a bar apart.** After a round trip through the interlude, the cello sat about half a bar off the violins. Strudel VS runs a file twice for every Cmd+Enter, and the second run, finding the Canon waiting for its turn, started a second copy. A piece waiting its turn now keeps it. After the fix, the round trip played in sync.

## 6. The arrangement

Around Pachelbel's four strands, the arrangement adds a fourth canon voice on an organ through a rotating-speaker "Leslie", a harpsichord, two flutes and a set of electronic voices:

- a Roland 909 kit with four variants
- a shaker and off-beat hats
- a sawtooth bass under the cello, and a filtered saw lead on violin 1's line
- an air-raid siren
- a walking sub-bass after the Minimoog lines on Parliament records
- a Casio RZ-1 played loose against the 909
- on random beats, short high blips, or three struck, vibraphone-like notes measured from a phone recording of a supermarket scanner

Each voice is a few lines in the `voices({…})` block at the bottom of the file. Most take their notes from the score, so they follow the section you're in.

## Tools

- **Strudel**: the music engine.
- **Strudel VS**: the VS Code extension that plays it.
- **Node**: runs the offline checks and tests.
- **Claude Code**: the design conversation, the machinery and its tests, and the transcription and its checks, worked out with Luke and checked by ear in VS Code.
