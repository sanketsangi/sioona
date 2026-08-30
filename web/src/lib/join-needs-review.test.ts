import { describe, expect, it } from "vitest";
import type {
  BackendPrediction,
  BackendPredictionWithFeedback,
} from "./backend-client";
import {
  applyChatEvidenceToSignals,
  doneSignals,
  filterPendingWithChat,
  followUpSignals,
  joinNeedsReviewPredictions,
  keepSetConversationIds,
  joinTenantSignals,
  missingConversationIds,
  pendingQueueSignals,
  predictionToStubSignal,
  queueSignalsForFilter,
  quotesFromCustomerMessages,
  resolvePreviewSignal,
  reviewedQueueSignals,
  reviewedSignalsFromStore,
} from "./join-needs-review";
import {
  GROWW_TESTING_JSON_EXTERNAL_ID,
  ZERODHA_BATCH02_EXTERNAL_ID,
} from "./testing-json-eval";
import type { Conversation, Message, Signal } from "./types";

/** Stable ids from Groww testing.json vs Zerodha Batch-02 (Partner Demo pack split). */
const GROWW_CONV_ID = `conv_${GROWW_TESTING_JSON_EXTERNAL_ID}`;
const ZERODHA_CONV_ID = `conv_${ZERODHA_BATCH02_EXTERNAL_ID}`;

const prediction = (
  overrides: Partial<BackendPrediction> & Pick<BackendPrediction, "id">
): BackendPrediction => ({
  tenant_id: "tenant_demo",
  conversation_id: "conv_1",
  signal_type: "lead",
  confidence: 0.9,
  summary: "Buying intent",
  created_at: "2026-08-01T00:00:00.000Z",
  ...overrides,
});

const baseSignal: Signal = {
  id: "sig_local_1",
  tenantId: "tenant_demo",
  conversationId: "conv_1",
  type: "lead",
  score: 0.9,
  confidence: 0.9,
  summary: "Local summary",
  suggestedAction: "Follow up",
  evidence: ["quote"],
  status: "new",
  createdAt: "2026-08-01T00:00:00.000Z",
};

describe("joinNeedsReviewPredictions", () => {
  it("joins by backendSignalId and preserves Neon order", () => {
    const preds = [
      prediction({ id: "bbb", conversation_id: "conv_2", signal_type: "upsell" }),
      prediction({ id: "aaa", conversation_id: "conv_1", signal_type: "lead" }),
    ];
    const json: Signal[] = [
      {
        ...baseSignal,
        id: "sig_a",
        backendSignalId: "aaa",
        conversationId: "conv_1",
        type: "lead",
      },
      {
        ...baseSignal,
        id: "sig_b",
        backendSignalId: "bbb",
        conversationId: "conv_2",
        type: "upsell",
        summary: "Upsell local",
        evidence: ["upsell quote"],
      },
    ];

    const joined = joinNeedsReviewPredictions(preds, json);
    expect(joined.map((s) => s.id)).toEqual(["sig_b", "sig_a"]);
    expect(joined[0].evidence).toEqual(["upsell quote"]);
    expect(joined[0].backendSignalId).toBe("bbb");
  });

  it("falls back to conversationId + signal_type", () => {
    const preds = [prediction({ id: "neon-1" })];
    const json: Signal[] = [{ ...baseSignal, id: "sig_match" }];

    const [joined] = joinNeedsReviewPredictions(preds, json);
    expect(joined.id).toBe("sig_match");
    expect(joined.backendSignalId).toBe("neon-1");
    expect(joined.evidence).toEqual(["quote"]);
  });

  it("keeps unmatched Neon predictions as stubs", () => {
    const preds = [
      prediction({
        id: "orphan",
        conversation_id: "conv_x",
        summary: "Neon only",
      }),
    ];
    const joined = joinNeedsReviewPredictions(preds, [baseSignal]);
    expect(joined).toHaveLength(1);
    expect(joined[0].id).toBe("sig_neon_orphan");
    expect(joined[0].conversationId).toBe("conv_x");
    expect(joined[0].summary).toBe("Neon only");
  });

  it("omits JSON matches that already have feedback", () => {
    const preds = [prediction({ id: "aaa" })];
    const json: Signal[] = [
      {
        ...baseSignal,
        backendSignalId: "aaa",
        feedback: {
          label: "correct",
          reviewedAt: "2026-08-02T00:00:00.000Z",
        },
        status: "reviewed",
      },
    ];
    const joined = joinNeedsReviewPredictions(preds, json);
    expect(joined).toHaveLength(0);
  });

  it("dedupes when multiple Neon predictions match one JSON signal", () => {
    const preds = [
      prediction({ id: "neon-first", created_at: "2026-08-03T00:00:00.000Z" }),
      prediction({ id: "neon-second", created_at: "2026-08-02T00:00:00.000Z" }),
    ];
    const json: Signal[] = [{ ...baseSignal, id: "sig_shared" }];

    const joined = joinNeedsReviewPredictions(preds, json);
    expect(joined).toHaveLength(1);
    expect(joined[0].id).toBe("sig_shared");
    expect(joined[0].backendSignalId).toBe("neon-first");
  });
});

