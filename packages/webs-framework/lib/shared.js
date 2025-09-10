const LOG_LEVELS = {
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  silent: 5,
};

let currentLogLevelName =
  (typeof process !== 'undefined' && process.env.LOG_LEVEL) || 'info';
let currentLogLevel = LOG_LEVELS[currentLogLevelName];

export function setLogLevel(level) {
  if (LOG_LEVELS[level]) {
    currentLogLevel = LOG_LEVELS[level];
    currentLogLevelName = level;
  }
}

export function createLogger(prefix) {
  const doLog = (level, consoleMethod, ...args) => {
    if (level >= currentLogLevel) {
      console[consoleMethod](prefix, ...args);
    }
  };

  return {
    debug: (...args) => doLog(LOG_LEVELS.debug, 'log', ...args),
    info: (...args) => doLog(LOG_LEVELS.info, 'log', ...args),
    log: (...args) => doLog(LOG_LEVELS.info, 'log', ...args),
    warn: (...args) => doLog(LOG_LEVELS.warn, 'warn', ...args),
    error: (...args) => doLog(LOG_LEVELS.error, 'error', ...args),
  };
}

export default createLogger('[Webs]');

export const voidElements = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

export function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const isObject = (val) =>
  val !== null && typeof val === 'object' && !Array.isArray(val);

export const isString = (val) => typeof val === 'string';

export const isFunction = (val) => typeof val === 'function';

export function normalizeClass(value) {
  let res = '';
  if (isString(value)) {
    res = value;
  } else if (Array.isArray(value)) {
    for (const item of value) {
      const normalized = normalizeClass(item);
      if (normalized) res += normalized + ' ';
    }
  } else if (isObject(value)) {
    for (const key in value) {
      if (value[key]) res += key + ' ';
    }
  }
  return res.trim();
}
