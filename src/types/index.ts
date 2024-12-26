export interface AgentState {
  messages: Message[];
  context: ExpenseContext;
  currentStep: string;
  toolCalls: ToolCall[];
}

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ToolCall {
  name: string;
  arguments: Record<string, any>;
  result?: any;
}

export interface TimeContext {
  now: Date;
  formattedNow: string;
  timeZone: string;
}

export interface ExpenseContext {
  timeContext?: TimeContext;
  timeframe?: {
    start: Date;
    end: Date;
  };
  category?: string;
  currentTotal?: number;
  budgetLimit?: number;
  recentExpenses?: Expense[];
  intent?:
    | "add_expense"
    | "get_insights"
    | "categorize"
    | "search"
    | "question";
  amount?: number;
  description?: string;
  date?: Date;
}

export interface Expense {
  id: string;
  amount: number;
  description: string;
  category_id: string;
  date: Date;
  date_created: Date;
  merchant?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface Category {
  id: string;
  name: string;
  description: string;
}

export interface Budget {
  id: string;
  category_id: string;
  amount: number;
  period: "daily" | "weekly" | "monthly" | "yearly";
  start_date: Date;
  end_date?: Date;
}

export interface UnderstandingContext extends Omit<ExpenseContext, "date"> {
  intent:
    | "add_expense"
    | "get_insights"
    | "categorize"
    | "search"
    | "question"
    | "need_clarification"
    | "confirm_category";
  amount?: number;
  description?: string;
  date?: Date;
  relativeDays?: number;
  timeContext: TimeContext;
  suggestedCategory?: {
    name: string;
    confidence: number;
    isNew: boolean;
  };
}
