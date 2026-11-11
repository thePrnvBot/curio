import { buildRabbitHoleFollowUpPrompt } from "@curio/api/infrastructure/rabbit-hole/digest";
import {
  buildProxyUrl,
  proxyBasePath,
} from "@curio/api/infrastructure/rabbit-hole/proxy-url";
import type {
  RabbitHoleHighlight,
  RabbitHoleMedia,
  RabbitHoleNote,
  RabbitHolePageSummary,
  RabbitHoleState,
  RabbitHoleStats,
  RabbitHoleVisit,
} from "@curio/api/infrastructure/rabbit-hole/types";
import {
  formatRabbitHoleDuration,
  normalizeRabbitHoleUrl,
  rabbitHoleHost,
} from "@curio/api/infrastructure/rabbit-hole/url";
import { MessageResponse } from "@curio/ui/components/ai-elements/message";
import { Button } from "@curio/ui/components/button";
import { Input } from "@curio/ui/components/input";
import { Textarea } from "@curio/ui/components/textarea";
import { cn } from "@curio/ui/lib/utils";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BookOpenIcon,
  HighlighterIcon,
  Loader2Icon,
  Maximize2Icon,
  Minimize2Icon,
  NotebookPenIcon,
  RabbitIcon,
  RotateCwIcon,
  SendIcon,
  SparklesIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent as ReactFormEvent } from "react";
import { toast } from "sonner";

interface EndPayload {
  readonly digest: string;
  /** Raw deterministic trail sent to the Director as source material. */
  readonly sourceDigest: string;
  readonly pages: readonly RabbitHolePageSummary[];
  readonly stats: RabbitHoleStats;
  readonly topic: string | null;
}

type Phase = "loading" | "live" | "ending" | "wrapup" | "error";

interface NavigationState {
  readonly index: number;
  readonly urls: readonly string[];
}

interface TrackerMessage {
  readonly __curio?: boolean;
  readonly event?: "activity" | "error" | "page" | "ready" | "selection";
  readonly media?: readonly RabbitHoleMedia[];
  readonly quote?: string;
  readonly requestId?: string;
  readonly scroll?: number;
  readonly sessionId?: string;
  readonly text?: string;
  readonly title?: string;
  readonly token?: string;
  readonly url?: string;
}

const MAX_NAVIGATION_ENTRIES = 50;

function postJson(url: string, body?: unknown): Promise<Response> {
  return fetch(url, {
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "include",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    method: "POST",
  });
}

/** Fire-and-forget POST: tracker updates and purges must never block the UI. */
async function postQuietly(url: string, body?: unknown): Promise<void> {
  try {
    await postJson(url, body);
  } catch {
    // The next tracker update (or the purge timer) covers a dropped request.
  }
}

function pushNavigation(
  current: NavigationState,
  url: string
): NavigationState {
  if (current.urls[current.index] === url) {
    return current;
  }
  const urls = current.urls.slice(0, current.index + 1);
  urls.push(url);
  const trimmed = urls.slice(-MAX_NAVIGATION_ENTRIES);
  return { index: trimmed.length - 1, urls: trimmed };
}

function syncNavigation(
  current: NavigationState,
  url: string
): NavigationState {
  if (current.urls[current.index] === url) {
    return current;
  }
  if (current.index > 0 && current.urls[current.index - 1] === url) {
    return { ...current, index: current.index - 1 };
  }
  if (
    current.index + 1 < current.urls.length &&
    current.urls[current.index + 1] === url
  ) {
    return { ...current, index: current.index + 1 };
  }
  return pushNavigation(current, url);
}

/**
 * The expandable browser window.
 *
 * The page itself is a live iframe through the local proxy, not a screencast:
 * native scroll, selection, links, forms and keyboard input all work. A tiny
 * injected script posts the trail and selection back to this component, which
 * is the only side allowed to write the authenticated session.
 */
