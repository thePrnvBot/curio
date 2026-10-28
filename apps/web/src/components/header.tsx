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

/** Rect of one nav option inside the mobile dropdown, used to position its
 * gliding pills (vertical counterpart of the desktop dock's pill rects). */
type MenuPill = {
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
};

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
 * plus quick access to theme and the account menu.
 *
 * Every element is a fixed 1.75rem box (hamburger, theme toggle, account
 * circle) with 1px gaps inside 0.25rem dock padding → exactly 6.25rem for
 * both the dock and the dropdown it opens. The dropdown therefore always
 * opens at exactly the dock's width, and its "start" alignment is shifted
 * back by the dock's 0.25rem padding so the two rectangles' top-left
 * corners coincide.
 *
 * The option list reproduces the desktop dock's hover treatment so both
 * docks animate identically: a soft translucent pill glides under the
 * hovered option while the solid primary pill marks the current route,
 * with the same durations and easings as the desktop version. */
function MobileDock() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const activeIndex = Math.max(
    0,
    NAV_LINKS.findIndex((navLink) => navLink.match(pathname))
  );

  const [navMenuOpen, setNavMenuOpen] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const itemRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [activePill, setActivePill] = useState<MenuPill | null>(null);
  const [hoveredPill, setHoveredPill] = useState<MenuPill | null>(null);

  // Measure the active option so the primary pill can glide to it, plus the
  // hovered option for the softer hover pill — vertically stacked, mirroring
  // the desktop dock's left-to-right glide. Re-measured on route changes and
  // whenever the pointer moves to another option; only measured while the
  // menu is open (the options are otherwise not mounted). Only this dock
  // attaches item refs — the hidden desktop dock above sm must not
  // overwrite them with zero-width measurements.
  useLayoutEffect(() => {
    if (!navMenuOpen) {
      return;
    }
    function measurePills(): void {
      const activeItem = itemRefs.current[String(activeIndex)];
      if (activeItem !== null && activeItem !== undefined) {
        setActivePill({
          height: activeItem.offsetHeight,
          left: activeItem.offsetLeft,
          top: activeItem.offsetTop,
          width: activeItem.offsetWidth,
        });
      }
      if (hoveredIndex === null) {
        setHoveredPill(null);
        return;
      }
      const hoveredItem = itemRefs.current[String(hoveredIndex)];
      if (hoveredItem === null || hoveredItem === undefined) {
        setHoveredPill(null);
        return;
      }
      setHoveredPill({
        height: hoveredItem.offsetHeight,
        left: hoveredItem.offsetLeft,
        top: hoveredItem.offsetTop,
        width: hoveredItem.offsetWidth,
      });
    }
    measurePills();
  }, [navMenuOpen, activeIndex, hoveredIndex]);

  const showHoverPill = hoveredIndex !== null && hoveredIndex !== activeIndex;

  return (
    <nav
      className="border-border/70 bg-card/80 pointer-events-auto flex w-[6.25rem] items-center gap-1 rounded-full border p-1 shadow-lg backdrop-blur-md sm:hidden"
    >
      <DropdownMenu
        onOpenChange={(open) => {
          setNavMenuOpen(open);
          if (open) {
            playInteractionCue("toggle", { emphasis: "subtle" });
          } else {
            setHoveredIndex(null);
          }
        }}
      >
        <DropdownMenuTrigger
          render={
            <Button
              aria-label="Open navigation menu"
              className="rounded-full"
              size="icon"
              variant="ghost"
            />
          }
        >
          <MenuIcon aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          alignOffset={-4}
          className="bg-card"
          onMouseLeave={() => {
            setHoveredIndex(null);
          }}
          style={{ width: "6.25rem", minWidth: "6.25rem" }}
        >
          {hoveredPill === null ? null : (
            <span
              aria-hidden="true"
              className={`bg-foreground/[0.06] absolute rounded-full transition-[left,top,width,height,opacity,scale] duration-200 ease-out ${
                showHoverPill ? "scale-100 opacity-100" : "scale-90 opacity-0"
              }`}
              style={{
                height: hoveredPill.height,
                left: hoveredPill.left,
                top: hoveredPill.top,
                width: hoveredPill.width,
              }}
            />
          )}
          {activePill === null ? null : (
            <span
              aria-hidden="true"
              className="bg-primary absolute rounded-full shadow-xs transition-[left,top,width,height,opacity] duration-300 ease-out"
              style={{
                height: activePill.height,
                left: activePill.left,
                top: activePill.top,
                width: activePill.width,
              }}
            />
          )}
          <DropdownMenuGroup>
            {NAV_LINKS.map((navLink, navLinkIndex) => {
              const isActive = navLinkIndex === activeIndex;
              return (
                <DropdownMenuItem
                  key={navLink.to}
                  render={
                    <Link
                      className={
                        isActive
                          // The pill layers live in this menu, so the item's
                          // own hover background is suppressed and the
                          // active option sits in primary fg on its pill.
                          ? "relative z-10 text-primary-foreground! data-[highlighted]:bg-transparent!"
                          : "relative z-10 text-muted-foreground data-[highlighted]:bg-transparent! data-[highlighted]:text-foreground"
                      }
                      data-cue="navigate"
                      onMouseEnter={() => {
                        setHoveredIndex(navLinkIndex);
                      }}
                      ref={(anchor) => {
                        itemRefs.current[String(navLinkIndex)] = anchor;
                      }}
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
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <UserMenu compact />
      </div>
    </nav>
  );
}
