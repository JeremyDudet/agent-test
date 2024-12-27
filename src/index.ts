import { config } from "dotenv";
import readline from "readline";
import { ExpenseAgent } from "./core/Agent";
import type { ActionProposal, ActionParameters } from "./types";
import chalk from "chalk";
import { ActionQueue } from "./core/ActionQueue";
import { StateManager } from "./core/StateManager";
import { ExpenseTools } from "./services/expense/ExpenseService";

config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function editActionProposal(
  proposal: ActionProposal
): Promise<ActionProposal> {
  const stateManager = StateManager.getInstance();

  console.log("\nEditing action:", chalk.bold(proposal.action));
  console.log(
    "Current parameters:",
    chalk.gray(JSON.stringify(proposal.parameters, null, 2))
  );

  const updatedParams: Record<string, any> = {};
  for (const [key, value] of Object.entries(proposal.parameters)) {
    const answer = await new Promise<string>((resolve) => {
      rl.question(
        `Enter new value for ${key} (current: ${value}), or press enter to keep: `,
        resolve
      );
    });
    updatedParams[key] = answer.trim() || value;
  }

  const editedProposal = {
    ...proposal,
    parameters: updatedParams,
    status: "modified" as const,
  };

  // Update the proposal in global state
  stateManager.updateState({
    actionContext: {
      ...stateManager.getState().actionContext,
      proposals: stateManager
        .getState()
        .actionContext.proposals.map((p) =>
          p.id === proposal.id ? editedProposal : p
        ),
    },
  });

  return editedProposal;
}

async function handleActionProposals(
  proposals: ActionProposal[],
  actionQueue: ActionQueue
): Promise<ActionProposal[]> {
  while (true) {
    console.log("\nProposed actions:");
    proposals.forEach((proposal, index) => {
      const status =
        proposal.status === "modified" ? chalk.yellow("(modified)") : "";
      console.log(
        `${index + 1}. ${chalk.bold(proposal.action)} ` +
          `(${chalk.blue(proposal.confidence)}% confident) ${status}\n` +
          `   Parameters: ${chalk.gray(
            JSON.stringify(proposal.parameters)
          )}\n` +
          `   Context: ${chalk.gray(proposal.context)}`
      );
    });

    const answer = await new Promise<string>((resolve) => {
      rl.question(
        "\nOptions:\n" +
          "- Numbers (comma-separated) to accept proposals\n" +
          '- "e NUMBER" to edit a proposal\n' +
          '- "n" to reject all\n' +
          '- "d" to done/proceed\n' +
          "Choice: ",
        resolve
      );
    });

    if (answer.toLowerCase() === "n") {
      proposals.forEach((proposal) => actionQueue.remove(proposal.id));
      return proposals.map((p) => ({ ...p, status: "rejected" }));
    } else if (answer.toLowerCase() === "d") {
      return proposals.map((p) => ({ ...p, status: "accepted" }));
    } else if (answer.toLowerCase().startsWith("e")) {
      const index = parseInt(answer.split(" ")[1]) - 1;
      if (index >= 0 && index < proposals.length) {
        proposals[index] = await editActionProposal(proposals[index]);
      }
      continue;
    } else {
      const acceptedIndices = answer
        .split(",")
        .map((n) => parseInt(n.trim()) - 1)
        .filter((i) => i >= 0 && i < proposals.length);

      if (acceptedIndices.length > 0) {
        return proposals.map((p, i) => ({
          ...p,
          status: acceptedIndices.includes(i) ? "accepted" : "rejected",
        }));
      }
      continue;
    }
  }
}

// Helper function to show help menu
const showHelp = () => {
  const stateManager = StateManager.getInstance();
  const state = stateManager.getState();

  console.log("\nAvailable Commands:");
  console.log("- help: Show this help message");
  console.log("- status: View current proposals in queue");
  console.log("- review: Review and act on pending proposals");
  console.log("- debug: Show detailed system state");
  console.log("- exit: Exit the application");

  // Show additional context-specific help based on current state
  if (state.actionContext.proposals.length > 0) {
    console.log("\nPending Actions:");
    console.log(
      `You have ${
        state.actionContext.proposals.filter((p) => p.status === "pending")
          .length
      } proposals waiting for review`
    );
  }
};

// Setup readline interface with state-aware error handling
const setupReadline = () => {
  const stateManager = StateManager.getInstance();

  rl.on("error", (err) => {
    console.error("Readline error:", err);
    stateManager.updateState({
      actionContext: {
        ...stateManager.getState().actionContext,
        isProcessing: false,
      },
    });
  });

  rl.on("close", () => {
    // Clean up state before exiting
    stateManager.updateState({
      actionContext: {
        proposals: [],
        currentInput: "",
        isProcessing: false,
      },
    });
    process.exit(0);
  });
};

// Initialize the application with proper state management
const initializeApp = () => {
  const stateManager = StateManager.getInstance();

  // Set initial state
  stateManager.setState({
    messages: [],
    context: {},
    currentStep: "initial",
    toolCalls: [],
    actionContext: {
      proposals: [],
      currentInput: "",
      isProcessing: false,
    },
  });

  // Setup event listeners
  setupReadline();

  console.log("\nExpense Tracking Assistant\n");
  console.log("Type 'help' to see available commands\n");
};

