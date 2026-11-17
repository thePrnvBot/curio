// oxlint-disable jsx-a11y/prefer-tag-over-role -- a command palette is a custom listbox/option surface by definition
import { Dialog } from "@base-ui/react/dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BookOpenIcon,
  HouseIcon,
  MessageSquareIcon,
  MoonStarIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  SunIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactElement, ReactNode } from "react";

import { authClient } from "@/lib/auth-client";
import { requestNewChat } from "@/utils/chat-runtime";
import {
  filterPaletteEntries,
  paletteGroupOrder,
} from "@/utils/command-palette";
import type { PaletteGroup } from "@/utils/command-palette";
import { playInteractionCue } from "@/utils/sound";
import { useTRPC } from "@/utils/trpc";

interface PaletteItem {
  readonly group: PaletteGroup;
  readonly hint?: string;
  readonly id: string;
  readonly icon: ReactNode;
  readonly keywords?: string;
  readonly label: string;
  readonly prefetch?: () => void;
  readonly run: () => void;
}

const PAGE_LINKS = [
  { icon: HouseIcon, label: "Home", to: "/" },
  { icon: MessageSquareIcon, label: "Director", to: "/chat" },
  { icon: BookOpenIcon, label: "Courses", to: "/courses" },
  { icon: SettingsIcon, label: "Settings", to: "/settings" },
] as const;

function isCurrentPage(to: string, pathname: string): boolean {
  if (to === "/") {
    return pathname === "/";
  }
  return pathname === to || pathname.startsWith(`${to}/`);
}

