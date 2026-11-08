import { Link, createFileRoute } from "@tanstack/react-router";
import {
  Share2,
  Sparkles,
  TrendingUp,
  Trophy,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { MeshGradient, Shader } from "shaders/react";

import AnimatedContent from "@/components/animated-content";
import CountUp from "@/components/count-up";
import {
  DotField,
  DoodleAtom,
  DoodleBook,
  DoodleBulb,
  DoodleGlobe,
  PlusMark,
  Sparkle,
  Squiggle,
} from "@/components/doodles";
import SplitText from "@/components/split-text";
import StarBorder from "@/components/star-border";

const Aurora = lazy(() => import("@/components/aurora"));

const FEATURES: {
  icon: LucideIcon;
  title: string;
  description: string;
}[] = [
  {
    icon: Sparkles,
    title: "Courses on anything",
    description:
      "Name any topic and Curio builds a course for it - guided teaching and exercises you can take on the go.",
  },
  {
    icon: TrendingUp,
    title: "Progress that remembers",
    description:
      "Every step is tracked, and recap exercises are waiting for you the moment you come back.",
  },
  {
    icon: Trophy,
    title: "Points & badges",
    description:
      "Earn points for every milestone and add completion badges to your profile as you level up.",
  },
  {
    icon: Share2,
    title: "Share the win",
    description:
      "Post your course badges to social media, and share your custom courses for others to experience - and edit to their own learning style.",
  },
];

const STATS: { value: number; suffix: string; label: string }[] = [
  { value: 1, suffix: "", label: "prompt builds a whole course" },
  { value: 24, suffix: "/7", label: "recaps waiting when you return" },
  { value: 100, suffix: "%", label: "taught at your own pace" },
];

const SHADER_STOPS = {
  dark: [
    { color: "#020617", position: 0 },
    { color: "#042f2e", position: 0.25 },
    { color: "#115e59", position: 0.5 },
    { color: "#0d9488", position: 0.72 },
    { color: "#34d399", position: 1 },
  ],
  light: [
    { color: "#ecfdf5", position: 0 },
    { color: "#ccfbf1", position: 0.3 },
    { color: "#99f6e4", position: 0.55 },
    { color: "#5eead4", position: 0.78 },
    { color: "#34d399", position: 1 },
  ],
};

const CURRENT_YEAR = new Date().getFullYear();

/**
 * Only runs expensive work (the WebGPU canvas) while its section is near the
 * screen. Starts `true` so the shader is part of the SSR output.
 *
 * `rootMargin` extends the zone on both sides, so the canvas mounts ~300px
 * before the hero enters the viewport and unmounts ~300px after it has fully
 * left - the element never flips states while it is actually visible.
 */
function useSectionVisible() {
  const ref = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { rootMargin: "300px 0px 300px 0px", threshold: 0 }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, isVisible };
}

/**
 * Mounts when `mounted` flips true and fades opacity to 1, so shader
 * re-initialization is cross-faded instead of popping in.
 */
function useSmoothMount(mounted: boolean) {
  const [isShown, setIsShown] = useState(false);

  useEffect(() => {
    if (!mounted) {
      return;
    }
    const frame = requestAnimationFrame(() => setIsShown(true));
    return () => cancelAnimationFrame(frame);
  }, [mounted]);

  // When unmounted we want the shader hidden immediately; deriving this
  // during render avoids a synchronous setState inside the effect.
  if (!mounted) {
    return false;
  }
  return isShown;
}

