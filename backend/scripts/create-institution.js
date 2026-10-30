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
      if (key === '\u0003') {
        process.stdin.setRawMode(false)
        process.stdin.pause()
        process.exit(1)
      }
      if (key === '\r' || key === '\n') {
        process.stdout.write('\n')
        process.stdin.removeListener('data', onData)
        process.stdin.setRawMode(false)
        process.stdin.pause()
        resolve(value)
        return
      }
      if (key === '\u007f' || key === '\b') {
        if (value.length) {
          value = value.slice(0, -1)
          process.stdout.write('\b \b')
        }
        return
      }
      if (key >= ' ' && key <= '~') {
        value += key
        process.stdout.write(hidden ? '*' : key)
      }
    }
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.on('data', onData)
  })
}

async function main() {
  if (!process.stdin.isTTY) throw new Error('Run this command from an interactive terminal.')
  const universityName = (await ask('University name: ')).trim()
  const city = (await ask('City (optional): ')).trim() || null
  const collegeName = (await ask('First college name: ')).trim()
  const departmentName = (await ask('First department name: ')).trim()
  const adminName = (await ask('Administrator full name: ')).trim()
  const email = (await ask('Administrator email: ')).trim().toLowerCase()
  const password = await ask('Administrator password (8+ characters, letters and numbers): ', true)
  if (universityName.length < 2 || universityName.length > 200) throw new Error('University name must be 2-200 characters.')
  if (city && city.length > 100) throw new Error('City must be 100 characters or fewer.')
  if (collegeName.length < 2 || collegeName.length > 200) throw new Error('College name must be 2-200 characters.')
  if (departmentName.length < 2 || departmentName.length > 200) throw new Error('Department name must be 2-200 characters.')
  if (adminName.length < 2 || adminName.length > 150) throw new Error('Administrator name must be 2-150 characters.')
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 255) throw new Error('Enter a valid administrator email address.')
  if (password.length < 8 || password.length > 128 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new Error('Password must be 8-128 characters and contain a letter and a number.')
  }

  const salt = crypto.randomBytes(16).toString('hex')
  const hash = await scrypt(password, salt, 64)
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'campus_os',
  })
  try {
    await db.beginTransaction()
    const [university] = await db.query('INSERT INTO universities (name, city) VALUES (?, ?)', [universityName, city])
    const [college] = await db.query('INSERT INTO colleges (university_id, name) VALUES (?, ?)', [university.insertId, collegeName])
    const [department] = await db.query('INSERT INTO departments (college_id, name) VALUES (?, ?)', [college.insertId, departmentName])
    const [admin] = await db.query(
      'INSERT INTO users (email, password_hash, full_name, role) VALUES (?, ?, ?, \'admin\')',
      [email, `${salt}$${hash.toString('hex')}`, adminName]
    )
    await db.query('INSERT INTO admin_profiles (user_id, university_id) VALUES (?, ?)', [admin.insertId, university.insertId])
    await db.commit()
    process.stdout.write(`Created ${universityName} (university ID ${university.insertId}) and its institution administrator ${email}.\n`)
  } catch (err) {
    await db.rollback()
    throw err
  } finally {
    await db.end()
  }
}

main().catch((err) => {
  process.stderr.write(`${err.message}\n`)
  process.exitCode = 1
})
