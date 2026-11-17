import { env } from '../config/env.js';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = process.env.LOG_LEVEL ? LEVELS[process.env.LOG_LEVEL] ?? 20 : 20;
const REDACTED = '[redacted]';
const SENSITIVE_KEY = /(password|secret|token|api[-_]?key|authorization|service[-_]?role|cookie)/i;

function redact(value, depth = 0) {
  if (depth > 4 || value == null) return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (typeof value === 'object') {
    if (value instanceof Error) {
      return { name: value.name, message: value.message, code: value.code };
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        SENSITIVE_KEY.test(key) ? REDACTED : redact(item, depth + 1),
      ]),
    );
  }
  return value;
}

function write(level, message, meta) {
  if (LEVELS[level] < threshold) return;
  const entry = {
    time: new Date().toISOString(),
    level,
    message,
    ...(meta === undefined ? {} : { meta: redact(meta) }),
  };

  const output = env.isProduction ? JSON.stringify(entry) : formatPretty(entry);
  if (level === 'error') console.error(output);
  else if (level === 'warn') console.warn(output);
  else console.log(output);
}

function formatPretty(entry) {
  const color = { debug: '\x1b[90m', info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m' }[entry.level];
  const time = entry.time.slice(11, 19);
  const meta = entry.meta ? ` ${JSON.stringify(entry.meta)}` : '';
  return `${color}${time} ${entry.level.toUpperCase().padEnd(5)}\x1b[0m ${entry.message}${meta}`;
}

export const logger = {
  debug: (message, meta) => write('debug', message, meta),
  info: (message, meta) => write('info', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  error: (message, meta) => write('error', message, meta),
};
