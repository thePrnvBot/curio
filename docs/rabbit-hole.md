# Rabbit Hole

A Rabbit Hole is a disposable, proxied browser session that the Director can summon from chat. The learner browses a real page — native scroll, selection, links, forms and keyboard input — while a small tracker records the trail. The Director takes notes in a sidebar, and when the session ends the trail is digested into either recap notes or a course.

There is no server-side Chromium and no frame stream. The page is loaded in an iframe through a local reverse proxy, so it is genuinely interactive and cheap to run.

## Using it

In the Director chat:

> Hey Curio, start a Rabbit Hole on HTTP caching.

The Director calls the `start_rabbit_hole` tool and the window opens. The learner can then:

- type a URL or a search in the omnibox (bare words become DuckDuckGo searches),
- click, scroll, select, type and play media directly in the page,
- press **Highlight selection** to capture the current text selection,
- write notes in the **Director notes** rail (each note is pinned to the page on screen and gets a short Director acknowledgement),
- press **X** or **End session** to finish.

Ending stops tracking and produces two things:

1. a polished **digest** shown in the wrap-up card, and
2. a deterministic **trail digest** used as source material for the Director.

The wrap-up asks for optional takeaways, then offers **Recap notes** or **Build a course**. Either choice sends the trail plus the takeaways back to the Director as a normal chat turn, so the existing recap/course pipeline does the work. **Discard session** throws the raw trail away.

## Requirements

None beyond a modern browser and the normal Curio server. Rabbit Hole no longer needs Chrome, Edge, Chromium, a temporary profile or `RABBIT_HOLE_BROWSER_BIN`.

The proxy runs inside the Curio server. It is intended for a local or single-user deployment; see the limits below before exposing it publicly.

## What gets captured

For every page visited:

- URL, title, entry/exit time, dwell time and maximum scroll depth,
- the page's visible text (capped at 12k characters, extracted both from the proxied HTML and from the rendered page),
- `video`/`audio` elements and iframe embeds, with YouTube URLs normalised,
- the navigation path (each page is its own visit).

Plus the session-level notes, highlights and the Director's replies.

`about:blank` and non-HTTP pages are never recorded. Activity heartbeats update dwell time and scroll depth without re-sending the page text.

## Lifecycle and retention

| Event | Effect |
| --- | --- |
| Session opens | an in-memory session, proxy token and trail are created |
| 45 minutes | watchdog ends the session automatically |
| End | tracking stops; digest frozen in memory |
| 30 minutes after end | raw session is purged; only the chat recap/course persists |
| Discard | immediate purge of the trail and proxy token |
| Server restart | sessions are lost (the registry is in memory) |

The raw trail is intentionally never written to Postgres. The recap/course and the compact digest live in the normal chat transcript.

## Architecture

```
apps/web
  src/routes/api/rabbit-hole.active.ts            reattach hint for a reloaded chat
  src/routes/api/rabbit-hole.$sessionId.ts        state snapshot
  src/routes/api/rabbit-hole.$sessionId.stream.ts SSE state/visits/notes (no frames)
  src/routes/api/rabbit-hole.$sessionId.proxy.$token.$origin.$.ts  the local reverse proxy
  src/routes/api/rabbit-hole.$sessionId.track.ts  page snapshots + activity heartbeats
  src/routes/api/rabbit-hole.$sessionId.note.ts   sidebar note + model acknowledgement
  src/routes/api/rabbit-hole.$sessionId.highlight.ts capture the live text selection
  src/routes/api/rabbit-hole.$sessionId.end.ts    stop tracking, digest, model polish
  src/routes/api/rabbit-hole.$sessionId.discard.ts purge
  src/components/rabbit-hole/*                    overlay, host, tool card, prompt card
  src/utils/rabbit-hole-*.ts                      store, route helpers, prompt parser

packages/api/src/infrastructure/rabbit-hole
  proxy.ts          upstream fetch, cookie isolation, HTML/CSS rewriting, tracker injection
  proxy-session.ts  in-memory trail store and event bus
  proxy-url.ts      pure proxy URL encoding/decoding shared with the overlay
  tracker.ts        the dependency-free script injected into proxied pages
  sessions.ts       in-memory registry (globalThis), watchdog and purge timers
  digest.ts         deterministic trail digest + follow-up prompt builders
  url.ts            omnibox normalisation and display helpers
  start-tool.ts     the Director's start_rabbit_hole tool
```

