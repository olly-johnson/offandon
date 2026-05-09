/**
 * Structured logger for Bot OS.
 *
 * One emitter, every server action / engine method / external call goes
 * through it. Output shape is JSON-per-line so logs stay grep-able and
 * pipeable in any environment (Vercel, local dev, future log aggregator).
 *
 * Discipline:
 *   - Always log on entry (operation + key inputs), exit (outcome + duration),
 *     and every error branch.
 *   - Never log raw secrets, JWTs, anon/service keys, or full prompt bodies.
 *     Sensitive keys are auto-redacted by name; long strings are truncated.
 *   - Use namespaces (`createLogger("voice.engine")`) so log lines are
 *     filterable by subsystem.
 *
 * Configuration:
 *   - LOG_LEVEL env var: debug | info | warn | error.
 *     Defaults to "info" in production, "debug" otherwise.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogFields {
  [key: string]: unknown;
}

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  /** Append a sub-namespace, e.g. log.child("rpc") -> "voice.engine.rpc". */
  child(namespace: string): Logger;
}

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/**
 * Field names that look like credentials or session material. Matched
 * case-insensitively against the JSON key (not the value), so a field
 * called `apiKey` or `anon_key` is redacted regardless of its content.
 */
const SENSITIVE_KEY_PATTERN =
  /(api[-_]?key|access[-_]?token|refresh[-_]?token|bearer|jwt|password|secret|service[-_]?role|anon[-_]?key|authorization|cookie)/i;

const STRING_TRUNCATE_AT = 200;
const MAX_DEPTH = 5;

function shouldRedactKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[max-depth]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    if (value.length > STRING_TRUNCATE_AT) {
      return `${value.slice(0, STRING_TRUNCATE_AT)}…(truncated, ${value.length} chars)`;
    }
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      // Stack is intentionally not redacted — it's debugging gold.
      stack: value.stack,
    };
  }
  if (Array.isArray(value)) return value.map((v) => sanitize(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = shouldRedactKey(k) ? "[redacted]" : sanitize(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

function envMinLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL?.toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

export function createLogger(namespace: string): Logger {
  const minLevel = LEVEL_RANK[envMinLevel()];

  function emit(level: LogLevel, message: string, fields?: LogFields): void {
    if (LEVEL_RANK[level] < minLevel) return;
    const record = {
      ts: new Date().toISOString(),
      level,
      ns: namespace,
      msg: message,
      ...(fields ? (sanitize(fields) as Record<string, unknown>) : {}),
    };
    const line = JSON.stringify(record);
    // warn/error to stderr so log aggregators can split streams cleanly.
    if (level === "warn" || level === "error") {
      console.error(line);
    } else {
      console.log(line);
    }
  }

  return {
    debug: (m, f) => emit("debug", m, f),
    info: (m, f) => emit("info", m, f),
    warn: (m, f) => emit("warn", m, f),
    error: (m, f) => emit("error", m, f),
    child: (sub: string) => createLogger(`${namespace}.${sub}`),
  };
}

/**
 * Time an async operation. Logs entry, exit (with duration_ms), and any
 * thrown error. Returns the operation's value or rethrows.
 */
export async function timed<T>(
  logger: Logger,
  operation: string,
  fn: () => Promise<T>,
  fields?: LogFields,
): Promise<T> {
  const start = Date.now();
  logger.debug(`${operation} start`, fields);
  try {
    const result = await fn();
    logger.info(`${operation} ok`, { ...fields, duration_ms: Date.now() - start });
    return result;
  } catch (err) {
    logger.error(`${operation} failed`, {
      ...fields,
      duration_ms: Date.now() - start,
      error: err,
    });
    throw err;
  }
}
