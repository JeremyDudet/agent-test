import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { PostgrestError } from '@supabase/postgrest-js';

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number,
    public code: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error('Error:', {
    name: error.name,
    message: error.message,
    stack: error.stack
  });

  // Handle validation errors
  if (error instanceof ZodError) {
    return res.status(400).json({
      error: {
        message: 'Validation error',
        code: 'VALIDATION_ERROR',
        details: error.errors
      }
    });
  }

  // Handle Supabase errors
  if (error instanceof PostgrestError) {
    return res.status(500).json({
      error: {
        message: 'Database error',
        code: 'DATABASE_ERROR',
        details: error.message
      }
    });
  }

  // Handle custom app errors
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      error: {
        message: error.message,
        code: error.code
      }
    });
  }

  // Handle unknown errors
  res.status(500).json({
    error: {
      message: 'Internal server error',
      code: 'INTERNAL_SERVER_ERROR'
    }
  });
}; 