### Why the target origin lives in a path segment

Proxied pages are served from:

```
/api/rabbit-hole/<session>/proxy/<token>/https%3A%2F%2Fexample.com/docs/page
```

Keeping the origin as a path segment means relative assets and ES-module imports (`./chunk.js`, `../img.png`) resolve through the same proxy naturally. The server rewrites absolute and root-relative URLs in HTML and CSS; the injected tracker rewrites them at runtime for DOM mutations and `fetch`/XHR.

### Iframe and tracking

The overlay renders a sandboxed iframe (scripts, forms, popups, downloads and modals allowed, but **not** `allow-same-origin`). The page therefore cannot read Curio cookies, local storage or same-origin APIs. The parent cannot read the iframe DOM either, so the injected tracker is the only tracking channel:

- `page` posts title, visible text, scroll depth and media after load, navigation and history changes,
- `activity` posts a small scroll/title heartbeat every few seconds,
- `selection` answers the overlay's highlight request with `window.getSelection()`,
- commands from the parent handle back, forward, reload and navigation.

The parent validates `event.source` plus the session id and proxy token before writing a tracker update to the authenticated `/track` route.

### Cookie isolation

The iframe request carries Curio's auth cookie because it is same-site. The proxy **never forwards it upstream**. Target-site cookies are rewritten with a per-origin name prefix and a proxy-scoped `Path`; only those namespaced cookies are sent back to the target. This keeps the ephemeral site session separate from the learner's Curio account.

## Limits and caveats

- **Best for readable docs and articles.** Server-rendered documentation, Wikipedia, MDN and blogs work well. Sites that depend on service workers, WebSockets, root-relative module imports, strict anti-bot checks or heavy client-only routing can degrade or fail. There is no remote browser to fall back to.
- **No arbitrary browser parity.** This is a proxy, not Chromium. Some sites will behave differently or refuse to embed.
- **The browser has real network access through the proxy.** The proxy can reach localhost and internal hosts. Treat Rabbit Hole as a trusted, local-user feature until an egress proxy or host allowlist is added.
- **Login state is disposable and best-effort.** Cookie rewriting supports cookie-based logins, but JavaScript `document.cookie`, WebAuthn and OAuth popups may not work.
- **Media is tracked.** Native playback works when the page's player works through the proxy; DRM and proprietary codecs may not.
- **One live session per chat.** Starting a new Rabbit Hole replaces the old one.
- **Single-node only.** The session registry lives in the server process.

## Testing

Unit tests cover URL encoding/decoding, HTML and CSS rewriting, the digest and prompt parsing. The proxy rewrite suite feeds a document with a CSP meta tag, a `<base>`, absolute/root-relative/srcset URLs, an SRI script and an embedded video through the rewriter.

```bash
pnpm exec vitest run packages/api/src/infrastructure/rabbit-hole
```

Manual checklist:

1. `pnpm dev:web`, sign in, open a chat.
2. Ask the Director to start a Rabbit Hole.
3. Navigate to a docs page, click a link, scroll, type in a site search box.
4. Add a sidebar note and confirm the reply appears.
5. Drag-select text, press the highlighter, confirm the quote is listed.
6. End the session, check the stats and digest, add a takeaway.
7. Choose **Recap notes** and confirm the Director replies with linked notes.
8. Repeat with **Build a course** and watch the course fill in the Courses tab.
