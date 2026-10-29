import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/env.js';

describe('loadEnv', () => {
  it('names MONGODB_URI when it is missing', () => {
    expect(() => loadEnv({ MONGODB_DB: 'sample' })).toThrow(/MONGODB_URI/);
  });

  it('names MONGODB_DB when it is missing', () => {
    expect(() => loadEnv({ MONGODB_URI: 'mongodb://localhost' })).toThrow(/MONGODB_DB/);
  });

  it('applies defaults and parses the allowlist', () => {
    const env = loadEnv({
      MONGODB_URI: 'mongodb://localhost',
      MONGODB_DB: 'sample',
      MCP_COLLECTION_ALLOWLIST: ' movies, reviews ,',
    });
    expect(env).toEqual({
      MONGODB_URI: 'mongodb://localhost',
      MONGODB_DB: 'sample',
      MCP_COLLECTION_ALLOWLIST: ['movies', 'reviews'],
      MCP_MAX_TIME_MS: 5000,
    });
  });

  it('treats an empty allowlist as unset', () => {
    const env = loadEnv({ MONGODB_URI: 'mongodb://localhost', MONGODB_DB: 'sample', MCP_COLLECTION_ALLOWLIST: ' , ' });
    expect(env.MCP_COLLECTION_ALLOWLIST).toBeUndefined();
  });

  it('rejects a non-positive time limit', () => {
    expect(() =>
      loadEnv({ MONGODB_URI: 'mongodb://localhost', MONGODB_DB: 'sample', MCP_MAX_TIME_MS: '0' }),
    ).toThrow(/MCP_MAX_TIME_MS/);
  });
});
