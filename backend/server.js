// Campus OS backend: the whole API in one file.
// Run it with:  npm run dev   (nodemon restarts it automatically whenever you save this file)
//
// How login works (Phase 5):
//   1. A user signs up or logs in -> the server checks the password and sends back a token (JWT).
//   2. The React app sends that token with every request: "Authorization: Bearer <token>".
//   3. The server checks the token, loads who the user is from the database, and then decides
//      what they are allowed to see or change (student, faculty, and which department).
//
// Every route below requires login EXCEPT: health check, the department list, signup and login.

require('dotenv').config()
const crypto = require('crypto')
const fs = require('fs/promises')
const path = require('path')
const { promisify } = require('util')
const express = require('express')
const cors = require('cors')
const db = require('./database')
const jwt = require('jsonwebtoken')

const scrypt = promisify(crypto.scrypt)

const app = express()
const PORT = process.env.PORT || 5001
const IS_PRODUCTION = process.env.NODE_ENV === 'production'
const RESOURCE_UPLOAD_DIR = path.join(__dirname, 'uploads')
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '')
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'campus-resources'

// ---------------------------------------------------------------------------
// 1. Setup: secret key, CORS, JSON, and the Supabase PostgreSQL connection
// ---------------------------------------------------------------------------

// The secret used to sign login tokens. Anyone who knows it can pretend to be any user,
// so it must be long, random and private (it lives in backend/.env, never in the code).
let JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  if (IS_PRODUCTION) {
    console.error('JWT_SECRET is missing. Set a long random value before running in production.')
    process.exit(1)
  }
  console.warn('WARNING: JWT_SECRET is not set in .env, so an insecure development key is being used.')
  JWT_SECRET = 'dev-only-insecure-secret-do-not-use-in-production'
} else if (JWT_SECRET.length < 32) {
  if (IS_PRODUCTION) {
    console.error('JWT_SECRET is too short. Use at least 32 random characters.')
    process.exit(1)
  }
  console.warn('WARNING: JWT_SECRET is shorter than 32 characters. Use a longer random one.')
}
const TOKEN_LIFETIME = '7d'

// Allow the React app. Any localhost port works (Vite may use 5173, 5174, ...).
// To allow a deployed site later, set CORS_ORIGIN in .env.
app.use(
  cors({
    origin(origin, callback) {
      const isLocal = !origin || /^http:\/\/localhost:\d+$/.test(origin)
      callback(null, isLocal || origin === process.env.CORS_ORIGIN)
    },
  })
)
app.use(express.json({ limit: '100kb' }))

// Wraps a route so any error becomes a clean JSON response instead of crashing the server.
function route(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next)
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message })
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status })
}

function hasSupabaseStorage() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
}

function supabaseStorageObjectUrl(resourceId, download = false) {
  const access = download ? 'authenticated' : ''
  const prefix = access ? `/object/${access}` : '/object'
  return `${SUPABASE_URL}/storage/v1${prefix}/${encodeURIComponent(SUPABASE_STORAGE_BUCKET)}/resources/${resourceId}.pdf`
}

async function uploadResourceFile(resourceId, file) {
  if (!hasSupabaseStorage()) {
    if (IS_PRODUCTION) {
      throw httpError(503, 'File storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
    }
    await fs.mkdir(RESOURCE_UPLOAD_DIR, { recursive: true })
    await fs.writeFile(path.join(RESOURCE_UPLOAD_DIR, `${resourceId}.pdf`), file, { flag: 'wx' })
    return
  }

  const response = await fetch(supabaseStorageObjectUrl(resourceId), {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/pdf',
      'x-upsert': 'false',
    },
    body: file,
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    console.error(`Supabase Storage upload failed (${response.status}): ${detail.slice(0, 500)}`)
    throw new Error('Resource file could not be saved to storage')
  }
}

async function sendResourceFile(resourceId, res) {
  if (!hasSupabaseStorage()) {
    const filePath = path.join(RESOURCE_UPLOAD_DIR, `${resourceId}.pdf`)
    res.type('application/pdf')
    res.set('Content-Disposition', `inline; filename="resource-${resourceId}.pdf"`)
    return res.sendFile(filePath, (err) => {
      if (err && !res.headersSent) res.status(err.statusCode === 404 ? 404 : 500).json({ error: 'Resource file could not be opened' })
    })
  }

  const response = await fetch(supabaseStorageObjectUrl(resourceId, true), {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  })
  if (!response.ok) {
    if (response.status === 404) throw httpError(404, 'Resource file not found')
    const detail = await response.text().catch(() => '')
    console.error(`Supabase Storage download failed (${response.status}): ${detail.slice(0, 500)}`)
    throw new Error('Resource file could not be opened')
  }
  res.type('application/pdf')
  res.set('Content-Disposition', `inline; filename="resource-${resourceId}.pdf"`)
  res.send(Buffer.from(await response.arrayBuffer()))
}

// Runs several database changes as one unit: either all are saved, or none are.
async function withTransaction(work) {
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const result = await work(conn)
    await conn.commit()
    return result
  } catch (err) {
    try {
      await conn.rollback()
    } catch (_) {
      // the connection may already be gone; the original error is the one that matters
    }
    throw err
  } finally {
    conn.release()
  }
}

// ---------------------------------------------------------------------------
// 2. Small helpers: dates, validation, passwords, rate limiting
// ---------------------------------------------------------------------------

// 'YYYY-MM-DD' for today (offsetDays = -1 for yesterday, 1 for tomorrow)
function dateString(offsetDays = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function isValidDateString(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validateEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!email || email.length > 255 || !EMAIL_PATTERN.test(email)) {
    throw httpError(400, 'Enter a valid email address')
  }
  return email
}

function validatePassword(value) {
  if (typeof value !== 'string' || value.length < 8) {
    throw httpError(400, 'Password must be at least 8 characters')
  }
  if (value.length > 128) throw httpError(400, 'Password must be 128 characters or fewer')
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    throw httpError(400, 'Password must contain at least one letter and one number')
  }
  return value
}

function cleanText(value, label, min, max) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (text.length < min || text.length > max) {
    throw httpError(400, `${label} must be between ${min} and ${max} characters`)
  }
  return text
}

function wholeNumber(value, label, min, max) {
  const n = Number(value)
  if (!Number.isInteger(n) || n < min || n > max) {
    throw httpError(400, `${label} must be a whole number from ${min} to ${max}`)
  }
  return n
}

function validateVisibility(value) {
  const visibility = value || 'university'
  if (!['university', 'cross_campus'].includes(visibility)) {
    throw httpError(400, 'Visibility must be university or cross_campus')
  }
  return visibility
}

function dateTimeValue(value, label, optional = false) {
  if (optional && !value) return null
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ||
      !isValidDateString(value.slice(0, 10))) {
    throw httpError(400, `${label} must be a valid date and time`)
  }
  const hour = Number(value.slice(11, 13))
  const minute = Number(value.slice(14, 16))
  if (hour > 23 || minute > 59) throw httpError(400, `${label} must be a valid date and time`)
  return `${value.replace('T', ' ')}:00`
}

function optionalUrl(value, label) {
  if (!value) return null
  const url = cleanText(value, label, 1, 500)
  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('protocol')
  } catch (_) {
    throw httpError(400, `${label} must be an http or https URL`)
  }
  return url
}

function timeValue(value, label) {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) throw httpError(400, `${label} must be a valid time`)
  const [hour, minute] = value.split(':').map(Number)
  if (hour > 23 || minute > 59) throw httpError(400, `${label} must be a valid time`)
  return value
}

// Passwords are never stored. We store "salt$hash", made with scrypt (built into Node).
// A fresh random salt per user means two people with the same password get different hashes.
async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const key = await scrypt(password, salt, 64)
  return `${salt}$${key.toString('hex')}`
}

async function verifyPassword(password, stored) {
  if (typeof stored !== 'string' || !stored.includes('$')) return false
  const [salt, hash] = stored.split('$')
  const expected = Buffer.from(hash, 'hex')
  if (expected.length !== 64) return false
  const actual = await scrypt(password, salt, 64)
  return crypto.timingSafeEqual(actual, expected)
}

// Used when an email isn't found, so "wrong email" and "wrong password" take the same time.
const dummyHashPromise = hashPassword('this-is-not-a-real-password-1')

// Limits how often something can be done (for example, login attempts) to slow down guessing.
// It lives in the server's memory, so it resets when the server restarts.
function rateLimit({ windowMs, max, message, key }) {
  const hits = new Map()
  const cleaner = setInterval(() => {
    const now = Date.now()
    for (const [k, entry] of hits) if (entry.resetAt <= now) hits.delete(k)
  }, windowMs)
  cleaner.unref()

  const middleware = (req, res, next) => {
    const k = key ? key(req) : req.ip
    const now = Date.now()
    let entry = hits.get(k)
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs }
      hits.set(k, entry)
    }
    entry.count++
    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)))
      return res.status(429).json({ error: message || 'Too many requests. Please try again later.' })
    }
    next()
  }
  middleware.reset = (k) => hits.delete(k)
  return middleware
}

const FIFTEEN_MINUTES = 15 * 60 * 1000
const loginKey = (req) => `${req.ip}|${String((req.body && req.body.email) || '').toLowerCase()}`
const ipLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  max: 100,
  message: 'Too many attempts from this device. Please wait a few minutes and try again.',
})
const loginLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  max: 10,
  message: 'Too many login attempts. Please wait 15 minutes and try again.',
  key: loginKey,
})

// ---------------------------------------------------------------------------
// 3. Who is making the request? (tokens, user lookup, role checks)
// ---------------------------------------------------------------------------

function signToken(userId) {
  // The token only says "this is user N". Role and department are read fresh from the
  // database on every request, so removing or changing a user takes effect immediately.
  return jwt.sign({}, JWT_SECRET, {
    subject: String(userId),
    expiresIn: TOKEN_LIFETIME,
    algorithm: 'HS256',
  })
}

// Everything the rest of the code needs to know about the logged-in user.
// Admin accounts are provisioned by trusted operators and scoped to one university.
async function loadUserContext(userId) {
  const [rows] = await db.query(
    `SELECT u.id AS user_id, u.email, u.full_name AS name, u.role, u.account_status,
            s.id AS student_id, s.program_id, s.class_section_id,
            f.id AS faculty_id, ap.id AS admin_id,
            d.id AS department_id, d.college_id,
            CASE WHEN u.role = 'admin' THEN ap.university_id
                 WHEN u.role = 'platform_admin' THEN NULL ELSE c.university_id END AS university_id
     FROM users u
     LEFT JOIN students s ON u.role = 'student' AND s.user_id = u.id
     LEFT JOIN faculty f ON u.role = 'faculty' AND f.user_id = u.id
     LEFT JOIN admin_profiles ap ON ap.user_id = u.id
     LEFT JOIN departments d ON d.id = COALESCE(s.department_id, f.department_id)
     LEFT JOIN colleges c ON c.id = d.college_id
     WHERE u.id = ?`,
    [userId]
  )
  return rows[0] || null
}

