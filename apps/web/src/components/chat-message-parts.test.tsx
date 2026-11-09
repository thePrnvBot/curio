import type { UIMessage } from "ai";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { renderUserMessageParts } from "./chat";

function renderUserMessage(message: UIMessage): string {
  return renderToStaticMarkup(<div>{renderUserMessageParts(message)}</div>);
}

describe("user message attachments", () => {
  it("renders media on the user side without placeholder text", () => {
    const markup = renderUserMessage({
      id: "user-media",
      parts: [
        { text: "Sent with attachments", type: "text" },
        {
          filename: "photo.png",
          mediaType: "image/png",
          type: "file",
          url: "data:image/png;base64,AAAA",
        },
      ],
      role: "user",
    });

    expect(markup).toContain("<img");
    expect(markup).toContain("photo.png");
    expect(markup).not.toContain("Sent with attachments");
  });

  it("keeps a real caption next to the attachment", () => {
    const markup = renderUserMessage({
      id: "user-caption",
      parts: [
        { text: "What is wrong in this screenshot?", type: "text" },
        {
          filename: "shot.png",
          mediaType: "image/png",
          type: "file",
          url: "data:image/png;base64,AAAA",
        },
      ],
      role: "user",
    });

    expect(markup).toContain("What is wrong in this screenshot?");
    expect(markup).toContain("<img");
  });
});
