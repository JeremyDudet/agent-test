import { expenseApp } from "./core/ExpenseWorkflow";
import { HumanMessage } from "@langchain/core/messages";
import { createInterface } from "readline";
import type { MessageContent, BaseMessage } from "@langchain/core/messages";

// Define interfaces for better type safety
interface Proposal {
  // Add specific properties your proposals should have
  [key: string]: any;
}

interface WorkflowState {
  messages: BaseMessage[];
  [key: string]: any;
}

// This array will store all proposals created so far:
const proposals: Proposal[] = [];

function convertMessageContentToString(content: MessageContent): string {
  if (Array.isArray(content)) {
    // Handle complex message content by converting to string
    return content
      .map((part) => (typeof part === "string" ? part : JSON.stringify(part)))
      .join(" ")
      .trim();
  }
  // Handle simple string content
  return content.trim();
}

async function main() {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(
    "Welcome! Type 'exit' to quit. Type 'review' to view proposals.\n"
  );
  console.log("You can also do 'approve [n]' to approve the n-th proposal.\n");

  // Use the same thread_id to preserve short-term memory across messages
  const threadId = "demo-thread-1";

  async function handleInput(userInput: string) {
    const lower = userInput.trim().toLowerCase();
    // 1) Check for special commands:
    if (userInput.toLowerCase() === "exit") {
      rl.close();
      return;
    }

    if (lower === "review") {
      if (proposals.length === 0) {
        console.log("No proposals yet.\n");
      } else {
        console.log("Here are your pending proposals:\n");
        proposals.forEach((p, i) => {
          console.log(`Proposal #${i + 1}:`, JSON.stringify(p, null, 2));
        });
      }
      console.log("\nEnter another input or 'exit':");
      return;
    }

    // 2) Approve a single proposal by number, e.g. "approve 1"
    if (lower.startsWith("approve")) {
      const parts = lower.split(" ");
      if (parts.length < 2) {
        console.log("Usage: approve [proposal_number]\n");
        return;
      }
      const index = parseInt(parts[1], 10) - 1;
      if (isNaN(index) || index < 0 || index >= proposals.length) {
        console.log("Invalid proposal number.\n");
        return;
      }

      // We'll feed the agent a special message that says:
      // "The user has approved the following proposal. Please run the relevant tool."
      const approvedProposal = proposals[index];
      console.log(`Approving proposal #${index + 1}...`);

      try {
        // After approval, we pass a new message to the agent describing acceptance.
        // That triggers the agent to call add_expense tool if relevant.
        const finalState = await expenseApp.invoke(
          {
            messages: [
              new HumanMessage(
                `APPROVAL NOTICE: The user has approved this proposal: ${JSON.stringify(
                  approvedProposal
                )}`
              ),
            ],
          },
          {
            configurable: {
              thread_id: threadId,
              checkpoint_ns: "expense-tracker",
            },
          }
        );

        // Optionally remove the proposal from the local store
        proposals.splice(index, 1);

        // Inspect the agent's response for any final messages
        const { messages: allMessages } = finalState;
        const lastMessage = allMessages[allMessages.length - 1];
        if (lastMessage?.content) {
          console.log("Agent says:", lastMessage.content, "\n");
        } else {
          console.log("Agent didn't respond.\n");
        }
      } catch (error) {
        console.error("Error approving proposal:", error);
      }
      console.log(
        "Enter your next input, 'review' to see proposals, or 'exit':"
      );
      return;
    }
    // 3) If none of the above commands match, treat as a user input to generate proposals
    try {
      const finalState = (await expenseApp.invoke(
        {
          messages: [new HumanMessage(userInput)],
        },
        {
          configurable: {
            thread_id: threadId,
            checkpoint_ns: "expense-tracker",
          },
        }
      )) as WorkflowState;

      const { messages } = finalState;
      const lastMessage = messages[messages.length - 1];
      if (lastMessage?.content) {
        const contentString = convertMessageContentToString(
          lastMessage.content
        );
        let parsed: unknown;

        try {
          parsed = JSON.parse(contentString);
        } catch {
          parsed = contentString;
        }

        // Type-guard to check if it's a single proposal object
        const isProposal = (value: unknown): value is Proposal =>
          typeof value === "object" && value !== null;

        if (isProposal(parsed) && !Array.isArray(parsed)) {
          proposals.push(parsed);
          console.log("New proposal(s) added.\n");
        } else if (Array.isArray(parsed) && parsed.length > 0) {
          const validProposals = parsed.filter(isProposal);
          proposals.push(...validProposals);
          console.log("New proposals added.\n");
        } else {
          console.log("No proposals or unrecognized format.\n");
        }
      } else {
        console.log("No proposals.\n");
      }
    } catch (error) {
      console.error("Error processing input:", error);
    }

    console.log("Enter your next input, 'review' to see proposals, or 'exit':");
  }

  rl.on("line", handleInput);
}

main().catch(console.error);
