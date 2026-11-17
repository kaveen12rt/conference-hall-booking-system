import pg from "pg";

const { Pool } = pg;

export function createDatabasePool(connectionString) {
  return new Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  });
}
