// Load test-specific env first when present, and never override variables already
// provided by the shell/CI job.
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '.env.test'), override: false });
dotenv.config({ override: false });

// Ensure JWT_SECRET is set so validateEnv() in src/index.ts does not process.exit(1) when tests import createApp.
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test-jwt-secret';
}

const DUMMY_DB_URL = 'postgresql://test_user:test_pass@localhost:5432/test_db?schema=public';

// Ensure DATABASE_URL is set so src/config/index.ts validation passes in unit tests
// that mock Prisma and do not require a real database.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = DUMMY_DB_URL;
}

// Global helper to check if a real DB is available
global.hasDb = Boolean(
  process.env.DATABASE_URL && 
  process.env.DATABASE_URL !== DUMMY_DB_URL &&
  !process.env.DATABASE_URL.includes('test_pass@localhost')
);

/**
 * Utility to skip DB-dependent tests if database is unavailable.
 * Use in test suites that require a real database connection.
 */
global.describeIfDb = (name, fn) => {
  const { describe } = require('@jest/globals');
  if (global.hasDb || process.env.RUN_DB_TESTS === 'true' || process.env.CI === 'true') {
    describe(name, fn);
  } else {
    describe.skip(`[DB SKIPPED] ${name}`, fn);
  }
};

/**
 * Helper to verify database connectivity.
 * Returns true if database is available, false otherwise.
 */
global.checkDbConnectivity = async () => {
  if (!global.hasDb) {
    console.warn('DATABASE_URL not configured or is dummy URL. Database tests will be skipped.');
    return false;
  }
  
  try {
    const { prisma } = require('./src/lib/prisma');
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Database connectivity check failed:', error.message);
    return false;
  }
};