// What the React app is allowed to know about the logged-in user.
function publicUser(user) {
  return { id: user.user_id, name: user.name, email: user.email, role: user.role }
}

// Runs before every protected route: checks the token and attaches req.user.
const requireAuth = route(async (req, res, next) => {
  const [scheme, token] = (req.headers.authorization || '').split(' ')
  if (scheme !== 'Bearer' || !token) throw httpError(401, 'Please log in to continue')

  let payload
  try {
    payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] })
  } catch (err) {
    throw httpError(401, 'Your session has expired. Please log in again')
  }

  const user = await loadUserContext(Number(payload.sub))
  if (!user) throw httpError(401, 'Account not found. Please log in again')

  req.user = user
  next()
})

// Use on a route to allow only certain roles, e.g. requireRole('faculty').
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to do that' })
    }
    next()
  }
}

const studentOnly = requireRole('student')
const facultyOnly = requireRole('faculty')
const adminOnly = requireRole('admin')
const platformAdminOnly = requireRole('platform_admin')
const institutionAdminOnly = (req, res, next) => {
  if (req.user.role !== 'admin' || !req.user.admin_id || !req.user.university_id) {
    return res.status(403).json({ error: 'An institution administrator account is required' })
  }
  next()
}

// ---------------------------------------------------------------------------
// 4. Public routes: health check, department list, signup, login
// ---------------------------------------------------------------------------

app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1')
    res.json({ status: 'ok', database: 'connected' })
  } catch (err) {
    res.status(500).json({ status: 'error', database: 'unreachable', message: err.message })
  }
})

app.post('/api/platform/institutions', requireAuth, platformAdminOnly, route(async (req, res) => {
  const body = req.body || {}
  const universityName = cleanText(body.universityName, 'University name', 2, 200)
  const city = body.city ? cleanText(body.city, 'City', 2, 100) : null
  const collegeName = cleanText(body.collegeName, 'College name', 2, 200)
  const departmentName = cleanText(body.departmentName, 'Department name', 2, 200)
  const adminName = cleanText(body.adminName, 'Administrator name', 2, 150)
  const adminEmail = validateEmail(body.adminEmail)
  const adminPassword = validatePassword(body.adminPassword)
  const [[existing]] = await db.query('SELECT id FROM universities WHERE LOWER(name) = LOWER(?)', [universityName])
  if (existing) throw httpError(409, 'A university with that name already exists')
  const passwordHash = await hashPassword(adminPassword)
  const created = await withTransaction(async (conn) => {
    const [uni] = await conn.query('INSERT INTO universities (name, city) VALUES (?, ?)', [universityName, city])
    const [college] = await conn.query('INSERT INTO colleges (university_id, name) VALUES (?, ?)', [uni.insertId, collegeName])
    const [department] = await conn.query('INSERT INTO departments (college_id, name) VALUES (?, ?)', [college.insertId, departmentName])
    const [user] = await conn.query(
      `INSERT INTO users (email, password_hash, full_name, role, account_status)
       VALUES (?, ?, ?, 'admin', 'active')`, [adminEmail, passwordHash, adminName]
    )
    await conn.query('INSERT INTO admin_profiles (user_id, university_id) VALUES (?, ?)', [user.insertId, uni.insertId])
    return { universityId: uni.insertId, collegeId: college.insertId, departmentId: department.insertId, administratorId: user.insertId }
  }).catch((err) => {
    if (err.code === 'ER_DUP_ENTRY') throw httpError(409, 'That administrator email already exists')
    throw err
  })
  res.status(201).json({ ...created, universityName, collegeName, departmentName, adminEmail })
}))

// Universities > colleges > departments, for the signup form's dropdowns.
app.get('/api/auth/directory', route(async (req, res) => {
  const [rows] = await db.query(
    `SELECT u.id AS universityId, u.name AS universityName,
            c.id AS collegeId, c.name AS collegeName,
            d.id AS departmentId, d.name AS departmentName
     FROM universities u
     JOIN colleges c ON c.university_id = u.id
     JOIN departments d ON d.college_id = c.id
     ORDER BY u.name, c.name, d.name`
  )

  const universities = []
  for (const row of rows) {
    let uni = universities.find((x) => x.id === row.universityId)
    if (!uni) {
      uni = { id: row.universityId, name: row.universityName, colleges: [] }
      universities.push(uni)
    }
    let college = uni.colleges.find((x) => x.id === row.collegeId)
    if (!college) {
      college = { id: row.collegeId, name: row.collegeName, departments: [] }
      uni.colleges.push(college)
    }
    college.departments.push({ id: row.departmentId, name: row.departmentName })
  }
  res.json(universities)
}))

