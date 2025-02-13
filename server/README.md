# AI-Powered Expense Tracker

This project demonstrates the implementation of multi-agent workflows using LangGraph, with an expense tracking use case. 

The application is an multi-agnt workflow that:

Processes natural language inputs to detect and categorize expenses
Handles relative date references (e.g., "yesterday", "last week")
Maintains conversation context for fluid interactions

The current CLI implementation serves as a prototype for future expansions

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

-- Create function for vector similarity search
create or replace function search_expenses(
  query_embedding vector(1536),
  similarity_threshold float,
  match_count int
)
returns table (
  id uuid,
  description text,
  amount decimal,
  date timestamp with time zone,
  merchant text,
  category_name text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    e.id,
    e.description,
    e.amount,
    e.date,
    e.merchant,
    c.name as category_name,
    1 - (e.embedding <=> query_embedding) as similarity
  from expenses e
  join categories c on c.id = e.category_id
  where 1 - (e.embedding <=> query_embedding) > similarity_threshold
  order by similarity desc
  limit match_count;
end;
$$;
```

## Usage

Start the application:

```