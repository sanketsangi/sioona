import { describe, expect, it } from "vitest";
import type { Breadcrumb, ErrorEvent } from "@sentry/core";
import { scrubSentryBreadcrumb, scrubSentryEvent } from "./sentry-options";

function errorEvent(overrides: Partial<ErrorEvent> = {}): ErrorEvent {
  return { type: undefined, ...overrides };
}

describe("scrubSentryEvent", () => {
  it("drops request bodies, cookies, headers, and query strings", () => {
    const event = scrubSentryEvent(
      errorEvent({
        request: {
          url: "/api/ingest",
          data: { messages: [{ text: "secret chat" }] },
          cookies: { session: "abc" },
          headers: { authorization: "Bearer x" },
          query_string: "q=hello",
        },
      }),
    );

    expect(event?.request?.url).toBe("/api/ingest");
    expect(event?.request?.data).toBeUndefined();
    expect(event?.request?.cookies).toBeUndefined();
    expect(event?.request?.headers).toBeUndefined();
    expect(event?.request?.query_string).toBeUndefined();
  });

  it("drops conversation-shaped extras and contexts", () => {
    const event = scrubSentryEvent(
      errorEvent({
        extra: {
          messages: [{ role: "customer", text: "buy more SIPs" }],
          conversation: { id: "conv_1" },
          route: "/insights",
        },
        contexts: {
          transcript: { text: "full dump" },
          os: { name: "Linux" },
        },
      }),
    );

    expect(event?.extra).toEqual({ route: "/insights" });
    expect(event?.contexts).toEqual({ os: { name: "Linux" } });
  });

  it("strips user email and IP", () => {
    const event = scrubSentryEvent(
      errorEvent({
        user: { id: "tenant_demo", email: "maya@example.com", ip_address: "1.2.3.4" },
      }),
    );

    expect(event?.user).toEqual({ id: "tenant_demo" });
  });
});

describe("scrubSentryBreadcrumb", () => {
  it("drops HTTP body fields from breadcrumb data", () => {
    const breadcrumb: Breadcrumb = {
      category: "fetch",
      data: {
        url: "/api/detect",
        method: "POST",
        body: { chats: ["secret"] },
        messages: ["nope"],
      },
    };

    expect(scrubSentryBreadcrumb(breadcrumb).data).toEqual({
      url: "/api/detect",
      method: "POST",
    });
  });
});
