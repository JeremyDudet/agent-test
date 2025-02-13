import type { Request, Response } from 'express';
import { ExpenseService } from '../services/expense/ExpenseService';
import { ExpenseView } from '../views/ExpenseView';

export class ExpenseController {
  constructor(
    private readonly expenseService: ExpenseService,
    private readonly expenseView: ExpenseView
  ) {}

  createExpense = async (req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json(this.expenseView.handleError(new Error('Unauthorized')));
        return;
      }

      // Auto-categorize if no category provided
      if (!req.body.category) {
        req.body.category = await this.expenseService.categorizeExpense(req.body.item);
      }

      const expense = await this.expenseService.createExpense(userId, req.body);
      res.status(201).json(this.expenseView.formatSingle(expense, startTime));
    } catch (error) {
      this.handleError(error, res);
    }
  };

  updateExpense = async (req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json(this.expenseView.handleError(new Error('Unauthorized')));
        return;
      }

      const id = req.params.id;
      const expense = await this.expenseService.updateExpense(userId, { id, ...req.body });
      res.json(this.expenseView.formatSingle(expense, startTime));
    } catch (error) {
      this.handleError(error, res);
    }
  };

  deleteExpense = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json(this.expenseView.handleError(new Error('Unauthorized')));
        return;
      }

      await this.expenseService.deleteExpense(userId, req.params.id);
      res.status(204).send();
    } catch (error) {
      this.handleError(error, res);
    }
  };

  getExpense = async (req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json(this.expenseView.handleError(new Error('Unauthorized')));
        return;
      }

      const expense = await this.expenseService.getExpenseById(userId, req.params.id);
      
      const format = req.query.format?.toString().toLowerCase();
      switch (format) {
        case 'pdf':
          const pdfBuffer = this.expenseView.formatPDF([expense]);
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="expense-${expense.id}.pdf"`);
          res.send(pdfBuffer);
          break;
        
        case 'csv':
          const csv = this.expenseView.formatCSV([expense]);
          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', `attachment; filename="expense-${expense.id}.csv"`);
          res.send(csv);
          break;
        
        default:
          res.json(this.expenseView.formatSingle(expense, startTime));
      }
    } catch (error) {
      this.handleError(error, res);
    }
  };

  listExpenses = async (req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json(this.expenseView.handleError(new Error('Unauthorized')));
        return;
      }

      const { 
        limit = 10, 
        page = 1,
        startDate,
        endDate,
        category,
        format
      } = req.query;

      const offset = (Number(page) - 1) * Number(limit);

      const { expenses, total } = await this.expenseService.getExpenses(userId, {
        limit: Number(limit),
        offset,
        startDate: startDate as string,
        endDate: endDate as string,
        category: category as string
      });

      switch (format?.toString().toLowerCase()) {
        case 'pdf':
          const pdfBuffer = this.expenseView.formatPDF(expenses);
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', 'attachment; filename="expenses.pdf"');
          res.send(pdfBuffer);
          break;
        
        case 'csv':
          const csv = this.expenseView.formatCSV(expenses);
          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', 'attachment; filename="expenses.csv"');
          res.send(csv);
          break;
        
        default:
          res.json(this.expenseView.formatList(
            expenses,
            total,
            Number(page),
            Number(limit),
            startTime
          ));
      }
    } catch (error) {
      this.handleError(error, res);
    }
  };

  private handleError(error: unknown, res: Response): void {
    console.error('Controller error:', error);
    const errorResponse = this.expenseView.handleError(error);
    res.status(errorResponse.error.code === 'UNAUTHORIZED' ? 401 : 500).json(errorResponse);
  }
} 