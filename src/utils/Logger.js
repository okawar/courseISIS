class Logger {
  constructor() {
    this.logs = [];
    this.maxLogs = 1000;
    this.listeners = [];
    this.logLevels = ['debug', 'info', 'calc', 'warning', 'error'];
  }

  log(level, message, data = {}) {
    const logEntry = {
      id: Date.now() + Math.random(),
      timestamp: new Date().toISOString(),
      level: level.toLowerCase(),
      message,
      data: this.sanitizeData(data),
      component: data.component || 'Unknown'
    };

    this.logs.push(logEntry);

    // Ограничиваем количество логов
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Уведомляем слушателей
    this.listeners.forEach(listener => {
      try {
        listener(logEntry);
      } catch (error) {
        console.error('Ошибка в listener логгера:', error);
      }
    });

    // Дублируем в консоль для отладки
    this.logToConsole(logEntry);
  }

  sanitizeData(data) {
    try {
      // Убираем циклические ссылки и очень большие объекты
      return JSON.parse(JSON.stringify(data, (key, value) => {
        if (typeof value === 'function') {
          return '[Function]';
        }
        if (value instanceof Error) {
          return {
            name: value.name,
            message: value.message,
            stack: value.stack
          };
        }
        if (Array.isArray(value) && value.length > 10) {
          return [...value.slice(0, 10), `... и ещё ${value.length - 10} элементов`];
        }
        return value;
      }));
    } catch (error) {
      return { error: 'Не удалось сериализовать данные' };
    }
  }

  logToConsole(logEntry) {
    const { level, message, data, timestamp, component } = logEntry;
    const timeStr = new Date(timestamp).toLocaleTimeString('ru-RU');
    
    switch (level) {
      case 'error':
        console.error(`[${timeStr}] ${component}: ${message}`, data);
        break;
      case 'warning':
        console.warn(`[${timeStr}] ${component}: ${message}`, data);
        break;
      case 'info':
        console.info(`[${timeStr}] ${component}: ${message}`, data);
        break;
      case 'calc':
        console.log(`[${timeStr}] 🧮 ${component}: ${message}`, data);
        break;
      case 'debug':
        console.log(`[${timeStr}] 🐛 ${component}: ${message}`, data);
        break;
      default:
        console.log(`[${timeStr}] ${component}: ${message}`, data);
    }
  }

  addListener(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  getLogs(filters = {}) {
    let filteredLogs = [...this.logs];

    if (filters.level) {
      filteredLogs = filteredLogs.filter(log => log.level === filters.level);
    }

    if (filters.component) {
      filteredLogs = filteredLogs.filter(log => 
        log.component.toLowerCase().includes(filters.component.toLowerCase())
      );
    }

    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      filteredLogs = filteredLogs.filter(log => 
        log.message.toLowerCase().includes(searchTerm) ||
        JSON.stringify(log.data).toLowerCase().includes(searchTerm)
      );
    }

    if (filters.timeRange) {
      const { start, end } = filters.timeRange;
      filteredLogs = filteredLogs.filter(log => {
        const logTime = new Date(log.timestamp);
        return logTime >= start && logTime <= end;
      });
    }

    return filteredLogs.reverse(); // Новые логи вверху
  }

  clearLogs() {
    this.logs = [];
    this.log('info', 'Логи очищены', { component: 'Logger' });
  }

  exportLogs(format = 'json') {
    const logs = this.getLogs();
    
    if (format === 'json') {
      return JSON.stringify(logs, null, 2);
    }
    
    if (format === 'csv') {
      const headers = 'Время,Уровень,Компонент,Сообщение,Данные\n';
      const rows = logs.map(log => {
        const time = new Date(log.timestamp).toLocaleString('ru-RU');
        const data = JSON.stringify(log.data).replace(/"/g, '""');
        return `"${time}","${log.level}","${log.component}","${log.message}","${data}"`;
      }).join('\n');
      return headers + rows;
    }

    return logs;
  }

  getStats() {
    const levelCounts = this.logLevels.reduce((acc, level) => {
      acc[level] = this.logs.filter(log => log.level === level).length;
      return acc;
    }, {});

    const componentCounts = this.logs.reduce((acc, log) => {
      acc[log.component] = (acc[log.component] || 0) + 1;
      return acc;
    }, {});

    return {
      totalLogs: this.logs.length,
      levelCounts,
      componentCounts,
      oldestLog: this.logs[0]?.timestamp,
      newestLog: this.logs[this.logs.length - 1]?.timestamp
    };
  }
}

// Создаем глобальный экземпляр логгера
const logger = new Logger();

// Экспортируем функцию логирования
export const log = (level, message, data = {}) => {
  logger.log(level, message, data);
};

// Экспортируем сам класс логгера для использования в компонентах
export default logger;