"use client";

import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText as GSAPSplitText } from "gsap/SplitText";
import React, { useRef, useEffect, useState } from "react";

gsap.registerPlugin(ScrollTrigger, GSAPSplitText, useGSAP);

const DEFAULT_FROM: gsap.TweenVars = { opacity: 0, y: 40 };
const DEFAULT_TO: gsap.TweenVars = { opacity: 1, y: 0 };

export interface SplitTextProps {
  text: string;
  className?: string;
  delay?: number;
  duration?: number;
  ease?: string | ((t: number) => number);
  splitType?: "chars" | "words" | "lines" | "words, chars";
  from?: gsap.TweenVars;
  to?: gsap.TweenVars;
  threshold?: number;
  rootMargin?: string;
  tag?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span";
  textAlign?: React.CSSProperties["textAlign"];
  onLetterAnimationComplete?: () => void;
}

const SplitText: React.FC<SplitTextProps> = ({
  text,
  className = "",
  delay = 50,
  duration = 1.25,
  ease = "power3.out",
  splitType = "chars",
  from = DEFAULT_FROM,
  to = DEFAULT_TO,
  threshold = 0.1,
  rootMargin = "-100px",
  tag = "p",
  textAlign = "center",
  onLetterAnimationComplete,
}) => {
  const ref = useRef<HTMLParagraphElement>(null);
  const animationCompletedRef = useRef(false);
  const onCompleteRef = useRef(onLetterAnimationComplete);
  const [fontsLoaded, setFontsLoaded] = useState<boolean>(() => {
    if (typeof document === "undefined") {
      return false;
    }
    return document.fonts.status === "loaded";
  });

  // Keep callback ref updated
  useEffect(() => {
    onCompleteRef.current = onLetterAnimationComplete;
  }, [onLetterAnimationComplete]);

  useEffect(() => {
    const loadFonts = async () => {
      if (document.fonts.status !== "loaded") {
        await document.fonts.ready;
      }
      setFontsLoaded(true);
    };

    // Synchronizing with the document.fonts loading state is exactly what this
    // effect is for; the setState here mirrors an external system value.
    // eslint-disable-next-line react/set-state-in-effect
    void loadFonts();
  }, []);

  useGSAP(
    () => {
      if (!ref.current || !text || !fontsLoaded) {
        return;
      }
      // Prevent re-animation if already completed
      if (animationCompletedRef.current) {
        return;
      }
      const el = ref.current as HTMLElement & {
        _rbsplitInstance?: GSAPSplitText;
      };

      if (el._rbsplitInstance) {
        try {
          el._rbsplitInstance.revert();
        } catch {
          // GSAPSplitText.revert() can throw when the DOM node was removed
          // externally; the cleanup below restores a clean state regardless.
        }
        el._rbsplitInstance = undefined;
      }

      const startPct = (1 - threshold) * 100;
      const marginMatch =
        /^(?<value>-?\d+(?:\.\d+)?)(?<unit>px|em|rem|%)?$/u.exec(rootMargin);
      const marginValue = marginMatch?.groups?.value
        ? Number(marginMatch.groups.value)
        : 0;
      const marginUnit = marginMatch?.groups?.unit || "px";
      let sign = "";
      if (marginValue < 0) {
        sign = `-=${Math.abs(marginValue)}${marginUnit}`;
      } else if (marginValue > 0) {
        sign = `+=${marginValue}${marginUnit}`;
      }
      const start = `top ${startPct}%${sign}`;
      let targets: Element[] = [];
      const assignTargets = (self: GSAPSplitText) => {
        if (
          splitType.includes("chars") &&
          (self as GSAPSplitText).chars?.length
        ) {
          targets = (self as GSAPSplitText).chars;
        }
        if (
          !targets.length &&
          splitType.includes("words") &&
          self.words.length
        ) {
          targets = self.words;
        }
        if (
          !targets.length &&
          splitType.includes("lines") &&
          self.lines.length
        ) {
          targets = self.lines;
        }
        if (!targets.length) {
          targets = self.chars || self.words || self.lines;
        }
      };
      const splitInstance = new GSAPSplitText(el, {
        type: splitType,
        smartWrap: true,
        autoSplit: splitType === "lines",
        linesClass: "split-line",
        wordsClass: "split-word",
        charsClass: "split-char",
        reduceWhiteSpace: false,
        onSplit: (self: GSAPSplitText) => {
          assignTargets(self);
          return gsap.fromTo(
            targets,
            { ...from },
            {
              ...to,
              duration,
              ease,
              stagger: delay / 1000,
              scrollTrigger: {
                trigger: el,
                start,
                once: true,
                fastScrollEnd: true,
                anticipatePin: 0.4,
              },
              onComplete: () => {
                animationCompletedRef.current = true;
                onCompleteRef.current?.();
              },
              willChange: "transform, opacity",
              force3D: true,
            }
          );
        },
      });
      el._rbsplitInstance = splitInstance;
      return () => {
        for (const st of ScrollTrigger.getAll()) {
          if (st.trigger === el) {
            st.kill();
          }
        }
        try {
          splitInstance.revert();
        } catch {
          // Same as above: ignore revert errors during teardown.
        }
        el._rbsplitInstance = undefined;
      };
    },
    {
      dependencies: [
        text,
        delay,
        duration,
        ease,
        splitType,
        JSON.stringify(from),
        JSON.stringify(to),
        threshold,
        rootMargin,
        fontsLoaded,
      ],
      scope: ref,
    }
  );

  const Tag = tag || "p";

  return (
    <Tag
      ref={ref}
      style={{
        textAlign,
        wordWrap: "break-word",
        willChange: "transform, opacity",
      }}
      className={`split-parent overflow-hidden inline-block whitespace-normal ${className}`}
    >
      {text}
    </Tag>
  );
};

export default SplitText;
