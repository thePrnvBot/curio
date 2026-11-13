import { describe, expect, it } from "vitest";

import {
  CHAT_SIDEBAR_RAIL_WIDTH,
  CHAT_SIDEBAR_WIDTH,
  getChatSidebarGutters,
} from "@/components/chat-sidebar-layout";

const RAIL = CHAT_SIDEBAR_RAIL_WIDTH;
const EXPANDED = CHAT_SIDEBAR_WIDTH;

describe("getChatSidebarGutters", () => {
  it("reserves nothing when both sidebars match", () => {
    expect(
      getChatSidebarGutters({ isLeftCollapsed: false, isRightCollapsed: false })
    ).toStrictEqual({ start: 0, end: 0 });
    expect(
      getChatSidebarGutters({ isLeftCollapsed: true, isRightCollapsed: true })
    ).toStrictEqual({ start: 0, end: 0 });
  });

  it("reserves the narrower side so the chat stays window-centered", () => {
    expect(
      getChatSidebarGutters({ isLeftCollapsed: true, isRightCollapsed: false })
    ).toStrictEqual({ start: EXPANDED - RAIL, end: 0 });
    expect(
      getChatSidebarGutters({ isLeftCollapsed: false, isRightCollapsed: true })
    ).toStrictEqual({ start: 0, end: EXPANDED - RAIL });
  });

  it("keeps the chat content flush with the wider sidebar", () => {
    const gutters = getChatSidebarGutters({
      isLeftCollapsed: true,
      isRightCollapsed: false,
    });
    const leftInset = RAIL + gutters.start;
    const rightInset = EXPANDED + gutters.end;
    expect(leftInset).toBe(rightInset);
  });
});
