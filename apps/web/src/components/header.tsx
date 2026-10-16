"use client";

import { Link, useRouterState } from "@tanstack/react-router";
import { useLayoutEffect, useRef, useState } from "react";

import { ThemeToggle } from "./theme-toggle";
import UserMenu from "./user-menu";

const NAV_LINKS = [
  { match: (pathname: string) => pathname === "/", label: "Home", to: "/" },
  {
    match: (pathname: string) =>
      pathname === "/chat" || pathname.startsWith("/chat/"),
    label: "Director",
    to: "/chat",
  },
  {
    match: (pathname: string) =>
      pathname === "/courses" || pathname.startsWith("/courses/"),
    label: "Courses",
    to: "/courses",
  },
  {
    match: (pathname: string) =>
      pathname === "/dashboard" || pathname.startsWith("/dashboard/"),
    label: "Dashboard",
    to: "/dashboard",
  },
] as const;

/**
 * Floating nav dock: a glassy pill fixed to the top of the viewport. The
 * highlighted "button" is one absolutely-positioned pill that glides to
 * whichever link the current route selects.
 */
export default function Header() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const activeIndex = Math.max(
    0,
    NAV_LINKS.findIndex((navLink) => navLink.match(pathname))
  );

  const containerRef = useRef<HTMLElement | null>(null);
  const itemRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [activePill, setActivePill] = useState<{
    readonly left: number;
    readonly width: number;
  } | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [hoveredPill, setHoveredPill] = useState<{
    readonly left: number;
    readonly width: number;
  } | null>(null);

  // Measure the active link so the pill can glide under it, plus the hovered
  // link for the softer hover pill; re-measure on viewport resizes, route
  // changes and whenever the pointer moves to another link.
  useLayoutEffect(() => {
    function measureActivePill(): void {
      const container = containerRef.current;
      if (container === null) {
        return;
      }
      const activeItem = itemRefs.current[String(activeIndex)];
      if (activeItem === null || activeItem === undefined) {
        return;
      }
      setActivePill({
        left: activeItem.offsetLeft,
        width: activeItem.offsetWidth,
      });
      if (hoveredIndex !== null) {
        const hoveredItem = itemRefs.current[String(hoveredIndex)];
        if (hoveredItem !== null && hoveredItem !== undefined) {
          setHoveredPill({
            left: hoveredItem.offsetLeft,
            width: hoveredItem.offsetWidth,
          });
        }
      }
    }
    measureActivePill();
    window.addEventListener("resize", measureActivePill);
    const fitTimer = window.setTimeout(measureActivePill, 300);
    return () => {
      window.removeEventListener("resize", measureActivePill);
      window.clearTimeout(fitTimer);
    };
  }, [activeIndex, hoveredIndex]);

  const showHoverPill =
    hoveredIndex !== null && hoveredIndex !== activeIndex && hoveredPill !== null;

  return (
    <header className="pointer-events-none fixed inset-x-0 top-2.5 z-50 flex justify-center px-3">
      <nav
        className="border-border/70 bg-card/80 pointer-events-auto relative flex items-center rounded-full border p-1 shadow-lg backdrop-blur-md"
        onPointerLeave={() => {
          setHoveredIndex(null);
        }}
        ref={containerRef}
      >
        {hoveredPill === null ? null : (
          <span
            aria-hidden="true"
            className={`bg-foreground/[0.06] absolute bottom-1 top-1 rounded-full transition-[left,width,opacity,scale] duration-200 ease-out ${
              showHoverPill ? "scale-100 opacity-100" : "scale-90 opacity-0"
            }`}
            style={{
              left: hoveredPill.left,
              width: hoveredPill.width,
            }}
          />
        )}
        {activePill === null ? null : (
          <span
            aria-hidden="true"
            className="bg-primary absolute bottom-1 top-1 rounded-full shadow-xs transition-[left,width,opacity] duration-300 ease-out"
            style={{
              left: activePill.left,
              width: activePill.width,
            }}
          />
        )}
        {NAV_LINKS.map((navLink, navLinkIndex) => {
          const isActive = navLinkIndex === activeIndex;
          return (
            <Link
              className={
                isActive
                  ? "text-primary-foreground relative z-10 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors"
                  : "text-muted-foreground hover:text-foreground relative z-10 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors"
              }
              data-cuelume-navigate="navigate"
              key={navLink.to}
              onMouseEnter={() => {
                setHoveredIndex(navLinkIndex);
              }}
              ref={(anchor) => {
                itemRefs.current[String(navLinkIndex)] = anchor;
              }}
              to={navLink.to}
            >
              {navLink.label}
            </Link>
          );
        })}
        <div
          aria-hidden="true"
          className="bg-border/70 mx-1 h-6 w-px"
        />
        <div className="flex items-center gap-1 px-1">
          <ThemeToggle />
          <UserMenu />
        </div>
      </nav>
    </header>
  );
}
