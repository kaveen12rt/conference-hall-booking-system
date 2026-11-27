import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/**
 * Translates PostgreSQL-style `$1, $2, ...` placeholders (outside string literals)
 * into MySQL `?` placeholders and binds values in order of appearance.
 */
function prepareQuery(sql, params = []) {
  const bound = [];
  let output = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;

  for (let index = 0; index < sql.length; index += 1) {
    const ch = sql[index];

    if (inSingleQuote) {
      output += ch;
      if (ch === "\\" && index + 1 < sql.length) {
        output += sql[index + 1];
        index += 1;
      } else if (ch === "'" && sql[index + 1] === "'") {
        output += sql[index + 1];
        index += 1;
      } else if (ch === "'") {
        inSingleQuote = false;
      }
      continue;
    }

    if (inDoubleQuote) {
      output += ch;
      if (ch === "\\" && index + 1 < sql.length) {
        output += sql[index + 1];
        index += 1;
      } else if (ch === '"' && sql[index + 1] === '"') {
        output += sql[index + 1];
        index += 1;
      } else if (ch === '"') {
        inDoubleQuote = false;
      }
      continue;
    }

    if (inBacktick) {
      output += ch;
      if (ch === "`") {
        inBacktick = false;
      }
      continue;
    }

    if (ch === "'") {
      inSingleQuote = true;
      output += ch;
      continue;
    }
    if (ch === '"') {
      inDoubleQuote = true;
      output += ch;
      continue;
    }
    if (ch === "`") {
      inBacktick = true;
      output += ch;
      continue;
    }

    if (ch === "$" && /[1-9]/.test(sql[index + 1] ?? "")) {
      let end = index + 1;
      while (end < sql.length && /\d/.test(sql[end])) {
        end += 1;
      }
      const paramIndex = Number(sql.slice(index + 1, end)) - 1;
      const rawValue = params[paramIndex];
      bound.push(rawValue === undefined ? null : rawValue);
      output += "?";
      index = end - 1;
      continue;
    }

    output += ch;
  }

  return { sql: output, bound };
}

function buildSslOptions(sslCa) {
  if (!sslCa) {
    return { rejectUnauthorized: false };
  }
  const resolved = isAbsolute(sslCa) ? sslCa : resolve(REPOSITORY_ROOT, sslCa);
  if (existsSync(resolved)) {
    return {
      ca: readFileSync(resolved, "utf8"),
      rejectUnauthorized: true,
    };
  }
  return { rejectUnauthorized: false };
}

async function runOnConnection(executor, sql, params = []) {
  const trimmed = sql.trim().replace(/;+\s*$/, "");
  const upper = trimmed.toUpperCase();

  if (upper === "BEGIN" && typeof executor.beginTransaction === "function") {
    await executor.beginTransaction();
    return { rows: [], rowCount: 0 };
  }
  if (upper === "COMMIT" && typeof executor.commit === "function") {
    await executor.commit();
    return { rows: [], rowCount: 0 };
  }
  if (upper === "ROLLBACK" && typeof executor.rollback === "function") {
    await executor.rollback();
    return { rows: [], rowCount: 0 };
  }

  const prepared = prepareQuery(trimmed, params);
  const [result] = await executor.query(prepared.sql, prepared.bound);

  if (Array.isArray(result)) {
    return { rows: result, rowCount: result.length };
  }
  return {
    rows: [],
    rowCount: Number(result?.affectedRows ?? 0),
  };
}

/**
 * Creates a MySQL connection pool configured from `.env` settings.
 */
export function createDatabasePool(dbConfig, { multipleStatements = false } = {}) {
  const pool = mysql.createPool({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    ssl: buildSslOptions(dbConfig.sslCa),
    waitForConnections: true,
    connectionLimit: 10,
    connectTimeout: 25_000,
    timezone: "Z",
    dateStrings: ["DATE", "TIME"],
    multipleStatements,
  });

  return {
    async query(sql, params = []) {
      return runOnConnection(pool, sql, params);
    },

    async exec(sql) {
      await pool.query(sql);
    },

    async connect() {
      const connection = await pool.getConnection();
      return {
        async query(sql, params = []) {
          return runOnConnection(connection, sql, params);
        },
        async exec(sql) {
          await connection.query(sql);
        },
        release() {
          connection.release();
        },
      };
    },

    async end() {
      await pool.end();
    },
  };
}
