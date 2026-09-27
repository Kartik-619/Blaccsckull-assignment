import {
  Schema,
  model,
  models,
  type HydratedDocument,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import {
  ADMIN_STATUS,
  ADMIN_STATUS_VALUES,
  DANCE_FORM_VALUES,
  DISCOUNT_TYPE,
  DISCOUNT_TYPE_VALUES,
} from '../constants/enums';

const competitionSchema = new Schema(
  {
    slug: { type: String, required: true, lowercase: true, trim: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true },
    rules: { type: [String], default: [] },
    bannerUrl: { type: String },
    danceForm: { type: String, required: true, enum: DANCE_FORM_VALUES },
    tags: { type: [String], default: [], index: true },
    organizerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    registrationOpensAt: { type: Date, required: true },
    registrationClosesAt: { type: Date, required: true },
    // Optional: when absent, a registered user may cancel at any time. Not
    // indexed because no query filters on it — it is compared in the service
    // after the competition has been loaded.
    cancellationClosesAt: { type: Date },
    startsAt: { type: Date, required: true },
    // No index of its own: no query filters on `endsAt` alone, and the compound
    // `{ startsAt, endsAt }` below is what actually serves the event-window
    // ranges. A second index here would be written on every insert and read by
    // nothing.
    endsAt: { type: Date, required: true },
    resultsAnnouncedAt: { type: Date },
    maxParticipants: { type: Number, required: true, min: 1 },
    minParticipants: { type: Number, required: true, min: 0, default: 0 },
    currentParticipantCount: { type: Number, required: true, min: 0, default: 0 },
    // `entryFee` and `referralPolicy` are declared required because every child
    // already has a default, so the subdocument is always materialised. Saying so
    // is what makes the inferred type non-optional; without it the type claimed a
    // value might be absent and the registration path had to defend against a
    // case the schema makes impossible. `venue` and `result` are left optional:
    // nothing reads them, and nothing guarantees them.
    entryFee: {
      type: {
        amount: { type: Number, min: 0, default: 0 },
        currency: { type: String, default: 'INR' },
      },
      required: true,
    },
    prizePool: {
      totalAmount: { type: Number, min: 0, default: 0 },
      currency: { type: String, default: 'INR' },
      breakdown: [
        {
          position: { type: Number },
          amount: { type: Number },
          description: { type: String },
        },
      ],
    },
    referralPolicy: {
      type: {
        enabled: { type: Boolean, default: false },
        discountType: {
          type: String,
          enum: DISCOUNT_TYPE_VALUES,
          default: DISCOUNT_TYPE.FLAT,
        },
        discountValue: { type: Number, min: 0, default: 0 },
        maxDiscountAmount: { type: Number, min: 0, default: 0 },
        validUntil: { type: Date },
        codePrefix: { type: String },
        rewardAmount: { type: Number, min: 0, default: 10 },
      },
      required: true,
    },
    // Design-only content, added so the client renders a populated screen instead
    // of an empty state. Every field carries a default per agents.md §8.1: the
    // strings default to '' (falsy, so a client truthiness check still reads them
    // as unpublished) and `judge` defaults to null.
    judge: {
      type: {
        name: { type: String },
        title: { type: String },
        experienceYears: { type: Number },
        avatarUrl: { type: String },
      },
      default: null,
    },
    previousWinners: {
      type: [
        {
          name: { type: String },
          position: { type: Number },
          imageUrl: { type: String },
        },
      ],
      default: [],
    },
    judgingParameters: { type: String, default: '' },
    eligibility: { type: String, default: '' },
    disclaimer: { type: String, default: '' },
    certificateProvided: { type: Boolean, default: false },
    // A competition may expose a submission window narrower than the event
    // window. The client falls back to startsAt/endsAt when these are absent.
    submissionStartsAt: { type: Date },
    submissionClosesAt: { type: Date },
    adminStatus: {
      type: String,
      enum: ADMIN_STATUS_VALUES,
      default: ADMIN_STATUS.NONE,
    },
    adminNote: { type: String },
    venue: {
      name: { type: String },
      address: { type: String },
      lat: { type: Number },
      lng: { type: Number },
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'competitions',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Public URL identity: the detail endpoint resolves a competition by slug, and
// two competitions may never share one.
competitionSchema.index({ slug: 1 }, { unique: true });
// Browse query: competitions of one dance form, soonest first.
competitionSchema.index({ danceForm: 1, startsAt: 1 });
// Search filters on a prefix of the title, and §8.2 requires an indexed field
// for anything used in a filter. The unique slug index already covers its half.
competitionSchema.index({ title: 1 });
// Lifecycle sweeps read these as ranges to find windows that open or close.
competitionSchema.index({ registrationOpensAt: 1 });
competitionSchema.index({ registrationClosesAt: 1 });
// Upcoming and past listings, and range filters over the event window.
competitionSchema.index({ startsAt: 1, endsAt: 1 });
// Present in nearly every list query; low cardinality, still worth indexing.
competitionSchema.index({ adminStatus: 1 });
// Organizer dashboard, newest first. Leading key also serves bare organizerId
// lookups, which is why `organizerId` carries no field-level index.
competitionSchema.index({ organizerId: 1, createdAt: -1 });

// Derived from the two numbers above, so it can never disagree with the
// counter. Read-only: no setter, and nothing persists these values.
competitionSchema
  .virtual('spotsRemaining')
  .get(function getSpotsRemaining(this: CompetitionDoc): number {
    return Math.max(0, this.maxParticipants - this.currentParticipantCount);
  });

competitionSchema.virtual('isFull').get(function getIsFull(this: CompetitionDoc): boolean {
  return this.currentParticipantCount >= this.maxParticipants;
});

export type CompetitionAttrs = InferSchemaType<typeof competitionSchema>;

// `InferSchemaType` describes stored fields only, so the two virtuals are
// declared here and threaded through the Model's virtuals parameter. Without
// that, every read of `doc.spotsRemaining` would be a type error and the value
// would be reimplemented by hand at each call site.
export interface CompetitionVirtuals {
  spotsRemaining: number;
  isFull: boolean;
}

export type CompetitionDoc = HydratedDocument<CompetitionAttrs> & CompetitionVirtuals;
export type CompetitionModel = Model<CompetitionAttrs, {}, {}, CompetitionVirtuals>;

// What the read model returns: the stored fields plus the virtuals. Spelled out
// rather than taken from `toObject()` because Mongoose's return type omits
// virtuals even when they are present at runtime. `_id` is added explicitly for
// the same reason: `toObject()` always includes it, but the inferred attribute
// type does not, so a client reading `details._id` would otherwise be reading a
// field the type claimed not to exist.
export type CompetitionSnapshot = Pick<CompetitionDoc, '_id'> &
  CompetitionAttrs &
  CompetitionVirtuals;

export const Competition = (models['Competition'] ??
  model<CompetitionAttrs>('Competition', competitionSchema)) as CompetitionModel;
