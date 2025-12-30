/**
 * Centralized Logging Utility
 * Replaces console.log statements with proper logging levels
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  level: LogLevel
  message: string
  context?: string
  data?: any
  timestamp: number
}

class Logger {
  private isDevelopment = process.env.NODE_ENV === 'development'
  private isProduction = process.env.NODE_ENV === 'production'

  /**
   * Debug logs - only in development
   */
  debug(message: string, data?: any, context?: string): void {
    if (this.isDevelopment) {
      const prefix = context ? `[${context}]` : ''
      console.debug(`${prefix} ${message}`, data || '')
    }
  }

  /**
   * Info logs - development and production
   */
  info(message: string, data?: any, context?: string): void {
    const prefix = context ? `[${context}]` : ''
    console.info(`${prefix} ${message}`, data || '')
  }

  /**
   * Warning logs - always logged
   */
  warn(message: string, data?: any, context?: string): void {
    const prefix = context ? `[${context}]` : ''
    console.warn(`${prefix} ${message}`, data || '')
  }

  /**
   * Error logs - always logged with stack traces in development
   */
  error(message: string, error?: any, context?: string): void {
    const prefix = context ? `[${context}]` : ''
    
    if (error instanceof Error) {
      console.error(`${prefix} ${message}`, {
        message: error.message,
        stack: this.isDevelopment ? error.stack : undefined,
      })
    } else {
      console.error(`${prefix} ${message}`, error || '')
    }
  }

  /**
   * Log API request (for debugging)
   */
  apiRequest(method: string, path: string, context?: string): void {
    if (this.isDevelopment) {
      this.debug(`${method} ${path}`, undefined, context || 'API')
    }
  }

  /**
   * Log API response (for debugging)
   */
  apiResponse(method: string, path: string, status: number, context?: string): void {
    if (this.isDevelopment) {
      this.debug(`${method} ${path} -> ${status}`, undefined, context || 'API')
    }
  }
}

// Export singleton instance
export const logger = new Logger()

// Export class for testing
export { Logger }

