import {
  Schema,
  model,
  models,
  type HydratedDocument,
  type InferSchemaType,
  type Model,
} from 'mongoose';

import { DANCE_FORM_VALUES, USER_ROLE, USER_ROLE_VALUES } from '../constants/enums';

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    avatarUrl: { type: String },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    country: { type: String, trim: true, default: 'India' },
    primaryDanceForm: { type: String, required: true, enum: DANCE_FORM_VALUES },
    role: { type: String, enum: USER_ROLE_VALUES, default: USER_ROLE.USER },
  },
  { timestamps: true, versionKey: false, collection: 'users' },
);

// Identity field: `authenticate` resolves the user by email on every request,
// and a second account with the same address must be impossible.
userSchema.index({ email: 1 }, { unique: true });

// Derived from the schema rather than written out by hand, so the type cannot
// describe a document the schema would not accept.
export type UserAttrs = InferSchemaType<typeof userSchema>;
export type UserDoc = HydratedDocument<UserAttrs>;
export type UserModel = Model<UserAttrs>;

// The `models` registry is a string index signature, so a cached model arrives
// as `Model<any>`. Re-asserting the concrete model is the one cast each model
// pays: it is what stops `any` leaking out of the registry into the services.
export const User = (models['User'] ?? model<UserAttrs>('User', userSchema)) as UserModel;
