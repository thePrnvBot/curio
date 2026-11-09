import { describe, expect, it } from "vitest";

import { ASK_USER_TOOL_NAME, createAskUserTool } from "./ask-user-tool";

describe("ask-user-tool", () => {
  it("exports the tool name", () => {
    expect(ASK_USER_TOOL_NAME).toBe("ask_user");
  });

  it("returns a ToolSet with ask_user", () => {
    const tools = createAskUserTool();
    expect(tools).toHaveProperty(ASK_USER_TOOL_NAME);
  });

  it("validates a valid question payload via schema", () => {
    const tools = createAskUserTool();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schema = (tools[ASK_USER_TOOL_NAME] as any).inputSchema;
    expect(schema).toBeDefined();
    const result = schema.safeParse({
      intro: "Quick questions to tailor the course.",
      questions: [
        {
          options: ["Beginner", "Intermediate"],
          question: "What is your current level?",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a question with too few options", () => {
    const tools = createAskUserTool();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schema = (tools[ASK_USER_TOOL_NAME] as any).inputSchema;
    const result = schema.safeParse({
      intro: "Quick questions.",
      questions: [
        {
          options: ["Only option"],
          question: "What is your level?",
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
