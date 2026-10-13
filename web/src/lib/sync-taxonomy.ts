/**
 * Neon copy of Adapt phrase overrides.
 * Skipped in Vitest unless SIOONA_TAXONOMY_NEON=1 so route tests stay offline.
 */

import {
  getTaxonomyOverrides,
  putTaxonomyOverrides,
  type BackendTaxonomyTypeOverride,
} from "./backend-client";
import type { TaxonomyOverrides, TaxonomyTypeOverride } from "./types";
import { getStateMode } from "./state-mode";

export function taxonomyNeonEnabled(): boolean {
  if (process.env.SIOONA_TAXONOMY_NEON === "0") return false;
  if (process.env.SIOONA_TAXONOMY_NEON === "1") return true;
  if (process.env.VITEST === "true") return false;
  if (getStateMode() === "postgres") return true;
  return (
    Boolean(process.env.BACKEND_URL?.trim()) || process.env.VERCEL === "1"
  );
}

function toBackend(
  overrides: TaxonomyOverrides,
): Record<string, BackendTaxonomyTypeOverride> {
  const out: Record<string, BackendTaxonomyTypeOverride> = {};
  for (const type of ["lead", "retention", "upsell"] as const) {
    const row = overrides[type];
    if (!row) continue;
    out[type] = {
      phrases: row.phrases ?? [],
      keywords: row.keywords ?? [],
      negative_phrases: row.negativePhrases ?? [],
    };
  }
  return out;
}

function fromBackend(
  overrides: Record<string, BackendTaxonomyTypeOverride>,
): TaxonomyOverrides {
  const out: TaxonomyOverrides = {};
  for (const type of ["lead", "retention", "upsell"] as const) {
    const row = overrides[type];
    if (!row) continue;
    const next: TaxonomyTypeOverride = {};
    if (row.phrases?.length) next.phrases = row.phrases;
    if (row.keywords?.length) next.keywords = row.keywords;
    if (row.negative_phrases?.length) next.negativePhrases = row.negative_phrases;
    if (Object.keys(next).length > 0) out[type] = next;
  }
  return out;
}

export async function syncTaxonomyOverridesToBackend(
  tenantId: string,
  overrides: TaxonomyOverrides,
): Promise<void> {
  if (!taxonomyNeonEnabled()) {
    if (getStateMode() === "postgres") {
      throw new Error("Canonical taxonomy destination disabled; mutation refused.");
    }
    return;
  }
  try {
    if (getStateMode() === "postgres") {
      await putTaxonomyOverrides(tenantId, toBackend(overrides), { merge: true });
    } else {
      await putTaxonomyOverrides(tenantId, toBackend(overrides));
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Neon write failed";
    throw new Error(`Could not save taxonomy overrides to Neon. ${detail}`);
  }
}

export async function taxonomyOverridesFromNeon(
  tenantId: string,
): Promise<TaxonomyOverrides | null> {
  if (!taxonomyNeonEnabled()) {
    if (getStateMode() === "postgres" && process.env.SIOONA_TAXONOMY_NEON === "0") {
      throw new Error("Canonical taxonomy destination disabled; mutation refused.");
    }
    return null;
  }
  try {
    return fromBackend(await getTaxonomyOverrides(tenantId));
  } catch (err) {
    if (getStateMode() === "postgres") {
      throw new Error(
        "Canonical taxonomy read unavailable; retry the request.",
      );
    }
    const detail = err instanceof Error ? err.message : "Neon read failed";
    throw new Error(`Could not load taxonomy overrides from Neon. ${detail}`);
  }
}
