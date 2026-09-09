import { describe, expect, it } from "vitest";
import { groupMessagesByConversation } from "./group-messages";

describe("groupMessagesByConversation", () => {
  it("returns an empty map for no messages", () => {
    expect(groupMessagesByConversation([])).toEqual(new Map());
  });

  it("groups in encounter order without dropping siblings", () => {
    const grouped = groupMessagesByConversation([
      { conversationId: "conv_a", id: "m1" },
      { conversationId: "conv_b", id: "m2" },
      { conversationId: "conv_a", id: "m3" },
    ]);
    expect([...grouped.keys()]).toEqual(["conv_a", "conv_b"]);
    expect(grouped.get("conv_a")?.map((row) => row.id)).toEqual(["m1", "m3"]);
    expect(grouped.get("conv_b")?.map((row) => row.id)).toEqual(["m2"]);
  });
});
