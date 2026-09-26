import { matchIntentPatterns } from "./detect-patterns";
import { formatEvidenceItem, formatScore } from "./format";
import { getTaxonomy } from "./taxonomy";
import type { SignalType } from "./types";

/** How a stored heuristic hit cleared the bar. */
export type FiredRuleKind = "phrase" | "keywords" | "pattern";

const PHRASE_ITEM = /^phrase:\s*"([^"]+)"$/;
const KEYWORD_ITEM = /^keyword:\s*"([^"]+)"$/;

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function taxonomyPhraseSet(type: SignalType): Set<string> {
  return new Set(getTaxonomy(type).phrases.map((phrase) => normalize(phrase)));
}

/**
 * A `phrase:` span that is not a taxonomy phrase and re-matches a structural
 * intent pattern. Detect stores those spans with the same prefix as lexicon
 * phrases; this reads that evidence without a new detect pass.
 */
export function isStructuralPatternSpan(
  span: string,
  type: SignalType,
): boolean {
  const text = normalize(span);
  if (!text || taxonomyPhraseSet(type).has(text)) return false;
  return matchIntentPatterns(text, type).length > 0;
}

/**
 * Phrase when a lexicon (or other non-pattern) phrase is stored.
 * Structural pattern when the only phrase spans are intent-pattern matches.
 * Two keywords when there is no phrase and at least two keyword items.
 */
export function firedRuleKind(
  evidence: string[],
  type: SignalType,
): FiredRuleKind | null {
  let lexicon = false;
  let structural = false;
  let keywords = 0;

  for (const item of evidence) {
    const phrase = item.match(PHRASE_ITEM);
    if (phrase?.[1]) {
      if (isStructuralPatternSpan(phrase[1], type)) structural = true;
      else lexicon = true;
      continue;
    }
    if (KEYWORD_ITEM.test(item)) keywords += 1;
  }

  if (lexicon) return "phrase";
  if (structural) return "pattern";
  if (keywords >= 2) return "keywords";
  return null;
}

export function firedRuleLabel(kind: FiredRuleKind): string {
  switch (kind) {
    case "phrase":
      return "Phrase";
    case "keywords":
      return "Two keywords";
    case "pattern":
      return "Structural pattern";
  }
}

/** Sentence under Why This Fired. */
export function firedRuleSentence(kind: FiredRuleKind): string {
  switch (kind) {
    case "phrase":
      return "Hit was a phrase.";
    case "keywords":
      return "Hit was two keywords.";
    case "pattern":
      return "Hit was a structural pattern.";
  }
}

/** Match-chip text. Structural spans stay distinguishable from lexicon phrases. */
export function evidenceMatchText(item: string, type: SignalType): string {
  const parsed = formatEvidenceItem(item);
  const phrase = item.match(PHRASE_ITEM);
  if (phrase?.[1] && isStructuralPatternSpan(phrase[1], type)) {
    return `Structural pattern · ${phrase[1]}`;
  }
  return parsed.text;
}

/**
 * Accessible name for `SignalScoreChip`. The digits stay the stored heuristic
 * score; the name calls that rule strength, not a model probability.
 */
export function scoreChipAccessibleName(
  score: number,
  evidence?: string[],
  type?: SignalType,
): string {
  const digits = formatScore(score);
  const kind =
    evidence && type ? firedRuleKind(evidence, type) : null;
  if (!kind) return `Rule strength ${digits}`;
  return `${firedRuleLabel(kind)}, rule strength ${digits}`;
}
