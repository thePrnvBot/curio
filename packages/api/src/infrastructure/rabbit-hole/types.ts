import { randomUUID } from "node:crypto";

/* ------------------------------- session model ------------------------------ */

/** One page visited during a Rabbit Hole session. Raw captures are ephemeral:
 * they only exist until the session is digested and purged. */
export interface RabbitHoleMedia {
  readonly url: string;
  readonly kind: "video" | "audio" | "embed";
  readonly title?: string;
}

export interface RabbitHoleVisit {
  readonly id: string;
  readonly url: string;
  readonly title: string;
  readonly enteredAt: number;
  leftAt: number | null;
  dwellMs: number;
  scrollDepth: number;
  excerpt: string;
  media: RabbitHoleMedia[];
}

/** A sidebar note the learner wrote while looking at a page. */
export interface RabbitHoleNote {
  readonly id: string;
  readonly text: string;
  readonly url: string;
  readonly title: string;
  readonly at: number;
  /** Short acknowledgement from the Director, when the model answered. */
  readonly reply?: string;
}

/** A passage the learner marked in the streamed page. */
export interface RabbitHoleHighlight {
  readonly id: string;
  readonly quote: string;
  readonly url: string;
  readonly title: string;
  readonly at: number;
}

export type RabbitHoleStatus = "starting" | "ready" | "ended" | "error";

export interface RabbitHoleViewport {
  readonly width: number;
  readonly height: number;
}

export interface RabbitHoleState {
  readonly id: string;
  readonly chatId: string;
  readonly topic: string | null;
  readonly status: RabbitHoleStatus;
  readonly url: string;
  readonly title: string;
  readonly loading: boolean;
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
  readonly viewport: RabbitHoleViewport;
  readonly startedAt: number;
  readonly endedAt: number | null;
  /**
   * Secret used in the proxied URL. The overlay needs it to build iframe
   * URLs; it is returned only to the authenticated session owner.
   */
  readonly proxyToken: string;
}

export interface RabbitHoleStats {
  readonly pages: number;
  readonly notes: number;
  readonly highlights: number;
  readonly media: number;
  readonly durationMs: number;
}

export interface RabbitHoleDigestResult {
  readonly digest: string;
  readonly stats: RabbitHoleStats;
  readonly pages: readonly RabbitHolePageSummary[];
  readonly topic: string | null;
}

export interface RabbitHolePageSummary {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly dwellMs: number;
  readonly scrollDepth: number;
  readonly noteCount: number;
  readonly highlightCount: number;
  readonly mediaCount: number;
}

export type RabbitHoleEvent =
  | { readonly type: "state"; readonly state: RabbitHoleState }
  | {
      readonly type: "visits";
      readonly visits: readonly RabbitHoleVisit[];
    }
  | { readonly type: "notes"; readonly notes: readonly RabbitHoleNote[] }
  | { readonly type: "ended" };

/* --------------------------------- helpers --------------------------------- */

export function createRabbitHoleId(): string {
  return `rh_${randomUUID().replaceAll("-", "")}`;
}

export function createVisitId(): string {
  return `visit_${randomUUID().replaceAll("-", "")}`;
}

export function createNoteId(): string {
  return `note_${randomUUID().replaceAll("-", "")}`;
}

export function createHighlightId(): string {
  return `highlight_${randomUUID().replaceAll("-", "")}`;
}
