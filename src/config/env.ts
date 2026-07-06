import dotenv from 'dotenv';
import path from 'path';

// Load .env from root directory
dotenv.config({ path: path.join(__dirname, '../../.env') });

const getEnvVar = (name: string, fallback?: string): string => {
  const val = process.env[name];
  if (!val) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Environment variable ${name} is required but was not provided.`);
  }
  return val;
};

const parseRedisUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port || '6379', 10),
      username: parsed.username || undefined,
      password: parsed.password || undefined,
      tls: url.startsWith('rediss://') ? {} : undefined,
      maxRetriesPerRequest: null,
    };
  } catch (err) {
    console.error('Failed to parse REDIS_URL, falling back to localhost options:', err);
    return {
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: null,
    };
  }
};

const redisUrl = getEnvVar('REDIS_URL');

export const config = {
  port: parseInt(getEnvVar('PORT', '3000'), 10),
  databaseUrl: getEnvVar('DATABASE_URL'),
  redisUrl,
  redisConnection: parseRedisUrl(redisUrl),
};
