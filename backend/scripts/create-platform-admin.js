const crypto = require('crypto')
const path = require('path')
const { promisify } = require('util')
const mysql = require('mysql2/promise')

require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
const scrypt = promisify(crypto.scrypt)

function ask(prompt, hidden = false) {
  return new Promise((resolve) => {
    process.stdout.write(prompt)
    let value = ''
    const onData = (chunk) => {
      const key = chunk.toString()
      if (key === '\u0003') { process.stdin.setRawMode(false); process.stdin.pause(); process.exit(1) }
      if (key === '\r' || key === '\n') {
        process.stdout.write('\n'); process.stdin.removeListener('data', onData); process.stdin.setRawMode(false); process.stdin.pause(); resolve(value); return
      }
      if (key === '\u007f' || key === '\b') { if (value.length) { value = value.slice(0, -1); process.stdout.write('\b \b') } return }
      if (key >= ' ' && key <= '~') { value += key; process.stdout.write(hidden ? '*' : key) }
    }
    process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.on('data', onData)
  })
}

async function main() {
  if (!process.stdin.isTTY) throw new Error('Run this command from an interactive terminal.')
  const email = (await ask('Platform administrator email: ')).trim().toLowerCase()
  const name = (await ask('Full name: ')).trim()
  const password = await ask('Password (8+ characters, letters and numbers): ', true)
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 255) throw new Error('Enter a valid email address.')
  if (name.length < 2 || name.length > 150) throw new Error('Name must be between 2 and 150 characters.')
  if (password.length < 8 || password.length > 128 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) throw new Error('Password must be 8-128 characters and contain a letter and a number.')
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = await scrypt(password, salt, 64)
  const db = await mysql.createConnection({ host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT) || 3306, user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', database: process.env.DB_NAME || 'campus_os' })
  try {
    const [created] = await db.query("INSERT INTO users (email, password_hash, full_name, role, account_status) VALUES (?, ?, ?, 'platform_admin', 'active')", [email, `${salt}$${hash.toString('hex')}`, name])
    process.stdout.write(`Created platform administrator account ${email} (user ${created.insertId}).\n`)
  } finally { await db.end() }
}
main().catch((err) => { process.stderr.write(`${err.message}\n`); process.exitCode = 1 })