describe("predictionToStubSignal", () => {
  it("maps prediction fields", () => {
    const stub = predictionToStubSignal(prediction({ id: "x" }));
    expect(stub.backendSignalId).toBe("x");
    expect(stub.type).toBe("lead");
  });
});

describe("reviewedSignalsFromStore", () => {
  it("keeps only signals with feedback", () => {
    const reviewed = reviewedSignalsFromStore([
      baseSignal,
      {
        ...baseSignal,
        id: "sig_r",
        feedback: {
          label: "incorrect",
          reviewedAt: "2026-08-02T00:00:00.000Z",
        },
      },
    ]);
    expect(reviewed.map((s) => s.id)).toEqual(["sig_r"]);
  });
});

describe("pendingQueueSignals", () => {
  it("keeps Neon join order then appends local unreviewed Neon missed", () => {
    const preds = [prediction({ id: "aaa" })];
    const json: Signal[] = [
      {
        ...baseSignal,
        id: "sig_neon",
        backendSignalId: "aaa",
      },
      {
        ...baseSignal,
        id: "sig_local_only",
        conversationId: "conv_local",
        summary: "Local only",
      },
      {
        ...baseSignal,
        id: "sig_reviewed",
        conversationId: "conv_done",
        feedback: {
          label: "correct",
          reviewedAt: "2026-08-02T00:00:00.000Z",
        },
      },
    ];

    const pending = pendingQueueSignals(preds, json);
    expect(pending.map((s) => s.id)).toEqual(["sig_neon", "sig_local_only"]);
  });

  it("surfaces keep-set locals after unmatched Neon stubs", () => {
    const preds = [
      prediction({
        id: "stale",
        conversation_id: "conv_other_pack",
      }),
    ];
    const json: Signal[] = [
      { ...baseSignal, id: "sig_a" },
      { ...baseSignal, id: "sig_b", conversationId: "conv_2", type: "retention" },
    ];

    const pending = pendingQueueSignals(preds, json);
    expect(pending.map((s) => s.id)).toEqual([
      "sig_neon_stale",
      "sig_a",
      "sig_b",
    ]);
  });
});