// Public student/faculty signup. Accounts remain pending until institution review.
app.post('/api/auth/signup', ipLimiter, route(async (req, res) => {
  const body = req.body || {}
  const name = cleanText(body.name, 'Name', 2, 100)
  const email = validateEmail(body.email)
  const password = validatePassword(body.password)
  const role = body.role === 'faculty' ? 'faculty' : 'student'
  const universityId = wholeNumber(body.universityId, 'University', 1, 2147483647)
  const departmentId = wholeNumber(body.departmentId, 'Department', 1, 2147483647)
  const [departments] = await db.query(
    `SELECT d.id FROM departments d JOIN colleges c ON c.id = d.college_id
     WHERE d.id = ? AND c.university_id = ?`, [departmentId, universityId]
  )
  if (!departments.length) throw httpError(400, 'Choose a department within the selected university')

  let studentPlacement = { programId: null, programName: 'Unassigned', year: 1, semester: 1, sectionId: null }
  if (role === 'student') {
    const [sections] = await db.query(
      `SELECT p.id AS programId, p.name AS programName, cs.id AS sectionId, cs.year, cs.semester
       FROM programs p LEFT JOIN class_sections cs ON cs.program_id = p.id
       WHERE p.department_id = ?
       ORDER BY (cs.id IS NULL), cs.year, cs.semester, p.name, cs.section_name
       LIMIT 1`, [departmentId]
    )
    if (sections.length) {
      studentPlacement = {
        programId: sections[0].programId,
        programName: sections[0].programName,
        year: sections[0].year || 1,
        semester: sections[0].semester || 1,
        sectionId: sections[0].sectionId,
      }
    }
  }

  const passwordHash = await hashPassword(password)

  let userId
  try {
    userId = await withTransaction(async (conn) => {
      const [created] = await conn.query(
        'INSERT INTO users (email, password_hash, full_name, role, account_status) VALUES (?, ?, ?, ?, \'pending\')',
        [email, passwordHash, name, role]
      )

      if (role === 'student') {
        const rollNumber = body.institutionalId
          ? cleanText(body.institutionalId, 'Roll number', 1, 50)
          : `PENDING-${created.insertId}`
        const [createdStudent] = await conn.query(
          `INSERT INTO students (user_id, department_id, roll_number, program, year, semester, program_id, class_section_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [created.insertId, departmentId, rollNumber, studentPlacement.programName, studentPlacement.year, studentPlacement.semester, studentPlacement.programId, studentPlacement.sectionId]
        )
        // Enroll only in the subjects offered to this exact class section.
        if (studentPlacement.sectionId) {
          await conn.query(
            `INSERT INTO enrollments (student_id, subject_id)
             SELECT ?, subject_id FROM subject_offerings WHERE class_section_id = ?
             ON CONFLICT (student_id, subject_id) DO NOTHING`,
            [createdStudent.insertId, studentPlacement.sectionId]
          )
        }
      } else {
        await conn.query(
          'INSERT INTO faculty (user_id, department_id, designation) VALUES (?, ?, ?)',
          [created.insertId, departmentId, body.designation ? cleanText(body.designation, 'Designation', 2, 100) : 'Faculty']
        )
      }
      return created.insertId
    })
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      if (/uq_roll_in_department/.test(err.message)) {
        throw httpError(409, 'That roll number is already registered in this department')
      }
      throw httpError(409, 'An account with that email already exists')
    }
    throw err
  }

  res.status(201).json({
    pendingApproval: true,
    message: 'Your account was created and is waiting for institutional approval. No invite code is required.',
  })
}))

// Body: { email, password }
app.post('/api/auth/login', ipLimiter, loginLimiter, route(async (req, res) => {
  const body = req.body || {}
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!email || !password) throw httpError(400, 'Enter your email and password')

  const [rows] = await db.query('SELECT id, password_hash, account_status FROM users WHERE email = ?', [email])
  const found = rows.length > 0
  const passwordOk = await verifyPassword(password, found ? rows[0].password_hash : await dummyHashPromise)

  // Same message for "no such email" and "wrong password", so nobody can use the form
  // to find out which emails have accounts.
  if (!found || !passwordOk) throw httpError(401, 'Invalid email or password')

  if (rows[0].account_status === 'pending') {
    throw httpError(403, 'Your account is waiting for institutional approval')
  }
  if (rows[0].account_status === 'rejected') {
    throw httpError(403, 'Your account was not approved. Contact your institution administrator')
  }

  loginLimiter.reset(loginKey(req))
  const user = await loadUserContext(rows[0].id)
  res.json({ token: signToken(rows[0].id), user: publicUser(user) })
}))

// ---------------------------------------------------------------------------
// 5. From here on, EVERY route requires login.
//    (Routes are checked in order, so anything added below is protected by default.)
// ---------------------------------------------------------------------------

app.use('/api', requireAuth)

// The logged-in user (the React app calls this on page load to restore the session)
app.get('/api/auth/me', route(async (req, res) => {
  res.json(publicUser(req.user))
}))

// ---------------------------------------------------------------------------
// 6. Assignments (students)
// ---------------------------------------------------------------------------

const ASSIGNMENT_FIELDS = `
  a.id, a.title, sub.name AS subject, sub.code AS code,
  a.description,
  TO_CHAR(a.due_date, 'YYYY-MM-DD') AS dueDate,
  a.priority,
  COALESCE(asub.status, 'Pending') AS status`

const ASSIGNMENT_JOINS = `
  FROM assignments a
  JOIN subjects sub ON sub.id = a.subject_id
  JOIN enrollments e ON e.subject_id = sub.id AND e.student_id = ?
  LEFT JOIN assignment_submissions asub
         ON asub.assignment_id = a.id AND asub.student_id = e.student_id`

async function getAssignments(studentId) {
  const [rows] = await db.query(
    `SELECT ${ASSIGNMENT_FIELDS} ${ASSIGNMENT_JOINS} ORDER BY a.due_date, a.id`,
    [studentId]
  )
  return rows
}

app.get('/api/assignments', studentOnly, route(async (req, res) => {
  res.json(await getAssignments(req.user.student_id))
}))

// Body: { "status": "Pending" } or { "status": "Completed" }
app.patch('/api/assignments/:id/status', studentOnly, route(async (req, res) => {
  const status = req.body && req.body.status
  if (!['Pending', 'Completed'].includes(status)) {
    throw httpError(400, 'status must be Pending or Completed')
  }

  const assignmentId = Number(req.params.id)

  // A student can only change assignments for subjects they are enrolled in.
  const [allowed] = await db.query(
    `SELECT a.id FROM assignments a
     JOIN enrollments e ON e.subject_id = a.subject_id AND e.student_id = ?
     WHERE a.id = ?`,
    [req.user.student_id, assignmentId]
  )
  if (!allowed.length) throw httpError(404, 'Assignment not found for this student')

  await db.query(
    `INSERT INTO assignment_submissions (assignment_id, student_id, status, completed_at)
     VALUES (?, ?, ?, CASE WHEN ? = 'Completed' THEN CURRENT_TIMESTAMP ELSE NULL END)
     ON CONFLICT (assignment_id, student_id) DO UPDATE SET
       status = EXCLUDED.status,
       completed_at = CASE WHEN EXCLUDED.status = 'Completed' THEN CURRENT_TIMESTAMP ELSE NULL END`,
    [assignmentId, req.user.student_id, status, status]
  )

  const [rows] = await db.query(
    `SELECT ${ASSIGNMENT_FIELDS} ${ASSIGNMENT_JOINS} WHERE a.id = ?`,
    [req.user.student_id, assignmentId]
  )
  res.json(rows[0])
}))

// ---------------------------------------------------------------------------
// 7. Attendance (students read their own; faculty mark it in section 13)
// ---------------------------------------------------------------------------

// Attended and total classes per subject ("late" counts as attended).
async function getAttendance(studentId) {
  const [rows] = await db.query(
    `SELECT sub.id, sub.name, sub.code,
            COALESCE(SUM((a.status IN ('present','late'))::integer), 0) AS attended,
            COUNT(a.id) AS total
     FROM enrollments e
     JOIN subjects sub ON sub.id = e.subject_id
     LEFT JOIN attendance a ON a.subject_id = sub.id AND a.student_id = e.student_id
     WHERE e.student_id = ?
     GROUP BY sub.id, sub.name, sub.code
     ORDER BY sub.code`,
    [studentId]
  )
  return rows.map((r) => ({ ...r, attended: Number(r.attended), total: Number(r.total) }))
}

app.get('/api/attendance', studentOnly, route(async (req, res) => {
  res.json(await getAttendance(req.user.student_id))
}))

// ---------------------------------------------------------------------------
// 8. Timetable (students)
// ---------------------------------------------------------------------------

const DAY_CODES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_NAMES = {
  Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday',
  Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday',
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

// Classes for one day. Defaults to today; pass 'Mon'..'Sat' to see another day.
async function getTimetable(studentId, dayParam) {
  const now = new Date()
  const todayCode = DAY_CODES[now.getDay()]
  const dayCode = DAY_CODES.includes(dayParam) ? dayParam : todayCode

  const [rows] = await db.query(
    `SELECT TO_CHAR(t.start_time, 'HH12:MI AM') AS time,
            TO_CHAR(t.end_time,   'HH12:MI AM') AS endTime,
            TO_CHAR(t.start_time, 'HH24:MI')    AS start24,
            TO_CHAR(t.end_time,   'HH24:MI')    AS end24,
            sub.name AS subject, sub.code, t.room, t.class_type AS type
     FROM timetable t
     JOIN subjects sub ON sub.id = t.subject_id
     JOIN enrollments e ON e.subject_id = sub.id AND e.student_id = ?
     WHERE t.day_of_week = ?
     ORDER BY t.start_time`,
    [studentId, dayCode]
  )

  // Next class: the first one still to start today (or the first one on another day)
  let next = rows[0]
  if (dayCode === todayCode) {
    const nowMinutes = now.getHours() * 60 + now.getMinutes()
    next = rows.find((r) => toMinutes(r.start24) > nowMinutes)
  }

  // Free periods: gaps of 15+ minutes between classes
  let freePeriods = 0
  for (let i = 1; i < rows.length; i++) {
    if (toMinutes(rows[i].start24) - toMinutes(rows[i - 1].end24) >= 15) freePeriods++
  }

  return {
    day: DAY_NAMES[dayCode],
    isToday: dayCode === todayCode,
    classes: rows.map(({ start24, end24, ...cls }) => cls),
    summary: { total: rows.length, nextClass: next ? next.time : null, freePeriods },
  }
}

app.get('/api/timetable', studentOnly, route(async (req, res) => {
  res.json(await getTimetable(req.user.student_id, req.query.day))
}))

// ---------------------------------------------------------------------------
// 9. Announcements (everyone reads; faculty post to their own department)
// ---------------------------------------------------------------------------

const ANNOUNCEMENT_FIELDS = `
  a.id, a.category, a.title, a.body AS description,
  TO_CHAR(a.created_at, 'YYYY-MM-DD') AS date,
  a.audience, a.pinned`

// A notice is visible if it is for the whole university, or for the user's college,
// or for the user's department. Notices for other departments never reach the user.
app.get('/api/announcements', route(async (req, res) => {
  const { university_id, college_id, department_id } = req.user
  const [rows] = await db.query(
    `SELECT ${ANNOUNCEMENT_FIELDS}
     FROM announcements a
     WHERE a.university_id = ?
       AND (a.college_id IS NULL OR a.college_id = ?)
       AND (a.department_id IS NULL OR a.department_id = ?)
     ORDER BY a.pinned DESC, a.created_at DESC`,
    [university_id, college_id, department_id]
  )
  res.json(rows.map((r) => ({ ...r, pinned: Boolean(r.pinned) })))
}))

app.get('/api/calendar', route(async (req, res) => {
  const [rows] = await db.query(
    `SELECT c.id, c.title, c.category,
            TO_CHAR(c.starts_on, 'YYYY-MM-DD') AS startsOn,
            TO_CHAR(c.ends_on, 'YYYY-MM-DD') AS endsOn,
            c.description, c.audience, c.eligible_program_id AS eligibleProgramId,
            p.name AS eligibleProgram
     FROM academic_calendar_items c
     LEFT JOIN programs p ON p.id = c.eligible_program_id
     WHERE c.university_id = ? AND c.audience IN ('everyone', ?)
       AND (c.eligible_program_id IS NULL OR c.eligible_program_id = ?)
     ORDER BY c.starts_on, c.id`,
    [req.user.university_id,
      req.user.role === 'student' ? 'students' : req.user.role === 'faculty' ? 'faculty' : 'everyone',
      req.user.program_id || null]
  )
  res.json(rows)
}))

const ANNOUNCEMENT_CATEGORIES = ['Academic', 'Event', 'Department', 'General']

// Body: { title, message, category }. The notice goes to the faculty member's own department.
app.post('/api/announcements', facultyOnly, route(async (req, res) => {
  const body = req.body || {}
  const title = cleanText(body.title, 'Title', 3, 200)
  const message = cleanText(body.message, 'Message', 3, 5000)
  const category = body.category || 'Department'
  if (!ANNOUNCEMENT_CATEGORIES.includes(category)) throw httpError(400, 'Choose a valid category')

  const { university_id, college_id, department_id, user_id } = req.user
  const [[department]] = await db.query('SELECT name FROM departments WHERE id = ?', [department_id])

  const [created] = await db.query(
    `INSERT INTO announcements
       (university_id, college_id, department_id, category, title, body, audience, pinned, posted_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, FALSE, ?)`,
    [university_id, college_id, department_id, category, title, message, department.name, user_id]
  )

  const [rows] = await db.query(`SELECT ${ANNOUNCEMENT_FIELDS} FROM announcements a WHERE a.id = ?`, [created.insertId])
  res.status(201).json({ ...rows[0], pinned: Boolean(rows[0].pinned) })
}))

// ---------------------------------------------------------------------------
// 10. Events (everyone; limited to the user's own university)
// ---------------------------------------------------------------------------

app.get('/api/events', route(async (req, res) => {
  const [rows] = await db.query(
    `SELECT e.id, e.title, e.category, e.visibility,
            TO_CHAR(e.starts_at, 'YYYY-MM-DD') AS date,
            TRIM(TO_CHAR(e.starts_at, 'FMHH12:MI AM')) AS time,
            e.location, e.description, e.seats_info AS seats,
            EXISTS(SELECT 1 FROM event_registrations r
                   WHERE r.event_id = e.id AND r.user_id = ?) AS registered
     FROM events e
     WHERE (e.university_id = ? OR e.visibility = 'cross_campus')
       AND e.audience IN ('everyone', ?)
       AND (e.eligible_program_id IS NULL OR e.eligible_program_id = ?)
       AND e.starts_at >= CURRENT_TIMESTAMP
     ORDER BY e.starts_at`,
    [req.user.user_id, req.user.university_id, req.user.role === 'student' ? 'students' : req.user.role === 'faculty' ? 'faculty' : 'everyone', req.user.program_id || null]
  )
  res.json(rows.map((r) => ({ ...r, registered: Boolean(r.registered) })))
}))

async function requireEvent(req) {
  const eventId = Number(req.params.id)
  const [found] = await db.query(
    `SELECT id FROM events
     WHERE id = ? AND (university_id = ? OR visibility = 'cross_campus')
       AND audience IN ('everyone', ?) AND (eligible_program_id IS NULL OR eligible_program_id = ?) AND starts_at >= CURRENT_TIMESTAMP`,
    [eventId, req.user.university_id, req.user.role === 'student' ? 'students' : req.user.role === 'faculty' ? 'faculty' : 'everyone', req.user.program_id || null]
  )
  if (!found.length) throw httpError(404, 'Event not found')
  return eventId
}

app.post('/api/events/:id/register', route(async (req, res) => {
  const eventId = await requireEvent(req)
  await db.query(
    'INSERT INTO event_registrations (event_id, user_id) VALUES (?, ?) ON CONFLICT (event_id, user_id) DO NOTHING',
    [eventId, req.user.user_id]
  )
  res.json({ id: eventId, registered: true })
}))

app.delete('/api/events/:id/register', route(async (req, res) => {
  const eventId = await requireEvent(req)
  await db.query(
    'DELETE FROM event_registrations WHERE event_id = ? AND user_id = ?',
    [eventId, req.user.user_id]
  )
  res.json({ id: eventId, registered: false })
}))

// ---------------------------------------------------------------------------
// 11. Resources (everyone) and Career (students). Both use saved_items for favourites / saves.
// ---------------------------------------------------------------------------

// Save or unsave an item. `table` is the table the item lives in (used to check it exists).
async function setSaved(userId, type, table, itemId, saved, universityId, role, programId) {
  const [found] = await db.query(
    `SELECT id FROM ${table}
     WHERE id = ? AND (visibility = 'cross_campus' OR university_id = ?)
       AND audience IN ('everyone', ?) AND (eligible_program_id IS NULL OR eligible_program_id = ?)`,
    [itemId, universityId, role === 'student' ? 'students' : role === 'faculty' ? 'faculty' : 'everyone', programId || null]
  )
  if (!found.length) throw httpError(404, 'Item not found')

  if (saved) {
    await db.query(
      'INSERT INTO saved_items (user_id, item_type, item_id) VALUES (?, ?, ?) ON CONFLICT (user_id, item_type, item_id) DO NOTHING',
      [userId, type, itemId]
    )
  } else {
    await db.query(
      'DELETE FROM saved_items WHERE user_id = ? AND item_type = ? AND item_id = ?',
      [userId, type, itemId]
    )
  }
}

app.get('/api/resources', route(async (req, res) => {
  const [rows] = await db.query(
    `SELECT r.id, r.title, r.subject, r.type, r.format, r.description, r.author, r.icon, r.url, r.visibility,
            EXISTS(SELECT 1 FROM saved_items s
                   WHERE s.user_id = ? AND s.item_type = 'resource' AND s.item_id = r.id) AS favourite
     FROM resources r
     WHERE (r.visibility = 'cross_campus' OR r.university_id = ?)
       AND r.audience IN ('everyone', ?) AND (r.eligible_program_id IS NULL OR r.eligible_program_id = ?)
     ORDER BY r.id`,
    [req.user.user_id, req.user.university_id, req.user.role === 'student' ? 'students' : req.user.role === 'faculty' ? 'faculty' : 'everyone', req.user.program_id || null]
  )
  res.json(rows.map((r) => ({ ...r, favourite: Boolean(r.favourite) })))
}))

// Faculty may upload PDF notes for students enrolled in one of their subjects.
// Files are served through an authenticated route so institution visibility rules apply.
app.post('/api/faculty/resources', facultyOnly, express.raw({ type: 'application/octet-stream', limit: '10mb' }), route(async (req, res) => {
  const title = cleanText(req.query.title, 'Title', 3, 200)
  const subjectId = wholeNumber(req.query.subjectId, 'Subject', 1, 2147483647)
  const description = req.query.description ? cleanText(req.query.description, 'Description', 1, 5000) : null
  const originalName = String(req.query.filename || '')
  const file = req.body

  if (!/\.pdf$/i.test(originalName)) throw httpError(400, 'Upload a PDF file')
  if (!Buffer.isBuffer(file) || file.length < 5 || file.subarray(0, 5).toString() !== '%PDF-') {
    throw httpError(400, 'The selected file is not a valid PDF')
  }

  const subject = await getOwnedSubject(req.user.faculty_id, subjectId)
  const [created] = await db.query(
    `INSERT INTO resources
       (university_id, visibility, audience, title, subject, type, format, description, author, icon, url, uploaded_by)
     VALUES (?, 'university', 'everyone', ?, ?, 'Notes', 'PDF', ?, ?, '📄', NULL, ?)`,
    [req.user.university_id, title, subject.name, description, req.user.name, req.user.user_id]
  )

  try {
    await uploadResourceFile(created.insertId, file)
    await db.query('UPDATE resources SET url = ? WHERE id = ?', [`/api/resources/${created.insertId}/file`, created.insertId])
  } catch (err) {
    await db.query('DELETE FROM resources WHERE id = ?', [created.insertId])
    throw err
  }

  res.status(201).json({
    id: created.insertId, title, subject: subject.name, type: 'Notes', format: 'PDF',
    description, author: req.user.name, icon: '📄', url: `/api/resources/${created.insertId}/file`,
    visibility: 'university', favourite: false,
  })
}))

app.get('/api/resources/:id/file', route(async (req, res) => {
  const id = wholeNumber(req.params.id, 'Resource', 1, 2147483647)
  const [rows] = await db.query(
    `SELECT r.id, r.title FROM resources r
     WHERE r.id = ? AND r.url = ?
       AND (r.visibility = 'cross_campus' OR r.university_id = ?)
       AND r.audience IN ('everyone', ?)
       AND (r.eligible_program_id IS NULL OR r.eligible_program_id = ?)`,
    [id, `/api/resources/${id}/file`, req.user.university_id,
      req.user.role === 'student' ? 'students' : req.user.role === 'faculty' ? 'faculty' : 'everyone',
      req.user.program_id || null]
  )
  if (!rows.length) throw httpError(404, 'Resource file not found')

  await sendResourceFile(id, res)
}))

app.post('/api/resources/:id/favourite', route(async (req, res) => {
  const id = Number(req.params.id)
  await setSaved(req.user.user_id, 'resource', 'resources', id, true, req.user.university_id, req.user.role, req.user.program_id)
  res.json({ id, favourite: true })
}))

app.delete('/api/resources/:id/favourite', route(async (req, res) => {
  const id = Number(req.params.id)
  await setSaved(req.user.user_id, 'resource', 'resources', id, false, req.user.university_id, req.user.role, req.user.program_id)
  res.json({ id, favourite: false })
}))

app.get('/api/career', studentOnly, route(async (req, res) => {
  const [rows] = await db.query(
    `SELECT o.id, o.title, o.company, o.type, o.mode, o.location, o.stipend, o.application_url AS applicationUrl, o.visibility,
            TO_CHAR(o.deadline, 'YYYY-MM-DD') AS deadline,
            o.category, o.description, o.skills,
            EXISTS(SELECT 1 FROM saved_items s
                   WHERE s.user_id = ? AND s.item_type = 'opportunity' AND s.item_id = o.id) AS saved
     FROM opportunities o
     WHERE (o.visibility = 'cross_campus' OR o.university_id = ?)
       AND o.audience IN ('everyone', 'students') AND (o.eligible_program_id IS NULL OR o.eligible_program_id = ?)
       AND o.deadline >= CURRENT_DATE
     ORDER BY o.deadline, o.id`,
    [req.user.user_id, req.user.university_id, req.user.program_id || null]
  )
  res.json(
    rows.map((r) => ({
      ...r,
      saved: Boolean(r.saved),
      // PostgreSQL JSONB is normally parsed already; handle a raw string just in case.
      skills: typeof r.skills === 'string' ? JSON.parse(r.skills) : r.skills,
    }))
  )
}))

app.post('/api/career/:id/save', studentOnly, route(async (req, res) => {
  const id = Number(req.params.id)
  await setSaved(req.user.user_id, 'opportunity', 'opportunities', id, true, req.user.university_id, req.user.role, req.user.program_id)
  res.json({ id, saved: true })
}))

app.delete('/api/career/:id/save', studentOnly, route(async (req, res) => {
  const id = Number(req.params.id)
  await setSaved(req.user.user_id, 'opportunity', 'opportunities', id, false, req.user.university_id, req.user.role, req.user.program_id)
  res.json({ id, saved: false })
}))

// ---------------------------------------------------------------------------
// 12. Profile (students and faculty)
// ---------------------------------------------------------------------------

function ordinal(n) {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'}`
}

async function getProfile(user) {
  if (user.role === 'faculty') {
    const [rows] = await db.query(
      `SELECT u.full_name AS name, u.email, f.id AS facultyId, f.designation,
              uni.name AS university, col.name AS college, d.name AS department
       FROM users u
       JOIN faculty f ON f.user_id = u.id
       JOIN departments d ON d.id = f.department_id
       JOIN colleges col ON col.id = d.college_id
       JOIN universities uni ON uni.id = col.university_id
       WHERE u.id = ?`,
      [user.user_id]
    )
    if (!rows.length) throw httpError(404, 'Profile not found')

    const { facultyId, designation, ...rest } = rows[0]
    return {
      role: 'faculty',
      ...rest,
      employeeId: `FAC${String(facultyId).padStart(4, '0')}`,
      designation: designation || 'Faculty',
    }
  }

  const [rows] = await db.query(
    `SELECT u.full_name AS name, u.email,
            s.roll_number AS studentId,
            uni.name AS university, col.name AS college, d.name AS department,
            s.program, s.year, s.semester
     FROM users u
     JOIN students s ON s.user_id = u.id
     JOIN departments d ON d.id = s.department_id
     JOIN colleges col ON col.id = d.college_id
     JOIN universities uni ON uni.id = col.university_id
     WHERE u.id = ?`,
    [user.user_id]
  )
  if (!rows.length) throw httpError(404, 'Profile not found')

  const { year, semester, ...rest } = rows[0]
  return { role: 'student', ...rest, year: `${ordinal(year)} Year`, semester: `Semester ${semester}` }
}

app.get('/api/profile', route(async (req, res) => {
  res.json(await getProfile(req.user))
}))

// Only name and email can be changed. The rest comes from the user's records.
app.patch('/api/profile', route(async (req, res) => {
  const body = req.body || {}
  const name = cleanText(body.name, 'Name', 2, 100)
  const email = validateEmail(body.email)

  try {
    await db.query('UPDATE users SET full_name = ?, email = ? WHERE id = ?', [
      name,
      email,
      req.user.user_id,
    ])
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw httpError(409, 'That email is already in use')
    throw err
  }

  res.json(await getProfile(req.user))
}))

// ---------------------------------------------------------------------------
// 13. Faculty: their subjects, marking attendance, posting assignments
//     A faculty member can only touch subjects they teach (subjects.faculty_id).
// ---------------------------------------------------------------------------

// Returns the subject if this faculty member teaches it. Otherwise "not found", so a
// faculty member can't even find out which subject ids belong to other teachers.
async function getOwnedSubject(facultyId, subjectId) {
  const [rows] = await db.query(
    'SELECT id, code, name FROM subjects WHERE id = ? AND faculty_id = ?',
    [subjectId, facultyId]
  )
  if (!rows.length) throw httpError(404, 'Subject not found')
  return rows[0]
}

app.get('/api/faculty/subjects', facultyOnly, route(async (req, res) => {
  const [rows] = await db.query(
    `SELECT s.id, s.code, s.name, s.semester,
            (SELECT COUNT(*) FROM enrollments e WHERE e.subject_id = s.id) AS students
     FROM subjects s
     WHERE s.faculty_id = ?
     ORDER BY s.code`,
    [req.user.faculty_id]
  )
  res.json(rows.map((r) => ({ ...r, students: Number(r.students) })))
}))

// The students enrolled in a subject, with their attendance status on one date (if marked).
app.get('/api/faculty/subjects/:id/roster', facultyOnly, route(async (req, res) => {
  const subjectId = Number(req.params.id)
  const date = req.query.date || dateString()
  if (!isValidDateString(date)) throw httpError(400, 'Choose a valid date')

  const subject = await getOwnedSubject(req.user.faculty_id, subjectId)
  const [students] = await db.query(
    `SELECT st.id AS studentId, u.full_name AS name, st.roll_number AS rollNumber, a.status
     FROM enrollments e
     JOIN students st ON st.id = e.student_id
     JOIN users u ON u.id = st.user_id
     LEFT JOIN attendance a
            ON a.student_id = st.id AND a.subject_id = e.subject_id AND a.class_date = ?
     WHERE e.subject_id = ?
     ORDER BY st.roll_number`,
    [date, subjectId]
  )
  res.json({ subject, date, students })
}))

const ATTENDANCE_STATUSES = ['present', 'absent', 'late']

// Body: { subjectId, date: 'YYYY-MM-DD', records: [{ studentId, status }] }
// Saving again for the same subject and date simply updates the earlier marks.
app.post('/api/faculty/attendance', facultyOnly, route(async (req, res) => {
  const body = req.body || {}
  const subjectId = wholeNumber(body.subjectId, 'Subject', 1, 2147483647)
  const { date, records } = body

  if (!isValidDateString(date)) throw httpError(400, 'Choose a valid date')
  // Tomorrow is allowed so a server in a different time zone doesn't reject "today".
  if (date > dateString(1)) throw httpError(400, 'You cannot mark attendance for a future date')
  if (!Array.isArray(records) || records.length === 0 || records.length > 500) {
    throw httpError(400, 'Send between 1 and 500 attendance records')
  }

  await getOwnedSubject(req.user.faculty_id, subjectId)

  const [enrolled] = await db.query('SELECT student_id FROM enrollments WHERE subject_id = ?', [subjectId])
  const enrolledIds = new Set(enrolled.map((r) => r.student_id))

  const seen = new Set()
  const rows = records.map((record) => {
    const studentId = Number(record && record.studentId)
    if (!enrolledIds.has(studentId)) {
      throw httpError(400, 'One or more students are not enrolled in this subject')
    }
    if (seen.has(studentId)) throw httpError(400, 'A student appears more than once')
    seen.add(studentId)
    if (!ATTENDANCE_STATUSES.includes(record.status)) {
      throw httpError(400, 'Attendance status must be present, absent or late')
    }
    return [studentId, subjectId, date, record.status, req.user.user_id]
  })

  const tuples = rows.map(() => `(${Array(5).fill('?').join(', ')})`).join(', ')
  await db.query(
    `INSERT INTO attendance (student_id, subject_id, class_date, status, marked_by)
     VALUES ${tuples}
     ON CONFLICT (student_id, subject_id, class_date)
     DO UPDATE SET status = EXCLUDED.status, marked_by = EXCLUDED.marked_by`,
    rows.flat()
  )
  res.json({ saved: rows.length })
}))

const FACULTY_ASSIGNMENT_FIELDS = `
  a.id, a.title, a.description, sub.code, sub.name AS subject,
  TO_CHAR(a.due_date, 'YYYY-MM-DD') AS dueDate, a.priority,
  (SELECT COUNT(*) FROM enrollments e WHERE e.subject_id = a.subject_id) AS totalStudents,
  (SELECT COUNT(*) FROM assignment_submissions s
     JOIN enrollments e2 ON e2.student_id = s.student_id AND e2.subject_id = a.subject_id
    WHERE s.assignment_id = a.id AND s.status = 'Completed') AS completed`

function shapeFacultyAssignment(row) {
  return { ...row, totalStudents: Number(row.totalStudents), completed: Number(row.completed) }
}

app.get('/api/faculty/assignments', facultyOnly, route(async (req, res) => {
  const [rows] = await db.query(
    `SELECT ${FACULTY_ASSIGNMENT_FIELDS}
     FROM assignments a
     JOIN subjects sub ON sub.id = a.subject_id
     WHERE sub.faculty_id = ?
     ORDER BY a.due_date DESC, a.id DESC`,
    [req.user.faculty_id]
  )
  res.json(rows.map(shapeFacultyAssignment))
}))

app.get('/api/faculty/assignments/:id/submissions', facultyOnly, route(async (req, res) => {
  const assignmentId = Number(req.params.id)
  const [owned] = await db.query(
    `SELECT a.id FROM assignments a
     JOIN subjects sub ON sub.id = a.subject_id
     WHERE a.id = ? AND sub.faculty_id = ?`,
    [assignmentId, req.user.faculty_id]
  )
  if (!owned.length) throw httpError(404, 'Assignment not found')

  const [rows] = await db.query(
    `SELECT st.id AS studentId, u.full_name AS student, st.roll_number AS rollNumber,
            COALESCE(asub.status, 'Pending') AS status,
            TO_CHAR(asub.completed_at, 'YYYY-MM-DD HH24:MI') AS completedAt
     FROM assignments a
     JOIN enrollments e ON e.subject_id = a.subject_id
     JOIN students st ON st.id = e.student_id
     JOIN users u ON u.id = st.user_id
     LEFT JOIN assignment_submissions asub
       ON asub.assignment_id = a.id AND asub.student_id = st.id
     WHERE a.id = ?
     ORDER BY u.full_name`,
    [assignmentId]
  )
  res.json(rows)
}))

// Body: { subjectId, title, description?, dueDate: 'YYYY-MM-DD', priority? }
// Students enrolled in the subject see it straight away.
app.post('/api/faculty/assignments', facultyOnly, route(async (req, res) => {
  const body = req.body || {}
  const subjectId = wholeNumber(body.subjectId, 'Subject', 1, 2147483647)
  const title = cleanText(body.title, 'Title', 3, 200)
  const description = body.description ? cleanText(body.description, 'Description', 1, 5000) : null
  const priority = body.priority || 'Medium'

  if (!['Low', 'Medium', 'High'].includes(priority)) throw httpError(400, 'Priority must be Low, Medium or High')
  if (!isValidDateString(body.dueDate)) throw httpError(400, 'Choose a valid due date')
  if (body.dueDate < dateString(-1)) throw httpError(400, 'The due date cannot be in the past')

  await getOwnedSubject(req.user.faculty_id, subjectId)

  const [created] = await db.query(
    `INSERT INTO assignments (subject_id, title, description, due_date, priority, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [subjectId, title, description, body.dueDate, priority, req.user.user_id]
  )

  const [rows] = await db.query(
    `SELECT ${FACULTY_ASSIGNMENT_FIELDS}
     FROM assignments a JOIN subjects sub ON sub.id = a.subject_id
     WHERE a.id = ?`,
    [created.insertId]
  )
  res.status(201).json(shapeFacultyAssignment(rows[0]))
}))

// Deleting also removes students' progress on it. Only the teacher of that subject can do it.
app.delete('/api/faculty/assignments/:id', facultyOnly, route(async (req, res) => {
  const id = Number(req.params.id)
  const [result] = await db.query(
    `DELETE FROM assignments a
     USING subjects s
     WHERE s.id = a.subject_id AND a.id = ? AND s.faculty_id = ?`,
    [id, req.user.faculty_id]
  )
  if (result.affectedRows === 0) throw httpError(404, 'Assignment not found')
  res.json({ id, deleted: true })
}))

// ---------------------------------------------------------------------------
// 14. Dashboards: one for students, one for faculty
// ---------------------------------------------------------------------------

app.get('/api/dashboard', studentOnly, route(async (req, res) => {
  const { student_id, university_id } = req.user

  const [today, assignments, attendance, [events]] = await Promise.all([
    getTimetable(student_id),
    getAssignments(student_id),
    getAttendance(student_id),
    db.query(
      `SELECT title, TO_CHAR(starts_at, 'YYYY-MM-DD') AS date
       FROM events
       WHERE university_id = ? AND starts_at >= CURRENT_TIMESTAMP
         AND starts_at < (CURRENT_TIMESTAMP + INTERVAL '7 days')
       ORDER BY starts_at LIMIT 5`,
      [university_id]
    ),
  ])

  const attended = attendance.reduce((sum, s) => sum + s.attended, 0)
  const total = attendance.reduce((sum, s) => sum + s.total, 0)
  const pending = assignments.filter((a) => a.status === 'Pending')
  const upcomingAssignments = pending.filter((a) =>
    a.dueDate >= dateString() && a.dueDate <= dateString(7)
  )

  res.json({
    todaysClasses: today.classes.length,
    pendingAssignments: pending.length,
    attendance: total === 0 ? 0 : Math.round((attended / total) * 100),
    timetable: today.classes.map((c) => ({ time: c.time, subject: c.subject })),
    upcoming: [
      ...upcomingAssignments.map((a) => ({
        type: 'assignment',
        label: a.title,
        date: a.dueDate,
      })),
      ...events.map((e) => ({ type: 'event', label: e.title, date: e.date })),
    ].sort((left, right) => left.date.localeCompare(right.date)).slice(0, 5),
  })
}))

app.get('/api/faculty/dashboard', facultyOnly, route(async (req, res) => {
  const facultyId = req.user.faculty_id
  const todayCode = DAY_CODES[new Date().getDay()]

  const [[subjects], [[posted]], [todaysClasses], [lowAttendance]] = await Promise.all([
    db.query(
      `SELECT s.id, s.code, s.name,
              (SELECT COUNT(*) FROM enrollments e WHERE e.subject_id = s.id) AS students
       FROM subjects s WHERE s.faculty_id = ? ORDER BY s.code`,
      [facultyId]
    ),
    db.query(
      `SELECT COUNT(*) AS total FROM assignments a
       JOIN subjects s ON s.id = a.subject_id WHERE s.faculty_id = ?`,
      [facultyId]
    ),
    db.query(
      `SELECT sub.id AS subjectId, TO_CHAR(t.start_time, 'HH12:MI AM') AS time,
              TO_CHAR(t.end_time,   'HH12:MI AM') AS endTime,
              sub.name AS subject, sub.code, t.room, t.class_type AS type
       FROM timetable t JOIN subjects sub ON sub.id = t.subject_id
       WHERE sub.faculty_id = ? AND t.day_of_week = ?
       ORDER BY t.start_time`,
      [facultyId, todayCode]
    ),
    // Students whose attendance in one of this teacher's subjects is below 75%
    db.query(
      `SELECT u.full_name AS student, sub.id AS subjectId, sub.code, sub.name AS subject,
              SUM((a.status IN ('present','late'))::integer) AS attended, COUNT(*) AS total
       FROM attendance a
       JOIN subjects sub ON sub.id = a.subject_id
       JOIN students st ON st.id = a.student_id
       JOIN users u ON u.id = st.user_id
       WHERE sub.faculty_id = ?
       GROUP BY a.student_id, a.subject_id, u.full_name, sub.code, sub.name
       HAVING SUM((a.status IN ('present','late'))::integer) * 4 < COUNT(*) * 3
       ORDER BY SUM((a.status IN ('present','late'))::numeric) / COUNT(*) ASC
       LIMIT 10`,
      [facultyId]
    ),
  ])

  res.json({
    name: req.user.name,
    subjects: subjects.map((s) => ({ ...s, students: Number(s.students) })),
    assignmentsPosted: Number(posted.total),
    todaysClasses,
    lowAttendance: lowAttendance.map((r) => {
      const attended = Number(r.attended)
      const total = Number(r.total)
      return { ...r, attended, total, percentage: Math.round((attended / total) * 100) }
    }),
  })
}))

// ---------------------------------------------------------------------------
// 15. Institution administration (trusted, university-scoped administrators)
// ---------------------------------------------------------------------------

app.get('/api/admin/overview', adminOnly, institutionAdminOnly, route(async (req, res) => {
  const universityId = req.user.university_id
  const [[universities], [colleges], [departments], [faculty], [subjects], [programs], [sections], [offerings], [timetable], [events], [resources], [opportunities], [calendarItems]] = await Promise.all([
    db.query('SELECT id, name, city FROM universities WHERE id = ?', [universityId]),
    db.query('SELECT id, name FROM colleges WHERE university_id = ? ORDER BY name', [universityId]),
    db.query(
      `SELECT d.id, d.name, d.college_id AS collegeId, c.name AS collegeName
       FROM departments d JOIN colleges c ON c.id = d.college_id
       WHERE c.university_id = ? ORDER BY c.name, d.name`,
      [universityId]
    ),
    db.query(
      `SELECT f.id, u.full_name AS name, u.email, f.department_id AS departmentId,
              d.name AS department
       FROM faculty f JOIN users u ON u.id = f.user_id
       JOIN departments d ON d.id = f.department_id
       JOIN colleges c ON c.id = d.college_id
       WHERE c.university_id = ? ORDER BY d.name, u.full_name`,
      [universityId]
    ),
    db.query(
      `SELECT s.id, s.code, s.name, s.semester, s.department_id AS departmentId,
              d.name AS department, f.id AS facultyId, u.full_name AS facultyName
       FROM subjects s JOIN departments d ON d.id = s.department_id
       JOIN colleges c ON c.id = d.college_id
       LEFT JOIN faculty f ON f.id = s.faculty_id
       LEFT JOIN users u ON u.id = f.user_id
       WHERE c.university_id = ? ORDER BY d.name, s.semester, s.code`,
      [universityId]
    ),
    db.query(
      `SELECT p.id, p.name, p.department_id AS departmentId, d.name AS department
       FROM programs p JOIN departments d ON d.id = p.department_id JOIN colleges c ON c.id = d.college_id
       WHERE c.university_id = ? ORDER BY d.name, p.name`, [universityId]
    ),
    db.query(
      `SELECT cs.id, cs.program_id AS programId, p.name AS program, cs.year, cs.semester, cs.section_name AS sectionName
       FROM class_sections cs JOIN programs p ON p.id = cs.program_id JOIN departments d ON d.id = p.department_id
       JOIN colleges c ON c.id = d.college_id WHERE c.university_id = ?
       ORDER BY p.name, cs.year, cs.semester, cs.section_name`, [universityId]
    ),
    db.query(
      `SELECT so.id, so.subject_id AS subjectId, so.class_section_id AS classSectionId,
              s.code, s.name AS subject, cs.program_id AS programId, p.name AS program,
              cs.year, cs.semester, cs.section_name AS sectionName
       FROM subject_offerings so JOIN subjects s ON s.id = so.subject_id
       JOIN class_sections cs ON cs.id = so.class_section_id JOIN programs p ON p.id = cs.program_id
       JOIN departments d ON d.id = p.department_id JOIN colleges c ON c.id = d.college_id
       WHERE c.university_id = ? ORDER BY p.name, cs.year, cs.semester, s.code`, [universityId]
    ),
    db.query(
      `SELECT t.id, t.subject_id AS subjectId, s.code, s.name AS subject,
              t.day_of_week AS day, TO_CHAR(t.start_time, 'HH24:MI') AS startTime,
              TO_CHAR(t.end_time, 'HH24:MI') AS endTime, t.room, t.class_type AS classType
       FROM timetable t JOIN subjects s ON s.id = t.subject_id
       JOIN departments d ON d.id = s.department_id
       JOIN colleges c ON c.id = d.college_id
       WHERE c.university_id = ? ORDER BY CASE t.day_of_week WHEN 'Mon' THEN 1 WHEN 'Tue' THEN 2 WHEN 'Wed' THEN 3 WHEN 'Thu' THEN 4 WHEN 'Fri' THEN 5 WHEN 'Sat' THEN 6 END, t.start_time`,
      [universityId]
    ),
    db.query(
      `SELECT id, title, category, visibility, TO_CHAR(starts_at, 'YYYY-MM-DD"T"HH24:MI') AS startsAt
       FROM events WHERE university_id = ? ORDER BY starts_at DESC`,
      [universityId]
    ),
    db.query(
      `SELECT id, title, subject, type, visibility FROM resources
       WHERE university_id = ? ORDER BY created_at DESC`,
      [universityId]
    ),
    db.query(
      `SELECT id, title, company, type, visibility,
              TO_CHAR(deadline, 'YYYY-MM-DD') AS deadline
       FROM opportunities WHERE university_id = ? ORDER BY deadline`,
      [universityId]
    ),
    db.query(
      `SELECT id, title, category,
              TO_CHAR(starts_on, 'YYYY-MM-DD') AS startsOn,
              TO_CHAR(ends_on, 'YYYY-MM-DD') AS endsOn,
              description, audience, eligible_program_id AS eligibleProgramId
       FROM academic_calendar_items WHERE university_id = ? ORDER BY starts_on, id`,
      [universityId]
    ),
  ])
  res.json({ university: universities[0], colleges, departments, faculty, subjects, programs, sections, offerings, timetable, events, resources, opportunities, calendarItems })
}))

// Programs and sections are institution-scoped. Roster entries are the source
// of verified affiliation; the signup form cannot invent academic placement.
app.post('/api/admin/programs', adminOnly, institutionAdminOnly, route(async (req, res) => {
  const departmentId = wholeNumber(req.body && req.body.departmentId, 'Department', 1, 2147483647)
  const name = cleanText(req.body && req.body.name, 'Program name', 2, 100)
  const [rows] = await db.query(
    `SELECT d.id FROM departments d JOIN colleges c ON c.id = d.college_id
     WHERE d.id = ? AND c.university_id = ?`, [departmentId, req.user.university_id]
  )
  if (!rows.length) throw httpError(404, 'Department not found in this institution')
  try {
    const [created] = await db.query('INSERT INTO programs (department_id, name) VALUES (?, ?)', [departmentId, name])
    res.status(201).json({ id: created.insertId, departmentId, name })
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw httpError(409, 'That program already exists in this department')
    throw err
  }
}))

app.post('/api/admin/sections', adminOnly, institutionAdminOnly, route(async (req, res) => {
  const programId = wholeNumber(req.body && req.body.programId, 'Program', 1, 2147483647)
  const year = wholeNumber(req.body && req.body.year, 'Year', 1, 6)
  const semester = wholeNumber(req.body && req.body.semester, 'Semester', 1, 12)
  const sectionName = cleanText(req.body && req.body.sectionName, 'Section', 1, 30).toUpperCase()
  const [programs] = await db.query(
    `SELECT p.id FROM programs p JOIN departments d ON d.id = p.department_id
     JOIN colleges c ON c.id = d.college_id WHERE p.id = ? AND c.university_id = ?`,
    [programId, req.user.university_id]
  )
  if (!programs.length) throw httpError(404, 'Program not found in this institution')
  try {
    const [created] = await db.query(
      'INSERT INTO class_sections (program_id, year, semester, section_name) VALUES (?, ?, ?, ?)',
      [programId, year, semester, sectionName]
    )
    res.status(201).json({ id: created.insertId, programId, year, semester, sectionName })
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw httpError(409, 'That class section already exists')
    throw err
  }
}))

app.post('/api/admin/offerings', adminOnly, institutionAdminOnly, route(async (req, res) => {
  const subjectId = wholeNumber(req.body && req.body.subjectId, 'Subject', 1, 2147483647)
  const classSectionId = wholeNumber(req.body && req.body.classSectionId, 'Class section', 1, 2147483647)
  const [valid] = await db.query(
    `SELECT s.id, s.faculty_id FROM subjects s
     JOIN departments sd ON sd.id = s.department_id JOIN colleges sc ON sc.id = sd.college_id
     JOIN class_sections cs ON cs.id = ? JOIN programs p ON p.id = cs.program_id
     JOIN departments pd ON pd.id = p.department_id JOIN colleges pc ON pc.id = pd.college_id
     WHERE s.id = ? AND sc.university_id = ? AND pc.university_id = ?
       AND s.department_id = p.department_id AND s.semester = cs.semester`,
    [classSectionId, subjectId, req.user.university_id, req.user.university_id]
  )
  if (!valid.length) throw httpError(400, 'Choose a subject and class section from the same department')
  await withTransaction(async (conn) => {
    await conn.query('INSERT INTO subject_offerings (subject_id, class_section_id, faculty_id) VALUES (?, ?, ?)', [subjectId, classSectionId, valid[0].faculty_id])
    await conn.query(
      `INSERT INTO enrollments (student_id, subject_id)
       SELECT id, ? FROM students WHERE class_section_id = ?
       ON CONFLICT (student_id, subject_id) DO NOTHING`, [subjectId, classSectionId]
    )
  }).catch((err) => {
    if (err.code === 'ER_DUP_ENTRY') throw httpError(409, 'This subject is already offered to that section')
    throw err
  })
  res.status(201).json({ subjectId, classSectionId })
}))

app.post('/api/admin/roster', adminOnly, institutionAdminOnly, route(async (req, res) => {
  const body = req.body || {}
  const role = body.role
  if (!['student', 'faculty'].includes(role)) throw httpError(400, 'Roster role must be student or faculty')
  const departmentId = wholeNumber(body.departmentId, 'Department', 1, 2147483647)
  const institutionalId = cleanText(body.institutionalId, 'Institutional ID', 1, 100)
  const email = validateEmail(body.email)
  const [departments] = await db.query(
    `SELECT d.id FROM departments d JOIN colleges c ON c.id = d.college_id
     WHERE d.id = ? AND c.university_id = ?`, [departmentId, req.user.university_id]
  )
  if (!departments.length) throw httpError(404, 'Department not found in this institution')
  let academic = { programId: null, year: null, semester: null, sectionName: null, designation: null }
  if (role === 'student') {
    const programId = wholeNumber(body.programId, 'Program', 1, 2147483647)
    const year = wholeNumber(body.year, 'Year', 1, 6)
    const semester = wholeNumber(body.semester, 'Semester', 1, 12)
    const sectionName = cleanText(body.sectionName || 'A', 'Section', 1, 30).toUpperCase()
    const [programs] = await db.query(
      `SELECT p.id FROM programs p WHERE p.id = ? AND p.department_id = ?`, [programId, departmentId]
    )
    const [sections] = await db.query(
      'SELECT id FROM class_sections WHERE program_id = ? AND year = ? AND semester = ? AND section_name = ?',
      [programId, year, semester, sectionName]
    )
    if (!programs.length || !sections.length) throw httpError(400, 'Create the program and class section before adding its roster')
    academic = { programId, year, semester, sectionName, designation: null }
  } else {
    academic.designation = body.designation ? cleanText(body.designation, 'Designation', 1, 100) : 'Faculty'
  }
  try {
    const inviteCode = crypto.randomBytes(18).toString('hex')
    const inviteCodeHash = crypto.createHash('sha256').update(inviteCode).digest('hex')
    const [created] = await db.query(
      `INSERT INTO affiliation_roster
       (university_id, department_id, role, institutional_id, email, program_id, year, semester, section_name, designation, invite_code_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.university_id, departmentId, role, institutionalId, email, academic.programId, academic.year, academic.semester, academic.sectionName, academic.designation, inviteCodeHash]
    )
    res.status(201).json({ id: created.insertId, role, institutionalId, email, inviteCode })
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw httpError(409, 'That email or institutional ID is already on the roster')
    throw err
  }
}))

app.get('/api/admin/roster', adminOnly, institutionAdminOnly, route(async (req, res) => {
  const [rows] = await db.query(
    `SELECT r.id, r.role, r.institutional_id AS institutionalId, r.email,
            d.name AS department, p.name AS program, r.year, r.semester, r.section_name AS sectionName,
            (r.claimed_by IS NOT NULL) AS claimed
     FROM affiliation_roster r JOIN departments d ON d.id = r.department_id
     JOIN colleges c ON c.id = d.college_id LEFT JOIN programs p ON p.id = r.program_id
     WHERE r.university_id = ? ORDER BY r.created_at DESC, r.id DESC`, [req.user.university_id]
  )
  res.json(rows.map((row) => ({ ...row, claimed: Boolean(row.claimed) })))
}))

app.post('/api/admin/roster/:id/renew-code', adminOnly, institutionAdminOnly, route(async (req, res) => {
  const rosterId = wholeNumber(req.params.id, 'Roster entry', 1, 2147483647)
  const inviteCode = crypto.randomBytes(18).toString('hex')
  const inviteCodeHash = crypto.createHash('sha256').update(inviteCode).digest('hex')
  const [updated] = await db.query(
    `UPDATE affiliation_roster SET invite_code_hash = ?
     WHERE id = ? AND university_id = ? AND claimed_by IS NULL`,
    [inviteCodeHash, rosterId, req.user.university_id]
  )
  if (!updated.affectedRows) throw httpError(404, 'An unclaimed roster entry was not found')
  const [[entry]] = await db.query('SELECT email FROM affiliation_roster WHERE id = ?', [rosterId])
  res.json({ id: rosterId, email: entry.email, inviteCode })
}))

app.post('/api/admin/announcements', adminOnly, institutionAdminOnly, route(async (req, res) => {
  const body = req.body || {}
  const title = cleanText(body.title, 'Title', 3, 200)
  const message = cleanText(body.message, 'Message', 3, 5000)
  const category = body.category || 'General'
  if (!ANNOUNCEMENT_CATEGORIES.includes(category)) throw httpError(400, 'Choose a valid category')
  const [created] = await db.query(
    `INSERT INTO announcements
       (university_id, category, title, body, audience, pinned, posted_by)
     VALUES (?, ?, ?, ?, 'All Students', FALSE, ?)`,
    [req.user.university_id, category, title, message, req.user.user_id]
  )
  res.status(201).json({ id: created.insertId, title, category, universityId: req.user.university_id })
}))

const CALENDAR_CATEGORIES = ['Term dates', 'Examination', 'Registration', 'Holiday', 'Other']

async function validateCalendarItem(body, universityId) {
  const title = cleanText(body.title, 'Title', 3, 200)
  const category = body.category || 'Other'
  if (!CALENDAR_CATEGORIES.includes(category)) throw httpError(400, 'Choose a valid calendar category')
  if (!isValidDateString(body.startsOn)) throw httpError(400, 'Choose a valid start date')
  const endsOn = body.endsOn || null
  if (endsOn && !isValidDateString(endsOn)) throw httpError(400, 'Choose a valid end date')
  if (endsOn && endsOn < body.startsOn) throw httpError(400, 'End date must be on or after the start date')
  const description = body.description ? cleanText(body.description, 'Description', 1, 5000) : null
  const { audience, eligibleProgramId } = await contentAudience(body, universityId)
  return { title, category, startsOn: body.startsOn, endsOn, description, audience, eligibleProgramId }
}

app.post('/api/admin/calendar', adminOnly, institutionAdminOnly, route(async (req, res) => {
  const item = await validateCalendarItem(req.body || {}, req.user.university_id)
  const [created] = await db.query(
    `INSERT INTO academic_calendar_items
       (university_id, title, category, starts_on, ends_on, description, audience, eligible_program_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.user.university_id, item.title, item.category, item.startsOn, item.endsOn, item.description, item.audience, item.eligibleProgramId, req.user.user_id]
  )
  res.status(201).json({ id: created.insertId, ...item })
}))

app.patch('/api/admin/calendar/:id', adminOnly, institutionAdminOnly, route(async (req, res) => {
  const id = wholeNumber(req.params.id, 'Calendar item', 1, 2147483647)
  const item = await validateCalendarItem(req.body || {}, req.user.university_id)
  const [updated] = await db.query(
    `UPDATE academic_calendar_items
     SET title = ?, category = ?, starts_on = ?, ends_on = ?, description = ?, audience = ?, eligible_program_id = ?
     WHERE id = ? AND university_id = ?`,
    [item.title, item.category, item.startsOn, item.endsOn, item.description, item.audience, item.eligibleProgramId, id, req.user.university_id]
  )
  if (!updated.affectedRows) throw httpError(404, 'Calendar item not found in this institution')
  res.json({ id, ...item })
}))

app.delete('/api/admin/calendar/:id', adminOnly, institutionAdminOnly, route(async (req, res) => {
  const id = wholeNumber(req.params.id, 'Calendar item', 1, 2147483647)
  const [result] = await db.query(
    'DELETE FROM academic_calendar_items WHERE id = ? AND university_id = ?',
    [id, req.user.university_id]
  )
  if (!result.affectedRows) throw httpError(404, 'Calendar item not found in this institution')
  res.json({ id, deleted: true })
}))

async function contentAudience(body, universityId) {
  const audience = body.audience || 'everyone'
  if (!['everyone', 'students', 'faculty'].includes(audience)) throw httpError(400, 'Choose a valid audience')
  const eligibleProgramId = body.eligibleProgramId ? wholeNumber(body.eligibleProgramId, 'Eligible program', 1, 2147483647) : null
  if (eligibleProgramId) {
    const [programs] = await db.query(
      `SELECT p.id FROM programs p JOIN departments d ON d.id = p.department_id JOIN colleges c ON c.id = d.college_id
       WHERE p.id = ? AND c.university_id = ?`, [eligibleProgramId, universityId]
    )
    if (!programs.length) throw httpError(404, 'Eligible program not found in this institution')
  }
  return { audience, eligibleProgramId }
}

app.post('/api/admin/events', adminOnly, institutionAdminOnly, route(async (req, res) => {
  const body = req.body || {}
  const title = cleanText(body.title, 'Title', 3, 200)
  const category = cleanText(body.category, 'Category', 2, 50)
  const description = body.description ? cleanText(body.description, 'Description', 1, 5000) : null
  const location = body.location ? cleanText(body.location, 'Location', 1, 150) : null
  const seats = body.seats ? cleanText(body.seats, 'Seats information', 1, 100) : null
  const startsAt = dateTimeValue(body.startsAt, 'Start time')
  const endsAt = dateTimeValue(body.endsAt, 'End time', true)
  const now = new Date()
  const today = dateString()
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`
  if (startsAt.slice(0, 10) < today || (startsAt.slice(0, 10) === today && startsAt.slice(11) <= currentTime)) {
    throw httpError(400, 'Event start time must be in the future')
  }
  if (endsAt && endsAt <= startsAt) throw httpError(400, 'End time must be after start time')
  const visibility = validateVisibility(body.visibility)
  const { audience, eligibleProgramId } = await contentAudience(body, req.user.university_id)
  const [created] = await db.query(
    `INSERT INTO events
       (university_id, title, category, description, location, seats_info, starts_at, ends_at, visibility, audience, eligible_program_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.user.university_id, title, category, description, location, seats, startsAt, endsAt, visibility, audience, eligibleProgramId]
  )
  res.status(201).json({ id: created.insertId, title, category, startsAt, visibility })
}))

app.post('/api/admin/resources', adminOnly, institutionAdminOnly, route(async (req, res) => {
  const body = req.body || {}
  const title = cleanText(body.title, 'Title', 3, 200)
  const subject = cleanText(body.subject, 'Subject', 2, 100)
  const type = body.type || 'Notes'
  if (!['Notes', 'Practice', 'Tutorial'].includes(type)) throw httpError(400, 'Choose a valid resource type')
  const format = cleanText(body.format, 'Format', 1, 50)
  const description = body.description ? cleanText(body.description, 'Description', 1, 5000) : null
  const author = body.author ? cleanText(body.author, 'Author', 1, 150) : req.user.name
  const icon = body.icon ? cleanText(body.icon, 'Icon', 1, 16) : null
  const url = optionalUrl(body.url, 'Resource URL')
  const visibility = validateVisibility(body.visibility)
  const { audience, eligibleProgramId } = await contentAudience(body, req.user.university_id)
  const [created] = await db.query(
    `INSERT INTO resources
       (university_id, visibility, audience, eligible_program_id, title, subject, type, format, description, author, icon, url, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.user.university_id, visibility, audience, eligibleProgramId, title, subject, type, format, description, author, icon, url, req.user.user_id]
  )
  res.status(201).json({ id: created.insertId, title, subject, type, visibility })
}))

app.post('/api/admin/opportunities', adminOnly, institutionAdminOnly, route(async (req, res) => {
  const body = req.body || {}
  const title = cleanText(body.title, 'Title', 3, 200)
  const company = cleanText(body.company, 'Company', 2, 150)
  const type = body.type || 'Internship'
  if (!['Internship', 'Training', 'Competition'].includes(type)) throw httpError(400, 'Choose a valid opportunity type')
  const mode = cleanText(body.mode, 'Mode', 2, 30)
  const location = cleanText(body.location, 'Location', 2, 100)
  const stipend = body.stipend ? cleanText(body.stipend, 'Stipend', 1, 100) : null
  if (!isValidDateString(body.deadline) || body.deadline < dateString()) throw httpError(400, 'Choose today or a future deadline')
  const category = cleanText(body.category, 'Category', 2, 50)
  const description = body.description ? cleanText(body.description, 'Description', 1, 5000) : null
  const applicationUrl = optionalUrl(body.applicationUrl, 'Application URL')
  if (!Array.isArray(body.skills) || body.skills.length > 30) throw httpError(400, 'Skills must be a list of up to 30 items')
  const skills = body.skills.map((item) => cleanText(item, 'Skill', 1, 40))
  const visibility = validateVisibility(body.visibility)
  const { audience, eligibleProgramId } = await contentAudience(body, req.user.university_id)
  if (audience === 'faculty') throw httpError(400, 'Career opportunities must target students or everyone')
  const [created] = await db.query(
    `INSERT INTO opportunities
       (university_id, visibility, audience, eligible_program_id, title, company, type, mode, location, stipend, deadline, category, description, skills, application_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.user.university_id, visibility, audience, eligibleProgramId, title, company, type, mode, location, stipend, body.deadline, category, description, JSON.stringify(skills), applicationUrl]
  )
  res.status(201).json({ id: created.insertId, title, company, type, deadline: body.deadline, visibility })
}))

async function updateSharingScope(req, table) {
  const id = wholeNumber(req.params.id, 'Content item', 1, 2147483647)
  const visibility = validateVisibility(req.body && req.body.visibility)
  const [found] = await db.query(
    `SELECT id FROM ${table} WHERE id = ? AND university_id = ?`,
    [id, req.user.university_id]
  )
  if (!found.length) throw httpError(404, 'Content item not found in this institution')
  await db.query(`UPDATE ${table} SET visibility = ? WHERE id = ?`, [visibility, id])
  return { id, visibility }
}

app.patch('/api/admin/events/:id/sharing', adminOnly, institutionAdminOnly, route(async (req, res) => {
  res.json(await updateSharingScope(req, 'events'))
}))

app.patch('/api/admin/resources/:id/sharing', adminOnly, institutionAdminOnly, route(async (req, res) => {
  res.json(await updateSharingScope(req, 'resources'))
}))

app.patch('/api/admin/opportunities/:id/sharing', adminOnly, institutionAdminOnly, route(async (req, res) => {
  res.json(await updateSharingScope(req, 'opportunities'))
}))

app.get('/api/admin/pending-users', adminOnly, institutionAdminOnly, route(async (req, res) => {
  const [rows] = await db.query(
    `SELECT u.id, u.full_name AS name, u.email, u.role,
            d.name AS department, c.name AS college,
            s.roll_number AS rollNumber, s.program, s.year, s.semester,
            f.designation
     FROM users u
     LEFT JOIN students s ON s.user_id = u.id
     LEFT JOIN faculty f ON f.user_id = u.id
     LEFT JOIN departments d ON d.id = COALESCE(s.department_id, f.department_id)
     LEFT JOIN colleges c ON c.id = d.college_id
     WHERE u.account_status = 'pending'
       AND u.role IN ('student','faculty')
       AND c.university_id = ?
     ORDER BY u.created_at, u.id`,
    [req.user.university_id]
  )
  res.json(rows)
}))

async function reviewPendingUser(req, status) {
  const userId = wholeNumber(req.params.id, 'User', 1, 2147483647)
  const [found] = await db.query(
    `SELECT u.id FROM users u
     LEFT JOIN students s ON s.user_id = u.id
     LEFT JOIN faculty f ON f.user_id = u.id
     LEFT JOIN departments d ON d.id = COALESCE(s.department_id, f.department_id)
     LEFT JOIN colleges c ON c.id = d.college_id
     WHERE u.id = ? AND u.account_status = 'pending'
       AND u.role IN ('student','faculty') AND c.university_id = ?`,
    [userId, req.user.university_id]
  )
  if (!found.length) throw httpError(404, 'Pending account not found in this institution')
  await db.query('UPDATE users SET account_status = ? WHERE id = ? AND account_status = \'pending\'', [status, userId])
  return { id: userId, status }
}

app.patch('/api/admin/users/:id/approve', adminOnly, institutionAdminOnly, route(async (req, res) => {
  res.json(await reviewPendingUser(req, 'active'))
}))

app.patch('/api/admin/users/:id/reject', adminOnly, institutionAdminOnly, route(async (req, res) => {
  res.json(await reviewPendingUser(req, 'rejected'))
}))

app.post('/api/admin/colleges', adminOnly, institutionAdminOnly, route(async (req, res) => {
  const name = cleanText(req.body && req.body.name, 'College name', 2, 200)
  const [created] = await db.query(
    'INSERT INTO colleges (university_id, name) VALUES (?, ?)',
    [req.user.university_id, name]
  )
  res.status(201).json({ id: created.insertId, name })
}))

app.post('/api/admin/departments', adminOnly, institutionAdminOnly, route(async (req, res) => {
  const name = cleanText(req.body && req.body.name, 'Department name', 2, 200)
  const collegeId = wholeNumber(req.body && req.body.collegeId, 'College', 1, 2147483647)
  const [colleges] = await db.query(
    'SELECT id FROM colleges WHERE id = ? AND university_id = ?',
    [collegeId, req.user.university_id]
  )
  if (!colleges.length) throw httpError(404, 'College not found in this institution')
  const [created] = await db.query('INSERT INTO departments (college_id, name) VALUES (?, ?)', [collegeId, name])
  res.status(201).json({ id: created.insertId, collegeId, name })
}))

app.post('/api/admin/subjects', adminOnly, institutionAdminOnly, route(async (req, res) => {
  const body = req.body || {}
  const departmentId = wholeNumber(body.departmentId, 'Department', 1, 2147483647)
  const code = cleanText(body.code, 'Subject code', 1, 20).toUpperCase()
  const name = cleanText(body.name, 'Subject name', 2, 150)
  const semester = wholeNumber(body.semester, 'Semester', 1, 12)
  const facultyId = body.facultyId ? wholeNumber(body.facultyId, 'Faculty member', 1, 2147483647) : null

  const [departments] = await db.query(
    `SELECT d.id FROM departments d JOIN colleges c ON c.id = d.college_id
     WHERE d.id = ? AND c.university_id = ?`,
    [departmentId, req.user.university_id]
  )
  if (!departments.length) throw httpError(404, 'Department not found in this institution')
  if (facultyId) {
    const [faculty] = await db.query('SELECT id FROM faculty WHERE id = ? AND department_id = ?', [facultyId, departmentId])
    if (!faculty.length) throw httpError(400, 'Choose a faculty member from this department')
  }

  const [duplicates] = await db.query(
    'SELECT id FROM subjects WHERE department_id = ? AND code = ?',
    [departmentId, code]
  )
  if (duplicates.length) throw httpError(409, 'That subject code already exists in this department')

  const [created] = await db.query(
    'INSERT INTO subjects (department_id, code, name, semester, faculty_id) VALUES (?, ?, ?, ?, ?)',
    [departmentId, code, name, semester, facultyId]
  )
  const subjectId = created.insertId
  res.status(201).json({ id: subjectId, departmentId, code, name, semester, facultyId })
}))

app.patch('/api/admin/subjects/:id/faculty', adminOnly, institutionAdminOnly, route(async (req, res) => {
  const subjectId = wholeNumber(req.params.id, 'Subject', 1, 2147483647)
  const facultyId = req.body && req.body.facultyId
    ? wholeNumber(req.body.facultyId, 'Faculty member', 1, 2147483647)
    : null
  const [subjects] = await db.query(
    `SELECT s.id, s.department_id FROM subjects s
     JOIN departments d ON d.id = s.department_id
     JOIN colleges c ON c.id = d.college_id
     WHERE s.id = ? AND c.university_id = ?`,
    [subjectId, req.user.university_id]
  )
  if (!subjects.length) throw httpError(404, 'Subject not found in this institution')
  if (facultyId) {
    const [faculty] = await db.query(
      'SELECT id FROM faculty WHERE id = ? AND department_id = ?',
      [facultyId, subjects[0].department_id]
    )
    if (!faculty.length) throw httpError(400, 'Choose a faculty member from this department')
  }
  await db.query('UPDATE subjects SET faculty_id = ? WHERE id = ?', [facultyId, subjectId])
  await db.query('UPDATE subject_offerings SET faculty_id = ? WHERE subject_id = ?', [facultyId, subjectId])
  res.json({ id: subjectId, facultyId })
}))

app.post('/api/admin/timetable', adminOnly, institutionAdminOnly, route(async (req, res) => {
  const body = req.body || {}
  const subjectId = wholeNumber(body.subjectId, 'Subject', 1, 2147483647)
  const day = body.day
  if (!['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].includes(day)) throw httpError(400, 'Choose a valid class day')
  const startTime = timeValue(body.startTime, 'Start time')
  const endTime = timeValue(body.endTime, 'End time')
  if (startTime >= endTime) throw httpError(400, 'End time must be after start time')
  const room = body.room ? cleanText(body.room, 'Room', 1, 50) : null
  const classType = body.classType || 'Lecture'
  if (!['Lecture', 'Practical', 'Tutorial'].includes(classType)) throw httpError(400, 'Choose a valid class type')

  const [subjects] = await db.query(
    `SELECT s.id FROM subjects s JOIN departments d ON d.id = s.department_id
     JOIN colleges c ON c.id = d.college_id
     WHERE s.id = ? AND c.university_id = ?`,
    [subjectId, req.user.university_id]
  )
  if (!subjects.length) throw httpError(404, 'Subject not found in this institution')
  const [conflicts] = await db.query(
    `SELECT t.id FROM timetable t
     JOIN subjects s ON s.id = t.subject_id
     JOIN departments d ON d.id = s.department_id
     JOIN colleges c ON c.id = d.college_id
     WHERE c.university_id = ? AND t.day_of_week = ?
       AND t.start_time < ? AND t.end_time > ?
       AND (t.subject_id = ? OR (? IS NOT NULL AND t.room = ?))`,
    [req.user.university_id, day, endTime, startTime, subjectId, room, room]
  )
  if (conflicts.length) throw httpError(409, 'This class overlaps an existing class for the subject or room')
  const [created] = await db.query(
    `INSERT INTO timetable (subject_id, day_of_week, start_time, end_time, room, class_type)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [subjectId, day, startTime, endTime, room, classType]
  )
  res.status(201).json({ id: created.insertId, subjectId, day, startTime, endTime, room, classType })
}))

app.delete('/api/admin/timetable/:id', adminOnly, institutionAdminOnly, route(async (req, res) => {
  const scheduleId = wholeNumber(req.params.id, 'Class', 1, 2147483647)
  const [result] = await db.query(
    `DELETE FROM timetable t
     USING subjects s, departments d, colleges c
     WHERE s.id = t.subject_id AND d.id = s.department_id AND c.id = d.college_id
       AND t.id = ? AND c.university_id = ?`,
    [scheduleId, req.user.university_id]
  )
  if (!result.affectedRows) throw httpError(404, 'Class not found in this institution')
  res.json({ id: scheduleId, deleted: true })
}))

// ---------------------------------------------------------------------------
// 16. Unknown routes and errors, then start the server
// ---------------------------------------------------------------------------

app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` })
})

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON in request' })
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large' })
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
})

// Only start listening when run directly (`node server.js`), not when a test file requires it.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Campus OS API running on http://localhost:${PORT}`)
  })
}

module.exports = app
