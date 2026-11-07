# Guided Explanation — feature plan

The name for Curio's effect.institute-style course format: sequential lessons
that explain themselves — a narrated timeline where each step reveals code or
a diagram in sync with the voice, one lesson per screen, keyboard-driven, with
autoplay into the next lesson.

## What it must be (behavioral spec)

- One lesson per screen; lessons form sections (headings); future lessons
  stay locked until earlier ones complete.
- Each lesson is a timed timeline: steps with narration + a visual, synced.
- Space = play/pause; ←/→ = lesson navigation; autoplay flows into the next
  lesson; playback speed, volume, hotkeys; URL carries the current step so
  back/forward and shared links land mid-explanation.
- Feels like Scrimba meets a video game, in Curio's emerald design.

## Content model

A lesson's `content` either keeps the existing kinds (video / cards /
animation / recap) or becomes a **guided explanation**:

```
kind: "guided-explanation"
narrationVoice: { name, providerRef?, rate }
code?: { language?, source }          // shared excerpt for a walkthrough
steps: [
  {
    id,
    durationMs,
    narration: { script: string, audio?: AudioRef },
    visual: {
      kind: "code" | "diagram" | "markdown" | "callout",
      language?, source, revealFrom?,
      focus?: {
        lines: number[],             // 1-based, kept bright
        cursor?: { line?, column?, length? }
      }
    }
  }
]
```

Code visuals render through the existing streamdown pipeline — the animation
is which lines/characters exist at step time, so no new animation engine.

### Code focus + floating cursor

Effect-Institute-style walkthroughs keep the narrated code line bright and dim
the rest of the excerpt, while a pointer cursor travels to the exact token being
discussed.

- `code` holds one shared excerpt for a walkthrough. Steps may omit
  `visual.source` and inherit `code.source` (and `code.language`); the writer
  expands it before storage, so stored content and rendering stay per-step.
  This keeps long repeated walkthroughs small in Director tool calls.
- `focus.lines` is a list of 1-based line numbers. Every other line dims to
  40% opacity; focused lines get a soft primary tint.
- `focus.cursor` selects the character range under the cursor. `line` defaults
  to the first focused line, `column` to the first meaningful identifier on
  that line, and `length` to that identifier's length. Lines and columns are
  1-based, so `column: 16` points at the 16th character.
- The cursor is a 24px pointer that spring-travels below the measured character
  range. The range is measured from the rendered DOM (not estimated character
  widths) and also draws a soft primary spotlight plus a token glow.
- Consecutive code steps that reuse the same `language` + `source` keep the
  same stage mounted, so the highlight, spotlight, and cursor animate between
  narration beats instead of the panel remounting. Reuse the excerpt while a
  walkthrough continues it.
- `focus` is optional for backwards compatibility. Older or generated
  lessons without it infer the focused line by matching narration identifiers
  against the code, then point at the named token. Blank code gets no
  spotlight.
- With `prefers-reduced-motion`, the dimming and highlight still apply but the
  cursor and spotlight jump directly instead of springing.

## Milestones

| M | Deliverable                                          |
|---|------------------------------------------------------|
| 0 | content contract (zod) + `courses.getGuidedExplanation` API |
| 1 | player shell: timeline hook (rAF clock, rate, seek), keyboard map, step visuals, complete-on-end, step URL sync — script-only narration via speechSynthesis fallback |
| 2 | course shell integration: chapter map, locking, autoplay to next lesson, progress persistence (`courses.saveGuidedExplanationProgress`) |
| 3 | TTS adapter + audio caching + volume/rate controls + voice settings |
| 4 | Director authoring: `create_course` tool schema extended so the Director writes narrated scripts + code snapshots, with a read-back verification pass |
| 5 | polish: step appear transitions, WebGPU garnish, hotkey overlay, in-course changelog |

## Risks

- speechSynthesis quality is OS-dependent — fallback only; the target is
  real audio files (human recordings or external TTS) attached per step.
- Keep step visuals pre-renderable (DOM-friendly), cheap per frame.
- Timeline is additive; existing lesson kinds keep their renderers.
