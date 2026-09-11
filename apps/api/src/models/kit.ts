// One document per kit. `state` is the pipeline RunState persisted after every step (ADR 0002);
// `kit` is the validated Appendix A object once the run is done; `meta` is builder state (ADR 0008).
import { model, Schema, Types, type InferSchemaType } from 'mongoose';

const kitSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    fingerprint: { type: String, required: true },
    status: {
      type: String,
      enum: ['queued', 'running', 'done', 'failed'],
      required: true,
      index: true,
    },
    input: {
      jd: { type: String, required: true },
      company_url: { type: String, required: true },
      days: { type: Number, required: true },
    },
    /** Pipeline RunState (plain JSON). */
    state: { type: Schema.Types.Mixed, required: true },
    /** Appendix A kit, present when status is done. */
    kit: { type: Schema.Types.Mixed, default: null },
    /** Builder metadata keyed by item id (ADR 0008). */
    meta: { type: Schema.Types.Mixed, default: () => ({ items: {}, sections: {}, order: {} }) },
    /** Set while a runner holds this kit; cleared when the step ends (double-trigger guard). */
    runLock: { type: Date, default: null },
  },
  { timestamps: true, minimize: false },
);
kitSchema.index({ userId: 1, fingerprint: 1 });
kitSchema.index({ userId: 1, createdAt: -1 });

export type KitDoc = InferSchemaType<typeof kitSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};
export const KitModel = model('Kit', kitSchema);
