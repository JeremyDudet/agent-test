import { config } from 'dotenv';
import readline from 'readline';
import { ExpenseAgent } from './agent';

config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function main() {
  console.log('\nExpense Tracking Assistant\n');
  console.log('Example commands:');
  console.log('- "Add expense: $42.50 for lunch at Subway"');
  console.log('- "Show my spending insights for this month"');
  console.log('- "Find similar expenses to groceries"');
  console.log('- "Exit" to quit\n');

  const agent = new ExpenseAgent();

  const askQuestion = () => {
    rl.question('> ', async (input) => {
      if (input.toLowerCase() === 'exit') {
        rl.close();
        return;
      }

      try {
        const response = await agent.processMessage(input);
        console.log('\n' + response + '\n');
      } catch (error: any) {
        console.error('Error:', error.message);
      }

      askQuestion();
    });
  };

  askQuestion();
}

main().catch(console.error);