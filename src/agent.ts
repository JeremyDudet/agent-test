// src/agent.ts
import { StateGraph, Annotation } from "@langchain/langgraph";
import { OpenAI } from "openai";
import type {
  AgentState,
  Message,
  ExpenseContext,
  UnderstandingContext,
} from "./types";
import { ExpenseTools } from "./tools/expense";
import { format, parseISO, subDays, subWeeks } from "date-fns";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";

// Define state annotation
const StateAnnotation = Annotation.Root({
  messages: Annotation<Message[]>({
    reducer: (x, y) => x.concat(y),
  }),
  context: Annotation<ExpenseContext>({
    reducer: (_, y) => y,
  }),
  currentStep: Annotation<string>({
    reducer: (_, y) => y,
  }),
  toolCalls: Annotation<any[]>({
    reducer: (_, y) => y,
  }),
});

export class ExpenseAgent {
  private graph: ReturnType<typeof StateGraph.prototype.compile>;
  private openai: OpenAI;
  private currentState: typeof StateAnnotation.State | null = null;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const baseGraph = new StateGraph(StateAnnotation)
      .addNode("setTimeContext", this.setTimeContext.bind(this))
      .addNode("understand", this.understand.bind(this))
      .addNode("think", this.think.bind(this))
      .addNode("act", this.act.bind(this))
      .addNode("respond", this.respond.bind(this))
      .addEdge("__start__", "setTimeContext")
      .addEdge("setTimeContext", "understand")
      .addEdge("understand", "think")
      .addEdge("think", "act")
      .addEdge("act", "respond")
      .addEdge("respond", "__end__");

