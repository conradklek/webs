/**
 * @file Manages logging functionality with configurable levels.
 */

import { format } from 'util';

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
 * @internal
 * @type {number}
 * The maximum length of a logger name (the text inside the brackets), used for alignment.
 */
let maxNameLength = 0;

/**
 * @internal
 * @type {string[]}
 * The in-memory buffer for recent log entries.
 */
let logBuffer = [];

/**
 * @internal
 * @type {number}
 * The maximum number of log entries to keep in memory.
 */
const MAX_LOG_BUFFER_SIZE = 500;

/**
 * @internal
 * @type {boolean}
 * Flag to control console output, useful for interactive shells.
 */
let isConsoleSuspended = false;

/**
 * Suspends logging to the console.
 */
export function suspendConsoleOutput() {
  isConsoleSuspended = true;
}

/**
 * Resumes logging to the console.
 */
export function resumeConsoleOutput() {
  isConsoleSuspended = false;
}

/**
 * Retrieves a copy of the current in-memory log buffer.
 * @returns {string[]} A list of recent log entries.
 */
export function getLogBuffer() {
  return [...logBuffer];
}

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
 * @param {string} prefix - The prefix to prepend to all log messages from this logger (e.g., '[MyLogger]').
 * @returns {Logger} A logger object with different log levels.
 */
export function createLogger(prefix) {
  const name = prefix.slice(1, -1);
  if (name.length > maxNameLength) {
    maxNameLength = name.length;
  }

  /**
   * @internal
   * @param {number} level - The severity level of the message.
   * @param {'log' | 'warn' | 'error'} consoleMethod - The console method to use.
   * @param {keyof typeof LOG_LEVELS} levelName - The string name of the log level.
   * @param {...any} args - The arguments to log.
   */
  const doLog = (level, consoleMethod, levelName, ...args) => {
    const shouldLogToConsole = level >= currentLogLevel && !isConsoleSuspended;

    const formattedMessage = format(...args);
    // Strip ANSI color codes for the buffer to keep it clean
    const strippedMessage = formattedMessage.replace(/\x1b\[[0-9;]*m/g, '');
    const timestamp = new Date().toLocaleTimeString();
    const bufferEntry = `[${timestamp}] [${levelName.toUpperCase()}] ${strippedMessage}`;

    logBuffer.push(bufferEntry);
    if (logBuffer.length > MAX_LOG_BUFFER_SIZE) {
      logBuffer.shift();
    }

    if (shouldLogToConsole) {
      if (typeof process !== 'undefined') {
        const paddedName = ' ' + name.padEnd(maxNameLength - 1, ' ');
        const finalPrefix = `[${paddedName}]`;
        console[consoleMethod](finalPrefix, ...args);
      } else {
        console[consoleMethod](...args);
      }
    }
  };

  return {
    /** @param {...any} args */
    debug: (...args) => doLog(LOG_LEVELS.debug, 'log', 'debug', ...args),
    /** @param {...any} args */
    info: (...args) => doLog(LOG_LEVELS.info, 'log', 'info', ...args),
    /** @param {...any} args */
    log: (...args) => doLog(LOG_LEVELS.info, 'log', 'info', ...args),
    /** @param {...any} args */
    warn: (...args) => doLog(LOG_LEVELS.warn, 'warn', 'warn', ...args),
    /** @param {...any} args */
    error: (...args) => doLog(LOG_LEVELS.error, 'error', 'error', ...args),
  };
}
