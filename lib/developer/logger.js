/**
 * @file Manages logging functionality with configurable levels.
 */

/**
 * The available logging levels.
 * @typedef {'debug' | 'info' | 'warn' | 'error' | 'silent'} LogLevel
 */

/**
 * A logger instance with methods for different log levels.
 * @typedef {object} Logger
 * @property {(...args: any[]) => void} debug - Logs a debug message.
 * @property {(...args: any[]) => void} info - Logs an info message.
 * @property {(...args: any[]) => void} log - Logs an info message (alias for info).
 * @property {(...args: any[]) => void} warn - Logs a warning message.
 * @property {(...args: any[]) => void} error - Logs an error message.
 */

/**
 * @internal
 * @type {Record<LogLevel, number>}
 * Maps log levels to their severity number.
 */
const LOG_LEVELS = {
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  silent: 5,
};

/**
 * @internal
 * @type {LogLevel}
 * The current logging level name.
 */
let currentLogLevelName =
  (typeof process !== 'undefined' &&
    /** @type {LogLevel} */ (process.env.LOG_LEVEL)) ||
  'info';

/**
 * @internal
 * @type {number}
 * The current logging level severity.
 */
let currentLogLevel = LOG_LEVELS[currentLogLevelName];

/**
 * Sets the global logging level for all created loggers.
 * @param {LogLevel} level - The new logging level to set.
 */
export function setLogLevel(level) {
  if (LOG_LEVELS[level]) {
    currentLogLevel = LOG_LEVELS[level];
    currentLogLevelName = level;
  }
}

/**
 * Creates a new logger instance with a specified prefix.
 * @param {string} prefix - The prefix to prepend to all log messages from this logger.
 * @returns {Logger} A logger object with different log levels.
 */
export function createLogger(prefix) {
  /**
   * @internal
   * @param {number} level - The severity level of the message.
   * @param {'log' | 'warn' | 'error'} consoleMethod - The console method to use.
   * @param {...any} args - The arguments to log.
   */
  const doLog = (level, consoleMethod, ...args) => {
    if (level >= currentLogLevel) {
      console[consoleMethod](prefix, ...args);
    }
  };

  return {
    /** @param {...any} args */
    debug: (...args) => doLog(LOG_LEVELS.debug, 'log', ...args),
    /** @param {...any} args */
    info: (...args) => doLog(LOG_LEVELS.info, 'log', ...args),
    /** @param {...any} args */
    log: (...args) => doLog(LOG_LEVELS.info, 'log', ...args),
    /** @param {...any} args */
    warn: (...args) => doLog(LOG_LEVELS.warn, 'warn', ...args),
    /** @param {...any} args */
    error: (...args) => doLog(LOG_LEVELS.error, 'error', ...args),
  };
}
