# AI-Powered Expense Tracker

An intelligent command-line expense tracking application that uses GPT-4 to detect expenses from your natural language input. As you type, the agent identifies potential expenses and builds a queue of proposals for you to review and approve before they're added to your database.

## Features

- 🤖 Natural language expense input
- 📊 Automatic expense categorization
- 💡 Smart category suggestions
- 📅 Flexible date handling

## Prerequisites

- Node.js 16+ or Bun runtime
- OpenAI API key
- Supabase account and credentials

## Installation

1. Clone the repository

   ```bash
   git clone https://github.com/JeremyDudet/agent-test
   cd agent-test
   ```

2. Install dependencies

   ```bash
   bun install
   # or
   npm install
   ```

3. Set up environment variables
   Create a `.env` file in the root directory with:

   ```bash
   OPENAI_API_KEY=your_openai_api_key
   SUPABASE_URL=your_supabase_url
   SUPABASE_KEY=your_supabase_key
   TIMEZONE=America/Los_Angeles # Optional, defaults to America/Los_Angeles
   ```

4. Set up Supabase tables
   In your Supabase SQL Editor, run the following SQL to create create the required tables in your Supabase DB:

```bash
-- Enable necessary extensions
create extension if not exists pg_trgm;
create extension if not exists vector;

-- Categories for expenses
create table categories (
  id uuid default gen_random_uuid() primary key,
  name text not null unique,
  description text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Expenses table
create table expenses (
  id uuid default gen_random_uuid() primary key,
  amount decimal(12,2) not null,
  description text not null,
  category_id uuid references categories(id),
  date timestamp with time zone not null,
  date_created timestamp with time zone default timezone('utc'::text, now()) not null,
  merchant text,
  tags text[],
  metadata jsonb,
  embedding vector(1536)  -- For semantic search capabilities
);

-- Budget limits table
create table budgets (
  id uuid default gen_random_uuid() primary key,
  category_id uuid references categories(id),
  amount decimal(12,2) not null,
  period text not null check (period in ('daily', 'weekly', 'monthly', 'yearly')),
  start_date timestamp with time zone not null,
  end_date timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Agent conversations table
create table agent_conversations (
  id uuid default gen_random_uuid() primary key,
  messages jsonb not null,
  context jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Insert some default categories
insert into categories (name, description) values
  ('Food & Dining', 'Restaurants, groceries, and food delivery'),
  ('Transportation', 'Public transit, gas, parking, and vehicle maintenance'),
  ('Shopping', 'Retail purchases and online shopping'),
  ('Bills & Utilities', 'Regular monthly bills and utility payments'),
  ('Entertainment', 'Movies, events, and recreational activities'),
  ('Health', 'Medical expenses, pharmacy, and fitness'),
  ('Travel', 'Flights, hotels, and vacation expenses'),
  ('Business', 'Work-related expenses'),
  ('Other', 'Miscellaneous expenses');

-- Create indexes for better query performance
create index expenses_category_id_idx on expenses(category_id);
create index expenses_date_idx on expenses(date);
create index expenses_amount_idx on expenses(amount);
create index expenses_description_trgm_idx on expenses using gin (description gin_trgm_ops);
create index expenses_embedding_idx on expenses using ivfflat (embedding vector_cosine_ops);
```

## Usage

Start the application:

```bash
bun run start
```

or

```bash
npm run start
```

### Available Commands

- `help`: Show available commands
- `status`: View current proposals in queue
- `review`: Review and act on pending proposals
- `debug`: Show detailed system state
- `exit`: Exit the application

### Example Interactions

```bash
> I spent $25 on lunch today
> Created 1 new proposal(s)
> Pending actions available. Type 'review' to see them.
> review
> Proposed actions:
> add_expense (90% confident)
> Parameters: {"amount": 25, "description": "lunch", "date": "2024-03-14"}
> Context: User reported spending on a meal
> Options:
> Numbers (comma-separated) to accept proposals
> "e NUMBER" to edit a proposal
> "n" to reject all
> "d" to done/proceed
```
