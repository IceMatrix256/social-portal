// Minimal browser polyfills for dependencies that assume Node globals.
// (Vite no longer injects these automatically.)
const g = globalThis as any;

if (!g.global) g.global = g;

if (!g.process) {
  g.process = { env: {}, browser: true, versions: {} };
}
if (!g.process.env) g.process.env = {};
if (!g.process.versions) g.process.versions = {};
if (!g.process.nextTick) g.process.nextTick = (cb: (...args: any[]) => void, ...args: any[]) =>
  Promise.resolve().then(() => cb(...args));

