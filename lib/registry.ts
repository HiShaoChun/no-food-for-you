import { promises as fs } from "fs";
import path from "path";
import type { SimEvent } from "@/lib/engine/types";

type Subscriber = (event: SimEvent) => void;

type Entry = {
  buffer: SimEvent[]; // for late subscribers / replay
  subscribers: Set<Subscriber>;
  ended: boolean;
  endedAt: number | null;
  filePath: string;
  // Serialized write chain — guarantees JSONL append order matches emit order
  writeChain: Promise<void>;
};

const RUNS_DIR = path.resolve(process.cwd(), "runs");

/**
 * Use globalThis to survive Next.js hot reload in dev.
 */
declare global {
  var __nffy_registry: Map<string, Entry> | undefined;
}

const registry: Map<string, Entry> =
  globalThis.__nffy_registry ?? new Map<string, Entry>();
if (!globalThis.__nffy_registry) {
  globalThis.__nffy_registry = registry;
}

async function ensureRunsDir(): Promise<void> {
  await fs.mkdir(RUNS_DIR, { recursive: true });
}

export async function createSim(sim_id: string): Promise<void> {
  await ensureRunsDir();
  const filePath = path.join(RUNS_DIR, `${sim_id}.jsonl`);
  // Truncate any prior file with the same id (collision is extremely unlikely with uuid).
  await fs.writeFile(filePath, "", { encoding: "utf8" });
  registry.set(sim_id, {
    buffer: [],
    subscribers: new Set(),
    ended: false,
    endedAt: null,
    filePath,
    writeChain: Promise.resolve(),
  });
}

/**
 * Wait until all queued writes for a sim_id have flushed to disk.
 * Useful for tests and for SSE handlers that need to confirm a final event was persisted.
 */
export async function flushWrites(sim_id: string): Promise<void> {
  const entry = registry.get(sim_id);
  if (!entry) return;
  await entry.writeChain;
}

export async function emitEvent(sim_id: string, event: SimEvent): Promise<void> {
  const entry = registry.get(sim_id);
  if (!entry) {
    throw new Error(`sim_id "${sim_id}" not registered`);
  }
  // Order is fixed at push-time: buffer order = emit order
  entry.buffer.push(event);

  // Chain the file append so writes are serialized in emit order, even when callers fire-and-forget.
  const writePromise = entry.writeChain.then(() =>
    fs.appendFile(entry.filePath, JSON.stringify(event) + "\n", { encoding: "utf8" }),
  );
  entry.writeChain = writePromise.catch(() => {
    // Don't break the chain on a single failed write
  });

  // Fan out to live subscribers synchronously (preserves order)
  for (const sub of entry.subscribers) {
    try {
      sub(event);
    } catch {
      // ignore subscriber errors; they should not bring down the engine
    }
  }

  if (event.type === "sim_ended") {
    entry.ended = true;
    entry.endedAt = Date.now();
    scheduleCleanup(sim_id);
  }

  // Caller can `await` this if it cares about durability
  await writePromise;
}

export function subscribe(sim_id: string, sub: Subscriber): {
  backlog: SimEvent[];
  unsubscribe: () => void;
} | null {
  const entry = registry.get(sim_id);
  if (!entry) return null;
  entry.subscribers.add(sub);
  return {
    backlog: [...entry.buffer],
    unsubscribe: () => {
      entry.subscribers.delete(sub);
    },
  };
}

export function isRegistered(sim_id: string): boolean {
  return registry.has(sim_id);
}

function scheduleCleanup(sim_id: string): void {
  // Remove entry 60s after sim_ended, regardless of subscribers (per spec).
  setTimeout(() => {
    registry.delete(sim_id);
  }, 60_000).unref?.();
}
