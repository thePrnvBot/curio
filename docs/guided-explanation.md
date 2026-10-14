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
steps: [
  {
    id,
    durationMs,
    narration: { script: string, audio?: AudioRef },
    visual: {
      kind: "code" | "diagram" | "markdown" | "callout",
      language?, source, revealFrom?
    }
  }
]
```

Code visuals render through the existing streamdown pipeline — the animation
is which lines/characters exist at step time, so no new animation engine.

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
