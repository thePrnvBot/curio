import { randomUUID } from "node:crypto";

import type {
  RabbitHoleEvent,
  RabbitHoleHighlight,
  RabbitHoleMedia,
  RabbitHoleNote,
  RabbitHoleState,
  RabbitHoleStatus,
  RabbitHoleVisit,
  RabbitHoleViewport,
} from "./types";
import { createHighlightId, createNoteId, createVisitId } from "./types";
import { normalizeRabbitHoleUrl } from "./url";

const PAGE_TEXT_LIMIT = 12_000;
const VIEWPORT: RabbitHoleViewport = { height: 900, width: 1440 };

interface MutableVisit {
  id: string;
  url: string;
  title: string;
  enteredAt: number;
  leftAt: number | null;
  dwellMs: number;
  scrollDepth: number;
  excerpt: string;
  media: RabbitHoleMedia[];
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function normalizeTitle(value: string): string {
  return value.trim().slice(0, 500);
}

function mergeVisit(
  visit: MutableVisit,
  input: RecordPageInput,
  now: number
): void {
  const title = normalizeTitle(input.title);
  if (title !== "") {
    visit.title = title;
  }
  if (input.text !== "") {
    visit.excerpt = input.text.slice(0, PAGE_TEXT_LIMIT);
  }
  if (input.media.length > 0) {
    visit.media = [...input.media];
  }
  visit.scrollDepth = Math.max(visit.scrollDepth, clamp01(input.scroll));
  visit.dwellMs = Math.max(0, now - visit.enteredAt);
}

export interface RecordPageInput {
  readonly media: readonly RabbitHoleMedia[];
  readonly scroll: number;
  readonly text: string;
  readonly title: string;
  readonly url: string;
}

export interface OpenRabbitHoleProxyOptions {
  readonly chatId: string;
  readonly id: string;
  readonly seedUrls: readonly string[];
  readonly topic: string | null;
}

/**
 * The live Rabbit Hole session.
 *
 * There is no server-side browser process any more: the learner browses the
 * proxied page directly in an iframe, so scrolling, selection, video and
 * keyboard input are native. This class is the trail store the proxy and the
 * injected tracker write into, plus the small event bus the overlay follows.
 */
export class RabbitHoleProxySession {
  readonly #id: string;
  readonly #chatId: string;
  readonly #topic: string | null;
  readonly #startedAt: number;
  readonly #proxyToken: string;
  readonly #listeners = new Set<(event: RabbitHoleEvent) => void>();
  readonly #visits: MutableVisit[] = [];
  readonly #notes: RabbitHoleNote[] = [];
  readonly #highlights: RabbitHoleHighlight[] = [];

  #status: RabbitHoleStatus = "ready";
  #url = "";
  #title = "";
  #loading = false;
  #endedAt: number | null = null;
  #activeVisit: MutableVisit | null = null;

  private constructor(options: OpenRabbitHoleProxyOptions) {
    this.#id = options.id;
    this.#chatId = options.chatId;
    this.#topic = options.topic;
    this.#startedAt = Date.now();
    this.#proxyToken = `rht_${randomUUID().replaceAll("-", "")}`;

    const seed = options.seedUrls
      .map((candidate) => normalizeRabbitHoleUrl(candidate))
      .find((candidate) => candidate !== null);
    if (seed !== undefined) {
      this.#url = seed;
    }
  }

  static open(options: OpenRabbitHoleProxyOptions): RabbitHoleProxySession {
    return new RabbitHoleProxySession(options);
  }

  get id(): string {
    return this.#id;
  }

  get chatId(): string {
    return this.#chatId;
  }

  get topic(): string | null {
    return this.#topic;
  }

  get startedAt(): number {
    return this.#startedAt;
  }

  get status(): RabbitHoleStatus {
    return this.#status;
  }

  get proxyToken(): string {
    return this.#proxyToken;
  }

  getState(): RabbitHoleState {
    return {
      canGoBack: false,
      canGoForward: false,
      chatId: this.#chatId,
      endedAt: this.#endedAt,
      id: this.#id,
      loading: this.#loading,
      proxyToken: this.#proxyToken,
      startedAt: this.#startedAt,
      status: this.#status,
      title: this.#title,
      topic: this.#topic,
      url: this.#url,
      viewport: { ...VIEWPORT },
    };
  }

  getVisits(): readonly RabbitHoleVisit[] {
    return this.#visits;
  }