// oxlint-disable-next-line complexity -- one dialog owns the proxied browser wiring; splitting it would thread a dozen refs through props
export function RabbitHoleWindow({
  onClose,
  onSendPrompt,
  sessionId,
}: {
  readonly onClose: () => void;
  readonly onSendPrompt: (prompt: string) => void;
  readonly sessionId: string;
}) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [browser, setBrowser] = useState<RabbitHoleState | null>(null);
  const [visits, setVisits] = useState<readonly RabbitHoleVisit[]>([]);
  const [notes, setNotes] = useState<readonly RabbitHoleNote[]>([]);
  const [highlights, setHighlights] = useState<readonly RabbitHoleHighlight[]>(
    []
  );
  const [endPayload, setEndPayload] = useState<EndPayload | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [addressDraft, setAddressDraft] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [notePending, setNotePending] = useState(false);
  const [takeaways, setTakeaways] = useState("");
  const [errorMessage, setErrorMessage] = useState("Session unavailable");
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [frameReady, setFrameReady] = useState(false);
  const [navigation, setNavigation] = useState<NavigationState>({
    index: -1,
    urls: [],
  });

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const finishGuardRef = useRef(false);
  const selectionRef = useRef<{
    readonly requestId: string;
    readonly resolve: (quote: string) => void;
  } | null>(null);

  const proxyToken = browser?.proxyToken ?? "";
  const basePath = useMemo(
    () => (proxyToken === "" ? null : proxyBasePath(sessionId, proxyToken)),
    [proxyToken, sessionId]
  );
  const currentUrl = browser?.url ?? "";
  const address = addressDraft ?? currentUrl;

  const sendCommand = useCallback(
    (command: string, extra: Record<string, unknown> = {}) => {
      iframeRef.current?.contentWindow?.postMessage(
        {
          __curioCommand: true,
          command,
          sessionId,
          token: proxyToken,
          ...extra,
        },
        "*"
      );
    },
    [proxyToken, sessionId]
  );

  const finish = useCallback(async () => {
    if (finishGuardRef.current) {
      return;
    }
    finishGuardRef.current = true;
    setPhase("ending");
    try {
      const response = await postJson(
        `/api/rabbit-hole/${encodeURIComponent(sessionId)}/end`
      );
      if (!response.ok) {
        finishGuardRef.current = false;
        setErrorMessage(
          response.status === 404
            ? "This Rabbit Hole has already been discarded."
            : "The session could not be digested."
        );
        setPhase("error");
        return;
      }
      const payload = (await response.json()) as EndPayload;
      setEndPayload(payload);
      setPhase("wrapup");
    } catch {
      finishGuardRef.current = false;
      setErrorMessage("The session could not be digested.");
      setPhase("error");
    }
  }, [sessionId]);

  // Initial snapshot, so a reload can reattach before the stream opens.
  useEffect(() => {
    let cancelled = false;

    async function loadSession(): Promise<void> {
      try {
        const response = await fetch(
          `/api/rabbit-hole/${encodeURIComponent(sessionId)}`,
          { credentials: "include" }
        );
        if (!response.ok) {
          if (!cancelled) {
            setErrorMessage(
              response.status === 404
                ? "This Rabbit Hole has already been discarded."
                : "Could not load the session."
            );
            setPhase("error");
          }
          return;
        }
        const payload = (await response.json()) as {
          highlights?: readonly RabbitHoleHighlight[];
          notes: readonly RabbitHoleNote[];
          state: RabbitHoleState;
          visits: readonly RabbitHoleVisit[];
        };
        if (cancelled) {
          return;
        }
        setBrowser(payload.state);
        setVisits(payload.visits);
        setNotes(payload.notes);
        setHighlights(payload.highlights ?? []);
        if (payload.state.status === "ended") {
          void finish();
          return;
        }
        if (payload.state.url !== "") {
          const base = proxyBasePath(sessionId, payload.state.proxyToken);
          setIframeUrl(buildProxyUrl(base, payload.state.url));
          setNavigation({ index: 0, urls: [payload.state.url] });
        }
        setPhase("live");
      } catch {
        if (!cancelled) {
          setErrorMessage("Could not load the session.");
          setPhase("error");
        }
      }
    }

    void loadSession();
    return () => {
      cancelled = true;
    };
  }, [finish, sessionId]);

  // Live feed: trail, notes, state and the ending signal. There are no frames.
  useEffect(() => {
    const source = new EventSource(
      `/api/rabbit-hole/${encodeURIComponent(sessionId)}/stream`
    );
    const onState = (event: MessageEvent<string>): void => {
      try {
        setBrowser(JSON.parse(event.data) as RabbitHoleState);
      } catch {
        // Ignore a malformed frame; the next one will replace it.
      }
    };
    const onVisits = (event: MessageEvent<string>): void => {
      try {
        const payload = JSON.parse(event.data) as {
          visits: readonly RabbitHoleVisit[];
        };
        setVisits(payload.visits);
      } catch {
        // Ignore.
      }
    };
    const onNotes = (event: MessageEvent<string>): void => {
      try {
        const payload = JSON.parse(event.data) as {
          notes: readonly RabbitHoleNote[];
        };
        setNotes(payload.notes);
      } catch {
        // Ignore.
      }
    };
    const onEnded = (): void => {
      source.close();
      if (!finishGuardRef.current) {
        void finish();
      }
    };

    source.addEventListener("state", onState as EventListener);
    source.addEventListener("visits", onVisits as EventListener);
    source.addEventListener("notes", onNotes as EventListener);
    source.addEventListener("ended", onEnded);
    return () => {
      source.removeEventListener("state", onState as EventListener);
      source.removeEventListener("visits", onVisits as EventListener);
      source.removeEventListener("notes", onNotes as EventListener);
      source.removeEventListener("ended", onEnded);
      source.close();
    };
  }, [finish, sessionId]);

  // The injected tracker is the only thing that can read the sandboxed DOM.
  useEffect(() => {
    if (proxyToken === "") {
      return;
    }
    const onMessage = (event: MessageEvent): void => {
      const frame = iframeRef.current;
      if (frame === null || event.source !== frame.contentWindow) {
        return;
      }
      const data = event.data as TrackerMessage | null;
      if (
        data === null ||
        data.__curio !== true ||
        data.sessionId !== sessionId ||
        data.token !== proxyToken
      ) {
        return;
      }

      if (data.event === "selection") {
        const pending = selectionRef.current;
        if (pending !== null && pending.requestId === data.requestId) {
          selectionRef.current = null;
          pending.resolve(data.quote ?? "");
        }
        return;
      }

      const url = typeof data.url === "string" ? data.url : "";
      if (data.event === "ready") {
        setFrameReady(true);
        setPhase((current) => (current === "loading" ? "live" : current));
        return;
      }
      if (data.event === "error") {
        setFrameReady(true);
        toast.error("This page did not finish loading inside the Rabbit Hole.");
        return;
      }
      if (url === "") {
        return;
      }

      if (data.event === "page") {
        setFrameReady(true);
        setPhase((current) => (current === "loading" ? "live" : current));
        setNavigation((current) => syncNavigation(current, url));
        setBrowser((current) =>
          current === null
            ? current
            : {
                ...current,
                loading: false,
                title:
                  typeof data.title === "string" && data.title !== ""
                    ? data.title
                    : current.title,
                url,
              }
        );
        void postQuietly(
          `/api/rabbit-hole/${encodeURIComponent(sessionId)}/track`,
          {
            kind: "page",
            media: data.media,
            scroll: data.scroll,
            text: data.text,
            title: data.title,
            url,
          }
        );
        return;
      }

      if (data.event === "activity") {
        // Activity also repairs the address bar if the first `page` message
        // landed before this listener existed.
        setFrameReady(true);
        setPhase((current) => (current === "loading" ? "live" : current));
        setNavigation((current) => syncNavigation(current, url));
        setBrowser((current) =>
          current === null
            ? current
            : {
                ...current,
                loading: false,
                title:
                  typeof data.title === "string" && data.title !== ""
                    ? data.title
                    : current.title,
                url,
              }
        );
        void postQuietly(
          `/api/rabbit-hole/${encodeURIComponent(sessionId)}/track`,
          {
            kind: "activity",
            scroll: data.scroll,
            title: data.title,
            url,
          }
        );
      }
    };

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, [proxyToken, sessionId]);

  // A page that never runs the tracker still deserves to become visible.
  useEffect(() => {
    if (iframeUrl === null || frameReady) {
      return;
    }
    const timer = window.setTimeout(() => {
      setFrameReady(true);
    }, 8000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [frameReady, iframeUrl]);

  const navigate = useCallback(
    (rawUrl: string) => {
      if (basePath === null) {
        return;
      }
      const url = normalizeRabbitHoleUrl(rawUrl);
      if (url === null) {
        return;
      }
      setNavigation((current) => pushNavigation(current, url));
      if (currentUrl === url) {
        sendCommand("reload");
        return;
      }
      setFrameReady(false);
      setIframeUrl(buildProxyUrl(basePath, url));
      setAddressDraft(null);
      setBrowser((current) =>
        current === null ? current : { ...current, loading: true, url }
      );
    },
    [basePath, currentUrl, sendCommand]
  );

  const goBack = useCallback(() => {
    if (basePath === null || navigation.index <= 0) {
      return;
    }
    const index = navigation.index - 1;
    const url = navigation.urls[index];
    if (url === undefined) {
      return;
    }
    setNavigation({ ...navigation, index });
    setFrameReady(false);
    setIframeUrl(buildProxyUrl(basePath, url));
  }, [basePath, navigation]);

  const goForward = useCallback(() => {
    if (basePath === null || navigation.index >= navigation.urls.length - 1) {
      return;
    }
    const index = navigation.index + 1;
    const url = navigation.urls[index];
    if (url === undefined) {
      return;
    }
    setNavigation({ ...navigation, index });
    setFrameReady(false);
    setIframeUrl(buildProxyUrl(basePath, url));
  }, [basePath, navigation]);

  const reload = useCallback(() => {
    setFrameReady(false);
    sendCommand("reload");
  }, [sendCommand]);

  // oxlint-disable-next-line arrow-body-style -- the block owns the pending-request ref and its timeout
  const requestSelection = useCallback((): Promise<string> => {
    // oxlint-disable-next-line promise/avoid-new -- a request/response pair with the sandboxed frame is inherently event-based
    return new Promise<string>((resolve) => {
      const previous = selectionRef.current;
      if (previous !== null) {
        previous.resolve("");
      }
      const requestId = `sel_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const timer = window.setTimeout(() => {
        if (selectionRef.current?.requestId === requestId) {
          selectionRef.current = null;
          resolve("");
        }
      }, 3000);
      selectionRef.current = {
        requestId,
        resolve: (quote) => {
          window.clearTimeout(timer);
          resolve(quote);
        },
      };
      sendCommand("capture-selection", { requestId });
    });
  }, [sendCommand]);

  const submitAddress = (event: ReactFormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    navigate(address);
    (document.activeElement as HTMLElement | null)?.blur();
  };

  const submitNote = async (): Promise<void> => {
    const text = noteText.trim();
    if (text === "" || notePending) {
      return;
    }
    setNotePending(true);
    try {
      const response = await postJson(
        `/api/rabbit-hole/${encodeURIComponent(sessionId)}/note`,
        { text }
      );
      if (response.ok) {
        const payload = (await response.json()) as { note: RabbitHoleNote };
        setNotes((current) =>
          current.some((note) => note.id === payload.note.id)
            ? current
            : [...current, payload.note]
        );
        setNoteText("");
      } else {
        toast.error("Couldn't save the note");
      }
    } catch {
      toast.error("Couldn't save the note");
    }
    setNotePending(false);
  };

  const captureHighlight = async (): Promise<void> => {
    const quote = await requestSelection();
    if (quote.trim() === "") {
      toast.info(
        "Drag across the text in the page first, then press Highlight."
      );
      return;
    }
    let response: Response;
    try {
      response = await postJson(
        `/api/rabbit-hole/${encodeURIComponent(sessionId)}/highlight`,
        { quote }
      );
    } catch {
      toast.error("Couldn't reach the page");
      return;
    }
    if (response.status === 422) {
      toast.info(
        "Drag across the text in the page first, then press Highlight."
      );
      return;
    }
    if (!response.ok) {
      toast.error("Couldn't capture that highlight");
      return;
    }
    try {
      const payload = (await response.json()) as {
        highlight: RabbitHoleHighlight;
      };
      setHighlights((current) => [...current, payload.highlight]);
      toast.success("Highlight captured");
    } catch {
      toast.error("Couldn't capture that highlight");
    }
  };

  const discard = useCallback(async () => {
    await postQuietly(
      `/api/rabbit-hole/${encodeURIComponent(sessionId)}/discard`
    );
    onClose();
  }, [onClose, sessionId]);

  const chooseTarget = (target: "recap" | "course"): void => {
    if (endPayload === null) {
      return;
    }
    const prompt = buildRabbitHoleFollowUpPrompt({
      digest: endPayload.sourceDigest || endPayload.digest,
      takeaways,
      target,
    });
    void postQuietly(
      `/api/rabbit-hole/${encodeURIComponent(sessionId)}/discard`
    );
    onSendPrompt(prompt);
    onClose();
  };

  const stats = endPayload?.stats;
  const endedState = endPayload?.topic ?? browser?.topic ?? "Your Rabbit Hole";

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-2 backdrop-blur-sm sm:p-4">
      <dialog
        aria-label="Rabbit Hole"
        aria-modal="true"
        className={cn(
          "bg-background text-foreground static m-0 flex w-full flex-col overflow-hidden border p-0 shadow-2xl transition-[max-width,max-height,border-radius] duration-200",
          expanded
            ? "h-full max-h-screen max-w-none rounded-none"
            : "h-[88vh] max-h-[980px] max-w-[1540px] rounded-2xl"
        )}
        open
      >
        {/* Top bar */}
        <header className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="bg-primary/10 text-primary flex size-7 shrink-0 items-center justify-center rounded-full">
              <RabbitIcon className="size-4" />
            </span>
            <div className="hidden min-w-0 sm:block">
              <p className="text-xs leading-tight font-semibold">Rabbit Hole</p>
              <p className="text-muted-foreground max-w-[220px] truncate text-[10px] leading-tight">
                {browser?.topic ?? "Open exploration"}
              </p>
            </div>
          </div>

          {phase === "live" ? (
            <div className="flex min-w-0 flex-1 items-center gap-1">
              <Button
                aria-label="Back"
                disabled={navigation.index <= 0}
                onClick={goBack}
                size="icon-sm"
                variant="ghost"
              >
                <ArrowLeftIcon />
              </Button>
              <Button
                aria-label="Forward"
                disabled={navigation.index >= navigation.urls.length - 1}
                onClick={goForward}
                size="icon-sm"
                variant="ghost"
              >
                <ArrowRightIcon />
              </Button>
              <Button
                aria-label="Reload"
                onClick={reload}
                size="icon-sm"
                variant="ghost"
              >
                <RotateCwIcon
                  className={
                    browser?.loading === true ? "animate-spin" : undefined
                  }
                />
              </Button>
              <form className="min-w-0 flex-1" onSubmit={submitAddress}>
                <Input
                  aria-label="Address"
                  className="bg-muted/40 h-7 w-full font-mono text-[11px]"
                  onBlur={() => {
                    setAddressDraft(null);
                  }}
                  onChange={(event) => {
                    setAddressDraft(event.target.value);
                  }}
                  onFocus={() => {
                    setAddressDraft(address);
                  }}
                  placeholder="Search or enter a URL"
                  spellCheck={false}
                  value={address}
                />
              </form>
              <Button
                aria-label="Highlight selection"
                onClick={() => {
                  void captureHighlight();
                }}
                size="icon-sm"
                variant="ghost"
              >
                <HighlighterIcon />
              </Button>
            </div>
          ) : (
            <div className="flex-1" />
          )}

          <div className="flex shrink-0 items-center gap-1">
            <span className="text-muted-foreground hidden items-center gap-1 text-[10px] md:flex">
              <SparklesIcon className="size-3" />
              {visits.length} pages
            </span>
            <Button
              aria-label={expanded ? "Restore window size" : "Expand window"}
              onClick={() => {
                setExpanded((current) => !current);
              }}
              size="icon-sm"
              variant="ghost"
            >
              {expanded ? <Minimize2Icon /> : <Maximize2Icon />}
            </Button>
            <Button
              aria-label={phase === "wrapup" ? "Close" : "End session"}
              onClick={() => {
                if (phase === "wrapup" || phase === "error") {
                  onClose();
                  return;
                }
                void finish();
              }}
              size="icon-sm"
              variant="ghost"
            >
              <XIcon />
            </Button>
          </div>
        </header>

        {phase === "wrapup" && endPayload !== null ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-3xl space-y-5 p-5 sm:p-8">
              <div className="space-y-1">
                <p className="text-muted-foreground flex items-center gap-1.5 text-[10px] font-medium tracking-[0.14em] uppercase">
                  <RabbitIcon className="size-3.5" />
                  Session digested
                </p>
                <h2 className="text-xl font-semibold">{endedState}</h2>
                {stats !== undefined && (
                  <p className="text-muted-foreground text-xs">
                    {stats.pages} pages ·{" "}
                    {formatRabbitHoleDuration(stats.durationMs)} · {stats.notes}{" "}
                    notes · {stats.highlights} highlights · {stats.media} media
                  </p>
                )}
              </div>

              <div className="bg-card rounded-xl border p-4 text-sm sm:p-5">
                <MessageResponse>{endPayload.digest}</MessageResponse>
              </div>

              <div className="space-y-2">
                <label
                  className="text-sm font-medium"
                  htmlFor="rabbit-hole-takeaways"
                >
                  What mattered most to you?
                </label>
                <p className="text-muted-foreground text-xs">
                  Optional. These takeaways steer the recap or course toward
                  what you actually care about.
                </p>
                <Textarea
                  className="min-h-20"
                  id="rabbit-hole-takeaways"
                  onChange={(event) => {
                    setTakeaways(event.target.value);
                  }}
                  placeholder="e.g. focus on the scheduler comparison, skip the history section"
                  value={takeaways}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => chooseTarget("recap")}>
                  <NotebookPenIcon data-icon="inline-start" />
                  Recap notes
                </Button>
                <Button
                  onClick={() => chooseTarget("course")}
                  variant="secondary"
                >
                  <BookOpenIcon data-icon="inline-start" />
                  Build a course
                </Button>
                <Button
                  className="ml-auto"
                  onClick={() => {
                    void discard();
                  }}
                  variant="ghost"
                >
                  Discard session
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            {/* Browser stage */}
            <div className="relative min-h-0 flex-1 bg-white">
              {iframeUrl === null ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black/90 p-6">
                  <div className="w-full max-w-md space-y-3 text-center">
                    <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-white/10 text-white">
                      {phase === "loading" ? (
                        <Loader2Icon className="size-5 animate-spin" />
                      ) : (
                        <RabbitIcon className="size-5" />
                      )}
                    </span>
                    <p className="text-sm font-medium text-white">
                      {phase === "loading"
                        ? "Opening the Rabbit Hole…"
                        : "The Rabbit Hole is open"}
                    </p>
                    <p className="text-xs text-white/70">
                      {phase === "loading"
                        ? "Preparing a tracked, disposable browser session."
                        : "Type a URL or a search above, or paste a link. Everything you visit is captured for the digest."}
                    </p>
                  </div>
                </div>
              ) : (
                <iframe
                  allow="autoplay; clipboard-read; clipboard-write; fullscreen"
                  className="h-full w-full border-0 bg-white"
                  ref={iframeRef}
                  referrerPolicy="same-origin"
                  sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-pointer-lock"
                  src={iframeUrl}
                  title="Rabbit Hole browser"
                />
              )}

              {!frameReady && iframeUrl !== null && phase !== "error" && (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/40 text-center text-white">
                  <Loader2Icon className="size-6 animate-spin" />
                  <p className="text-xs">Connecting to the page…</p>
                </div>
              )}

              {phase === "ending" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 text-white">
                  <Loader2Icon className="size-6 animate-spin" />
                  <p className="text-xs">Digesting the trail…</p>
                </div>
              )}
              {phase === "error" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 p-6 text-center text-white">
                  <TriangleAlertIcon className="size-6 text-amber-300" />
                  <p className="max-w-sm text-xs">{errorMessage}</p>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        void finish();
                      }}
                      size="sm"
                      variant="secondary"
                    >
                      Try again
                    </Button>
                    <Button
                      onClick={() => {
                        void discard();
                      }}
                      size="sm"
                      variant="ghost"
                    >
                      Close
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Director sidebar */}
            <aside className="border-border flex max-h-[42%] w-full shrink-0 flex-col border-t lg:max-h-none lg:w-[336px] lg:border-t-0 lg:border-l">
              <div className="flex shrink-0 items-center justify-between px-3 pt-3 pb-1">
                <p className="text-[10px] font-medium tracking-[0.14em] uppercase">
                  Director notes
                </p>
                <span className="text-muted-foreground text-[10px]">
                  {notes.length} pinned
                </span>
              </div>
              <div className="flex shrink-0 gap-1.5 px-3 pb-2">
                <Input
                  className="h-8 text-xs"
                  maxLength={1000}
                  onChange={(event) => {
                    setNoteText(event.target.value);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void submitNote();
                    }
                  }}
                  placeholder="Tell Curio what to keep…"
                  value={noteText}
                />
                <Button
                  aria-label="Save note"
                  disabled={notePending || noteText.trim() === ""}
                  onClick={() => {
                    void submitNote();
                  }}
                  size="icon-sm"
                >
                  {notePending ? (
                    <Loader2Icon className="animate-spin" />
                  ) : (
                    <SendIcon />
                  )}
                </Button>
              </div>

              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-2">
                {notes.length === 0 ? (
                  <p className="text-muted-foreground text-[11px] leading-relaxed">
                    Notes are pinned to the page you are looking at and weighted
                    in the digest. They are private to this session.
                  </p>
                ) : (
                  notes.map((note) => (
                    <div
                      className="bg-muted/40 rounded-lg border p-2"
                      key={note.id}
                    >
                      <p className="text-xs leading-snug">{note.text}</p>
                      {note.reply !== undefined && note.reply !== "" && (
                        <p className="text-muted-foreground mt-1 text-[11px] leading-snug">
                          <span className="text-foreground font-medium">
                            Curio:
                          </span>{" "}
                          {note.reply}
                        </p>
                      )}
                      <p className="text-muted-foreground mt-1 truncate text-[10px]">
                        {rabbitHoleHost(note.url)}
                      </p>
                    </div>
                  ))
                )}
              </div>

              <div className="border-border shrink-0 border-t">
                <div className="flex items-center justify-between px-3 pt-2 pb-1">
                  <p className="text-[10px] font-medium tracking-[0.14em] uppercase">
                    Trail
                  </p>
                  <span className="text-muted-foreground text-[10px]">
                    {visits.length}
                  </span>
                </div>
                <div className="max-h-44 overflow-y-auto px-2 pb-2">
                  {visits.length === 0 ? (
                    <p className="text-muted-foreground px-1 pb-1 text-[11px]">
                      Pages appear here as you browse.
                    </p>
                  ) : (
                    visits.map((visit) => (
                      <button
                        className={cn(
                          "hover:bg-muted/60 flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left",
                          visit.url === currentUrl && "bg-muted"
                        )}
                        key={visit.id}
                        onClick={() => {
                          navigate(visit.url);
                        }}
                        type="button"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[11px] font-medium">
                            {visit.title === ""
                              ? rabbitHoleHost(visit.url)
                              : visit.title}
                          </span>
                          <span className="text-muted-foreground block truncate text-[10px]">
                            {rabbitHoleHost(visit.url)}
                          </span>
                        </span>
                        <span className="text-muted-foreground shrink-0 pt-0.5 font-mono text-[10px]">
                          {formatRabbitHoleDuration(visit.dwellMs)}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {highlights.length > 0 && (
                <div className="border-border max-h-40 shrink-0 overflow-y-auto border-t px-3 py-2">
                  <p className="text-muted-foreground mb-1 text-[10px] font-medium tracking-[0.14em] uppercase">
                    Highlights
                  </p>
                  <ul className="space-y-1.5">
                    {highlights.map((highlight) => (
                      <li
                        className="border-l-2 pl-2 text-[11px] leading-snug"
                        key={highlight.id}
                      >
                        “{highlight.quote}”
                        <span className="text-muted-foreground block text-[10px]">
                          {rabbitHoleHost(highlight.url)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </aside>
          </div>
        )}
      </dialog>
    </div>
  );
}