describe("filterPendingWithChat", () => {
  it("drops Neon stubs whose conversation is missing", () => {
    const pending = pendingQueueSignals(
      [prediction({ id: "stale", conversation_id: "conv_other_pack" })],
      [
        { ...baseSignal, id: "sig_a" },
        { ...baseSignal, id: "sig_b", conversationId: "conv_2", type: "retention" },
      ]
    );
    const filtered = filterPendingWithChat(pending, [
      {
        id: "conv_1",
        tenantId: "tenant_demo",
        channel: "whatsapp",
        startedAt: "2026-08-01T00:00:00.000Z",
        messageIds: [],
      },
      {
        id: "conv_2",
        tenantId: "tenant_demo",
        channel: "whatsapp",
        startedAt: "2026-08-01T00:00:00.000Z",
        messageIds: [],
      },
    ]);
    expect(filtered.map((s) => s.id)).toEqual(["sig_a", "sig_b"]);
  });

  it("keeps Neon stubs when overlay/store has the conversation", () => {
    const pending = pendingQueueSignals(
      [
        prediction({
          id: "hydrate",
          conversation_id: "conv_hydrated",
          summary: "After /tmp wipe",
        }),
      ],
      []
    );
    const filtered = filterPendingWithChat(pending, [
      {
        id: "conv_hydrated",
        tenantId: "tenant_demo",
        channel: "whatsapp",
        startedAt: "2026-08-01T00:00:00.000Z",
        messageIds: [],
      },
    ]);
    expect(filtered.map((s) => s.id)).toEqual(["sig_neon_hydrate"]);
  });
});

const tenantRow = (
  overrides: Partial<BackendPredictionWithFeedback> &
    Pick<BackendPredictionWithFeedback, "id">
): BackendPredictionWithFeedback => ({
  tenant_id: "tenant_demo",
  conversation_id: "conv_1",
  signal_type: "lead",
  confidence: 0.9,
  summary: "Buying intent",
  created_at: "2026-08-01T00:00:00.000Z",
  acted: false,
  feedback: {
    id: "fb-1",
    tenant_id: "tenant_demo",
    signal_id: overrides.id,
    feedback: "correct",
    note: null,
    reviewed_by: "shadow_reviewer",
    reviewed_at: "2026-08-02T00:00:00.000Z",
  },
  ...overrides,
});

describe("pendingQueueSignals Neon reviewed exclusion", () => {
  it("does not re-open JSON-unreviewed locals already reviewed in Neon", () => {
    const json: Signal[] = [
      {
        ...baseSignal,
        id: "sig_stale_instance",
        backendSignalId: "aaa",
      },
      {
        ...baseSignal,
        id: "sig_still_open",
        conversationId: "conv_open",
        backendSignalId: "open-pred",
      },
    ];
    const pending = pendingQueueSignals([], json, [
      tenantRow({
        id: "aaa",
        conversation_id: "conv_1",
        signal_type: "lead",
      }),
    ]);
    expect(pending.map((s) => s.id)).toEqual(["sig_still_open"]);
  });

  it("excludes stale JSON locals by conversation+type when backendSignalId is missing", () => {
    const json: Signal[] = [
      {
        ...baseSignal,
        id: "sig_no_backend_id",
        conversationId: "conv_1",
        type: "lead",
      },
    ];
    const pending = pendingQueueSignals([], json, [
      tenantRow({
        id: "neon-reviewed",
        conversation_id: "conv_1",
        signal_type: "lead",
      }),
    ]);
    expect(pending).toEqual([]);
  });
});

