import {
  Schema,
  model,
  models,
  type HydratedDocument,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import { PARTICIPATION_STATUS, PARTICIPATION_STATUS_VALUES } from '../constants/enums';

const participationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    competitionId: {
      type: Schema.Types.ObjectId,
      ref: 'Competition',
      required: true,
    },
    status: {
      type: String,
      enum: PARTICIPATION_STATUS_VALUES,
      default: PARTICIPATION_STATUS.REGISTERED,
      // No index of its own: every read that filters `status` also filters
      // `userId` or `competitionId`, which the two compound indexes below lead
      // with, or filters `_id`, which is indexed already. A third index over the
      // same column would never be the one the planner picks.
    },
    registeredAt: { type: Date, default: Date.now },
    cancelledAt: { type: Date },
    slotNumber: { type: Number },
    finalEntryFee: { type: Number, required: true, min: 0, default: 0 },
    appliedReferralCode: { type: String },
    result: {
      position: { type: Number },
      score: { type: Number },
      remarks: { type: String },
      announcedAt: { type: Date },
    },
  },
  { timestamps: true, versionKey: false, collection: 'participations' },
);

// Last line of defence against a double booking: two concurrent registrations
// for the same user and competition cannot both insert a REGISTERED row.
// The filter must equal the stored value exactly — MongoDB matches the literal
// document contents, so a partial index built on anything other than the
// 'REGISTERED' string silently indexes every row and the constraint never fires.
// Cancelled and waitlisted rows fall outside the index, which is what allows a
// cancelled user to register again.
participationSchema.index(
  { competitionId: 1, userId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: PARTICIPATION_STATUS.REGISTERED },
  },
);
// "My participations": active first, newest first.
participationSchema.index({ userId: 1, status: 1, registeredAt: -1 });
// Roster for one competition, oldest first, which is slot order.
participationSchema.index({ competitionId: 1, status: 1, registeredAt: 1 });

export type ParticipationAttrs = InferSchemaType<typeof participationSchema>;
export type ParticipationDoc = HydratedDocument<ParticipationAttrs>;
export type ParticipationModel = Model<ParticipationAttrs>;

export const Participation = (models['Participation'] ??
  model<ParticipationAttrs>('Participation', participationSchema)) as ParticipationModel;

// The subset the read model reads, per §8.4. `deriveUserRelationship` is exported
// and tested with plain objects, so it takes a structural subset rather than a
// hydrated document.
export interface ParticipationStatusSource {
  status: ParticipationAttrs['status'];
}
