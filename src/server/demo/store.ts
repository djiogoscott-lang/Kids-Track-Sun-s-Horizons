import { buildDemoState, type DemoState } from "./seed";

// Next.js dev-mode Fast Refresh re-evaluates modules on save; stashing the
// store on globalThis keeps demo data (and anything a monitor just recorded)
// stable across those reloads instead of silently reseeding.
const globalForDemo = globalThis as unknown as { __ktDemoState?: DemoState };

export function getDemoState(): DemoState {
  if (!globalForDemo.__ktDemoState) {
    globalForDemo.__ktDemoState = buildDemoState(new Date());
  }
  return globalForDemo.__ktDemoState;
}

export function resetDemoState(): DemoState {
  globalForDemo.__ktDemoState = buildDemoState(new Date());
  return globalForDemo.__ktDemoState;
}
