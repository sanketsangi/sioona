/**
 * Structural intent patterns for Detect.
 *
 * These encode product rules (first-product lead, close/switch retention,
 * same-id adjacent upsell, fraud/complaint → none) without copying
 * conversation ids, customer names, or held-out planted phrases.
 * Precision-first: ticket/chat/login/document ops must not fire; competitor
 * names only with I'm/sitting/already/now/considering (not "research on Angel").
 */

import type { SignalType } from "./types";

export type PatternHit = {
  label: string;
  span: string;
};

/** India broking competitors — used in retention soft-switch patterns. */
const COMPETITOR =
  "(?:angel(?:\\s+one)?|upstox|dhan|kuvera|fyers|groww)";

/**
 * Leave/switch/use/prefer intent before other/another venue.
 * Shared so another-venue cannot drift behind other-app (use/using, prefer).
 * Bare "another/other app" ops mentions must still miss.
 */
const SWITCH_VENUE_INTENT =
  "(?:switch(?:ing)?(?:\\s+to)?|mov(?:e|ing)(?:\\s+to)?|shift(?:ing)?(?:\\s+to)?|try|leave|leaving|install(?:ing)?|go(?:ing)?(?:\\s+to)?|tak(?:e|ing)\\s+.{0,28}\\s+to|park(?:ing)?\\s+.{0,40}\\s+on|apply(?:ing)?\\s+(?:from|on|via|with)|us(?:e|ing)|prefer(?:ring)?)";

/** Competitor must sit within this many chars of a soft family-switch phrase. */
const FAMILY_COMPETITOR_NEAR = 100;

function nearCompetitor(phrase: string): RegExp {
  return new RegExp(
    `(?:\\b${COMPETITOR}\\b.{0,${FAMILY_COMPETITOR_NEAR}}${phrase}|${phrase}.{0,${FAMILY_COMPETITOR_NEAR}}\\b${COMPETITOR}\\b)`,
    "i"
  );
}