describe("joinTenantSignals", () => {
  it("keeps Neon-only Correct-not-Acted as a stub", () => {
    const rows = [
      tenantRow({
        id: "orphan",
        conversation_id: "conv_x",
        summary: "Neon only",
      }),
    ];
    const joined = joinTenantSignals(rows, [baseSignal]);
    expect(joined).toHaveLength(1);
    expect(joined[0].id).toBe("sig_neon_orphan");
    expect(joined[0].feedback?.label).toBe("correct");
    expect(joined[0].status).toBe("reviewed");
    expect(joined[0].evidence).toEqual([]);
  });

  it("prefers JSON evidence when ids match", () => {
    const rows = [tenantRow({ id: "aaa" })];
    const json: Signal[] = [
      {
        ...baseSignal,
        backendSignalId: "aaa",
        evidence: ["quote: \"local\""],
        suggestedAction: "Call back",
        feedback: {
          label: "correct",
          reviewedAt: "2026-08-02T00:00:00.000Z",
        },
        status: "reviewed",
      },
    ];
    const [joined] = joinTenantSignals(rows, json);
    expect(joined.id).toBe("sig_local_1");
    expect(joined.evidence).toEqual(["quote: \"local\""]);
    expect(joined.suggestedAction).toBe("Call back");
    expect(joined.backendSignalId).toBe("aaa");
  });

  it("skips unreviewed Neon rows", () => {
    const rows = [tenantRow({ id: "open", feedback: null })];
    expect(joinTenantSignals(rows, [baseSignal])).toHaveLength(0);
  });

  it("sets acted status from Neon", () => {
    const rows = [tenantRow({ id: "done", acted: true })];
    const [joined] = joinTenantSignals(rows, [
      { ...baseSignal, backendSignalId: "done" },
    ]);
    expect(joined.status).toBe("acted");
    expect(joined.feedback?.label).toBe("correct");
  });
});

describe("followUpSignals / doneSignals", () => {
  it("keeps Correct-not-Acted in follow-up and Acted in done", () => {
    const follow: Signal = {
      ...baseSignal,
      id: "sig_follow",
      status: "reviewed",
      feedback: { label: "correct", reviewedAt: "2026-08-02T00:00:00.000Z" },
    };
    const acted: Signal = {
      ...baseSignal,
      id: "sig_done",
      status: "acted",
      feedback: { label: "correct", reviewedAt: "2026-08-02T00:00:00.000Z" },
    };
    const wrong: Signal = {
      ...baseSignal,
      id: "sig_wrong",
      status: "reviewed",
      feedback: { label: "incorrect", reviewedAt: "2026-08-02T00:00:00.000Z" },
    };
    expect(followUpSignals([follow, acted, wrong]).map((s) => s.id)).toEqual([
      "sig_follow",
    ]);
    expect(doneSignals([follow, acted, wrong]).map((s) => s.id)).toEqual([
      "sig_done",
    ]);
  });
});

describe("resolvePreviewSignal", () => {
  it("prefers reviewed Correct over pending twin", () => {
    const pending: Signal = { ...baseSignal, id: "sig_same", status: "new" };
    const reviewed: Signal = {
      ...baseSignal,
      id: "sig_same",
      status: "reviewed",
      feedback: {
        label: "correct",
        reviewedAt: "2026-08-02T00:00:00.000Z",
      },
    };
    expect(resolvePreviewSignal("sig_same", [pending], [reviewed])).toEqual(
      reviewed,
    );
  });

  it("uses pending when only pending matches", () => {
    const pending: Signal = { ...baseSignal, id: "sig_p", status: "new" };
    expect(resolvePreviewSignal("sig_p", [pending], [])?.id).toBe("sig_p");
  });
});

describe("reviewedQueueSignals", () => {
  it("appends JSON reviewed rows Neon missed", () => {
    const rows = [tenantRow({ id: "aaa" })];
    const json: Signal[] = [
      { ...baseSignal, backendSignalId: "aaa" },
      {
        ...baseSignal,
        id: "sig_local_reviewed",
        conversationId: "conv_local",
        feedback: {
          label: "incorrect",
          reviewedAt: "2026-08-02T00:00:00.000Z",
        },
        status: "reviewed",
      },
    ];
    expect(reviewedQueueSignals(rows, json).map((s) => s.id)).toEqual([
      "sig_local_1",
      "sig_local_reviewed",
    ]);
  });
});

