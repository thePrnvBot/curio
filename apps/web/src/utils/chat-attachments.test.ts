import { describe, expect, it } from "vitest";

import {
  describeUnsupportedAttachment,
  isSupportedChatAttachment,
  MAX_CHAT_ATTACHMENT_BYTES,
} from "./chat-attachments";

describe("chat attachment policy", () => {
  it("accepts images and text documents", () => {
    expect(isSupportedChatAttachment("image/png")).toBe(true);
    expect(isSupportedChatAttachment("image/webp")).toBe(true);
    expect(isSupportedChatAttachment("application/pdf")).toBe(true);
    expect(isSupportedChatAttachment("text/markdown")).toBe(true);
    expect(isSupportedChatAttachment("application/json")).toBe(true);
  });

  it("rejects video, audio and arbitrary binaries", () => {
    expect(isSupportedChatAttachment("video/mp4")).toBe(false);
    expect(isSupportedChatAttachment("audio/mpeg")).toBe(false);
    expect(isSupportedChatAttachment("application/zip")).toBe(false);
    expect(isSupportedChatAttachment("")).toBe(false);
  });

  it("explains video and audio rejections", () => {
    expect(
      describeUnsupportedAttachment({
        filename: "lesson.mp4",
        mediaType: "video/mp4",
      })
    ).toContain("video");
    expect(
      describeUnsupportedAttachment({
        filename: "lesson.mp3",
        mediaType: "audio/mpeg",
      })
    ).toContain("audio");
  });

  it("keeps the upload cap at 8 MiB", () => {
    expect(MAX_CHAT_ATTACHMENT_BYTES).toBe(8 * 1024 * 1024);
  });
});
