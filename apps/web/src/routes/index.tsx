import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  Share2,
  Sparkles,
  TrendingUp,
  Trophy,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import AnimatedContent from "@/components/animated-content";
import { DotField, Squiggle } from "@/components/doodles";
import { LandingBackground } from "@/components/landing-background";
import SplitText from "@/components/split-text";

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

const STEPS: { title: string; description: string }[] = [
  {
    title: "Ask for anything",
    description:
      "Name a topic, a question, or a skill. The Director turns it into a structured course.",
  },
  {
    title: "Learn by doing",
    description:
      "Move through guided lessons, visuals, and exercises sized to the time you actually have.",
  },
  {
    title: "Come back to a recap",
    description:
      "Your progress is kept, and the next recap is ready when you are.",
  },
];

const EXAMPLE_COURSES = [
  "How ray tracing works",
  "Photosynthesis, from the ground up",
  "SQL joins, visually",
  "Stoicism for everyday decisions",
  "Music theory you can hear",
  "Behavioral economics in practice",
] as const;

const CURRENT_YEAR = new Date().getFullYear();

function HomeComponent() {
  return (
    <div className="bg-background text-foreground">
      {/* Hero */}
      <section className="relative -mt-14 flex min-h-svh flex-col items-center justify-center overflow-hidden px-6">
        <LandingBackground />

        <div className="relative z-10 flex w-full max-w-3xl flex-col items-center text-center">
          <SplitText
            tag="h1"
            text="Learn anything, your way."
            className="text-[clamp(2.75rem,7vw,5.25rem)] leading-[0.98] font-semibold tracking-[-0.045em] text-balance"
            delay={60}
            duration={0.9}
            threshold={0.2}
          />
          <AnimatedContent delay={0.4} distance={30} className="mt-6 max-w-xl">
            <p className="text-muted-foreground text-[15px] leading-7 text-balance">
              Curio creates courses on anything you want to learn - with guided
              teaching, exercises on the go, and progress that keeps track of
              itself.
            </p>
          </AnimatedContent>

          <AnimatedContent
            delay={0.6}
            distance={24}
            className="mt-10 w-full max-w-lg"
          >
            <Link
              className="group border-border/80 bg-card/95 hover:border-foreground/20 flex items-center gap-3 rounded-2xl border p-1.5 pl-4 text-left shadow-lg shadow-black/[0.05] transition-[border-color,background-color] duration-200"
              data-cue="navigate"
              to="/chat"
            >
              <Sparkles className="text-brand size-4 shrink-0" />
              <span className="text-muted-foreground group-hover:text-foreground min-w-0 flex-1 truncate text-[13.5px] transition-colors">
                What do you want to learn?
              </span>
              <span className="bg-primary text-primary-foreground flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[12px] font-medium">
                Start
                <ArrowRightIcon
                  aria-hidden="true"
                  className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
                />
              </span>
            </Link>
          </AnimatedContent>

          <AnimatedContent delay={0.8} distance={16} className="mt-5">
            <Link
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-[12px] font-medium transition-colors"
              to="/courses"
            >
              Track your progress
              <ArrowUpRightIcon aria-hidden="true" className="size-3" />
            </Link>
          </AnimatedContent>
        </div>
      </section>

      {/* How it works */}
      <section className="border-y" id="how-it-works">
        <div className="mx-auto max-w-5xl px-6 py-20 sm:py-24">
          <div className="grid gap-10 md:grid-cols-[240px_minmax(0,1fr)] md:gap-16">
            <AnimatedContent distance={28} threshold={0.15}>
              <h2 className="text-[26px] leading-[1.15] font-semibold tracking-[-0.03em] text-balance sm:text-[28px]">
                From a prompt to a plan.
              </h2>
              <p className="text-muted-foreground mt-4 max-w-[220px] text-[13px] leading-6">
                No syllabus to design. No blank page. Just tell Curio what you
                want to understand.
              </p>
            </AnimatedContent>

            <div className="grid gap-8 sm:grid-cols-3">
              {STEPS.map((step, index) => (
                <AnimatedContent
                  className="border-border/80 border-t pt-5"
                  delay={index * 0.1}
                  distance={24}
                  key={step.title}
                  threshold={0.15}
                >
                  <h3 className="text-[15px] font-medium tracking-[-0.01em]">
                    {step.title}
                  </h3>
                  <p className="text-muted-foreground mt-2 text-[13px] leading-6">
                    {step.description}
                  </p>
                </AnimatedContent>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Editorial statement */}
      <section className="mx-auto max-w-4xl px-6 py-24 sm:py-28">
        <AnimatedContent distance={32} threshold={0.15}>
          <p className="text-[26px] leading-[1.45] font-medium tracking-[-0.025em] text-balance sm:text-[32px]">
            You choose what to learn and how; Curio does the rest - guided
            teaching, exercises that meet you where you are, and recaps that
            greet you when you come back.
          </p>
          <p className="text-muted-foreground mt-6 max-w-xl text-[13.5px] leading-6">
            The Director keeps the thread: what you have covered, what is still
            shaky, and what to try next. You get a course that feels built for
            the moment, not a generic track with your name on it.
          </p>
        </AnimatedContent>
      </section>

      {/* Features */}
      <section className="relative mx-auto max-w-5xl px-6 pb-24">
        <DotField className="absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)] text-teal-700/[0.06] dark:text-teal-200/[0.05]" />
        <h2 className="relative mb-10 text-[26px] leading-[1.15] font-semibold tracking-[-0.03em] text-balance sm:text-[28px]">
          Built around how you learn.
        </h2>

        <div className="relative grid gap-x-12 sm:grid-cols-2">
          {FEATURES.map(({ icon: FeatureIcon, title, description }, index) => (
            <AnimatedContent
              className="border-border/80 border-t py-6"
              delay={index * 0.08}
              distance={24}
              key={title}
              threshold={0.2}
            >
              <div className="group hover:bg-muted/25 -mx-3 rounded-lg px-3 py-2 transition-colors duration-200">
                <div className="flex items-center gap-3">
                  <span className="bg-muted text-foreground flex size-8 shrink-0 items-center justify-center rounded-lg">
                    <FeatureIcon aria-hidden="true" className="size-4" />
                  </span>
                  <h3 className="text-[14.5px] font-medium tracking-[-0.01em]">
                    {title}
                  </h3>
                </div>
                <p className="text-muted-foreground mt-3 text-[13px] leading-6">
                  {description}
                </p>
              </div>
            </AnimatedContent>
          ))}
        </div>
      </section>

      {/* Course shelf */}
      <section className="border-y">
        <div className="mx-auto max-w-5xl px-6 py-20 sm:py-24">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="text-[26px] leading-[1.15] font-semibold tracking-[-0.03em] text-balance sm:text-[28px]">
              Start with a question. Leave with a course.
            </h2>
            <Link
              className="text-muted-foreground hover:text-foreground inline-flex shrink-0 items-center gap-1 text-[12px] font-medium transition-colors"
              to="/chat"
            >
              Ask for your own
              <ArrowUpRightIcon aria-hidden="true" className="size-3" />
            </Link>
          </div>

          <div className="mt-10 grid gap-x-12 sm:grid-cols-2">
            {EXAMPLE_COURSES.map((course) => (
              <div
                className="border-border/80 hover:bg-muted/20 border-t py-4 text-[14px] font-medium tracking-[-0.01em] transition-colors duration-150"
                key={course}
              >
                {course}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative overflow-hidden px-6 py-28 sm:py-36">
        <LandingBackground variant="cta" />
        <AnimatedContent
          distance={40}
          className="relative z-10 mx-auto max-w-2xl text-center"
        >
          <h2 className="text-[32px] leading-[1.12] font-semibold tracking-[-0.035em] text-balance sm:text-[40px]">
            Your next skill is one prompt away.
          </h2>
          <Squiggle className="text-brand/40 mx-auto mt-5 h-2.5 w-24" />
          <p className="text-muted-foreground mx-auto mt-4 max-w-md text-[13.5px] leading-6 text-balance">
            Create a course, work through guided lessons, and earn badges worth
            sharing. Curio keeps the streak alive while life does its thing.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center gap-1.5 rounded-lg px-5 text-[13px] font-medium transition-colors duration-150"
              to="/chat"
            >
              Create your first course
              <ArrowRightIcon aria-hidden="true" className="size-3.5" />
            </Link>
            <Link
              className="border-border hover:bg-muted/60 inline-flex h-10 items-center rounded-lg border px-5 text-[13px] font-medium transition-colors duration-150"
              to="/courses"
            >
              See your courses
            </Link>
          </div>
          <p className="text-muted-foreground mt-16 text-[11px]">
            © {CURRENT_YEAR} Curio · Built with TanStack Start, Vercel AI SDK
            and React Bits
          </p>
        </AnimatedContent>
      </section>
    </div>
  );
}

export const Route = createFileRoute("/")({
  component: HomeComponent,
});
