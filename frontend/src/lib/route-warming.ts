export interface ConnectionHints {
  effectiveType?: string;
  saveData?: boolean;
}

export interface RouteWarmingStrategy {
  initialDelayMs: number;
  betweenRoutesMs: number;
  idleTimeoutMs: number;
}

/**
 * Background document warming must yield to the route the user actually
 * requested. Slow/data-saver connections still warm every offline route, but
 * do so later and with a wider gap so they do not monopolize the radio.
 */
export function resolveRouteWarmingStrategy(connection?: ConnectionHints): RouteWarmingStrategy {
  const isConstrained = connection?.saveData === true
    || connection?.effectiveType === "slow-2g"
    || connection?.effectiveType === "2g"
    || connection?.effectiveType === "3g";

  return isConstrained
    ? { initialDelayMs: 10_000, betweenRoutesMs: 1_000, idleTimeoutMs: 5_000 }
    : { initialDelayMs: 3_000, betweenRoutesMs: 150, idleTimeoutMs: 2_000 };
}
