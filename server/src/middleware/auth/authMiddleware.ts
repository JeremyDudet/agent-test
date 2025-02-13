import type { Request, Response, NextFunction } from 'express';
import { supabase } from '../../services/database/supabase';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
      };
    }
  }
}

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ 
        error: { 
          message: 'No token provided', 
          code: 'UNAUTHORIZED' 
        } 
      });
      return;
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({ 
        error: { 
          message: 'Invalid token', 
          code: 'UNAUTHORIZED' 
        } 
      });
      return;
    }

    req.user = {
      id: user.id,
      email: user.email || ''
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ 
      error: { 
        message: 'Authentication failed', 
        code: 'INTERNAL_SERVER_ERROR' 
      } 
    });
  }
}; 