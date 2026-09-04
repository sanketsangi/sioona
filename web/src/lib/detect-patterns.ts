/**
 * Structural intent patterns for Detect.
 *
 * These encode product rules (first-product lead, close/switch retention,
 * same-id adjacent upsell, fraud/complaint → none) without copying
 * conversation ids, customer names, or held-out planted phrases.
 * Precision-first: ticket/chat/login/document ops must not fire; competitor
 * names only with I'm/sitting/already/now (not "research on Angel").
 */

import type { SignalType } from "./types";

export type PatternHit = {
  label: string;
  span: string;
};

const LEAD_PATTERNS: Array<{ label: string; re: RegExp }> = [
  {
    label: "first-product",
    re: /\b(?:my )?first\s+(?:time\s+buying\s+|time\s+)?(?:digital\s+)?(?:\w+\s+){0,1}(?:fd|elss|sip|etf|gold|stock|demat|credit card|delivery buy)\b/i,
  },
  {
    label: "never-traded",
    re: /\bnever\s+(?:bought|traded|used|invested|placed)\b/i,
  },
  {
    label: "starting-fresh",
    re: /\bstarting fresh\b/i,
  },
  {
    label: "opening-own",
    re: /\bopening my own\b/i,
  },
  {
    label: "first-buy-walkthrough",
    re: /\bwalk me through first\b/i,
  },
  {
    label: "onboarding-again",
    re: /\b(?:finish|complete|restart)\s+onboarding\b/i,
  },
  {
    label: "enable-stocks",
    re: /\b(?:turn on|enable)\s+stocks\b/i,
  },
  {
    label: "want-etf",
    // "want … ETF" as a buy, not "want to know why my ETF NAV …"
    re: /\bwant(?!\s+to (?:know|check|see|understand)\b)\s+.{0,36}\b(?:one )?(?:index )?etf\b/i,
  },
];

