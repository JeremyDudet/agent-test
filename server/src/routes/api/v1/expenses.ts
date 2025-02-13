import { Router } from 'express';
import { ExpenseController } from '../../../controllers/ExpenseController';
import { validateExpense } from '../../../middleware/validation/expenseValidator';
import { authMiddleware } from '../../../middleware/auth/authMiddleware';
import { ExpenseModel } from '../../../models/expense/ExpenseModel';
import { ExpenseService } from '../../../services/expense/ExpenseService';
import { ExpenseView } from '../../../views/ExpenseView';
import { supabase } from '../../../services/database/supabase';
import { openai } from '../../../services/ai/openai';
import { getPendingExpenseProposals } from '../../../services/database/expenses';

const router = Router();

// Initialize dependencies
const expenseModel = new ExpenseModel(supabase, openai);
const expenseService = new ExpenseService(expenseModel);
const expenseView = new ExpenseView();
const expenseController = new ExpenseController(expenseService, expenseView);

// Routes
router.get('/', authMiddleware, expenseController.listExpenses);

// Proposal routes (must come before parameterized routes)
router.get('/proposals/pending', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const proposals = await getPendingExpenseProposals(userId);
    res.json(proposals);
  } catch (error) {
    console.error('Error fetching pending proposals:', error);
    res.status(500).json({ error: 'Failed to fetch pending proposals' });
  }
});

// Parameterized routes
router.get('/:id', authMiddleware, expenseController.getExpense);
router.post('/', authMiddleware, validateExpense, expenseController.createExpense);
router.put('/:id', authMiddleware, validateExpense, expenseController.updateExpense);
router.delete('/:id', authMiddleware, expenseController.deleteExpense);

export default router; 