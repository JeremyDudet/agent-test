import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

const expenseSchema = z.object({
  amount: z.number().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category: z.string().min(1),
  item: z.string().min(1),
  description: z.string().optional()
});

export const validateExpense = (req: Request, res: Response, next: NextFunction) => {
  try {
    const validatedData = expenseSchema.parse(req.body);
    req.body = validatedData;
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: {
          message: 'Invalid expense data',
          code: 'VALIDATION_ERROR',
          details: error.errors
        }
      });
      return;
    }
    next(error);
  }
}; 