// Update the main function to use state-aware initialization
async function main() {
  initializeApp();

  const agent = new ExpenseAgent();
  const actionQueue = new ActionQueue();
  const stateManager = StateManager.getInstance();

  // Background processor
  actionQueue.on("proposalUpdated", async () => {
    const pendingProposals = actionQueue.getPending();
    if (pendingProposals.length > 0) {
      console.log("\nPending actions available. Type 'review' to see them.");
    }
  });

  let processingInput = false;

  const processInput = async (input: string) => {
    if (processingInput) return;
    processingInput = true;

    try {
      const stateManager = StateManager.getInstance();

      if (input.toLowerCase() === "help") {
        showHelp();
      } else if (input.toLowerCase() === "debug") {
        const state = stateManager.getState();
        console.log("\nCurrent System State:");
        console.log("Messages:", state.messages);
        console.log("Context:", state.context);
        console.log("Current Step:", state.currentStep);
        console.log("Tool Calls:", state.toolCalls);
        console.log("Action Context:", state.actionContext);
      } else if (input.toLowerCase() === "status") {
        const state = stateManager.getState();
        const proposals = state.actionContext.proposals;

        if (proposals.length > 0) {
          console.log("\nCurrent proposals:");
          proposals.forEach((proposal, index) => {
            console.log(
              `${index + 1}. ${proposal.action} [${proposal.status}] - ${
                proposal.parameters.description
              } ($${proposal.parameters.amount})`
            );
          });
        } else {
          console.log("\nNo proposals in queue.\n");
        }
      } else if (input.toLowerCase() === "review") {
        const pendingProposals = stateManager
          .getState()
          .actionContext.proposals.filter((p) => p.status === "pending");

        if (pendingProposals.length > 0) {
          const updatedProposals = await handleActionProposals(
            pendingProposals,
            actionQueue
          );

          // Process accepted proposals first
          if (updatedProposals.some((p) => p.status === "accepted")) {
            await agent.processAcceptedActions(updatedProposals);
          }

          // After processing, update statuses in global state
          stateManager.updateState({
            actionContext: {
              ...stateManager.getState().actionContext,
              proposals: stateManager
                .getState()
                .actionContext.proposals.map((p) => {
                  const updated = updatedProposals.find((up) => up.id === p.id);
                  return updated || p;
                })
                .filter((p) => p.status === "pending"), // Remove processed proposals
            },
          });
        } else {
          console.log("\nNo pending actions to review.\n");
        }
      } else {
        const proposals = await agent.processMessage(input);
        if (proposals.length > 0) {
          console.log(`Created ${proposals.length} new proposal(s)`);
          actionQueue.add(proposals);
        }
      }
    } catch (error) {
      console.error("Error processing input:", error);
    } finally {
      processingInput = false;
    }
  };

  const askQuestion = () => {
    rl.question("> ", async (input) => {
      if (input.toLowerCase() === "exit") {
        rl.close();
        return;
      }

      await processInput(input);
      askQuestion(); // Continue the loop after processing
    });
  };

  askQuestion(); // Start the input loop
}

interface CategoryConfirmationError {
  code: string;
  suggestedCategory: string;
  reasoning: string;
  originalParams: ActionParameters;
}

function isCategoryConfirmationError(
  error: unknown
): error is CategoryConfirmationError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "NEEDS_CATEGORY_CONFIRMATION" &&
    "suggestedCategory" in error &&
    "reasoning" in error &&
    "originalParams" in error
  );
}

export async function handleExpenseProposal(
  proposal: ActionProposal
): Promise<void> {
  try {
    try {
      await ExpenseTools.addExpense(proposal.parameters);
    } catch (error) {
      if (isCategoryConfirmationError(error)) {
        console.log("\nNew category suggestion:");
        console.log(`Category: ${chalk.yellow(error.suggestedCategory)}`);
        console.log(`Reasoning: ${chalk.gray(error.reasoning)}`);

        const answer = await new Promise<string>((resolve) => {
          rl.question(
            `Do you want to create this new category? (y/n/edit): `,
            resolve
          );
        });

        if (answer.toLowerCase() === "n") {
          console.log("Category creation cancelled. Expense not added.");
          return;
        }

        if (answer.toLowerCase() === "edit") {
          const newCategory = await new Promise<string>((resolve) => {
            rl.question("Enter new category name: ", resolve);
          });
          error.originalParams.category = newCategory;
        }

        // Try adding expense again with confirmed/edited category
        error.originalParams.isNewCategory = false; // Category is now confirmed
        await ExpenseTools.addExpense(error.originalParams);
      } else {
        throw error;
      }
    }

    console.log(
      `✓ Expense added: ${proposal.parameters.description} ($${proposal.parameters.amount})`
    );
  } catch (error) {
    console.error("Error processing expense:", error);
  }
}

main().catch((error) => {
  console.error("Application error:", error);
  process.exit(1);
});
