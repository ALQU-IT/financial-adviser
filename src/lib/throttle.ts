import "server-only";
import { headers } from "next/headers";

/*
 * In-memory limits for the unauthenticated sign-in steps. The app runs as a
 * single Node process, so process memory is the right place: nothing to set
 * up, and a restart simply forgets old failures.
 */

type Window = { count: number; resetAt: number };

class FailureCounter {
  private map = new Map<string, Window>();
  constructor(
    private readonly max: number,
    private readonly windowMs: number
  ) {}

  /** True when the key has used up its failures for the current window. */
  blocked(key: string): boolean {
    const w = this.map.get(key);
    if (!w) return false;
    if (w.resetAt <= Date.now()) {
      this.map.delete(key);
      return false;
    }
    return w.count >= this.max;
  }

  fail(key: string) {
    const now = Date.now();
    const w = this.map.get(key);
    if (!w || w.resetAt <= now) {
      this.map.set(key, { count: 1, resetAt: now + this.windowMs });
    } else {
      w.count++;
    }
    if (this.map.size > 10_000) this.sweep();
  }

  reset(key: string) {
    this.map.delete(key);
  }

  private sweep() {
    const now = Date.now();
    for (const [k, w] of this.map) if (w.resetAt <= now) this.map.delete(k);
  }
}

const FIFTEEN_MIN = 15 * 60 * 1000;

/** Wrong passwords per client address. */
export const loginFailuresByClient = new FailureCounter(10, FIFTEEN_MIN);
/** Wrong second-factor codes per account, across all pending sign-ins. */
export const secondFactorFailuresByUser = new FailureCounter(10, FIFTEEN_MIN);

/**
 * The client's address. Behind the bundled Caddy proxy X-Forwarded-For is
 * set by Caddy itself; when the app port is exposed directly the header is
 * client-controlled, so the hash concurrency gate below is the backstop.
 */
export async function clientKey(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  const ip = xff ? xff.split(",").pop()!.trim() : h.get("x-real-ip");
  return ip || "unknown";
}

/**
 * Caps how many password hashes run at once, so a burst of sign-in attempts
 * cannot monopolise the single server process. Extra callers wait in a short
 * queue; beyond that they are turned away.
 */
const MAX_CONCURRENT_HASHES = 2;
const MAX_QUEUED_HASHES = 16;
let running = 0;
const queue: (() => void)[] = [];

export async function withHashSlot<T>(fn: () => Promise<T>): Promise<T | null> {
  if (running >= MAX_CONCURRENT_HASHES) {
    if (queue.length >= MAX_QUEUED_HASHES) return null;
    await new Promise<void>((resolve) => queue.push(resolve));
  }
  running++;
  try {
    return await fn();
  } finally {
    running--;
    queue.shift()?.();
  }
}
