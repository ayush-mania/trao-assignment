// Kit persistence: everything is scoped by userId (Section 1: users read and modify only their own).
import { createRunState, fingerprint, MAX_DAYS, type RunState } from '@trao/core';
import { Types } from 'mongoose';
import { KitModel, type KitDoc } from '../models/kit.js';
import { HttpError } from '../middleware/errors.js';

export const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface CreateKitInput {
  jd: string;
  company_url: string;
  days: number;
}

export function toObjectId(id: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(404, 'NOT_FOUND', 'No such kit');
  return new Types.ObjectId(id);
}

/**
 * Same description + company + days within 24h returns the existing kit (Section 10 duplicate case)
 * unless that run failed, in which case a fresh attempt is fair.
 */
export async function createOrReuseKit(
  userId: string,
  input: CreateKitInput,
): Promise<{ kit: KitDoc; reused: boolean }> {
  const fp = fingerprint(input);
  const existing = await KitModel.findOne({
    userId,
    fingerprint: fp,
    status: { $ne: 'failed' },
    createdAt: { $gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
  }).sort({ createdAt: -1 });
  if (existing) return { kit: existing.toObject() as unknown as KitDoc, reused: true };
  const created = await KitModel.create({
    userId,
    fingerprint: fp,
    status: 'queued',
    input,
    state: createRunState(input),
  });
  return { kit: created.toObject() as unknown as KitDoc, reused: false };
}

export async function listKits(userId: string) {
  return KitModel.find({ userId })
    .sort({ createdAt: -1 })
    .select(
      'status input.company_url input.days state.steps state.error kit.source kit.role.title createdAt updatedAt',
    )
    .lean();
}

export async function getKit(userId: string, id: string): Promise<KitDoc> {
  const doc = await KitModel.findOne({ _id: toObjectId(id), userId }).lean();
  if (!doc) throw new HttpError(404, 'NOT_FOUND', 'No such kit');
  return doc as unknown as KitDoc;
}

export async function deleteKit(userId: string, id: string): Promise<void> {
  const r = await KitModel.deleteOne({ _id: toObjectId(id), userId });
  if (r.deletedCount === 0) throw new HttpError(404, 'NOT_FOUND', 'No such kit');
}

/** Re-queue a failed kit from its failed step (state keeps completed steps' artifacts). */
export async function retryKit(userId: string, id: string): Promise<KitDoc> {
  const doc = await KitModel.findOne({ _id: toObjectId(id), userId });
  if (!doc) throw new HttpError(404, 'NOT_FOUND', 'No such kit');
  if (doc.status !== 'failed')
    throw new HttpError(409, 'NOT_FAILED', 'Only a failed kit can be retried');
  const state = doc.state as RunState;
  const resumed: RunState = {
    ...state,
    status: 'pending',
    error: null,
    finishedAt: null,
    // drop the failed step record so the retry re-runs it cleanly
    steps: state.steps.filter((s) => s.status !== 'failed'),
  };
  doc.state = resumed;
  doc.status = 'queued';
  doc.runLock = null;
  await doc.save();
  return doc.toObject() as unknown as KitDoc;
}

export { MAX_DAYS };
