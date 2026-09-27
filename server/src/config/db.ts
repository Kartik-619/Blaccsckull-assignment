import mongoose from 'mongoose';

import { config } from './env';

// No connection options: Mongoose's default 30s server-selection timeout is
// already the fail-fast §15 asks for, and every option added here would be a
// guess about a deployment target that does not exist yet.
export async function connectDatabase(): Promise<typeof mongoose.connection> {
  await mongoose.connect(config.mongodbUri);
  return mongoose.connection;
}
