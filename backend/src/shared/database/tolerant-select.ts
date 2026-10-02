import { logger } from "../logging/logger.js";

export interface TolerantSelectOptions {
  table: string;
  baseColumns: string[];
  evolutionaryColumns?: string[];
}

/**
 * Resilient schema-tolerant query executor for PostgREST / PostgreSQL.
 *
 * Prevents zero-downtime deployment races where application code is deployed
 * before database migrations have executed. If PostgREST returns error 42703
 * ('undefined_column' or 'column does not exist'), this helper automatically
 * logs a structured warning and falls back to querying the baseColumns.
 */
export async function tolerantSelect<T extends Record<string, unknown>>(
  runQuery: (columns: string) => PromiseLike<{ data: unknown[] | null; error: { code?: string; message?: string } | null }>,
  options: TolerantSelectOptions
): Promise<T[]> {
  const { table, baseColumns, evolutionaryColumns = [] } = options;

  if (evolutionaryColumns.length === 0) {
    const { data, error } = await runQuery(baseColumns.join(", "));
    if (error) throw error;
    return (data ?? []) as T[];
  }

  const fullProjection = [...baseColumns, ...evolutionaryColumns].join(", ");
  const { data, error } = await runQuery(fullProjection);

  if (!error) {
    return (data ?? []) as T[];
  }

  const isUndefinedColumn =
    error.code === "42703" ||
    (typeof error.message === "string" && error.message.toLowerCase().includes("does not exist"));

  if (isUndefinedColumn) {
    logger.warn(`Schema evolution tolerance triggered for ${table}; falling back to base columns`, {
      table,
      evolutionaryColumns: evolutionaryColumns.join(", "),
      error: error.message ?? null,
    });

    const fallbackProjection = baseColumns.join(", ");
    const fallback = await runQuery(fallbackProjection);
    if (fallback.error) {
      throw fallback.error;
    }
    return (fallback.data ?? []) as T[];
  }

  throw error;
}
