type LogFields = Record<string, string | number | boolean | null | undefined>;

function clean(fields: LogFields): LogFields {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
}

export const logger = {
  info(message: string, fields: LogFields = {}) {
    console.log(`[backend] ${message}`, clean(fields));
  },
  warn(message: string, fields: LogFields = {}) {
    console.warn(`[backend] ${message}`, clean(fields));
  },
  error(message: string, fields: LogFields = {}, cause?: unknown) {
    const error = cause instanceof Error ? cause.message : cause === undefined ? undefined : String(cause);
    console.error(`[backend] ${message}`, clean({ ...fields, error }));
  },
};
