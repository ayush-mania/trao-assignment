// Server-side sessions: logout and expiry are enforced by the database, not by trusting the cookie.
import { model, Schema } from 'mongoose';

const sessionSchema = new Schema({
  _id: { type: String, required: true }, // random token
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  expiresAt: { type: Date, required: true },
});
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = model('Session', sessionSchema);
