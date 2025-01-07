import { ExpenseTrackerError, ErrorSeverity } from "../../utils/error";

export enum LogLevel {
  DEBUG = "debug",
  INFO = "info",
  WARN = "warn",
  ERROR = "error",
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  component?: string;
  metadata?: Record<string, unknown>;
}

export class LoggingService {
  private static instance: LoggingService;
  private isDevelopment: boolean;

  private constructor() {
    this.isDevelopment = process.env.NODE_ENV !== "production";
  }

  static getInstance(): LoggingService {
    if (!LoggingService.instance) {
      LoggingService.instance = new LoggingService();
    }
    return LoggingService.instance;
  }

  private formatLog(entry: LogEntry): string {
    const metadata = entry.metadata
      ? ` | ${JSON.stringify(entry.metadata)}`
      : "";
    return `[${entry.timestamp}] ${entry.level.toUpperCase()} ${
      entry.component ? `[${entry.component}]` : ""
    }: ${entry.message}${metadata}`;
  }

  log(
    level: LogLevel,
    message: string,
    component?: string,
    metadata?: Record<string, unknown>
  ): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      component,
      metadata: this.isDevelopment ? metadata : undefined,
    };

    const formattedLog = this.formatLog(entry);

    switch (level) {
      case LogLevel.ERROR:
        console.error(formattedLog);
        break;
      case LogLevel.WARN:
        console.warn(formattedLog);
        break;
      case LogLevel.INFO:
        console.info(formattedLog);
        break;
      case LogLevel.DEBUG:
        if (this.isDevelopment) {
          console.debug(formattedLog);
        }
        break;
    }
  }

  error(error: ExpenseTrackerError, component?: string): void {
    this.log(LogLevel.ERROR, error.message, component, {
      code: error.code,
      ...error.metadata,
    });
  }
}
