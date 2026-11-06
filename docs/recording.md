# Recording a performance

Notes for filming the Canon being played: the code, the edits and re-runs, and the sound, in one take.

## Capture

**The Mac's own recorder first.** Press Cmd+Shift+5, choose *Record Selected Portion* or *Record Entire Screen*, and open **Options**:
- If it offers **system audio**, the music is recorded with the screen. macOS 27 is reported to add this, though Apple's own documentation doesn't confirm it.
- If it only offers microphones, it can't record the music by itself. Either route the sound through a loopback device such as [BlackHole](https://github.com/ExistentialAudio/BlackHole), or use OBS.

**Your camera.** The built-in recorder doesn't put the camera in the picture. Two ways to get it in:
- Record the camera separately (QuickTime Player → File → New Movie Recording) and combine the two videos when editing. Clap once on camera at the start so they're easy to line up.
- Use [OBS Studio](https://obsproject.com): one recording with the screen, the camera as a picture-in-picture, and the computer's sound (add a *macOS Audio Capture* source for the app playing the music).

**Levels.** The piece keeps its loudest moments under full scale, so leave the recording level as it is rather than boosting it, and turn up the monitors instead. If you narrate, a separate microphone track lets you balance it against the music afterwards.

## Hosting the video

GitHub can play a video inline in a README, if it's small enough:
- **A short clip on GitHub.** On github.com, edit the README in the browser and drag an MP4, MOV or WebM file into it. GitHub uploads it and plays it inline. The limit is 10 MB for a free account (100 MB on a paid plan): enough for 20–40 seconds at screen-recording quality, not a whole performance. GitHub documents these limits for issues and comments; check that the clip plays in the README after you commit it.
- **The full video elsewhere.** Put it on YouTube or Vimeo, and link to it from the README with a thumbnail image.

A good combination: the full performance on YouTube, plus a short inline clip on GitHub of one moment (say, the violins entering one by one).

## Set up VS Code for the camera

- A large font (View → Appearance → Zoom In a couple of times) and a dark theme, so Strudel VS's white highlight shows up.
- Fold the machinery (click the fold arrow beside `// #region machinery`) so the panel and the score are what's on screen.
- The **Strudel** panel in the Explorer sidebar shows whether it's playing. It can also show a piano roll, but only for a pattern that asks for one (`.pianoroll()`); this piece doesn't, so there's nothing to see there unless you add it.
- Hide the minimap and the activity bar if you want more room for the code (View → Appearance).
- Start from a clean panel: the file starts with the cello and violins on, so set `v1`, `v2` and `v3` to 0 for `cello: 1` and everything else 0, with `section = 1`.

## A shot list that tells the story

1. **The ground bass alone.** Press Cmd+Enter, and let the cello's eight notes go round once or twice. Point out the `bars` line lighting up.
2. **Build the canon.** Set `strings: 1`, re-run. Then `v1: 1`, `v2: 1` and `v3: 1`, one re-run at a time. Each violin waits for the top of its phrase, and each plays the same theme two bars after the one before.
3. **Move through the sections.** `section = 2`, then 3, then 4: the piece waits for the end of the pass, then moves on together. Watch the bar meter: the change lands when it runs out.
4. **Make a slip on purpose.** Type a variant that doesn't exist (`v1: 7`) and re-run. Nothing audible happens, and the Output panel (View → Output → Strudel) says why.
5. **Bring in the electronics.** `kit: 1`, then `hats: 1`, `ebass: 1`, maybe `beep: 1`.
6. **The close.** `section = 6`, let it play a pass, then `section = 7`. It slows through bars 55–56 into the final chord, and the Gigue starts.
7. **The end.** `section = 0`: the Gigue plays out its pass, slows, and stops.

## A background that moves

VS Code itself can't draw behind the code to the music. Two ways to get that in the video:

- **Add it while editing.** Put an audio-reactive layer behind the screen recording, driven by the recording's own music track: in After Effects, for example, *Convert Audio to Keyframes* drives any layer from the sound. Key the VS Code background out, or set the window slightly transparent, to see through it.
- **Cut to strudel.cc.** strudel.cc runs [Hydra](https://hydra.ojack.xyz) visuals full-screen behind the code. The piece runs there, but with an audible gap between sections that Strudel VS doesn't have, so use it for B-roll rather than the main take.
