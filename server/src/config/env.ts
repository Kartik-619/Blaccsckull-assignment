import dotenv from 'dotenv';

dotenv.config();

const NODE_ENV_MAP = Object.freeze({
  DEVELOPMENT: 'development',
  TEST: 'test',
  PRODUCTION: 'production',
} as const);

export type NodeEnv = (typeof NODE_ENV_MAP)[keyof typeof NODE_ENV_MAP];

const MONGO_URI_PATTERN = /^mongodb(\+srv)?:\/\/.+/;
const MIN_PORT = 1;
const MAX_PORT = 65535;

const NODE_ENV_NAMES = Object.values(NODE_ENV_MAP);

// Typed as a predicate so the branch after it narrows away the undefined, which
// is what lets each reader return a real value instead of a possibly-undefined
// one that every caller would have to re-check.
function isMissing(value: string | undefined): value is undefined | '' {
  return value === undefined || value.trim() === '';
}

// Keyed like the map above, so the guard needs no cast to narrow a plain string
// down to the union.
function isNodeEnv(value: string): value is NodeEnv {
  return Object.hasOwn(NODE_ENV_MAP, value.toUpperCase());
}

function readPort(value: string | undefined, errors: string[]): number | undefined {
  if (isMissing(value)) {
    errors.push('PORT is required.');
    return undefined;
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
    errors.push(`PORT must be an integer between ${MIN_PORT} and ${MAX_PORT}, got "${value}".`);
    return undefined;
  }
  return port;
}

function readNodeEnv(value: string | undefined, errors: string[]): NodeEnv | undefined {
  if (isMissing(value)) {
    errors.push('NODE_ENV is required.');
    return undefined;
  }
  const nodeEnv = value.trim().toLowerCase();
  if (!isNodeEnv(nodeEnv)) {
    errors.push(`NODE_ENV must be one of ${NODE_ENV_NAMES.join(', ')}, got "${value}".`);
    return undefined;
  }
  return nodeEnv;
}

function readMongoDbUri(value: string | undefined, errors: string[]): string | undefined {
  if (isMissing(value)) {
    errors.push('MONGODB_URI is required.');
    return undefined;
  }
  const mongodbUri = value.trim();
  if (!MONGO_URI_PATTERN.test(mongodbUri)) {
    errors.push('MONGODB_URI must start with mongodb:// or mongodb+srv://.');
    return undefined;
  }
  return mongodbUri;
}

// The permitted AUTH_MODE values are not specified anywhere yet, so only
// presence is enforced. Pinning the list is a DECISIONS.md entry of its own;
// until then a typo in it passes boot and fails at the first authenticated
// request, which is the cost of not inventing a contract.
function readAuthMode(value: string | undefined, errors: string[]): string | undefined {
  if (isMissing(value)) {
    errors.push('AUTH_MODE is required.');
    return undefined;
  }
  return value.trim();
}

export interface EnvConfig {
  port: number;
  nodeEnv: NodeEnv;
  mongodbUri: string;
  authMode: string;
}

interface PartialEnvConfig {
  port: number | undefined;
  nodeEnv: NodeEnv | undefined;
  mongodbUri: string | undefined;
  authMode: string | undefined;
}

// A discriminated union, so the caller below is forced to handle the failure
// case before it can read a `port` as a number. Returning a bag of `| undefined`
// fields and trusting the exit is what made the old version unsafe to read.
export type EnvValidation =
  | { ok: true; config: EnvConfig; errors: readonly string[] }
  | { ok: false; config: PartialEnvConfig; errors: readonly string[] };

// Pure: it takes the environment as an argument and never touches process.env,
// never throws and never exits, so every problem can be reported at once
// instead of one per boot attempt.
export function validateEnv(rawEnv: NodeJS.ProcessEnv): EnvValidation {
  const errors: string[] = [];
  const config: PartialEnvConfig = {
    port: readPort(rawEnv['PORT'], errors),
    nodeEnv: readNodeEnv(rawEnv['NODE_ENV'], errors),
    mongodbUri: readMongoDbUri(rawEnv['MONGODB_URI'], errors),
    authMode: readAuthMode(rawEnv['AUTH_MODE'], errors),
  };

  const { port, nodeEnv, mongodbUri, authMode } = config;
  if (errors.length > 0 || port === undefined || nodeEnv === undefined
    || mongodbUri === undefined || authMode === undefined) {
    return { ok: false, config, errors };
  }
  return { ok: true, config: { port, nodeEnv, mongodbUri, authMode }, errors };
}

const validated = validateEnv(process.env);

if (!validated.ok) {
  const report = validated.errors.map((problem) => `  - ${problem}`).join('\n');
  console.error(`Invalid environment configuration:\n${report}`);
  process.exit(1);
}

export const config: EnvConfig = Object.freeze(validated.config);
