# Gyri — Your decision

[Open the interactive experience](https://littleffww.github.io/gyri/) — no account required.

## Saved versions

| Version | Date (Europe/London) | Description |
| --- | --- | --- |
| [Gyri v7.5](https://github.com/littleffww/gyri/tree/codex/gyri-v7.5-2026-11-06) | 2026-11-06 | A recorded human voice follows the sculpture’s movement, opens into reverberation and fades at rest. |
| [Gyri v7.4](https://github.com/littleffww/gyri/tree/codex/gyri-v7.4-2026-11-06) | 2026-11-06 | Uses the same Chinese typeface for headings and body text. |
| [Gyri v7.3](https://github.com/littleffww/gyri/tree/codex/gyri-v7.3-2026-11-06) | 2026-11-06 | Portfolio typography for Chinese and English. |
| [Gyri v7.2](https://github.com/littleffww/gyri/tree/codex/gyri-v7.2-2026-11-06) | 2026-11-06 | Full scatter-and-gather opening, shorter controls and a trilingual project introduction. |
| [Gyri v7.1](https://github.com/littleffww/gyri/tree/codex/gyri-v7.1-2026-11-06) · [tag](https://github.com/littleffww/gyri/releases/tag/gyri-v7.1-2026-11-06) | 2026-11-06 | Adds a one-time, ten-second opening dissolve from 0 to 100%; visitors can take over immediately. |
| [Gyri v7](https://github.com/littleffww/gyri/tree/codex/gyri-v7-public-2026-11-06) · [tag](https://github.com/littleffww/gyri/releases/tag/gyri-v7-public-2026-11-06) | 2026-11-06 | Full preserved project snapshot; exact v7 website assets, with public hosting documentation. |

Snapshot branches and annotated tags are fixed archives. Development continues on `codex/gyri-development`; `gh-pages` contains the published static files.

Original website source commit: `638a2107e19576b00d83efca5169f80bf094ea65`.
The original Rhino file is not included. Run `python3 serve.py` to preview locally.



An AcrossRCA interaction study about retaining authorship while talking with AI. The work makes influence visible, adjustable and reversible. This is an artistic proposal based on the user's theme, not a statement of an official course requirement. It uses authored rules and local gesture recognition; no conversational AI is connected, and it does not assess emotions or authenticity.

## Current experience

After loading, the sculpture disperses over ten seconds, holds for 1.5 seconds, then gathers over ten seconds. Visitors can take control at any point. Reduced-motion preferences skip the opening. The introduction and controls are available in Chinese, Japanese and English.

A monochrome, empty stage with silver material, neutral studio reflections and an optional ground shadow. All control panels and the gesture dock have transparent backgrounds. Chinese, Japanese and English are selectable through a small text navigation; the language preference is stored locally. Colour and material experiments remain available in a collapsed section.

- Drag to deform the selected shape. Shift-drag pulls a local region; Alt-drag rotates; wheel scales. Holding the pointer still for 650 ms starts progressive surface disintegration. Moving or releasing gathers the points again.
- Five labelled simulations demonstrate inflation, compression, stretching, twisting and local pulling. Keyboard 1–5 selects these; K keeps the current shape, R resets, Space pauses and Escape releases.
- **Keep this moment** captures actual deformed vertex positions in a separate trace attribute. With **Keep changes on release** enabled, releasing a pointer deformation or leaving hand tracking captures it automatically. Original mesh positions remain immutable. Traces last for the current page session, not across reloads.
- **Accept the suggestion** blends this trace towards the preset source form and reduces live deformation. Withdrawing the suggestion restores the trace. The preset is explicitly not presented as more correct. A deliberate new capture replaces the previous trace; Clear and Reset remove it.
- 42,000 seeded area-weighted triangle samples share the solid's deformation uniforms and a spatial/part-based dissolve threshold. Pieces granulate before their points leave the surface; the material is never globally faded out. Shadow fragments use the same threshold. Point samples retain barycentric coordinates so saved personal traces transfer to precisely the same source triangles.
- Original, sphere, double helix and a five-copy assembly can disperse and reassemble. Form changes first disintegrate, blend the same points, then regroup. The alternate forms are procedural additions, not independent complete models found in the source file. Point sprites approximate grains, not ray-traced metal spheres.

## Meaning and limits

Particles represent the possibility of reconsidering and recombining an idea while retaining a place of origin. Stretching faces competing directions; compression evokes external expectations; twisting holds contradictions; local pulling starts a change from one chosen point; inflation makes room for expression. These are artistic metaphors, not psychological measurements. The concrete connection to the theme is the visitor's ability to preserve, decline and undo a system's influence.

## Source geometry

The original `Gyri-final copy.3dm` has 721 objects (720 Breps and one extrusion), across three layers. The renderable export has 719 body parts and a separate cylindrical base. The additional extrusion has no render mesh. The original 3DM and `model.json` are unchanged. Ownership or licensing cannot be established from geometry or author metadata.

`soft-geometry.bin` is a tessellated merged surface with per-vertex part centres. GPU deformation applies inflation/compression, axis stretch, torsion, local pull and a pulse. The CPU counterpart captures traces and computes the touch marker. Flat surface normals use derivatives of the deformed triangles; the shadow pass shares the deformation field. These are authored geometric effects rather than physical material simulation.

## Input and privacy

Hand, gaze and sound modes require the visitor to start the relevant device. Open palms inflate, fists compress, two hands stretch, tilted palms twist and pinch movement pulls locally. Palm openness also drives particles. Pinch release, blinks and sound beats can trigger a brief release. Gaze uses calibrated relative horizontal iris position and is not precise screen-point eye tracking. Local pull uses hand height, not exact surface picking. Audio uses loudness and spectral balance, not emotion or semantic speech analysis.

Seven editable mappings connect input to pigment position, saturation, gloss/metalness, pigment distortion, light position, brightness and shadow density. All changes follow input or its spring/decay response; there is no idle colour oscillator. Static palette choices are baselines. Pause stops visual updates but does not stop an active device.

Camera and sound are processed locally. Mode changes, stopping, reset, page backgrounding, errors and cancelled starts close media streams. No camera image is included in screenshot exports. Physical device accuracy depends on the user's camera, lighting and microphone and has not been validated on their live inputs in this revision.

## Run and validate

```sh
python3 -m http.server 8794 --bind 127.0.0.1 --directory dist
node --check dist/app.js
node --test tests/*.test.mjs
```

27 tests cover gesture and media handling, deformation, mapping, unchanged source geometry, reversible saved traces, shared particle/solid uniforms, barycentric trace transfer and formation reconstruction. Browser QA covers partial dissolution, regrouping, preserved twist, accepting/withdrawing suggestions, language switching and a 390 × 844 mobile layout. Early shader compilation errors found during QA were fixed before publication.

Dependencies: Three.js 0.170.0 (MIT), MediaPipe Tasks Vision 0.10.21 (Apache-2.0), Google hand/face models. Existing notices are retained. No third-party imagery is used.
