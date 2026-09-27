import type { Server } from 'node:http';

import type { Express } from 'express';
import mongoose from 'mongoose';

import { createApp } from './app';
import { connectDatabase } from './config/db';
import { config } from './config/env';

const SHUTDOWN_SIGNALS = ['SIGINT', 'SIGTERM'] as const;
const SHUTDOWN_GRACE_MS = 10_000;
const CONNECTED = 1;

// Everything up to and including the last '@' before the host is the userinfo
// segment, which is where a username and password live. §16 keeps both out of
// logs; the host, port and database name are what identify the deployment, so
// they stay.
const MONGO_CREDENTIALS = /^(mongodb(?:\+srv)?:\/\/)[^@/]*@/;

let isShuttingDown = false;

function describeMongoTarget(uri: string): string {
  return uri.replace(MONGO_CREDENTIALS, '$1<redacted>@');
}

// What this process is, before anything can fail: the values a log reader needs
// to tell two running instances apart, and none of them are secrets.
function logBootSummary(): void {
  console.log(
    `[boot] env=${config.nodeEnv} auth=${config.authMode} pid=${process.pid} node=${process.version}`,
  );
  console.log(`[boot] mongodb=${describeMongoTarget(config.mongodbUri)}`);
}

// Registered before the connection opens, so the initial 'connected' is logged
// like any other transition. A pool that goes away mid-run is the one dependency
// failure that is otherwise invisible until requests start failing: /health
// flips to 503 and this says why. Every one of these is a state change, not a
// per-query event, so the volume stays at the rate of actual trouble.
function watchDatabase(): void {
  const { connection } = mongoose;
  connection.on('connected', () => console.log('[mongo] connected'));
  connection.on('reconnected', () => console.log('[mongo] reconnected'));
  // The disconnect() in shutDown emits this too, and an orderly shutdown is not
  // a fault, so it is reported as one only when nothing asked for it.
  connection.on('disconnected', () => {
    if (!isShuttingDown) {
      console.error('[mongo] disconnected');
    }
  });
  connection.on('error', (error: unknown) => console.error('[mongo] connection error', error));
}

function listen(app: Express): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = app.listen(config.port, () => {
      console.log(`[boot] listening on http://localhost:${config.port} (${config.nodeEnv})`);
      resolve(server);
    });
    // Without this, a port already in use surfaces as an unhandled 'error'
    // event: the process dies with a stack trace instead of a message, and the
    // promise above never settles. Forwarding it lets `start` report it.
    server.once('error', reject);
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

// A hard timeout, because a stuck keep-alive connection otherwise leaves the
// process alive forever and the orchestrator has to SIGKILL it. Once the timer
// fires the process exits whatever state the connections are in.
//
// Mongoose is disconnected explicitly: its pool holds sockets open, so
// server.close() would wait for them and the process would rely on the timeout
// every time. HTTP first (stop taking new work), then the database (finish the
// work in flight).
async function shutDown(server: Server): Promise<void> {
  isShuttingDown = true;
  const forced = setTimeout(() => process.exit(1), SHUTDOWN_GRACE_MS);
  forced.unref();
  try {
    await closeServer(server);
    console.log('[shutdown] http server closed');
    await mongoose.disconnect();
    console.log('[shutdown] mongodb disconnected');
    process.exit(0);
  } catch (error) {
    console.error('[shutdown] failed to close cleanly', error);
    process.exit(1);
  }
}

function startShutdown(server: Server): void {
  for (const signal of SHUTDOWN_SIGNALS) {
    process.once(signal, () => {
      console.log(`[shutdown] ${signal} received, closing`);
      void shutDown(server);
    });
  }
}

export async function start(): Promise<Server> {
  logBootSummary();
  watchDatabase();
  await connectDatabase();
  const server = await listen(createApp());
  startShutdown(server);
  // One line that means "nothing is left to wait for". Reached only when the
  // database answered and the socket is bound, so its absence is the signal.
  console.log(
    `[ready] mongodb ${mongoose.connection.readyState === CONNECTED ? 'connected' : 'unavailable'}, `
      + `api on http://localhost:${config.port}`,
  );
  return server;
}

if (require.main === module) {
  start().catch((error: unknown) => {
    console.error('[boot] failed to start', error);
    process.exit(1);
  });
}
