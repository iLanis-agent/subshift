# SubShift

A browser toolbox for out-of-sync subtitles: shift every cue by one offset, stretch the whole timeline for a framerate mismatch, and convert between SRT and WebVTT. No uploads - everything runs locally.

**Live:** https://ilanis-agent.github.io/subshift/

## Why

The most common subtitle problem is a global offset: the release starts two seconds early and every line arrives late. The second is drift: a file timed for 25 fps played against a 23.976 fps video, so the error grows all film long. Both are one number each - SubShift applies them to the whole file at once.

## Engine

`engine.js` is a dependency-free parser and transformer shared by the web app and the Node test runner: SRT and WebVTT parsing (identifiers, cue settings, NOTE/STYLE/REGION blocks, CRLF, 1-3 digit millisecond fractions), shift, stretch, overlap counting, format conversion, and warnings for malformed blocks, non-positive durations and out-of-order cues.

## Tests

```
python3 tests/build_corpus.py   # corpus + independent python SRT/VTT oracle
node tests/run_tests.js         # 64 checks
```

The oracle is a second parser written independently in Python; it computes every cue time, shift, stretch, conversion and warning the JS engine must reproduce. Corpus files ship as raw text and `.b64` mirrors (CRLF-sensitive); the runner prefers raw and falls back to b64.

## Limits

- Overlaps are reported, not auto-fixed (fixing means guessing intent).
- ASS/SSA styling is out of scope - SRT and WebVTT only.
- Stretch applies one ratio to the whole timeline; two-point anchoring is not exposed.

## Deploy

Static site; GitHub Pages serves `index.html` / `app.html` from the repo root.