function Kbd({ children }: { children: ReactNode }): ReactElement {
  return (
    <kbd className="border-border bg-muted text-muted-foreground rounded border px-1 py-0.5 font-mono text-[10px] leading-none">
      {children}
    </kbd>
  );
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): ReactElement {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { resolvedTheme, setTheme } = useTheme();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const { data: session } = authClient.useSession();
  const isSignedIn = session !== null && session !== undefined;

  // Prefetched on mount for signed-in users: opening ⌘K never waits on the
  // network, and typing filters data that is already in the query cache.
  const chatsQuery = useQuery({
    ...trpc.chats.list.queryOptions(),
    enabled: isSignedIn,
  });
  const coursesQuery = useQuery({
    ...trpc.courses.list.queryOptions(),
    enabled: isSignedIn,
  });

  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  // Reset in the closing event, not in an effect: opening always starts from
  // an empty query and the first row, without a second render pass.
  function handleOpenChange(nextOpen: boolean): void {
    if (!nextOpen) {
      setQuery("");
      setActiveIndex(0);
    }
    onOpenChange(nextOpen);
  }

  function runItem(item: PaletteItem): void {
    playInteractionCue("navigate", { emphasis: "subtle" });
    handleOpenChange(false);
    item.run();
  }

  function prefetchPage(to: string): void {
    if (!isSignedIn) {
      return;
    }
    if (to === "/chat") {
      void queryClient.prefetchQuery(trpc.chats.list.queryOptions());
      return;
    }
    if (to === "/courses") {
      void queryClient.prefetchQuery(trpc.courses.list.queryOptions());
      void queryClient.prefetchQuery(trpc.courses.listBadges.queryOptions());
    }
  }

  const items: PaletteItem[] = [];
  for (const page of PAGE_LINKS) {
    if (isCurrentPage(page.to, pathname)) {
      continue;
    }
    const PageIcon = page.icon;
    items.push({
      group: "Pages",
      icon: <PageIcon />,
      id: `page-${page.to}`,
      label: page.label,
      prefetch: () => {
        prefetchPage(page.to);
      },
      run: () => {
        void navigate({ to: page.to });
      },
    });
  }

  const nextTheme = resolvedTheme === "dark" ? "light" : "dark";
  const ThemeIcon = nextTheme === "dark" ? MoonStarIcon : SunIcon;
  items.push(
    {
      group: "Actions",
      icon: <ThemeIcon />,
      id: "action-theme",
      keywords: "dark light appearance color scheme",
      label: `Switch to ${nextTheme} theme`,
      run: () => {
        setTheme(nextTheme);
      },
    },
    {
      group: "Actions",
      icon: <PlusIcon />,
      id: "action-new-chat",
      keywords: "new conversation start",
      label: "New chat",
      run: () => {
        if (pathname === "/chat") {
          requestNewChat();
          return;
        }
        void navigate({ to: "/chat" });
      },
    }
  );

  for (const chat of (chatsQuery.data ?? []).slice(0, 24)) {
    items.push({
      group: "Chats",
      icon: <MessageSquareIcon />,
      id: `chat-${chat.id}`,
      label: chat.title,
      prefetch: () => {
        void queryClient.prefetchQuery(
          trpc.chats.get.queryOptions({ chatId: chat.id })
        );
      },
      run: () => {
        void navigate({
          params: { chatId: chat.id },
          to: "/chat/$chatId",
        });
      },
    });
  }

  for (const course of (coursesQuery.data ?? []).slice(0, 16)) {
    const percent =
      course.lessonCount === 0
        ? 0
        : Math.min(
            Math.round(
              (course.completedLessonCount / course.lessonCount) * 100
            ),
            100
          );
    items.push({
      group: "Courses",
      hint: `${percent}%`,
      icon: <BookOpenIcon />,
      id: `course-${course.id}`,
      keywords: `${course.status} ${percent}%`,
      label: course.title,
      prefetch: () => {
        void queryClient.prefetchQuery(
          trpc.courses.get.queryOptions({ courseId: course.id })
        );
      },
      run: () => {
        void navigate({
          params: { courseId: course.id },
          to: "/courses/$courseId",
        });
      },
    });
  }

  const normalizedQuery = query.trim().toLowerCase();
  const visibleItems: (PaletteItem & { index: number })[] = [];
  for (const group of paletteGroupOrder(pathname)) {
    const groupItems = filterPaletteEntries(
      items.filter((item) => item.group === group),
      query
    ).slice(0, normalizedQuery === "" ? 5 : 8);
    for (const item of groupItems) {
      visibleItems.push({ ...item, index: visibleItems.length });
    }
  }

  const visibleGroups = paletteGroupOrder(pathname)
    .map((group) => ({
      group,
      items: visibleItems.filter((item) => item.group === group),
    }))
    .filter((entry) => entry.items.length > 0);

  const safeActiveIndex =
    visibleItems.length === 0
      ? 0
      : Math.min(activeIndex, visibleItems.length - 1);

  useEffect(() => {
    if (visibleItems.length === 0) {
      return;
    }
    const activeElement = document.querySelector(
      `#command-item-${safeActiveIndex}`
    );
    activeElement?.scrollIntoView({ block: "nearest" });
  }, [safeActiveIndex, visibleItems.length]);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex(
        visibleItems.length === 0
          ? 0
          : (safeActiveIndex + 1) % visibleItems.length
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(
        visibleItems.length === 0
          ? 0
          : (safeActiveIndex - 1 + visibleItems.length) % visibleItems.length
      );
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(Math.max(visibleItems.length - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      const activeItem = visibleItems[safeActiveIndex];
      if (activeItem === undefined) {
        return;
      }
      event.preventDefault();
      runItem(activeItem);
    }
  }

  return (
    <Dialog.Root onOpenChange={handleOpenChange} open={open}>
      <Dialog.Portal>
        <Dialog.Backdrop className="bg-background/60 fixed inset-0 z-50 backdrop-blur-sm" />
        <Dialog.Popup className="bg-popover text-popover-foreground fixed top-[12vh] left-1/2 z-50 w-[min(94vw,38rem)] -translate-x-1/2 overflow-hidden rounded-xl border shadow-2xl shadow-black/10 outline-none">
          <Dialog.Title className="sr-only">Command menu</Dialog.Title>
          <div className="border-border/80 flex items-center gap-2.5 border-b px-3.5">
            <SearchIcon
              aria-hidden="true"
              className="text-muted-foreground size-4 shrink-0"
            />
            <input
              aria-activedescendant={
                visibleItems.length === 0
                  ? undefined
                  : `command-item-${safeActiveIndex}`
              }
              aria-autocomplete="list"
              aria-controls="command-palette-list"
              aria-expanded={open}
              aria-label="Search commands"
              className="placeholder:text-muted-foreground h-11 w-full min-w-0 bg-transparent text-[14px] outline-none"
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search or jump to…"
              ref={inputRef}
              role="combobox"
              value={query}
            />
            <Kbd>esc</Kbd>
          </div>

          <div
            aria-label="Commands"
            className="max-h-[min(56vh,22rem)] overflow-y-auto overscroll-contain p-1.5"
            id="command-palette-list"
            role="listbox"
          >
            {visibleItems.length === 0 ? (
              <p className="text-muted-foreground px-2.5 py-8 text-center text-xs">
                {`No matches for “${query.trim()}”`}
              </p>
            ) : (
              visibleGroups.map(({ group, items: groupItems }) => (
                <div
                  aria-labelledby={`command-group-${group}`}
                  key={group}
                  role="group"
                >
                  <p
                    className="section-label px-2.5 pt-2 pb-1.5"
                    id={`command-group-${group}`}
                  >
                    {group}
                  </p>
                  {groupItems.map((item) => {
                    const isActive = item.index === safeActiveIndex;
                    return (
                      <button
                        aria-selected={isActive}
                        className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors duration-75 ${
                          isActive
                            ? "bg-muted text-foreground"
                            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                        }`}
                        id={`command-item-${item.index}`}
                        key={item.id}
                        onClick={() => {
                          runItem(item);
                        }}
                        onPointerEnter={() => {
                          setActiveIndex(item.index);
                          item.prefetch?.();
                        }}
                        role="option"
                        tabIndex={-1}
                        type="button"
                      >
                        <span className="border-border/70 bg-card flex size-6 shrink-0 items-center justify-center rounded-md border [&_svg]:size-3.5">
                          {item.icon}
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {item.label}
                        </span>
                        {item.hint === undefined ? null : (
                          <span className="text-muted-foreground/70 shrink-0 font-mono text-[10px] tabular-nums">
                            {item.hint}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          <div className="border-border/80 bg-card/40 text-muted-foreground flex items-center justify-between gap-3 border-t px-3 py-2 text-[11px]">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd>
                Navigate
              </span>
              <span className="flex items-center gap-1">
                <Kbd>↵</Kbd>
                Open
              </span>
            </div>
            <span className="font-mono text-[10px]">⌘K</span>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
