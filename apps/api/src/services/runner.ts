// In-process runner over the core step machine (ADR 0002). One step per iteration, persisted after
// each, so progress is visible, a crash resumes from the last completed step, and a double trigger
// cannot run the same step twice (atomic runLock).
import { advance, type RunDeps, type RunState } from '@trao/core';
import { KitModel } from '../models/kit.js';

export interface RunnerOptions {
  deps: RunDeps;
  concurrency?: number;
  /** A lock older than this is considered abandoned (process died mid-step). */
  staleLockMs?: number;
  log?: (msg: string) => void;
}

export class Runner {
  private readonly queue: string[] = [];
  private active = 0;
  private readonly concurrency: number;
  private readonly staleLockMs: number;
  private readonly deps: RunDeps;
  private readonly log: (msg: string) => void;
  private stopped = false;

  constructor(opts: RunnerOptions) {
    this.deps = opts.deps;
    this.concurrency = Math.max(1, opts.concurrency ?? 1);
    this.staleLockMs = opts.staleLockMs ?? 5 * 60 * 1000;
    this.log = opts.log ?? (() => {});
  }

  /** Called on boot: anything left queued/running by a previous process is picked up again. */
  async recover(): Promise<number> {
    const pending = await KitModel.find({ status: { $in: ['queued', 'running'] } })
      .select('_id')
      .lean();
    for (const k of pending) this.enqueue(k._id.toString());
    return pending.length;
  }

  enqueue(kitId: string): void {
    if (!this.queue.includes(kitId)) this.queue.push(kitId);
    void this.pump();
  }

  stop(): void {
    this.stopped = true;
  }

  /** Resolves when nothing is queued or active (tests). */
  async idle(): Promise<void> {
    while (this.queue.length > 0 || this.active > 0) await new Promise((r) => setTimeout(r, 25));
  }

  private async pump(): Promise<void> {
    while (!this.stopped && this.active < this.concurrency && this.queue.length > 0) {
      const id = this.queue.shift()!;
      this.active += 1;
      this.runKit(id)
        .catch((err) => this.log(`runner: kit ${id} crashed: ${(err as Error).message}`))
        .finally(() => {
          this.active -= 1;
          void this.pump();
        });
    }
  }

  private async runKit(id: string): Promise<void> {
    for (;;) {
      // Take the lock for one step. If another runner holds a fresh lock, leave it to them.
      const doc = await KitModel.findOneAndUpdate(
        {
          _id: id,
          status: { $in: ['queued', 'running'] },
          $or: [{ runLock: null }, { runLock: { $lt: new Date(Date.now() - this.staleLockMs) } }],
        },
        { $set: { runLock: new Date(), status: 'running' } },
        { new: true },
      );
      if (!doc) return;

      const before = doc.state as RunState;
      const after = await advance(before, this.deps);
      const last = after.steps[after.steps.length - 1];
      if (last)
        this.log(`kit ${id}: ${last.name} ${last.status} ${last.ms}ms — ${last.notes.join(' | ')}`);

      const status =
        after.status === 'done' ? 'done' : after.status === 'failed' ? 'failed' : 'running';
      await KitModel.updateOne(
        { _id: id },
        { $set: { state: after, status, kit: after.artifacts.kit ?? null, runLock: null } },
      );
      if (status !== 'running') return;
    }
  }
}
