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
