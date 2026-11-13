import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

/** Expanded sidebar width, shared by the chats sidebar and session files. */
export const CHAT_SIDEBAR_WIDTH = 256;
/** Collapsed rail width, shared by the chats sidebar and session files. */
export const CHAT_SIDEBAR_RAIL_WIDTH = 44;

export interface ChatSidebarGutters {
  /** Reserved space on the left of the chat column, in px. */
  readonly start: number;
  /** Reserved space on the right of the chat column, in px. */
  readonly end: number;
}

/**
 * Collapsing a sidebar must not re-center the chat, so the chat content is
 * always centered in the window by reserving the wider sidebar width on both
 * sides. The narrower side gets the difference as padding.
 */
export function getChatSidebarGutters({
  isLeftCollapsed,
  isRightCollapsed,
}: {
  isLeftCollapsed: boolean;
  isRightCollapsed: boolean;
}): ChatSidebarGutters {
  const leftWidth = isLeftCollapsed
    ? CHAT_SIDEBAR_RAIL_WIDTH
    : CHAT_SIDEBAR_WIDTH;
  const rightWidth = isRightCollapsed
    ? CHAT_SIDEBAR_RAIL_WIDTH
    : CHAT_SIDEBAR_WIDTH;
  const widest = Math.max(leftWidth, rightWidth);

  return {
    start: widest - leftWidth,
    end: widest - rightWidth,
  };
}

interface ChatSidebarLayoutValue {
  readonly isLeftCollapsed: boolean;
  readonly isRightCollapsed: boolean;
  readonly toggleLeft: () => void;
  readonly toggleRight: () => void;
}

const ChatSidebarLayoutContext = createContext<ChatSidebarLayoutValue | null>(
  null
);

export function ChatSidebarLayoutProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);
  const [isRightCollapsed, setIsRightCollapsed] = useState(false);

  const value = useMemo(
    () => ({
      isLeftCollapsed,
      isRightCollapsed,
      toggleLeft: () => {
        setIsLeftCollapsed((previous) => !previous);
      },
      toggleRight: () => {
        setIsRightCollapsed((previous) => !previous);
      },
    }),
    [isLeftCollapsed, isRightCollapsed]
  );

  return (
    <ChatSidebarLayoutContext.Provider value={value}>
      {children}
    </ChatSidebarLayoutContext.Provider>
  );
}

export function useChatSidebarLayout(): ChatSidebarLayoutValue {
  const value = useContext(ChatSidebarLayoutContext);
  if (value === null) {
    throw new Error(
      "useChatSidebarLayout must be used inside ChatSidebarLayoutProvider"
    );
  }
  return value;
}