function HomeComponent() {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === "light";
  const { ref: heroRef, isVisible: heroIsVisible } = useSectionVisible();
  const heroFadedIn = useSmoothMount(heroIsVisible);

  return (
    <div className="bg-background text-foreground">
      {/* Hero */}
      <section
        ref={heroRef}
        className="relative flex min-h-[calc(100svh-4rem)] flex-col items-center justify-center overflow-hidden px-6"
      >
        {heroIsVisible && (
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              opacity: heroFadedIn ? 1 : 0,
              transition: "opacity 700ms ease",
            }}
            aria-hidden="true"
          >
            <Shader className="absolute inset-0" disableTelemetry>
              <MeshGradient
                stops={isLight ? SHADER_STOPS.light : SHADER_STOPS.dark}
                colorSpace="oklab"
                count={4}
                smoothness={3.4}
                variation={0.2}
                swirl={0.1}
                drift={0.3}
                speed={0.25}
                seed={7}
              />
            </Shader>
          </div>
        )}
        {/* Scrim: flat tint + fades. No backdrop-blur - it repaints the canvas
            underneath on every scroll frame and tanks scroll performance. */}
        <div
          className="from-background to-background pointer-events-none absolute inset-0 bg-gradient-to-b via-transparent"
          aria-hidden="true"
        />
        <div
          className="bg-background/45 pointer-events-none absolute inset-0"
          aria-hidden="true"
        />

        {/* Chalk doodles floating over the scrim, under the headline */}
        <div className="pointer-events-none absolute inset-0 z-[5] text-teal-600/30 dark:text-teal-200/25">
          <DoodleAtom className="absolute top-[19%] left-[6%] hidden size-14 -rotate-12 motion-safe:animate-[spin_26s_linear_infinite] md:block" />
          <DoodleBulb className="absolute bottom-[24%] left-[10%] hidden size-9 rotate-6 motion-safe:animate-pulse lg:block" />
          <DoodleGlobe className="absolute right-[8%] bottom-[30%] hidden size-14 -rotate-3 md:block" />
          <Sparkle className="absolute top-[24%] right-[14%] size-5 motion-safe:animate-pulse" />
          <Sparkle className="absolute top-[13%] right-[27%] size-3" />
          <Sparkle className="absolute bottom-[21%] left-[21%] size-4" />
          <PlusMark className="absolute top-[34%] right-[33%] hidden size-4 rotate-12 sm:block" />
          <PlusMark className="absolute bottom-[16%] left-[31%] hidden size-4 -rotate-6 lg:block" />
        </div>

        <div className="relative z-10 flex max-w-3xl flex-col items-center text-center">
          <p className="text-muted-foreground mb-6 flex items-center gap-3 text-sm tracking-widest uppercase">
            <Sparkle className="text-primary/60 size-3.5" />
            Your learning companion
            <Sparkle className="text-primary/60 size-3.5" />
          </p>
          <SplitText
            tag="h1"
            text="Learn anything, your way."
            className="text-5xl font-semibold tracking-tight text-balance sm:text-6xl md:text-7xl"
            delay={60}
            duration={0.9}
            threshold={0.2}
          />
          <AnimatedContent delay={0.4} distance={30} className="mt-6 max-w-xl">
            <p className="text-muted-foreground text-lg text-balance">
              Curio creates courses on anything you want to learn - with guided
              teaching, exercises on the go, and progress that keeps track of
              itself.
            </p>
          </AnimatedContent>
          <AnimatedContent
            delay={0.6}
            distance={24}
            className="mt-10 flex flex-wrap items-center justify-center gap-3"
          >
            <StarBorder
              as={Link}
              to="/chat"
              theme={isLight ? "light" : "dark"}
              color={isLight ? "#0f766e" : "#34d399"}
              duration={6}
              className="text-sm"
            >
              Start learning
            </StarBorder>
            <Link
              to="/dashboard"
              className="hover:bg-accent hover:text-accent-foreground rounded-lg px-6 py-3 text-sm font-medium transition-colors"
            >
              Track your progress
            </Link>
          </AnimatedContent>
        </div>

        <div className="text-muted-foreground absolute bottom-8 flex flex-col items-center gap-1 text-xs">
          <span>Scroll</span>
          <div className="motion-safe:animate-bounce" aria-hidden="true">
            ↓
          </div>
        </div>
      </section>

      {/* Reveal statement */}
      <section className="relative mx-auto max-w-4xl px-6 py-28">
        <DotField className="absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_25%,transparent_72%)] text-teal-700/[0.08] dark:text-teal-200/[0.07]" />
        <AnimatedContent distance={40} className="relative">
          <p className="text-muted-foreground mb-2 text-xs tracking-widest uppercase">
            Why Curio
          </p>
          <Squiggle className="text-primary/40 mt-3 h-2.5 w-24" />
        </AnimatedContent>
        <AnimatedContent distance={32} className="relative max-w-3xl">
          <p className="text-2xl leading-relaxed font-medium text-balance sm:text-3xl">
            You choose what to learn and how; Curio does the rest - guided
            teaching, exercises that meet you where you are, and recaps that
            greet you when you come back.
          </p>
        </AnimatedContent>{" "}
      </section>

      {/* Features */}
      <section className="relative mx-auto max-w-5xl px-6 pb-28">
        <DotField className="absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)] text-teal-700/[0.06] dark:text-teal-200/[0.05]" />
        <div className="relative grid gap-x-10 gap-y-14 sm:grid-cols-2">
          {FEATURES.map(({ icon: FeatureIcon, title, description }, index) => (
            <AnimatedContent
              key={title}
              delay={index * 0.12}
              distance={40}
              threshold={0.2}
            >
              <div className="flex gap-4">
                <div className="text-primary mt-1 shrink-0">
                  <FeatureIcon className="size-5" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-lg font-medium tracking-tight">
                    {title}
                  </h3>
                  <Squiggle className="text-primary/50 mt-1.5 h-2 w-20" />
                  <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                    {description}
                  </p>
                </div>
              </div>
            </AnimatedContent>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section className="border-y">
        <div className="mx-auto grid max-w-5xl grid-cols-1 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {STATS.map(({ value, suffix, label }) => (
            <AnimatedContent
              key={label}
              distance={24}
              className="px-6 py-10 text-center"
            >
              <div className="text-4xl font-semibold tracking-tight sm:text-5xl">
                <CountUp to={value} duration={1.6} />
                <span className="text-primary">{suffix}</span>
              </div>
              <p className="text-muted-foreground mt-2 text-sm">{label}</p>
            </AnimatedContent>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative overflow-hidden px-6 py-32">
        <Suspense fallback={null}>
          <Aurora
            className="pointer-events-none absolute inset-x-0 bottom-0 h-64"
            colorStops={["#0f766e", "#34d399", "#0f766e"]}
            amplitude={0.8}
            height={0.6}
            glow={0.4}
            opacity={0.4}
            lightMode={isLight}
            mouseInteraction={false}
          />
        </Suspense>
        <div className="pointer-events-none absolute inset-0 text-teal-600/30 dark:text-teal-200/25">
          <DoodleBook className="absolute top-[26%] left-[9%] hidden size-12 -rotate-8 lg:block" />
          <DoodleAtom className="absolute right-[7%] bottom-[16%] hidden size-12 motion-safe:animate-[spin_30s_linear_infinite] lg:block" />
          <Sparkle className="absolute top-[22%] right-[13%] size-5 motion-safe:animate-pulse" />
          <Sparkle className="absolute top-[38%] left-[18%] size-3.5" />
          <PlusMark className="absolute right-[30%] bottom-[26%] hidden size-4 -rotate-6 sm:block" />
          <PlusMark className="absolute bottom-[20%] left-[26%] hidden size-4 rotate-12 lg:block" />
        </div>
        <AnimatedContent
          distance={40}
          className="relative z-10 mx-auto max-w-2xl text-center"
        >
          <div className="relative mb-2 flex items-center justify-center gap-2 text-teal-600/40 dark:text-teal-200/40">
            <Sparkle className="size-3" />
            <Sparkle className="size-4" />
            <Sparkle className="size-3" />
          </div>
          <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Your next skill is one prompt away.
          </h2>
          <Squiggle className="text-primary/50 mx-auto mt-5 h-2.5 w-28" />
          <p className="text-muted-foreground mx-auto mt-4 max-w-md text-balance">
            Create a course, work through guided lessons, and earn badges worth
            sharing. Curio keeps the streak alive while life does its thing.
          </p>
          <div className="mt-10 flex justify-center">
            <Link
              className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-5 py-3 text-sm font-medium transition-colors"
              to="/chat"
            >
              Create your first course
            </Link>
          </div>
          <p className="text-muted-foreground mt-16 text-xs">
            © {CURRENT_YEAR} Curio · Built with TanStack Start,
            Vercel AI SDK and React Bits
          </p>
        </AnimatedContent>
      </section>
    </div>
  );
}

export const Route = createFileRoute("/")({
  component: HomeComponent,
});
