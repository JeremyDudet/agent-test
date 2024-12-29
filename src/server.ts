import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { expenseApp } from "./core/ExpenseWorkflow";
import { HumanMessage } from "@langchain/core/messages";

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.post("/api/messages", async (req, res) => {
  const { text, threadId } = req.body;

  if (typeof text !== "string") {
    return res.status(400).json({ error: "Text must be a string" });
  }

  try {
    // Pass user text into the workflow
    const finalState = await expenseApp.invoke(
      {
        messages: [new HumanMessage(text)],
      },
      {
        configurable: {
          thread_id: threadId || "demo-thread",
          checkpoint_ns: "expense-tracker",
        },
      }
    );

    // Inspect the final state's last message for proposals
    const { messages } = finalState;
    const lastMessage = messages[messages.length - 1];

    let parsed;
    if (lastMessage?.content) {
      try {
        parsed = JSON.parse(lastMessage.content);
      } catch (err) {
        parsed = lastMessage.content;
      }
    }

    return res.json({ proposals: parsed || null });
  } catch (err) {
    console.error("Error handling request:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
