import type { StateManager, TimeContext } from "../core/StateManager";
import type { ActionQueue } from "../core/ActionQueue";
import type { Message } from "openai/resources/beta/threads/messages.mjs";

// Base state interfaces
export interface AgentState {
  messages: Message[];
  context: ExpenseContext;
  currentStep: AgentStep;
  toolCalls: ToolCall[];
  actionContext: ActionContext;
}

export type AgentStep =
  | "initial"
  | "understanding"
  | "thinking"
  | "acting"
  | "complete";

// Context types
export interface ExpenseContext {
  timeContext?: TimeContext;
  understanding?: UnderstandingContext;
  [key: string]: any;
}

export interface UnderstandingContext {
  needsClarification?: boolean;
  clarificationReason?: string;
  [key: string]: any;
}

// Action handling
export interface ActionContext {
  proposals: ActionProposal[];
  currentInput: string;
  isProcessing: boolean;
  currentProposal?: string | null;
  proposalHistory?: Array<{
    originalState: string;
    currentState: string;
    transitions: string[];
  }>;
}

export interface ActionProposal {
  id: string;
  action: string;
  parameters: ActionParameters;
  confidence: number;
  context: string;
  followUp: string[];
  status: ProposalStatus;
  originalText: string;
}

export type ProposalStatus = "pending" | "accepted" | "rejected" | "modified";

export interface ActionParameters {
  amount?: number;
  description?: string;
  date?: string;
  category_id?: string;
  merchant?: string;
  tags?: string[];
  metadata?: Record<string, any>;
  [key: string]: any;
}

// Tool calls
export type ToolCallStatus = "success" | "failed" | "pending";

export interface ToolCall {
  name: string;
  arguments: Record<string, any>;
  result?: any;
  status?: ToolCallStatus;
  error?: string;
  executedAt?: string;
}

// Event types
export interface StateEvents {
  stateChanged: (state: AgentState) => void;
  stateReset: () => void;
}

export interface QueueEvents {
  proposalAdded: (proposal: ActionProposal) => void;
  proposalUpdated: (proposal: ActionProposal) => void;
  proposalRemoved: (id: string) => void;
  queueCleared: () => void;
}

// Error handling
export interface AgentError extends Error {
  code: string;
  details?: Record<string, any>;
}

// State Manager type guards
export function isValidState(state: any): state is AgentState {
  return (
    state &&
    Array.isArray(state.messages) &&
    typeof state.context === "object" &&
    typeof state.currentStep === "string" &&
    Array.isArray(state.toolCalls) &&
    typeof state.actionContext === "object"
  );
}

export function isValidProposal(proposal: any): proposal is ActionProposal {
  return (
    proposal &&
    typeof proposal.id === "string" &&
    typeof proposal.action === "string" &&
    typeof proposal.parameters === "object" &&
    typeof proposal.confidence === "number" &&
    typeof proposal.context === "string" &&
    Array.isArray(proposal.followUp) &&
    typeof proposal.status === "string" &&
    typeof proposal.originalText === "string"
  );
}

// Utility types
export type StateUpdater = (state: AgentState) => Partial<AgentState>;
export type ProposalHandler = (proposal: ActionProposal) => Promise<void>;

// Component props types
export interface StateAwareProps {
  stateManager: StateManager;
}

export interface QueueAwareProps {
  actionQueue: ActionQueue;
}

export interface AddExpenseParams extends ActionParameters {
  amount: number;
  description: string;
  date?: string;
  category?: string;
}

export interface GetInsightsParams {
  timeframe: string;
}

export interface GetSimilarExpensesParams {
  description: string;
  limit?: number;
}

export interface CategorizeExpenseParams {
  description: string;
  amount: number;
}

export type ToolParameters =
  | AddExpenseParams
  | GetInsightsParams
  | GetSimilarExpensesParams
  | CategorizeExpenseParams;

export interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
  source: string;
}

export interface TavilySearchAPIResponse {
  answer?: string;
  results: TavilySearchResult[];
  query: string;
}

export interface Expense {
  id: string;
  userId: string;
  amount: number;
  date: string;
  category: string;
  item: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface ExpenseCreateDTO {
  amount: number;
  date: string;
  category: string;
  item: string;
  description?: string;
}

export interface ExpenseUpdateDTO extends Partial<ExpenseCreateDTO> {
  id: string;
}

export interface User {
  id: string;
  email: string;
  created_at: string;
  updated_at: string;
}

export interface TranscriptionData {
  text: string;
  userId: string;
  timestamp: string;
}

export interface ApiResponse<T> {
  data?: T;
  error?: {
    message: string;
    code: string;
  };
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
  };
}