  /**
   * Lightweight view for the overlay and SSE. Page excerpts can be 12k each;
   * sending them on every activity heartbeat made the trail payload grow with
   * the session. The digest still reads the full visits via `getVisits()`.
   */
  getVisitsForDisplay(): readonly RabbitHoleVisit[] {
    return this.#visits.map((visit) => ({ ...visit, excerpt: "" }));
  }

  getNotes(): readonly RabbitHoleNote[] {
    return this.#notes;
  }

  getHighlights(): readonly RabbitHoleHighlight[] {
    return this.#highlights;
  }

  subscribe(listener: (event: RabbitHoleEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /**
   * Merges a snapshot from the proxy HTML or the tracker into the active
   * visit. The two sources overlap on purpose: the proxy guarantees a capture
   * even if page JavaScript never runs, and the tracker refines it with the
   * rendered title, visible text and scroll position.
   */
  recordPage(input: RecordPageInput): void {
    if (this.#status === "ended") {
      return;
    }
    const url = input.url.trim().slice(0, 4000);
    if (!/^https?:/iu.test(url)) {
      return;
    }

    const now = Date.now();
    const active = this.#activeVisit;
    if (active !== null && active.url === url) {
      mergeVisit(active, input, now);
      this.#url = url;
      const title = normalizeTitle(input.title);
      if (title !== "") {
        this.#title = title;
      }
      this.#loading = false;
      this.#emitState();
      this.#emitVisits();
      return;
    }

    // Fold a quick back/forward revisit into the same visit instead of
    // flooding the trail with one-second duplicates.
    const recent = this.#visits.findLast(
      (candidate) =>
        candidate !== active &&
        candidate.url === url &&
        now - (candidate.leftAt ?? now) < 4000
    );
    if (recent !== undefined) {
      this.#finishActiveVisit(now);
      recent.leftAt = null;
      mergeVisit(recent, input, now);
      this.#activeVisit = recent;
      this.#url = url;
      this.#title = recent.title;
      this.#loading = false;
      this.#emitState();
      this.#emitVisits();
      return;
    }

    this.#finishActiveVisit(now);
    const visit: MutableVisit = {
      dwellMs: 0,
      enteredAt: now,
      excerpt: input.text.slice(0, PAGE_TEXT_LIMIT),
      id: createVisitId(),
      leftAt: null,
      media: [...input.media],
      scrollDepth: clamp01(input.scroll),
      title: normalizeTitle(input.title),
      url,
    };
    this.#visits.push(visit);
    this.#activeVisit = visit;
    this.#url = url;
    this.#title = visit.title === "" ? url : visit.title;
    this.#loading = false;
    this.#emitState();
    this.#emitVisits();
  }

  addHighlight(quote: string): RabbitHoleHighlight {
    const highlight: RabbitHoleHighlight = {
      at: Date.now(),
      id: createHighlightId(),
      quote,
      title: this.#title,
      url: this.#url,
    };
    this.#highlights.push(highlight);
    return highlight;
  }

  addNote(note: {
    readonly text: string;
    readonly reply?: string;
  }): RabbitHoleNote {
    const entry: RabbitHoleNote = {
      at: Date.now(),
      id: createNoteId(),
      text: note.text,
      title: this.#title,
      url: this.#url,
      ...(note.reply === undefined ? {} : { reply: note.reply }),
    };
    this.#notes.push(entry);
    this.#emit({ notes: this.#notes, type: "notes" });
    return entry;
  }

  currentPageExcerpt(limit = 1600): string {
    const active = this.#activeVisit;
    if (active === null) {
      return "";
    }
    return active.excerpt.slice(0, limit);
  }

  end(): void {
    if (this.#status === "ended") {
      return;
    }
    this.#status = "ended";
    this.#loading = false;
    this.#finishActiveVisit(Date.now());
    this.#endedAt = Date.now();
    this.#emitState();
    this.#emit({ type: "ended" });
  }

  close(): void {
    this.end();
  }

  #finishActiveVisit(now: number): void {
    const active = this.#activeVisit;
    if (active === null) {
      return;
    }
    active.leftAt = now;
    active.dwellMs = Math.max(0, now - active.enteredAt);
    this.#activeVisit = null;
    this.#emitVisits();
  }

  #emit(event: RabbitHoleEvent): void {
    for (const listener of this.#listeners) {
      listener(event);
    }
  }

  #emitState(): void {
    this.#emit({ state: this.getState(), type: "state" });
  }

  #emitVisits(): void {
    this.#emit({ type: "visits", visits: this.getVisitsForDisplay() });
  }
}
