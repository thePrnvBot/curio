const { Client } = require("pg");

async function main() {  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const userRows = await client.query(
    'SELECT id FROM "user" ORDER BY created_at LIMIT 1'
  );
  const owner = userRows.rows.at(0);
  if (!owner) {
    console.log("NO USER FOUND");
    await client.end();
    return;
  }

  await client.query("DELETE FROM course_lesson WHERE course_id = $1", [
    "course_demo",
  ]);
  await client.query("DELETE FROM course_section WHERE course_id = $1", [
    "course_demo",
  ]);
  await client.query("DELETE FROM course WHERE id = $1", ["course_demo"]);

  await client.query(
    `INSERT INTO course (id, user_id, title, description, status, lesson_count, completed_lesson_count)
     VALUES ('course_demo', $1, 'Prompt Engineering Basics', 'Demo course wired to the new LMS course pages', 'active', 2, 0)`,
    [owner.id]
  );
  await client.query(
    `INSERT INTO course_section (id, course_id, position, title)
     VALUES ('section_demo_1', 'course_demo', 1, 'Foundations')`
  );

  const lessonOne = {
    kind: "cards",
    body:
      "A prompt is the structured instruction set you hand to a model. Curio courses use the same idea: the system role holds the standing rules, the user role carries the turn-by-turn request.",
    cards: [
      {
        title: "System role",
        body: "Standing instructions and guardrails that persist across the whole conversation.",
      },
      {
        title: "User role",
        body: "The turn-level request: what you want right now, with enough context to act on.",
      },
      {
        title: "Model role",
        body: "The reply, streamed token by token - tool calls show up as structured events.",
      },
    ],
  };
  const lessonTwo = {
    kind: "recap",
    questions: [
      {
        prompt: "Which role holds standing instructions for the whole conversation?",
        options: ["System", "User", "Assistant"],
        answerIndex: 0,
        explanation:
          "The system prompt carries persistent instructions; user messages are turn-level.",
      },
      {
        prompt: "What does the tool-call stream give you that plain text cannot?",
        options: ["Faster tokens", "Visible structured actions", "Smaller bills"],
        answerIndex: 1,
        explanation:
          "Tool calls arrive as structured events, so the UI can show the agent working.",
      },
    ],
  };

  await client.query(
    `INSERT INTO course_lesson (id, course_id, section_id, position, kind, title, content)
     VALUES ('lesson_demo_1', 'course_demo', 'section_demo_1', 1, 'cards', 'What is a prompt?', $1),
            ('lesson_demo_2', 'course_demo', 'section_demo_1', 2, 'recap', 'Recap: prompting fundamentals', $2)`,
    [JSON.stringify(lessonOne), JSON.stringify(lessonTwo)]
  );

  const after = await client.query(
    "SELECT (SELECT COUNT(*) FROM course) courses, (SELECT COUNT(*) FROM course_lesson) lessons"
  );
  console.log("seeded for user", owner.id, JSON.stringify(after.rows[0]));
  await client.end();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
