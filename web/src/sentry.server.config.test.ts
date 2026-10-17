import {afterEach,expect,it,vi} from "vitest";
const h=vi.hoisted(()=>({init:vi.fn(),profiling:vi.fn()}));
vi.mock("@sentry/nextjs",()=>({init:h.init}));
vi.mock("@sentry/profiling-node",()=>({nodeProfilingIntegration:h.profiling}));
afterEach(()=>{vi.unstubAllEnvs();vi.resetModules();vi.clearAllMocks();});
it("does not load a native profiler for an unconfigured local Sentry client",async()=>{
 vi.stubEnv("SENTRY_DSN","");vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN","");
 await import("./sentry.server.config");expect(h.profiling).not.toHaveBeenCalled();expect(h.init).toHaveBeenCalledWith(expect.objectContaining({integrations:[]}));
});