describe("Groww Neon vs Zerodha JSON keep-set mismatch", () => {
  /** JSON after Partner Demo (Zerodha only); Neon still has leftover Groww reviews. */
  const zerodhaJson: Signal[] = [
    {
      ...baseSignal,
      id: "sig_zerodha",
      conversationId: ZERODHA_CONV_ID,
      type: "retention",
      backendSignalId: "zerodha-pred",
    },
  ];

  it("pending drops Groww Neon stubs that have no Zerodha chat", () => {
    const preds = [
      prediction({
        id: "groww-stale",
        conversation_id: GROWW_CONV_ID,
        signal_type: "lead",
      }),
    ];
    const joined = pendingQueueSignals(preds, zerodhaJson);
    expect(joined.map((s) => s.id)).toEqual(["sig_neon_groww-stale", "sig_zerodha"]);
    const pending = filterPendingWithChat(joined, [
      {
        id: ZERODHA_CONV_ID,
        tenantId: "tenant_demo",
        channel: "whatsapp",
        startedAt: "2026-08-01T00:00:00.000Z",
        messageIds: [],
      },
    ]);
    expect(pending.map((s) => s.id)).toEqual(["sig_zerodha"]);
    expect(pending.every((s) => s.conversationId === ZERODHA_CONV_ID)).toBe(
      true
    );
  });

  it("Follow-up keeps Groww Neon Correct as a stub (not filtered by JSON keep-set)", () => {
    const rows = [
      tenantRow({
        id: "groww-correct",
        conversation_id: GROWW_CONV_ID,
        signal_type: "lead",
        summary: "Leftover Groww review",
      }),
    ];
    const reviewed = reviewedQueueSignals(rows, zerodhaJson);
    const followUp = followUpSignals(reviewed);
    expect(followUp).toHaveLength(1);
    expect(followUp[0].id).toBe("sig_neon_groww-correct");
    expect(followUp[0].conversationId).toBe(GROWW_CONV_ID);
    expect(followUp[0].feedback?.label).toBe("correct");
    expect(followUp[0].status).toBe("reviewed");
    const zerodhaOnlyChats: Conversation[] = [
      {
        id: ZERODHA_CONV_ID,
        tenantId: "tenant_demo",
        channel: "whatsapp",
        startedAt: "2026-08-01T00:00:00.000Z",
        messageIds: [],
      },
    ];
    expect(missingConversationIds(followUp, zerodhaOnlyChats)).toEqual([
      GROWW_CONV_ID,
    ]);
  });
});

describe("queueSignalsForFilter", () => {
  const pending: Signal[] = [{ ...baseSignal, id: "sig_p" }];
  const follow: Signal = {
    ...baseSignal,
    id: "sig_follow",
    type: "retention",
    status: "reviewed",
    feedback: { label: "correct", reviewedAt: "2026-08-02T00:00:00.000Z" },
  };
  const acted: Signal = {
    ...baseSignal,
    id: "sig_done",
    status: "acted",
    feedback: { label: "correct", reviewedAt: "2026-08-02T00:00:00.000Z" },
  };
  const reviewed = [follow, acted];

  it("splits follow-up and done", () => {
    expect(
      queueSignalsForFilter({
        pending,
        reviewed,
        status: "followup",
        type: "all",
      }).filtered.map((s) => s.id)
    ).toEqual(["sig_follow"]);
    expect(
      queueSignalsForFilter({
        pending,
        reviewed,
        status: "acted",
        type: "all",
      }).filtered.map((s) => s.id)
    ).toEqual(["sig_done"]);
  });

  it("counts pending, follow-up, done, and all", () => {
    const counts = queueSignalsForFilter({
      pending,
      reviewed,
      status: "all",
      type: "all",
    });
    expect(counts.pendingCount).toBe(1);
    expect(counts.followUpCount).toBe(1);
    expect(counts.doneCount).toBe(1);
    expect(counts.allCount).toBe(3);
    expect(counts.filtered.map((s) => s.id)).toEqual([
      "sig_p",
      "sig_follow",
      "sig_done",
    ]);
  });

  it("applies type filter on follow-up", () => {
    expect(
      queueSignalsForFilter({
        pending,
        reviewed,
        status: "followup",
        type: "lead",
      }).filtered
    ).toHaveLength(0);
    expect(
      queueSignalsForFilter({
        pending,
        reviewed,
        status: "followup",
        type: "retention",
      }).filtered.map((s) => s.id)
    ).toEqual(["sig_follow"]);
  });
});

