/**
 * State Mode configuration for Sioona (CB-10).
 * In production mode, Postgres is the only writer for operational state.
 * JSON remains only for local demo mode.
 * Production refuses json-demo at boot.
 */

export type StateMode = "postgres" | "json-demo";

export class ProductionRefusesJsonDemoError extends Error {
  constructor(
    message = "Production refuses json-demo state mode; operational state must use Postgres."
  ) {
    super(message);
    this.name = "ProductionRefusesJsonDemoError";
  }
}

export function isProductionEnvironment(): boolean {
  return (
    process.env.SIOONA_ENV === "production" ||
    process.env.VERCEL_ENV === "production"
  );
}

export function getStateMode(): StateMode {
  const configured = process.env.SIOONA_STATE_MODE?.trim().toLowerCase();
  if (configured === "postgres") {
    return "postgres";
  }
  if (configured === "json-demo") {
    if (isProductionEnvironment()) {
      throw new ProductionRefusesJsonDemoError();
    }
    return "json-demo";
  }
  if (configured && configured !== "") {
    throw new Error(
      `Invalid SIOONA_STATE_MODE: "${configured}". Allowed values are "postgres" or "json-demo".`
    );
  }
  // Default: postgres in production, json-demo in non-production.
  return isProductionEnvironment() ? "postgres" : "json-demo";
}

export function assertValidStateModeAtBoot(): StateMode {
  return getStateMode();
}