const RETENTION_PATTERNS: Array<{ label: string; re: RegExp }> = [
  {
    label: "need-closed",
    // Account/broker close — not "need this ticket/chat closed"
    re: /\b(?:need|get|keep|want)\s+(?:(?!\b(?:ticket|chat|request|issue|thread|incident)\b).){0,40}\bclosed\b/i,
  },
  {
    label: "start-closure",
    re: /\b(?:start|raise|begin)\s+.{0,28}\bclosure\b/i,
  },
  {
    label: "closing-to-consolidate",
    re: /\bclosing\s+\w+\s+so\b/i,
  },
  {
    label: "delete-close",
    re: /\b(?:delete\s*\/\s*close|delete or close)\b/i,
  },
  {
    label: "close-account-please",
    re: /\bclose\s+(?:my |the )?(?:account|demat|wallet|card|folio)\s+please\b/i,
  },
  {
    label: "stop-everything",
    re: /\bstop everything\b/i,
  },
  {
    label: "other-app",
    re: /\b(?:the )?other (?:app|broker|platform)\b/i,
  },
  {
    label: "another-venue",
    re: /\banother (?:broker|app|platform|dp)\b/i,
  },
  {
    label: "try-competitor",
    re: /\btry\s+(?:another|the other|upstox|dhan|angel|kuvera|fyers)\b/i,
  },
  {
    label: "already-on-competitor",
    re: /\balready on\s+(?:upstox|dhan|angel|kuvera|fyers)\b/i,
  },
  {
    label: "move-assets-to-competitor",
    re: /\b(?:mfs?|sips?|funds|holdings|equity|options|portfolio|folio|stocks)\s+to\s+(?:upstox|dhan|angel|kuvera|fyers|another|elsewhere)\b/i,
  },
  {
    label: "parking-elsewhere",
    re: /\bparking\s+.{0,36}\s+on\s+(?:kuvera|upstox|dhan|angel|another)\b/i,
  },
  {
    label: "folio-elsewhere",
    re: /\b(?:shift(?:ing)? the folio|folio elsewhere)\b/i,
  },
  {
    label: "pause-trading",
    re: /\bpause (?:trading|this account|gold|sips?)\b/i,
  },
  {
    label: "leave-the-app",
    re: /\b(?:leave|leaving)\s+.{0,24}(?:the )?(?:app|broker|platform|wallet)\b/i,
  },
  {
    label: "stop-using",
    re: /\bstop using\b/i,
  },
  {
    label: "filling-competitor",
    re: /\bfilling\s+(?:angel|upstox|dhan|kuvera|fyers)\b/i,
  },
  {
    label: "on-competitor",
    // "I'm / sitting / already on Dhan" — not "research on Angel" / "blog on Upstox"
    re: /\b(?:i'?m|sitting|already|still|now) on\s+(?:dhan|upstox|angel|kuvera|fyers)\b/i,
  },
  {
    label: "wont-keep-here",
    re: /\bwon'?t keep (?:it )?here\b/i,
  },
  {
    label: "not-adding-funds",
    re: /\bnot adding\s+a?\s*(?:rupee|rs|inr|money|funds)\b/i,
  },
  {
    label: "sit-out",
    re: /\bsit out\b/i,
  },
  {
    label: "conditional-churn",
    re: /\bif this\s+.{0,80}\b(?:leave|shift|try|pause|parking|other app|another (?:app|broker)|sit out|close|angel|upstox|dhan|kuvera|fyers)\b/i,
  },
];

const UPSELL_PATTERNS: Array<{ label: string; re: RegExp }> = [
  {
    label: "family-view",
    // Ask for a family product surface — not "family view of the ticket"
    re: /\b(?:is there a family view|want a family view|need a family view|family (?:login|profile|folio|account))\b/i,
  },
  {
    label: "do-you-also",
    // "do you also have weekend hours / an office" is ops; sell/offer/provide is product
    re: /\bdo you also\s+(?:sell|offer|provide)\b|\bdo you also have\s+.{0,40}\b(?:insurance|fd|mtf|gold|commodity|advisory|sip|etf|pms|aif)\b/i,
  },
  {
    label: "can-i-also",
    // "can I also get a statement / contract note" is ops; start/add/buy is adjacent product
    re: /\bcan i also\s+(?:start|add|buy|open|enable)\b/i,
  },
  {
    label: "turn-on-mtf",
    // Request to enable MTF — not "Turn on MTF is stuck on loading"
    re: /\b(?:can i|want to|please|how do i|able to)\s+turn on mtf\b/i,
  },
  {
    label: "pledge-margin",
    re: /\bpledge\s+.{0,32}\b(?:margin|mtf)\b/i,
  },
  {
    label: "increase-margin",
    re: /\bincrease\s+(?:my |the |overnight )?margin\b/i,
  },
  {
    label: "term-insurance",
    // Buy/offer intent — not "where is my term insurance policy PDF"
    re: /\b(?:sell|offer|buy|add|get|start|want|need|looking at|interested in)\s+.{0,28}term insurance\b/i,
  },
  {
    label: "same-login",
    // Same-id adjacent product — not "same login isn't working"
    re: /\b(?:(?:insurance|fd|mtf|gold|sip|commodity|family|pledge|margin|etf|advisory).{0,56}same (?:id|login)|same (?:id|login).{0,56}(?:insurance|fd|mtf|gold|sip|commodity|family|pledge|margin|etf|advisory))\b/i,
  },
  {
    label: "already-have-adjacent",
    re: /\balready\s+(?:have|has|on|do|use)\b.{0,56}\b(?:can i|parking|pledge|also|fd|insurance|mtf|commodity|gold buy)\b/i,
  },
  {
    label: "commodity-available",
    re: /\b(?:commodity|crude)\b.{0,28}\b(?:available|enable|activate|add)\b/i,
  },
];

const PATTERNS_BY_TYPE: Record<SignalType, Array<{ label: string; re: RegExp }>> =
  {
    lead: LEAD_PATTERNS,
    retention: RETENTION_PATTERNS,
    upsell: UPSELL_PATTERNS,
  };

/**
 * Phishing / unauthorized / dispute language. Product maps fraud+complaint → none.
 * Suppresses lead and upsell; retention may still fire if the customer is leaving.
 */
const FRAUD_COMPLAINT_PATTERNS: RegExp[] = [
  /\b(?:unauthori[sz]ed|fraud|scam|phish(?:ing)?)\b/i,
  /\breport(?:ing)? fraud\b/i,
  /\bdispute (?:this |the )?(?:charge|transaction|debit)\b/i,
  /\bcharged without\b/i,
  /\bdidn'?t (?:authori[sz]e|approve|sign up for|buy this)\b/i,
  /\bnever (?:authori[sz]ed|signed up for)\b/i,
  /\b(?:asked for|asking for|read (?:me )?the)\s+.{0,28}(?:otp|tpin|authenticator|sms code)\b/i,
  /\bfake (?:app|apk|site|login)\b/i,
  /\b(?:telegram|whatsapp).{0,48}(?:otp|tpin|password|apk)\b/i,
];

export function isFraudComplaintText(text: string): boolean {
  return FRAUD_COMPLAINT_PATTERNS.some((re) => {
    re.lastIndex = 0;
    return re.test(text);
  });
}

/** True when `term` at `index` is under a local negation (never/not/didn't …). */
export function isNegatedMatch(text: string, index: number): boolean {
  if (index <= 0) return false;
  const window = text.slice(Math.max(0, index - 24), index);
  return /(?:^|[^a-z0-9])(?:not|never|no longer|without|didn'?t|doesn'?t|don'?t|wasn'?t|isn'?t|can'?t)\s+(?:really\s+|been\s+|even\s+)?$/i.test(
    window
  );
}

export function matchIntentPatterns(
  text: string,
  type: SignalType
): PatternHit[] {
  const hits: PatternHit[] = [];
  for (const { label, re } of PATTERNS_BY_TYPE[type]) {
    re.lastIndex = 0;
    const match = re.exec(text);
    if (!match?.[0]) continue;
    if (isNegatedMatch(text, match.index)) continue;
    hits.push({
      label,
      span: match[0].replace(/\s+/g, " ").trim(),
    });
  }
  return hits;
}
