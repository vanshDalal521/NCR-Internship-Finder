import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

const backendRoot = resolve(import.meta.dirname, '..');
dotenv.config({ path: resolve(backendRoot, '.env'), quiet: true });

const emptyToUndefined = (value) => {
  if (typeof value === 'string' && value.trim() === '') return undefined;
  return value;
};

const optionalString = z.preprocess(emptyToUndefined, z.string().trim().optional());
const optionalUrl = z.preprocess(emptyToUndefined, z.string().url().optional());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  FRONTEND_ORIGIN: z.string().trim().default('http://localhost:5173'),
  ALLOWED_ORIGINS: optionalString,
  ALLOW_PUBLIC_ACCESS: z.enum(['true', 'false']).default('false'),

  SUPABASE_URL: optionalUrl,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,

  LOCAL_STORE_FILE: z.string().trim().default('./data/local-db.json'),

  JSEARCH_API_KEY: optionalString,
  JSEARCH_API_HOST: z.string().trim().default('jsearch.p.rapidapi.com'),
  JSEARCH_COUNTRY: z.string().trim().default('in'),

  ADZUNA_APP_ID: optionalString,
  ADZUNA_APP_KEY: optionalString,
  ADZUNA_COUNTRY: z.string().trim().default('in'),

  DISCOVERY_DAILY_LIMIT: z.coerce.number().int().min(1).max(1000).default(40),
  DISCOVERY_MAX_AGE_DAYS: z.coerce.number().int().min(1).max(365).default(45),

  GEMINI_API_KEY: optionalString,
  GEMINI_MODEL: z.string().trim().default('gemini-2.5-flash'),

  APP_PASSWORD: optionalString,
  AUTH_SECRET: optionalString,
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(12),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
  throw new Error(`Invalid environment configuration — ${details}`);
}

const data = parsed.data;
const isProduction = data.NODE_ENV === 'production';
const warnings = [];

if (isProduction && !data.APP_PASSWORD && data.ALLOW_PUBLIC_ACCESS !== 'true') {
  throw new Error(
    'APP_PASSWORD must be set in production. To intentionally run a public, read-only demo, set ALLOW_PUBLIC_ACCESS=true.',
  );
}

if (data.SUPABASE_URL && !data.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required when SUPABASE_URL is configured.');
}

if (!data.SUPABASE_URL && data.SUPABASE_SERVICE_ROLE_KEY) {
  warnings.push('SUPABASE_SERVICE_ROLE_KEY is set without SUPABASE_URL. The service role key will be ignored.');
}

if (isProduction && !data.SUPABASE_URL) {
  warnings.push(
    'No Supabase credentials found. Using the local JSON store — data will be lost when an ephemeral host restarts.',
  );
}

if (isProduction && !data.APP_PASSWORD) {
  warnings.push('Application authentication is disabled because APP_PASSWORD is not set.');
}

let authSecret = data.AUTH_SECRET;
if (!authSecret) {
  if (isProduction && data.APP_PASSWORD) {
    throw new Error('AUTH_SECRET (32+ random characters) is required when APP_PASSWORD is used in production.');
  }
  authSecret = randomBytes(32).toString('hex');
  warnings.push('AUTH_SECRET was not provided. An ephemeral secret was generated for this process.');
} else if (authSecret.length < 32) {
  throw new Error('AUTH_SECRET must be at least 32 characters long.');
}

const allowedOrigins = [
  data.FRONTEND_ORIGIN,
  ...(data.ALLOWED_ORIGINS ? data.ALLOWED_ORIGINS.split(',') : []),
]
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

if (data.NODE_ENV === 'development') {
  for (const origin of ['http://localhost:5173', 'http://127.0.0.1:5173']) {
    if (!allowedOrigins.includes(origin)) allowedOrigins.push(origin);
  }
}

export const env = {
  ...data,
  isProduction,
  isTest: data.NODE_ENV === 'test',
  authRequired: Boolean(data.APP_PASSWORD),
  authSecret,
  allowedOrigins,
  databaseMode: data.SUPABASE_URL && data.SUPABASE_SERVICE_ROLE_KEY ? 'supabase' : 'local',
  localStoreFile: resolve(backendRoot, data.LOCAL_STORE_FILE),
  frontendDist: resolve(backendRoot, '../frontend/dist'),
  backendRoot,
  warnings,
};

if (warnings.length && data.NODE_ENV !== 'test') {
  for (const warning of warnings) {
    // Avoid importing the logger here to keep configuration dependency-free.
    console.warn(`[config] ${warning}`);
  }
}