    this.graph = baseGraph.compile();
  }

  private async setTimeContext(state: typeof StateAnnotation.State) {
    const timeZone = "America/Los_Angeles";

    // Create a UTC date
    const utcNow = new Date();

    // Convert UTC to PST
    const pstNow = toZonedTime(utcNow, timeZone);

    // Format for display
    const formattedNow = formatInTimeZone(
      utcNow,
      timeZone,
      "EEEE, MMMM do, yyyy h:mm a"
    );

    // Debug logs
    console.log("UTC Time:", utcNow.toISOString());
    console.log(
      "Pacific Time:",
      format(pstNow, "yyyy-MM-dd'T'HH:mm:ss.SSSxxx")
    );
    console.log("Formatted:", formattedNow);

    return {
      messages: state.messages,
      context: {
        ...state.context,
        timeContext: {
          now: pstNow,
          formattedNow,
          timeZone,
        },
      },
      currentStep: "setting_time_context",
      toolCalls: [],
    };
  }

  private async understand(state: typeof StateAnnotation.State) {
    const { timeContext } = state.context;
    if (!timeContext) {
      throw new Error("Time context not set");
    }

    const completion = await this.openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: `You are an expense tracking assistant. The current time is ${timeContext.formattedNow} (Pacific Time).
                   When handling dates, always use Pacific Time (${timeContext.timeZone}).
                   For relative dates like "yesterday", calculate from current time: ${timeContext.formattedNow}
                   
                   Analyze the entire conversation to maintain context. If you find relevant information from previous messages
                   (like amounts, dates, or descriptions), use them to complete the current understanding.
                   
                   Return a JSON object with:
                   - intent: 'add_expense', 'get_insights', 'categorize', 'search', 'need_clarification', or 'question'
                   - date: ISO string in America/Los_Angeles timezone
                   - amount: number if mentioned
                   - description: string if expense description provided
                   - relativeDays: number (e.g., -1 for yesterday, -7 for a week ago)
                   - needsClarification: boolean (true if description is missing or too vague)
                   - previousContext: object containing any relevant information from previous messages`,
        },
        ...state.messages,
      ],
      response_format: { type: "json_object" },
    });

    const understanding = JSON.parse(
      completion.choices[0].message.content || "{}"
    );

    // Merge with previous context if available
    const previousContext = state.context as UnderstandingContext;
    const mergedUnderstanding = {
      ...understanding,
      amount: understanding.amount || previousContext.amount,
      description: understanding.description || previousContext.description,
      relativeDays: understanding.relativeDays || previousContext.relativeDays,
    };

    // If we need clarification, maintain existing context
    if (mergedUnderstanding.needsClarification) {
      return {
        context: {
          ...previousContext,
          intent: "need_clarification",
          amount: mergedUnderstanding.amount,
          description: mergedUnderstanding.description,
          relativeDays: mergedUnderstanding.relativeDays,
          timeContext,
        },
      };
    }

    // Calculate the final date
    let finalDate;
    if (mergedUnderstanding.relativeDays) {
      finalDate = subDays(
        timeContext.now,
        Math.abs(mergedUnderstanding.relativeDays)
      );
      finalDate = toZonedTime(finalDate, timeContext.timeZone);
    } else if (mergedUnderstanding.date) {
      finalDate = toZonedTime(
        parseISO(mergedUnderstanding.date),
        timeContext.timeZone
      );
    } else {
      finalDate = timeContext.now;
    }

    return {
      context: {
        ...mergedUnderstanding,
        date: finalDate,
        timeContext,
      },
    };
  }

  private async think(state: typeof StateAnnotation.State) {
    const context = state.context as UnderstandingContext;
    let toolCalls = [];

    switch (context.intent) {
      case "need_clarification":
        return {
          messages: [
            ...state.messages,
            {
              role: "assistant",
              content:
                "Could you please provide more details about this expense? For example, what was it for? This helps me categorize it correctly.",
            },
          ],
          context: state.context,
          currentStep: "thinking",
          toolCalls: [],
        };

      case "add_expense":
        if (context.description) {
          // First try to categorize
          const categorization = await ExpenseTools.categorizeExpense(
            context.description
          );

          if (categorization.needsConfirmation) {
            // If we need confirmation, update context and ask user
            return {
              messages: [
                ...state.messages,
                {
                  role: "assistant",
                  content: categorization.isNew
                    ? `I think this might be a new category "${categorization.category.name}" (${categorization.category.description}). Would you like to create this category? (yes/no)`
                    : `I'm ${categorization.confidence}% confident this expense belongs to the "${categorization.category.name}" category. Is this correct? (yes/no)`,
                },
              ],
              context: {
                ...context,
                intent: "confirm_category",
                suggestedCategory: {
                  name: categorization.category.name,
                  confidence: categorization.confidence,
                  isNew: categorization.isNew,
                },
              },
              currentStep: "thinking",
              toolCalls: [],
            };
          }

          // If confident enough, proceed with adding expense
          toolCalls.push({
            name: "addExpense",
            arguments: {
              amount: context.amount,
              description: context.description,
              date: context.date,
              category_id: categorization.category.id,
            },
          });
        }
        break;

      case "confirm_category":
        const userResponse =
          state.messages[state.messages.length - 1].content.toLowerCase();
        if (userResponse.includes("yes")) {
          // Proceed with the suggested category
          const finalCategory = await ExpenseTools.categorizeExpense(
            context.description || "",
            false // Skip confirmation this time
          );

          toolCalls.push({
            name: "addExpense",
            arguments: {
              amount: context.amount,
              description: context.description,
              date: context.date,
              category_id: finalCategory.category.id,
            },
          });
        } else {
          // Ask for the correct category
          return {
            messages: [
              ...state.messages,
              {
                role: "assistant",
                content:
                  "Could you please specify which category this expense should belong to?",
              },
            ],
            context: {
              ...context,
              intent: "need_clarification",
            },
            currentStep: "thinking",
            toolCalls: [],
          };
        }
        break;

      case "get_insights":
        toolCalls.push({
          name: "getSpendingInsights",
          arguments: context.timeframe || {},
        });
        break;

      case "search":
        if (context.description) {
          toolCalls.push({
            name: "getSimilarExpenses",
            arguments: {
              description: context.description,
            },
          });
        }
        break;
    }

    return {
      messages: state.messages,
      context: state.context,
      currentStep: "thinking",
      toolCalls,
    };
  }

  private async act(state: typeof StateAnnotation.State) {
    const results = [];

    for (const toolCall of state.toolCalls) {
      try {
        switch (toolCall.name) {
          case "addExpense":
            toolCall.result = await ExpenseTools.addExpense(toolCall.arguments);
            break;
          case "categorizeExpense":
            toolCall.result = await ExpenseTools.categorizeExpense(
              toolCall.arguments.description
            );
            break;
          case "getSpendingInsights":
            toolCall.result = await ExpenseTools.getSpendingInsights(
              toolCall.arguments
            );
            break;
          case "getSimilarExpenses":
            toolCall.result = await ExpenseTools.getSimilarExpenses(
              toolCall.arguments.description
            );
            break;
        }
        results.push(toolCall);
      } catch (error: any) {
        console.error(`Error executing ${toolCall.name}:`, error);
        toolCall.result = { error: error.message };
      }
    }

    return {
      messages: state.messages,
      context: state.context,
      currentStep: "acting",
      toolCalls: results,
    };
  }

  private async respond(state: typeof StateAnnotation.State) {
    const completion = await this.openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: `You are an expense tracking assistant. Generate a helpful response based on the action results.
                   Keep responses concise but informative. Use bullet points for multiple items.
                   Context: ${JSON.stringify(state.context)}
                   Results: ${JSON.stringify(state.toolCalls)}`,
        },
        ...state.messages,
      ],
    });

    const response = completion.choices[0].message.content;

    return {
      messages: [...state.messages, { role: "assistant", content: response }],
      context: state.context,
      currentStep: "responding",
      toolCalls: state.toolCalls,
    };
  }

  async processMessage(message: string) {
    // Initialize state if this is the first message
    if (!this.currentState) {
      this.currentState = {
        messages: [],
        context: {},
        currentStep: "initial",
        toolCalls: [],
      };
    }

    // Keep only the last 10 messages to prevent context overflow
    const recentMessages = this.currentState.messages.slice(-9);

    // Add new message to existing messages
    const newState = {
      ...this.currentState,
      messages: [...recentMessages, { role: "user", content: message }],
    };

    // Process the state through the graph
    const finalState = await this.graph.invoke(newState);

    // Update the current state for the next message
    this.currentState = finalState;

    // Return the last assistant message
    return finalState.messages[finalState.messages.length - 1].content;
  }
}
