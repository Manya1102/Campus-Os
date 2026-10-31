// PostgreSQL connection and a small parameter/result adapter for the API.
// The API uses '?' placeholders and familiar insertId/affectedRows results;
// SQL statements themselves are PostgreSQL syntax.
const { Pool, types } = require('pg')

types.setTypeParser(1082, (value) => value) // Preserve DATE as YYYY-MM-DD.

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required. Set it in backend/.env or the backend hosting environment.')
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'disable' ? false : { rejectUnauthorized: process.env.DATABASE_SSL === 'verify-full' },
  max: Number(process.env.DB_POOL_SIZE) || 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
})

pool.on('error', (error) => console.error('Unexpected PostgreSQL pool error:', error))

function toPostgres(sql) {
  let query = String(sql).trim().replace(/;\s*$/, '')
  let output = ''
  let placeholder = 0
  let quote = null
  let lineComment = false
  let blockComment = false

  for (let i = 0; i < query.length; i += 1) {
    const char = query[i]
    const next = query[i + 1]

    if (lineComment) {
      output += char
      if (char === '\n') lineComment = false
      continue
    }
    if (blockComment) {
      output += char
      if (char === '*' && next === '/') {
        output += next
        i += 1
        blockComment = false
      }
      continue
    }
    if (quote) {
      output += char
      if (char === quote) {
        if (next === quote) {
          output += next
          i += 1
        } else {
          quote = null
        }
      } else if (char === '\\' && quote === "'" && next) {
        output += next
        i += 1
      }
      continue
    }

    if (char === '-' && next === '-') {
      output += '--'
      i += 1
      lineComment = true
    } else if (char === '/' && next === '*') {
      output += '/*'
      i += 1
      blockComment = true
    } else if (char === "'" || char === '"') {
      quote = char
      output += char
    } else if (char === '?') {
      placeholder += 1
      output += `$${placeholder}`
    } else {
      output += char
    }
  }

  // PostgreSQL lowercases unquoted aliases. Keep API-facing camelCase keys.
  query = output.replace(/\bAS\s+([A-Za-z_][A-Za-z0-9]*[A-Z][A-Za-z0-9_]*)\b/g, 'AS "$1"')
  if (/^INSERT\s+INTO\b/i.test(query) && !/\bRETURNING\b/i.test(query)) query += ' RETURNING id'
  return query
}

async function runQuery(client, sql, params = []) {
  const command = String(sql).trim().match(/^(SELECT|INSERT|UPDATE|DELETE|WITH)\b/i)?.[1]?.toUpperCase()
  try {
    const result = await client.query(toPostgres(sql), params)
    if (command === 'SELECT' || command === 'WITH') return [result.rows]
    if (command === 'INSERT') return [{ insertId: result.rows[0]?.id ?? null, affectedRows: result.rowCount }]
    return [{ affectedRows: result.rowCount }]
  } catch (error) {
    if (error.code === '23505') error.code = 'ER_DUP_ENTRY'
    throw error
  }
}

const db = {
  query: (sql, params = []) => runQuery(pool, sql, params),
  async getConnection() {
    const client = await pool.connect()
    return {
      query: (sql, params = []) => runQuery(client, sql, params),
      beginTransaction: () => client.query('BEGIN'),
      commit: () => client.query('COMMIT'),
      rollback: () => client.query('ROLLBACK'),
      release: () => client.release(),
    }
  },
  end: () => pool.end(),
}

module.exports = db
