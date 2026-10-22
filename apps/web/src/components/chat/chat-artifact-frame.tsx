import { Option } from "effect";
import { useEffect, useRef, useState } from "react";

import { decodeArtifactHeight } from "@/utils/chat-schemas";

/**
 * The bounded, content-sized window holding one HTML artifact. The artifact
 * itself reports its document height through the probe below, so the frame
 * never scrolls — it grows and shrinks with the artifact's content.
 */

const MIN_FRAME_HEIGHT_PX = 120;
const MAX_FRAME_HEIGHT_PX = 10_000;

/** Matched case-insensitively is unnecessary; artifact HTML closes with `</body>`. */
const BODY_CLOSING_TAG = /<\/body>/u;

/**
 * Injected into sandboxed artifacts so the frame can size itself from the
 * artifact's own document height: it posts `curio-artifact-height` messages
 * on load, on document readiness, and on every observed resize.
 */
const ARTIFACT_HEIGHT_PROBE_SCRIPT =
  "<script>(function(){var lastHeight=0,post=function(){var height=document.documentElement.scrollHeight;if(height!==lastHeight){lastHeight=height;parent.postMessage(JSON.stringify({type:'curio-artifact-height',height:height}),'*')}};window.addEventListener('load',post);if(document.readyState!=='loading'){post()}if('ResizeObserver' in window){new ResizeObserver(post).observe(document.documentElement)}})();</script>";

export function injectSandboxedHeightProbe(htmlContent: string): string {
  if (BODY_CLOSING_TAG.test(htmlContent)) {
    return htmlContent.replace(
      BODY_CLOSING_TAG,
      `${ARTIFACT_HEIGHT_PROBE_SCRIPT}</body>`
    );
  }
  return htmlContent + ARTIFACT_HEIGHT_PROBE_SCRIPT;
}

export function ArtifactHtmlFrame({
  htmlContent,
  title,
}: {
  htmlContent: string;
  title: Option.Option<string>;
}) {
  const htmlFrameRef = useRef<HTMLIFrameElement>(null);
  const [reportedFrameHeight, setReportedFrameHeight] =
    useState(MIN_FRAME_HEIGHT_PX);
  const [measuredContent, setMeasuredContent] = useState(htmlContent);

  useEffect(() => {
    function receiveArtifactMessage(windowMessage: MessageEvent): void {
      if (windowMessage.source !== htmlFrameRef.current?.contentWindow) {
        return;
      }
      if (typeof windowMessage.data !== "string") {
        return;
      }
      try {
        const probeMessage = JSON.parse(windowMessage.data);
        Option.match(decodeArtifactHeight(probeMessage), {
          // Non-JSON or malformed probe messages, and any height that never
          // parsed, contribute nothing to the frame size.
          onNone: () => null,
          onSome: (probeHeight) => {
            if (!Number.isFinite(probeHeight)) {
              return null;
            }
            setReportedFrameHeight(
              Math.min(
                Math.max(probeHeight, MIN_FRAME_HEIGHT_PX),
                MAX_FRAME_HEIGHT_PX
              )
            );
            return null;
          },
        });
      } catch {
        // Messages the artifact posted that are not JSON are ignored.
      }
    }

    window.addEventListener("message", receiveArtifactMessage);
    return () => {
      window.removeEventListener("message", receiveArtifactMessage);
    };
  }, []);

  // New content may report a different height; reset synchronously during
  // render (React's derived-state pattern) so the correct size paints first.
  let frameHeight = reportedFrameHeight;
  if (measuredContent !== htmlContent) {
    setMeasuredContent(htmlContent);
    setReportedFrameHeight(MIN_FRAME_HEIGHT_PX);
    frameHeight = MIN_FRAME_HEIGHT_PX;
  }

  return (
    <iframe
      className="bg-background w-full rounded-md border-x border-b"
      ref={htmlFrameRef}
      // Interactive artifacts: scripts and forms run, but the frame keeps a
      // null origin — meaning no access to Curio's cookies, storage, DOM, or
      // any httpOnly session cookie, no same-origin reads, and no top-level
      // navigation out of the artifact.
      sandbox="allow-scripts allow-forms"
      srcDoc={injectSandboxedHeightProbe(htmlContent)}
      style={{ height: `${frameHeight}px` }}
      title={Option.getOrElse(title, () => "Artifact preview")}
    />
  );
}