describe("missingConversationIds / chat evidence", () => {
  const conv: Conversation = {
    id: "conv_1",
    tenantId: "tenant_demo",
    channel: "whatsapp",
    startedAt: "2026-08-01T00:00:00.000Z",
    messageIds: ["msg_1"],
  };

  it("lists ids that are not in the JSON store", () => {
    expect(
      missingConversationIds(
        [
          { ...baseSignal, conversationId: "conv_1" },
          { ...baseSignal, id: "sig_x", conversationId: "conv_x" },
        ],
        [conv]
      )
    ).toEqual(["conv_x"]);
  });

  it("unions overlay conversation ids into the Eval keep-set", () => {
    const overlay: Conversation = {
      id: "conv_hydrated",
      tenantId: "tenant_demo",
      channel: "whatsapp",
      startedAt: "2026-08-01T00:00:00.000Z",
      messageIds: [],
    };
    expect(keepSetConversationIds([conv], [overlay, conv])).toEqual([
      "conv_1",
      "conv_hydrated",
    ]);
    expect(keepSetConversationIds([], [overlay])).toEqual(["conv_hydrated"]);
    expect(keepSetConversationIds([conv], null)).toEqual(["conv_1"]);
    expect(keepSetConversationIds([], null)).toEqual([]);
  });

  it("builds quote evidence from the last customer messages", () => {
    const messages: Message[] = [
      {
        id: "m1",
        conversationId: "conv_x",
        role: "agent",
        content: "How can I help?",
        timestamp: "2026-08-01T00:00:00.000Z",
      },
      {
        id: "m2",
        conversationId: "conv_x",
        role: "customer",
        content: "I want to close my account",
        timestamp: "2026-08-01T00:01:00.000Z",
      },
    ];
    expect(quotesFromCustomerMessages(messages)).toEqual([
      'quote: "I want to close my account"',
    ]);
  });

  it("fills empty stub evidence and action from overlay chats", () => {
    const stub: Signal = {
      ...predictionToStubSignal(
        prediction({ id: "orphan", conversation_id: "conv_x" })
      ),
      status: "reviewed",
      feedback: {
        label: "correct",
        reviewedAt: "2026-08-02T00:00:00.000Z",
      },
    };
    const filled = applyChatEvidenceToSignals(
      [stub],
      {
        conversations: [
          {
            ...conv,
            id: "conv_x",
            customerName: "Priya",
          },
        ],
        messages: [
          {
            id: "m2",
            conversationId: "conv_x",
            role: "customer",
            content: "I want to close my account",
            timestamp: "2026-08-01T00:01:00.000Z",
          },
        ],
      }
    );
    expect(filled[0].evidence).toEqual([
      'quote: "I want to close my account"',
    ]);
    expect(filled[0].suggestedAction.length).toBeGreaterThan(0);
  });

  it("does not overwrite JSON evidence", () => {
    const local: Signal = {
      ...baseSignal,
      evidence: ['quote: "keep me"'],
      suggestedAction: "Keep this",
    };
    const filled = applyChatEvidenceToSignals([local], {
      conversations: [conv],
      messages: [
        {
          id: "m2",
          conversationId: "conv_1",
          role: "customer",
          content: "I want to close my account",
          timestamp: "2026-08-01T00:01:00.000Z",
        },
      ],
    });
    expect(filled[0].evidence).toEqual(['quote: "keep me"']);
    expect(filled[0].suggestedAction).toBe("Keep this");
  });
});
