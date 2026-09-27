import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { Competition } from '../../src/models/Competition';
import { Participation } from '../../src/models/Participation';
import { User } from '../../src/models/User';

let server: MongoMemoryServer | null = null;

// A real mongod, not a stub: the register flow depends on a filter and an
// increment being evaluated under one document lock, and a double would be
// testing my own arithmetic instead of Mongo's.
export async function startMemoryDb(): Promise<void> {
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri());
  // The unique partial index is load-bearing for the duplicate-registration
  // test, so the indexes are built explicitly rather than hoped for.
  await Promise.all([User.init(), Competition.init(), Participation.init()]);
}

export async function stopMemoryDb(): Promise<void> {
  await mongoose.disconnect();
  if (server) {
    await server.stop();
    server = null;
  }
}

export async function resetDatabase(): Promise<void> {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})),
  );
}
