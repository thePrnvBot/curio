/**
 * Builds the small script injected into every proxied HTML document.
 *
 * It is intentionally dependency-free and runs before the page's own scripts
 * where possible. Its jobs are:
 *
 * 1. rewrite root-relative and absolute URLs created at runtime,
 * 2. keep the overlay's address bar and trail in sync with pushes/pops,
 * 3. report page text, title, scroll depth and media to the parent frame,
 * 4. answer parent commands (back, forward, reload, capture selection).
 *
 * The iframe is sandboxed without `allow-same-origin`, so the parent cannot
 * read this DOM directly. `postMessage` is the whole tracking channel.
 */

export interface TrackerOptions {
  readonly parentOrigin: string;
  readonly proxyBasePath: string;
  readonly sessionId: string;
  readonly targetUrl: string;
  readonly token: string;
}

function jsLiteral(value: string): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

export function buildTrackerScript(options: TrackerOptions): string {
  return `(() => {
  "use strict";
  const SESSION = ${jsLiteral(options.sessionId)};
  const TOKEN = ${jsLiteral(options.token)};
  const BASE = ${jsLiteral(options.proxyBasePath)};
  const PARENT_ORIGIN = ${jsLiteral(options.parentOrigin)};
  let target = ${jsLiteral(options.targetUrl)};

  const send = (event, payload) => {
    const message = Object.assign(
      {
        __curio: true,
        event,
        sessionId: SESSION,
        token: TOKEN,
        url: String(target).slice(0, 4000),
      },
      payload || {}
    );
    try {
      window.parent.postMessage(message, PARENT_ORIGIN || "*");
    } catch (_) {
      // The parent may already be gone.
    }
  };

  const toProxy = (raw) => {
    if (typeof raw !== "string") return raw;
    const value = raw.trim();
    if (value === "") return raw;
    if (value.charAt(0) === "#") return value;
    if (value.indexOf(BASE + "/") === 0) return value;
    if (/^(about|blob|data|file|javascript|mailto|tel|ws|wss):/i.test(value)) {
      return raw;
    }
    let resolved;
    try {
      resolved = new URL(value, target);
    } catch (_) {
      return raw;
    }
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
      return raw;
    }
    const prefix = BASE + "/";
    if (
      resolved.host === location.host &&
      resolved.pathname.indexOf(prefix) === 0
    ) {
      return resolved.href;
    }
    return (
      BASE +
      "/" +
      encodeURIComponent(resolved.origin) +
      resolved.pathname +
      resolved.search +
      resolved.hash
    );
  };

  const isProxyUrl = (value) => {
    if (typeof value !== "string" || value === "") return false;
    if (value.indexOf(BASE + "/") === 0) return true;
    try {
      const parsed = new URL(value, location.href);
      return (
        parsed.host === location.host &&
        parsed.pathname.indexOf(BASE + "/") === 0
      );
    } catch (_) {
      return false;
    }
  };

  const fromProxy = (value) => {
    if (typeof value !== "string" || value === "") return value;
    let parsed;
    try {
      parsed = new URL(value, location.href);
    } catch (_) {
      return value;
    }
    if (parsed.host !== location.host) return value;
    const prefix = BASE + "/";
    if (parsed.pathname.indexOf(prefix) !== 0) return value;
    const rest = parsed.pathname.slice(prefix.length);
    const slash = rest.indexOf("/");
    const encodedOrigin = slash === -1 ? rest : rest.slice(0, slash);
    const path = slash === -1 ? "/" : rest.slice(slash);
    let origin;
    try {
      origin = decodeURIComponent(encodedOrigin);
    } catch (_) {
      return value;
    }
    if (!/^https?:\\/\\//i.test(origin)) return value;
    return origin + path + parsed.search + parsed.hash;
  };

  const targetFromLocation = () => {
    const prefix = BASE + "/";
    if (location.pathname.indexOf(prefix) !== 0) return null;
    const rest = location.pathname.slice(prefix.length);
    const slash = rest.indexOf("/");
    const encodedOrigin = slash === -1 ? rest : rest.slice(0, slash);
    const path = slash === -1 ? "/" : rest.slice(slash);
    let origin;
    try {
      origin = decodeURIComponent(encodedOrigin);
    } catch (_) {
      return null;
    }
    if (!/^https?:\\/\\//i.test(origin)) return null;
    return origin + path + location.search + location.hash;
  };

  const clean = (value) => String(value || "").replace(/\\s+/g, " ").trim();
  const pageTitle = () => String(document.title || "").slice(0, 500);

  const collectMedia = () => {
    const found = [];
    const seen = new Set();
    const push = (url, kind, title) => {
      url = String(url || "").trim().slice(0, 4000);
      if (!url || seen.has(url)) return;
      seen.add(url);
      const label = title ? clean(title).slice(0, 500) : "";
      found.push({
        url: url,
        kind: kind,
        title: label === "" ? undefined : label,
      });
    };
    try {
      for (const el of Array.from(document.querySelectorAll("video,audio"))) {
        push(
          fromProxy(el.currentSrc || el.src || ""),
          el.tagName.toLowerCase() === "video" ? "video" : "audio",
          el.getAttribute("title") || el.getAttribute("aria-label") || ""
        );
      }
      for (const frame of Array.from(document.querySelectorAll("iframe"))) {
        const src = fromProxy(frame.src || "");
        if (
          !src ||
          src.indexOf("about:") === 0 ||
          src.indexOf("javascript:") === 0
        ) {
          continue;
        }
        const match = src.match(
          /(?:youtube\\.com\\/embed\\/|youtu\\.be\\/|youtube\\.com\\/watch\\?v=)([A-Za-z0-9_-]{6,})/
        );
        push(
          match ? "https://www.youtube.com/watch?v=" + match[1] : src,
          match ? "video" : "embed",
          frame.getAttribute("title") || ""
        );
      }
    } catch (_) {
      // Media collection is best-effort.
    }
    return found.slice(0, 20);
  };

  const snapshot = () => {
    let text = "";
    let scroll = 0;
    try {
      text = clean(
        document.body
          ? document.body.innerText || document.body.textContent
          : ""
      ).slice(0, 12000);
      scroll = Math.min(
        1,
        Math.max(
          0,
          (window.scrollY + window.innerHeight) /
            Math.max(document.documentElement.scrollHeight, 1)
        )
      );
    } catch (_) {
      // Reading a hostile document must not break the session.
    }
    return {
      media: collectMedia(),
      scroll: scroll,
      text: text,
      title: pageTitle(),
    };
  };

  const reportPage = () => {
    const data = snapshot();
    send("page", data);
  };

  let activityTimer = 0;
  const reportActivity = () => {
    let scroll = 0;
    try {
      scroll = Math.min(
        1,
        Math.max(
          0,
          (window.scrollY + window.innerHeight) /
            Math.max(document.documentElement.scrollHeight, 1)
        )
      );
    } catch (_) {
      // Ignore.
    }
    send("activity", { scroll: scroll, title: pageTitle() });
  };
  const scheduleActivity = () => {
    if (activityTimer) return;
    activityTimer = window.setTimeout(() => {
      activityTimer = 0;
      reportActivity();
    }, 500);
  };

  // Keep dwell time fresh without resending the page text every few seconds.
  window.setInterval(() => {
    if (document.visibilityState === "visible") reportActivity();
  }, 5000);

  // Patch runtime URL creation before the page's own scripts run.
  const originalFetch = window.fetch;
  if (typeof originalFetch === "function") {
    window.fetch = function (input, init) {
      try {
        if (typeof input === "string" || input instanceof URL) {
          return originalFetch.call(this, toProxy(String(input)), init);
        }
        if (typeof Request !== "undefined" && input instanceof Request) {
          return originalFetch.call(this, new Request(toProxy(input.url), input), init);
        }
      } catch (_) {
        // Fall through to the original call.
      }
      return originalFetch.apply(this, arguments);
    };
  }

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    const args = Array.prototype.slice.call(arguments);
    if (typeof url === "string") args[1] = toProxy(url);
    return originalOpen.apply(this, args);
  };

  const originalSendBeacon = navigator.sendBeacon;
  if (typeof originalSendBeacon === "function") {
    navigator.sendBeacon = function (url, data) {
      return originalSendBeacon.call(this, toProxy(String(url)), data);
    };
  }

  window.open = function (url) {
    if (url) {
      try {
        location.href = toProxy(String(url));
      } catch (_) {
        // Ignore.
      }
    }
    return window;
  };

  const rewriteHistory = (original) =>
    function (state, title, url) {
      let next = target;
      if (typeof url === "string" || url instanceof URL) {
        const raw = String(url);
        if (isProxyUrl(raw)) {
          // Routers often re-push location.pathname. Recover the upstream URL
          // instead of nesting the proxy prefix inside the target.
          const recovered = fromProxy(raw);
          next = recovered === raw ? target : recovered;
        } else {
          try {
            next = new URL(raw, target).href;
          } catch (_) {
            next = target;
          }
        }
      }
      target = next;
      const proxied =
        typeof url === "string" || url instanceof URL ? toProxy(String(url)) : url;
      const result = original.call(history, state, title, proxied);
      window.setTimeout(reportPage, 300);
      // SPAs often paint their new route after the history call; a second
      // pass captures late-rendered text without polling.
      window.setTimeout(reportPage, 1500);
      return result;
    };
  history.pushState = rewriteHistory(history.pushState);
  history.replaceState = rewriteHistory(history.replaceState);

  window.addEventListener("popstate", () => {
    const next = targetFromLocation();
    if (next) target = next;
    window.setTimeout(reportPage, 300);
    window.setTimeout(reportPage, 1500);
  });

  const ATTRS = [
    "src",
    "href",
    "srcset",
    "poster",
    "action",
    "formaction",
    "data",
    "background",
    "style",
    "xlink:href",
  ];

  const rewriteCss = (value) =>
    String(value).replace(
      /url\\(\\s*(['"]?)([^'")]+)\\1\\s*\\)/gi,
      (match, quote, mediaUrl) => {
        const proxied = toProxy(mediaUrl);
        return proxied === null ? match : "url(" + quote + proxied + quote + ")";
      }
    );

  const rewriteSrcset = (value) => {
    if (String(value).toLowerCase().indexOf("data:") !== -1) return value;
    return String(value)
      .split(",")
      .map((candidate) => {
        const match = candidate.trim().match(/^(\\S+)(\\s+.+)?$/);
        if (!match) return candidate;
        const proxied = toProxy(match[1]);
        return proxied === null ? candidate : proxied + (match[2] || "");
      })
      .join(", ");
  };

  const rewriteNode = (node) => {
    if (!node || node.nodeType !== 1) return;
    try {
      if (node.tagName === "BASE") {
        node.remove();
        return;
      }
      for (const name of ATTRS) {
        if (!node.hasAttribute(name)) continue;
        const value = node.getAttribute(name);
        const next =
          name === "srcset"
            ? rewriteSrcset(value)
            : name === "style"
              ? rewriteCss(value)
              : toProxy(value);
        if (next !== null && next !== value) node.setAttribute(name, next);
      }
      if (
        (node.tagName === "A" || node.tagName === "FORM") &&
        ["_blank", "_parent", "_top"].indexOf(node.getAttribute("target")) !== -1
      ) {
        node.setAttribute("target", "_self");
      }
      if (node.tagName === "STYLE" && node.textContent) {
        const next = rewriteCss(node.textContent);
        if (next !== node.textContent) node.textContent = next;
      }
      for (const child of Array.from(node.children || [])) rewriteNode(child);
    } catch (_) {
      // A single hostile node must not stop the observer.
    }
  };

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes" && mutation.target) {
        rewriteNode(mutation.target);
      } else {
        for (const node of Array.from(mutation.addedNodes || [])) rewriteNode(node);
      }
    }
  });

  const start = () => {
    try {
      // Catch nodes the page added before DOMContentLoaded, then observe
      // future mutations instead of paying for parser churn.
      rewriteNode(document.documentElement);
      observer.observe(document.documentElement, {
        attributeFilter: ATTRS,
        attributes: true,
        childList: true,
        subtree: true,
      });
    } catch (_) {
      // MutationObserver is a nicety.
    }

    try {
      if (navigator.serviceWorker && navigator.serviceWorker.register) {
        navigator.serviceWorker.register = () =>
          Promise.reject(new Error("Service workers are disabled in Rabbit Hole"));
      }
    } catch (_) {
      // Ignore.
    }

    try {
      void window.localStorage;
    } catch (_) {
      const store = new Map();
      const shim = {
        clear: () => store.clear(),
        getItem: (key) => (store.has(String(key)) ? store.get(String(key)) : null),
        key: (index) => Array.from(store.keys())[index] || null,
        get length() {
          return store.size;
        },
        removeItem: (key) => store.delete(String(key)),
        setItem: (key, value) => store.set(String(key), String(value)),
      };
      try {
        Object.defineProperty(window, "localStorage", { configurable: true, get: () => shim });
        Object.defineProperty(window, "sessionStorage", { configurable: true, get: () => shim });
      } catch (_) {
        // Some engines make these properties non-configurable.
      }
    }

    if (location.hash) {
      try {
        const id = decodeURIComponent(location.hash.slice(1));
        const element =
          document.getElementById(id) || document.querySelector('[name="' + id + '"]');
        if (element) element.scrollIntoView();
      } catch (_) {
        // Ignore a malformed fragment.
      }
    }

    send("ready", { title: pageTitle() });
    reportPage();
    // The overlay's message listener may not be attached yet on a very fast
    // cached load; a second snapshot covers that race.
    window.setTimeout(reportPage, 1000);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }

  window.addEventListener("scroll", scheduleActivity, { passive: true });
  window.addEventListener("pagehide", reportPage);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") reportPage();
  });

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent) return;
    const data = event.data;
    if (!data || data.__curioCommand !== true) return;
    if (data.sessionId !== SESSION || data.token !== TOKEN) return;
    switch (data.command) {
      case "back":
        history.back();
        break;
      case "forward":
        history.forward();
        break;
      case "reload":
        location.reload();
        break;
      case "navigate":
        if (data.url) location.href = toProxy(String(data.url));
        break;
      case "capture-selection": {
        let quote = "";
        try {
          quote = clean(window.getSelection() ? window.getSelection().toString() : "").slice(0, 2000);
        } catch (_) {
          // No selection.
        }
        send("selection", { quote: quote, requestId: data.requestId });
        break;
      }
      default:
        break;
    }
  });
})();`;
}
