"use client";

import { Button } from "@curio/ui/components/button";
import { cn } from "@curio/ui/lib/utils";
import { Maximize2Icon, TableIcon, XIcon } from "lucide-react";
import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ComponentProps } from "react";
import { StreamdownContext, TableCopyDropdown, TableDownloadButton } from "streamdown";
import type { StreamdownContextType } from "streamdown";

/**
 * Markdown tables rendered inline in a scroll box, with the full table
 * available in a window that matches Curio's other floating windows (scrim,
 * rounded frame, header bar, expand/restore, Escape to close).
 *
 * Streamdown's built-in fullscreen control is a bare full-page overlay, so the
 * table renderer is replaced here instead of restyled.
 */

const DEFAULT_TABLE_MAX_HEIGHT = 300;

type MarkdownTableProps = Omit<ComponentProps<"table">, "ref"> & {
  readonly node?: unknown;
};

interface TableSize {
  readonly columns: number;
  readonly rows: number;
}

/** Cell/row counts for the window subtitle; null before the table mounts. */
export function measureMarkdownTable(
  table: HTMLTableElement | null
): TableSize | null {
  if (table === null) {
    return null;
  }
  const headRowCount = table.tHead?.rows.length ?? 0;
  return {
    columns: table.rows[0]?.cells.length ?? 0,
    rows: Math.max(table.rows.length - headRowCount, 0),
  };
}

function toCssMaxHeight(value: number | string): string | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? `${value}px` : undefined;
  }
  return value === "" || value === "0" ? undefined : value;
}

export function MarkdownTable({
  children,
  className,
  node: _node,
  ...props
}: MarkdownTableProps) {
  const streamdownContext = useContext(StreamdownContext) as
    | StreamdownContextType
    | undefined;
  const [openWindow, setOpenWindow] = useState(false);
  const [size, setSize] = useState<TableSize | null>(null);
  const windowTableRef = useRef<HTMLTableElement>(null);

  const maxHeight = toCssMaxHeight(
    streamdownContext?.tableMaxHeight ?? DEFAULT_TABLE_MAX_HEIGHT
  );

  const closeWindow = useCallback(() => {
    setOpenWindow(false);
  }, []);

  useEffect(() => {
    if (!openWindow) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        closeWindow();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeWindow, openWindow]);

  useEffect(() => {
    if (openWindow) {
      setSize(measureMarkdownTable(windowTableRef.current));
    }
  }, [openWindow]);

  const tableClassName = cn("w-full divide-y divide-border", className);

  return (
    <div
      className="border-border bg-sidebar/60 my-4 flex flex-col gap-2 rounded-lg border p-2"
      data-streamdown="table-wrapper"
    >
      <div className="flex items-center justify-end gap-1">
        <TableCopyDropdown />
        <TableDownloadButton />
        <Button
          aria-label="Expand table"
          onClick={() => {
            setOpenWindow(true);
          }}
          size="icon-sm"
          title="Expand table"
          variant="ghost"
        >
          <Maximize2Icon />
        </Button>
      </div>
      <div
        className="border-border bg-background overflow-x-auto overflow-y-auto rounded-md border"
        style={maxHeight === undefined ? undefined : { maxHeight }}
      >
        <table className={tableClassName} data-streamdown="table" {...props}>
          {children}
        </table>
      </div>

      {openWindow ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-2 backdrop-blur-sm sm:p-4">
          <dialog
            aria-label="Expanded table"
            aria-modal="true"
            className="bg-background text-foreground border-border/80 static m-0 flex max-h-[88vh] w-fit max-w-full flex-col overflow-hidden rounded-2xl border p-0 shadow-2xl shadow-black/20"
            data-streamdown="table-wrapper"
            open
          >
            <header className="border-border/70 flex shrink-0 items-center gap-2 border-b px-4 py-1.5">
              <TableIcon className="text-muted-foreground size-3.5 shrink-0" />
              {size !== null && (
                <p className="text-muted-foreground truncate text-[11px] leading-none">
                  {size.columns} columns · {size.rows} rows
                </p>
              )}
              <div className="ml-auto flex shrink-0 items-center gap-0.5">
                <TableCopyDropdown />
                <TableDownloadButton />
                <Button
                  aria-label="Close table"
                  onClick={closeWindow}
                  size="icon-xs"
                  variant="ghost"
                >
                  <XIcon />
                </Button>
              </div>
            </header>
            <div className="min-h-0 overflow-auto overscroll-contain">
              <table
                className="w-full border-collapse text-sm"
                ref={windowTableRef}
              >
                {children}
              </table>
            </div>
          </dialog>
        </div>
      ) : null}
    </div>
  );
}
