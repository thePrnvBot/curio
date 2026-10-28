import { Button } from "@curio/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@curio/ui/components/dropdown-menu";
import { Link, useRouterState } from "@tanstack/react-router";
import { MenuIcon } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

import { playInteractionCue } from "@/utils/sound";
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
    label: "Settings",
    to: "/dashboard",
  },
] as const;

/**
 * Floating nav dock: a glassy pill fixed to the top of the viewport. On
 * sm+ screens the highlighted "button" is one absolutely-positioned pill
 * that glides to whichever link the current route selects. Below sm the
 * dock collapses to a hamburger menu so four labels + controls stop
 * fighting for a ~320px viewport.
 */
export default function Header() {
  return (
    <header className="pointer-events-none fixed inset-x-0 top-2.5 z-50 flex justify-center px-3">
      <DesktopDock />
      <MobileDock />
    </header>
  );
}

/** Full labelled dock, sm (640px) and up. */
function DesktopDock() {
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
  // changes and whenever the pointer moves to another link. Only this dock
  // attaches item refs — the hidden mobile dock below sm must not overwrite
  // them with zero-width measurements.
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
    hoveredIndex !== null &&
    hoveredIndex !== activeIndex &&
    hoveredPill !== null;

  return (
    <nav
      className="border-border/70 bg-card/80 pointer-events-auto relative hidden items-center rounded-full border p-1 shadow-lg backdrop-blur-md sm:flex"
      onPointerLeave={() => {
        setHoveredIndex(null);
      }}
      ref={containerRef}
    >
      {hoveredPill === null ? null : (
        <span
          aria-hidden="true"
          className={`bg-foreground/[0.06] absolute top-1 bottom-1 rounded-full transition-[left,width,opacity,scale] duration-200 ease-out ${
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
          className="bg-primary absolute top-1 bottom-1 rounded-full shadow-xs transition-[left,width,opacity] duration-300 ease-out"
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
            data-cue="navigate"
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
      <div aria-hidden="true" className="bg-border/70 mx-1 h-6 w-px" />
      <div className="flex items-center gap-1 px-1">
        <ThemeToggle />
        <UserMenu />
      </div>
    </nav>
  );
}

/** Compact dock below sm (640px): hamburger menu with the four links,
 * plus quick access to theme and the account menu. The dropdown opens at
 * the same width as the dock itself, so the two read as one element. */
function MobileDock() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const navRef = useRef<HTMLElement | null>(null);
  const [dockWidth, setDockWidth] = useState<number | null>(null);

  // Measure the dock so the dropdown content can be styled to exactly the
  // same width. Re-measured on viewport resizes, after late font/rendering
  // shifts, and — critically — each time the menu opens: the dock's width
  // changes when the user-menu skeleton swaps to the real name pill, so a
  // mount-time measurement alone goes stale.
  useLayoutEffect(() => {
    measureDock();
    window.addEventListener("resize", measureDock);
    const fitTimer = window.setTimeout(measureDock, 300);
    return () => {
      window.removeEventListener("resize", measureDock);
      window.clearTimeout(fitTimer);
    };
  }, []);

  function measureDock(): void {
    const nav = navRef.current;
    if (nav === null) {
      return;
    }
    setDockWidth(nav.offsetWidth);
  }

  return (
    <nav
      className="border-border/70 bg-card/80 pointer-events-auto flex items-center gap-1 rounded-full border p-1 pl-1.5 shadow-lg backdrop-blur-md sm:hidden"
      ref={navRef}
    >
      <DropdownMenu
        onOpenChange={(open) => {
          if (open) {
            // Width is measured fresh on open so the dropdown always
            // matches the dock as it is right now.
            measureDock();
            playInteractionCue("toggle", { emphasis: "subtle" });
          }
        }}
      >
        <DropdownMenuTrigger
          render={
            <Button aria-label="Open navigation menu" size="icon" variant="ghost" />
          }
        >
          <MenuIcon aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="bg-card"
          style={{ width: dockWidth ?? undefined }}
        >
          <DropdownMenuGroup>
            {NAV_LINKS.map((navLink) => {
              const isActive = navLink.match(pathname);
              return (
                <DropdownMenuItem
                  key={navLink.to}
                  render={
                    <Link
                      className={isActive ? "bg-muted/60" : undefined}
                      data-cue="navigate"
                      to={navLink.to}
                    />
                  }
                >
                  {navLink.label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <div aria-hidden="true" className="bg-border/70 mx-0.5 h-6 w-px" />
      <div className="flex items-center gap-0.5">
        <ThemeToggle />
        <UserMenu />
      </div>
    </nav>
  );
}
