import { format } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';

export interface ResponseMetadata {
  timestamp: string;
  version: string;
  requestId: string;
  responseTime?: number;
}

export interface ErrorResponse {
  error: {
    message: string;
    code: string;
    details?: unknown;
  };
  meta: ResponseMetadata;
}

export interface BaseResponseDTO<T> {
  data: T;
  meta: ResponseMetadata;
}

export interface PaginatedResponseDTO<T> extends BaseResponseDTO<T[]> {
  meta: ResponseMetadata & {
    pagination: {
      total: number;
      page: number;
      limit: number;
      hasMore: boolean;
    };
  };
}

export abstract class BaseView<T, R> {
  protected readonly apiVersion = '1.0.0';

  abstract format(data: T): R;
  
  protected createMetadata(startTime?: number): ResponseMetadata {
    const metadata: ResponseMetadata = {
      timestamp: new Date().toISOString(),
      version: this.apiVersion,
      requestId: uuidv4()
    };

    if (startTime) {
      metadata.responseTime = Date.now() - startTime;
    }

    return metadata;
  }

  protected formatResponse(data: R, startTime?: number): BaseResponseDTO<R> {
    return {
      data,
      meta: this.createMetadata(startTime)
    };
  }

  protected formatPaginatedResponse(
    data: R[],
    total: number,
    page: number,
    limit: number,
    startTime?: number
  ): PaginatedResponseDTO<R> {
    return {
      data,
      meta: {
        ...this.createMetadata(startTime),
        pagination: {
          total,
          page,
          limit,
          hasMore: total > page * limit
        }
      }
    };
  }

  protected handleError(error: Error | unknown): ErrorResponse {
    const errorResponse: ErrorResponse = {
      error: {
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        code: error instanceof Error ? error.name : 'UNKNOWN_ERROR'
      },
      meta: this.createMetadata()
    };

    if (error instanceof Error && error.stack) {
      errorResponse.error.details = {
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      };
    }

    return errorResponse;
  }

  protected formatDate(date: string | Date, pattern = 'PPP'): string {
    return format(typeof date === 'string' ? new Date(date) : date, pattern);
  }

  protected formatCurrency(
    amount: number,
    currency = 'USD',
    locale = 'en-US'
  ): string {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency
    }).format(amount);
  }
} 