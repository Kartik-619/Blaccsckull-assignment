import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import morgan from 'morgan';

import { config } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';
import v1Routes from './routes/v1';
import { sendSuccess } from './utils/response';

const BODY_LIMIT = '16kb';
const API_PREFIX = '/api/v1';
const HEALTH_PATH = '/health';
const CONNECTED = 1;

// Order is load-bearing, and each entry earns its place:
//   helmet      headers first, so nothing downstream can undo them
//   cors        before any route, and before body parsing so a rejected
//               preflight is still a CORS response the browser can read
//   morgan      dev only (§16); in production access logs are the proxy's job
//   json        after cors, and before routes, so a malformed body is a 400
//               rather than a controller crash
//   routes      the only place the version prefix appears
//   notFound    after every route, or it would swallow them
//   errorHandler last, because Express identifies an error handler by position
export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors());
  if (config.nodeEnv === 'development') {
    app.use(morgan('dev'));
  }
  app.use(express.json({ limit: BODY_LIMIT }));

  // Outside the version prefix on purpose: a load balancer asking whether this
  // process is up should not have to know which API version it is talking to.
  // It reports readiness as well as liveness, because a process listening but
  // unable to reach Mongo is not ready to serve. 503 rather than 500, since the
  // process is healthy and the dependency is not.
  app.get(HEALTH_PATH, (req, res) => {
    const isConnected = mongoose.connection.readyState === CONNECTED;
    const data = {
      status: isConnected ? 'ok' : 'degraded',
      database: isConnected ? 'connected' : 'disconnected',
    };
    sendSuccess(res, data, { status: isConnected ? 200 : 503 });
  });

  app.use(API_PREFIX, v1Routes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
