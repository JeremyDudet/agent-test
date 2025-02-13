import type { Request, Response, NextFunction } from 'express';
import winston from 'winston';
import { format } from 'winston';

const { combine, timestamp, printf, colorize } = format;

// Custom log format
const logFormat = printf(({ level, message, timestamp, ...metadata }) => {
  const metaString = Object.keys(metadata).length 
    ? `\n${JSON.stringify(metadata, null, 2)}`
    : '';
    
  return `${timestamp} ${level}: ${message}${metaString}`;
});

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp(),
    colorize(),
    logFormat
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ]
});

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();

  // Log request
  logger.info(`Incoming ${req.method} request to ${req.url}`, {
    method: req.method,
    url: req.url,
    query: req.query,
    headers: req.headers,
    userId: req.user?.id
  });

  // Override end to log response
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any, callback?: any): any {
    const responseTime = Date.now() - start;
    
    logger.info(`Outgoing response for ${req.method} ${req.url}`, {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      userId: req.user?.id
    });

    res.end = originalEnd;
    return res.end(chunk, encoding, callback);
  };

  next();
};

export const errorLogger = (error: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Error processing request', {
    error: {
      message: error.message,
      stack: error.stack
    },
    method: req.method,
    url: req.url,
    userId: req.user?.id
  });

  next(error);
}; 