const LEAD_PATTERNS: Array<{ label: string; re: RegExp }> = [
  {
    label: "first-product",
    re: /\b(?:my )?first\s+(?:time\s+buying\s+|time\s+)?(?:digital\s+)?(?:\w+\s+){0,1}(?:fd|elss|sip|etf|gold|stock|demat|credit card|delivery buy|f&o|fno|ipo|cnc)\b/i,
  },
  {
    label: "never-traded",
    re: /\bnever\s+(?:bought|traded|used|invested|placed|did)\b/i,
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
  {
    label: "dont-have-broker-yet",
    re: /\bdon'?t have\s+(?:a\s+)?(?:zerodha|groww|demat|account)\s+yet\b/i,
  },
  {
    label: "open-broker",
    re: /\b(?:can i |want to |how do i )?open\s+(?:a\s+)?zerodha\b|\bopening zerodha\b|\bnew zerodha\b|\benough to open\b/i,
  },
  {
    label: "joint-demat-open",
    // Multi-person on one demat / opening together
    re: /\b(?:three|two|both).{0,24}on one demat\b|\bjoint demat\b/i,
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
    // Switch/leave/use TO the other app — not "PLAID from another app" / "any other app linked"
    re: new RegExp(
      `\\b${SWITCH_VENUE_INTENT}\\s+(?:the )?other (?:app|broker|platform)\\b`,
      "i"
    ),
  },
  {
    label: "another-venue",
    // Same verb gate as other-app, plus finish/complete-at / funds-to extras.
    // Bare "another app/broker" is ops/micro-deposit noise.
    re: new RegExp(
      `\\b(?:${SWITCH_VENUE_INTENT}|funds?\\s+to|finish(?:ing)?\\s+.{0,40}\\sat|complete\\s+.{0,40}\\sat)\\s+another (?:broker|app|platform|dp)\\b`,
      "i"
    ),
  },
  {
    label: "try-competitor",
    re: new RegExp(
      `\\btry\\s+(?:another|the other|${COMPETITOR})\\b`,
      "i"
    ),
  },
  {
    label: "already-on-competitor",
    re: new RegExp(`\\balready on\\s+${COMPETITOR}\\b`, "i"),
  },
  {
    label: "move-assets-to-competitor",
    re: new RegExp(
      `\\b(?:mfs?|sips?|funds|holdings|equity|options|portfolio|folio|stocks)\\s+to\\s+(?:${COMPETITOR}|another|elsewhere)\\b`,
      "i"
    ),
  },
  {
    label: "parking-elsewhere",
    re: new RegExp(
      `\\bparking\\s+.{0,36}\\s+on\\s+(?:${COMPETITOR}|another)\\b`,
      "i"
    ),
  },
  {
    label: "folio-elsewhere",
    re: /\b(?:shift(?:ing)? the folio|folio elsewhere)\b/i,
  },
  {
    label: "pause-trading",
    // Pause segment / SIPs / account — not "pause the video"
    re: /\bpause\s+(?:trading|this account|gold|sips?|f&o|fno|coin sips?|here)\b/i,
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
    re: new RegExp(`\\bfilling\\s+${COMPETITOR}\\b`, "i"),
  },
  {
    label: "considering-competitor",
    // Soft switch: "Considering Dhan for morning CNC" — not bare research compare
    re: new RegExp(`\\bconsidering\\s+${COMPETITOR}\\b`, "i"),
  },
  {
    label: "on-competitor",
    // "I'm / sitting / already on Dhan" — not "research on Angel" / "blog on Upstox"
    re: new RegExp(
      `\\b(?:i'?m|sitting|already|still|now) on\\s+${COMPETITOR}\\b`,
      "i"
    ),
  },
  {
    label: "closing-broker",
    // Close the broker product — not "close this ticket/chat"
    re: /\bclos(?:e|ing)\s+(?:zerodha|kite|groww|everything|this fortnight)\b/i,
  },
  {
    label: "im-closing",
    // Bare "I'm closing." after friction — not "I'm closing this ticket"
    re: /\bi'?m closing(?!\s+(?:this\s+)?(?:ticket|chat|request|issue|thread|incident))\b/i,
  },
  {
    label: "exit-broker",
    re: /\b(?:i'?ll\s+)?exit\s+(?:zerodha|kite|groww|upstox|dhan)\b/i,
  },
  {
    label: "closure-cum-transfer",
    re: /\bclosure[- ]cum[- ]transfer\b/i,
  },
  {
    label: "done-with-products",
    re: /\bdone with\s+(?:kite|coin|zerodha|groww)\b/i,
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
    label: "family-forwarding-competitor",
    // Family pushing competitor research/advice — not bare "research on Angel"
    re: new RegExp(
      `\\b(?:dad|mom|father|mother|husband|wife|parents?)\\b.{0,100}\\b(?:forward(?:ing)?|push(?:ing)?|recommend(?:ing)?)\\b.{0,48}\\b${COMPETITOR}\\b`,
      "i"
    ),
  },
  {
    label: "might-listen-family",
    // Soft switch under ops friction — competitor must be nearby, not bare
    // "might just listen to him".
    re: nearCompetitor(
      "\\bmight just listen to (?:him|her|them|dad|mom|father|mother)\\b"
    ),
  },
  {
    label: "family-winning-switch",
    // "dad is winning" only with a competitor in the nearby window.
    re: nearCompetitor(
      "\\b(?:dad|mom|father|mother|husband|wife)\\s+is winning\\b"
    ),
  },
  {
    label: "conditional-churn",
    re: new RegExp(
      `\\bif this\\s+.{0,80}\\b(?:leave|shift|try|pause|parking|other app|another (?:app|broker)|sit out|close|${COMPETITOR})\\b`,
      "i"
    ),
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
    // Pledge holdings for margin — allow a longer span for MF+stocks wording
    re: /\bpledge\s+.{0,56}\b(?:margin|mtf|f&o)\b/i,
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
  {
    label: "add-currency-pair",
    re: /\badd\s+(?:eurinr|usdinr|currency)\b/i,
  },
  {
    label: "enable-ddpi",
    re: /\benable ddpi\b/i,
  },
  {
    label: "want-smallcase",
    re: /\bwant\s+a?\s*smallcase\b|\brun a smallcase\b|\btry (?:a |one )?smallcase\b/i,
  },
  {
    label: "lumpsum-ask",
    // Existing SIP/fund + lumpsum — not bare "what is lumpsum"
    re: /\b(?:want|add|do)\s+.{0,48}\blumpsum\b|\blumpsum\s+.{0,40}\b(?:same|fund|sip|coin)\b/i,
  },
  {
    label: "second-fund",
    re: /\bsecond fund\b/i,
  },
  {
    label: "bump-sip-amount",
    // Amount / investment bump — not "increase my SIP date"
    re: /\bwant\s+₹?\d[\d,]*(?:\.\d+)?\s+from next month\b|\bbump (?:it |sip )?(?:to|up)\b|\bincrease (?:my |the )?(?:monthly )?investment\b|\bincrease .{0,20}sip (?:to|by|amount|from)\b/i,
  },
  {
    label: "want-connect-api",
    re: /\b(?:want|need)\s+(?:kite\s+)?connect\b|\bkite connect api\b/i,
  },
  {
    label: "family-own-id",
    // Existing customer helping a family member open their own login
    re: /\b(?:father|mother|dad|mom|wife|husband|son|daughter)\s+wants?\s+(?:his|her|their)\s+own\s+(?:id|account|login|demat)\b/i,
  },
  {
    label: "price-alerts",
    re: /\b(?:want|need|set)\s+.{0,24}(?:price |% |percent )?move alerts?\b|\balerts? on nifty\b/i,
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
  return FRAUD_COMPLAINT_PATTERNS.some((re) => re.test(text));
}

/**
 * True when a matched span is locally negated (never / not / no longer /
 * without / don't … immediately before the match, with optional really /
 * been / even). Used so "never interested in insurance" and "no longer
 * interested in insurance" do not fire upsell.
 */
export function isNegatedMatch(text: string, matchIndex: number): boolean {
  const before = text.slice(Math.max(0, matchIndex - 32), matchIndex);
  return /(?:\bno longer|\bwithout)(?:\s+\w+){0,2}\s+$|\b(?:never|not|no|don'?t|doesn'?t|didn'?t|won'?t|wasn'?t|isn'?t|cannot|can'?t)(?:\s+(?:really|been|even))?\s+$/i.test(
    before
  );
}

export function matchIntentPatterns(
  text: string,
  type: SignalType
): PatternHit[] {
  const hits: PatternHit[] = [];
  for (const { label, re } of PATTERNS_BY_TYPE[type]) {
    const match = re.exec(text);
    if (!match || match.index === undefined) continue;
    if (isNegatedMatch(text, match.index)) continue;
    const span = match[0].replace(/\s+/g, " ").trim();
    if (!span) continue;
    hits.push({ label, span: span.slice(0, 80) });
  }
  return hits;
}
