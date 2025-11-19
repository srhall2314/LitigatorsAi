/**
 * Logger utility for collecting logs and sending them to browser
 */

export interface LogEntry {
  level: 'log' | 'warn' | 'error' | 'info'
  message: string
  data?: any
  timestamp: number
}

export class LogCollector {
  private logs: LogEntry[] = []
  private maxLogs = 1000 // Prevent memory issues

  log(message: string, ...args: any[]) {
    const logData = args.length > 0 ? (args.length === 1 ? args[0] : args) : undefined
    this.addLog('log', message, logData)
    // Also log to console for server-side debugging
    console.log(`[Eyecite] ${message}`, ...args)
  }

  warn(message: string, ...args: any[]) {
    const logData = args.length > 0 ? (args.length === 1 ? args[0] : args) : undefined
    this.addLog('warn', message, logData)
    console.warn(`[Eyecite] ${message}`, ...args)
  }

  error(message: string, ...args: any[]) {
    const logData = args.length > 0 ? (args.length === 1 ? args[0] : args) : undefined
    this.addLog('error', message, logData)
    console.error(`[Eyecite] ${message}`, ...args)
  }

  info(message: string, ...args: any[]) {
    const logData = args.length > 0 ? (args.length === 1 ? args[0] : args) : undefined
    this.addLog('info', message, logData)
    console.info(`[Eyecite] ${message}`, ...args)
  }

  private addLog(level: LogEntry['level'], message: string, data?: any) {
    this.logs.push({
      level,
      message,
      data,
      timestamp: Date.now(),
    })
    
    // Keep only the most recent logs
    if (this.logs.length > this.maxLogs) {
      this.logs.shift()
    }
  }

  getLogs(): LogEntry[] {
    return [...this.logs]
  }

  clear() {
    this.logs = []
  }
}

// Create a singleton instance
let logCollector: LogCollector | null = null

export function getLogCollector(): LogCollector {
  if (!logCollector) {
    logCollector = new LogCollector()
  }
  return logCollector
}

export function resetLogCollector() {
  logCollector = null
}

