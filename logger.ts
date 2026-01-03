import AsyncStorage from '@react-native-async-storage/async-storage';

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  data?: any;
  error?: string;
}

const MAX_LOGS = 500; // 最多保存500条日志
const LOG_STORAGE_KEY = 'app_logs';

class Logger {
  private logs: LogEntry[] = [];
  private listeners: Array<(logs: LogEntry[]) => void> = [];

  constructor() {
    this.loadLogs();
  }

  // 加载历史日志
  private async loadLogs() {
    try {
      const savedLogs = await AsyncStorage.getItem(LOG_STORAGE_KEY);
      if (savedLogs) {
        this.logs = JSON.parse(savedLogs);
        // 只保留最近的日志
        if (this.logs.length > MAX_LOGS) {
          this.logs = this.logs.slice(-MAX_LOGS);
        }
      }
    } catch (error) {
      console.error('加载日志失败:', error);
    }
  }

  // 保存日志到存储
  private async saveLogs() {
    try {
      await AsyncStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(this.logs));
      // 通知监听者
      this.listeners.forEach(listener => listener([...this.logs]));
    } catch (error) {
      console.error('保存日志失败:', error);
    }
  }

  // 添加日志
  private addLog(level: LogLevel, category: string, message: string, data?: any, error?: any) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      data: data ? JSON.stringify(data) : undefined,
      error: error ? (error instanceof Error ? error.message : String(error)) : undefined,
    };

    this.logs.push(entry);
    
    // 限制日志数量
    if (this.logs.length > MAX_LOGS) {
      this.logs = this.logs.slice(-MAX_LOGS);
    }

    // 同时输出到控制台
    const logMessage = `[${entry.timestamp}] [${level}] [${category}] ${message}`;
    switch (level) {
      case LogLevel.DEBUG:
        console.log(logMessage, data || '');
        break;
      case LogLevel.INFO:
        console.info(logMessage, data || '');
        break;
      case LogLevel.WARN:
        console.warn(logMessage, data || '');
        break;
      case LogLevel.ERROR:
        console.error(logMessage, error || data || '');
        break;
    }

    this.saveLogs();
  }

  debug(category: string, message: string, data?: any) {
    this.addLog(LogLevel.DEBUG, category, message, data);
  }

  info(category: string, message: string, data?: any) {
    this.addLog(LogLevel.INFO, category, message, data);
  }

  warn(category: string, message: string, data?: any) {
    this.addLog(LogLevel.WARN, category, message, data);
  }

  error(category: string, message: string, error?: any, data?: any) {
    this.addLog(LogLevel.ERROR, category, message, data, error);
  }

  // 获取所有日志
  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  // 获取错误日志
  getErrorLogs(): LogEntry[] {
    return this.logs.filter(log => log.level === LogLevel.ERROR);
  }

  // 获取最近的日志
  getRecentLogs(count: number = 50): LogEntry[] {
    return this.logs.slice(-count);
  }

  // 清空日志
  async clearLogs() {
    this.logs = [];
    await AsyncStorage.removeItem(LOG_STORAGE_KEY);
    this.listeners.forEach(listener => listener([]));
  }

  // 导出日志
  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  // 订阅日志更新
  subscribe(listener: (logs: LogEntry[]) => void) {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }
}

export const logger = new Logger();
