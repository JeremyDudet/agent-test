import { StateGraph, Annotation, MemorySaver } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import {
  addExpenseTool,
  getSpendingInsightsTool,
  getSimilarExpensesTool,
  categorizeExpenseTool,
} from "../services/langgraphTools";
import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";

// 1. Define annotation for your graph's state
const StateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (oldValue, newValue) => oldValue.concat(newValue),
  }),
  proposals: Annotation<any[]>({
    reducer: (oldValue, newValue) => oldValue.concat(newValue),
  }),
});

// 2. Collect all tools into an array
const allTools = [
  addExpenseTool,
  getSpendingInsightsTool,
  getSimilarExpensesTool,
  categorizeExpenseTool,
];

// 3. Build the tool node
const expenseToolsNode = new ToolNode(allTools);

// 4. Create your AI model (with .bindTools)
//    Inject a custom system message that instructs minimal, proposal-focused output
const model = new ChatOpenAI({
  temperature: 0,
  openAIApiKey: process.env.OPENAI_API_KEY,
}).bindTools(allTools);

// 5. Customize how we build the conversation
//    We prepend a system message that instructs the AI not to converse, but only propose actions
function prependSystemMessage(messages: BaseMessage[]): BaseMessage[] {
  const systemInstruction = new SystemMessage(
    "You are an expense proposal agent. Do not produce conversational text. " +
      "Output only JSON or minimal text describing proposals or final statuses. " +
      "Only propose CRUD actions if applicable, otherwise state 'no proposals'."
  );
  return [systemInstruction, ...messages];
}

// Node that calls the model but with the custom system message
async function callModelNode(state: typeof StateAnnotation.State) {
  // Merge the user’s messages with our system instruction
  const rawMessages = state.messages;
  const messagesWithSystem = prependSystemMessage(rawMessages);

  // Call the LLM
  const response = await model.invoke(messagesWithSystem);

  // (Optional) Post-process to extract proposals from the response
  // For instance, you could parse JSON or apply regex.

  return { messages: [response] };
}

// Decide whether to call tools or end
function decideNextNode(state: typeof StateAnnotation.State): string {
  const messages = state.messages;
  const last = messages[messages.length - 1];
  if (last instanceof AIMessage && last.tool_calls?.length) {
    return "tools";
  }
  return "__end__";
}

// Build the graph
export const expenseWorkflow = new StateGraph(StateAnnotation)
  .addNode("model", callModelNode)
  .addNode("tools", expenseToolsNode)
  .addEdge("__start__", "model")
  .addConditionalEdges("model", decideNextNode)
  .addEdge("tools", "model");

// Compile the graph
const checkpointer = new MemorySaver();
export const expenseApp = expenseWorkflow.compile({ checkpointer });
