export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertLaunchEnvironment } = await import("./lib/launch-environment");
    assertLaunchEnvironment();
    await import("./instrumentation-node");
  }
}
