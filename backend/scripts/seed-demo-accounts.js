const crypto = require('crypto')
const path = require('path')
const { promisify } = require('util')

require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
const db = require('../database')

const scrypt = promisify(crypto.scrypt)
const DEMO_PASSWORD = 'Campus@123'

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const key = await scrypt(password, salt, 64)
  return `${salt}$${key.toString('hex')}`
}

async function firstRow(connection, sql, values = []) {
  const [rows] = await connection.query(sql, values)
  return rows[0] || null
}

async function ensureProgram(connection, departmentId) {
  await connection.query(
    'INSERT INTO programs (department_id, name) VALUES (?, ?) ON CONFLICT (department_id, name) DO NOTHING',
    [departmentId, 'B.Tech']
  )
  const program = await firstRow(connection,
    'SELECT id FROM programs WHERE department_id = ? AND name = ?', [departmentId, 'B.Tech'])

  await connection.query(
    `INSERT INTO class_sections (program_id, year, semester, section_name)
     VALUES (?, 2, 3, 'A') ON CONFLICT (program_id, year, semester, section_name) DO NOTHING`,
    [program.id]
  )
  const section = await firstRow(connection,
    "SELECT id FROM class_sections WHERE program_id = ? AND year = 2 AND semester = 3 AND section_name = 'A'",
    [program.id]
  )
  return { programId: program.id, sectionId: section.id }
}

async function ensureUser(connection, account) {
  const existing = await firstRow(connection, 'SELECT id FROM users WHERE email = ?', [account.email])
  if (existing) return existing.id

  const passwordHash = await hashPassword(DEMO_PASSWORD)
  const [created] = await connection.query(
    `INSERT INTO users
       (email, password_hash, full_name, role, account_status, affiliation_verified_at)
     VALUES (?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)`,
    [account.email, passwordHash, account.name, account.role]
  )
  return created.insertId
}

async function ensureSubject(connection, departmentId, facultyId, code, name) {
  let subject = await firstRow(connection,
    'SELECT id FROM subjects WHERE department_id = ? AND code = ?', [departmentId, code])
  if (!subject) {
    const [created] = await connection.query(
      'INSERT INTO subjects (department_id, code, name, semester, faculty_id) VALUES (?, ?, ?, 3, ?)',
      [departmentId, code, name, facultyId]
    )
    subject = { id: created.insertId }
  }
  return subject.id
}

async function ensureTimetable(connection, subjectId, day, startTime, endTime, room, classType) {
  const existing = await firstRow(connection,
    `SELECT id FROM timetable
     WHERE subject_id = ? AND day_of_week = ? AND start_time = ? AND end_time = ? AND room = ?`,
    [subjectId, day, startTime, endTime, room]
  )
  if (existing) return
  await connection.query(
    'INSERT INTO timetable (subject_id, day_of_week, start_time, end_time, room, class_type) VALUES (?, ?, ?, ?, ?, ?)',
    [subjectId, day, startTime, endTime, room, classType]
  )
}

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_ACCOUNTS !== 'true') {
    throw new Error('Refusing to seed demo accounts in production. Set ALLOW_DEMO_ACCOUNTS=true only for an isolated demo project.')
  }

  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()

    const departments = await connection.query(
      `SELECT u.id AS university_id, c.id AS college_id,
              d.id AS department_id, d.name AS department_name
       FROM universities u
       JOIN colleges c ON c.university_id = u.id
       JOIN departments d ON d.college_id = c.id
       WHERE u.name = ? AND c.name = ? AND d.name IN (?, ?)`,
      ['Campus University', 'College of Engineering', 'Computer Science', 'Electronics and Communication']
    )
    const [directory] = departments
    const csDepartment = directory.find((row) => row.department_name === 'Computer Science')
    const electronicsDepartment = directory.find((row) => row.department_name === 'Electronics and Communication')
    if (!csDepartment || !electronicsDepartment) {
      throw new Error('Campus University demo departments were not found. Run the Supabase schema first.')
    }

    const csPlacement = await ensureProgram(connection, csDepartment.department_id)
    const electronicsPlacement = await ensureProgram(connection, electronicsDepartment.department_id)

    const alexId = await ensureUser(connection, {
      email: 'alex.morgan@university.edu', name: 'Alex Morgan', role: 'student',
    })
    const facultyId = await ensureUser(connection, {
      email: 'faculty@university.edu', name: 'Dr. Meera Iyer', role: 'faculty',
    })
    const riyaId = await ensureUser(connection, {
      email: 'riya.patel@university.edu', name: 'Riya Patel', role: 'student',
    })

    await connection.query(
      `INSERT INTO students
         (user_id, department_id, roll_number, program, program_id, class_section_id, year, semester)
       VALUES (?, ?, 'STU2026001', 'B.Tech', ?, ?, 2, 3)
       ON CONFLICT (user_id) DO NOTHING`,
      [alexId, csDepartment.department_id, csPlacement.programId, csPlacement.sectionId]
    )
    await connection.query(
      `INSERT INTO faculty (user_id, department_id, designation)
       VALUES (?, ?, 'Associate Professor') ON CONFLICT (user_id) DO NOTHING`,
      [facultyId, csDepartment.department_id]
    )
    await connection.query(
      `INSERT INTO students
         (user_id, department_id, roll_number, program, program_id, class_section_id, year, semester)
       VALUES (?, ?, 'STU2026101', 'B.Tech', ?, ?, 2, 3)
       ON CONFLICT (user_id) DO NOTHING`,
      [riyaId, electronicsDepartment.department_id, electronicsPlacement.programId, electronicsPlacement.sectionId]
    )

    const csSubjects = [
      ['CS201', 'Data Structures'],
      ['CS202', 'Database Management'],
      ['CS203', 'Web Development'],
      ['CS204', 'Operating Systems'],
      ['CS205', 'Computer Networks'],
    ]
    const electronicsSubjects = [
      ['EC201', 'Digital Electronics'],
      ['EC202', 'Signals and Systems'],
    ]
    const subjectIds = new Map()

    for (const [code, name] of csSubjects) {
      const subjectId = await ensureSubject(connection, csDepartment.department_id, null, code, name)
      subjectIds.set(code, subjectId)
      await connection.query(
        `UPDATE subjects SET faculty_id = (SELECT id FROM faculty WHERE user_id = ?)
         WHERE id = ? AND faculty_id IS NULL`, [facultyId, subjectId]
      )
      await connection.query(
        `INSERT INTO subject_offerings (subject_id, class_section_id, faculty_id)
         SELECT ?, ?, id FROM faculty WHERE user_id = ?
         ON CONFLICT (subject_id, class_section_id) DO NOTHING`,
        [subjectId, csPlacement.sectionId, facultyId]
      )
      await connection.query(
        'INSERT INTO enrollments (student_id, subject_id) SELECT id, ? FROM students WHERE user_id = ? ON CONFLICT (student_id, subject_id) DO NOTHING',
        [subjectId, alexId]
      )
    }

    for (const [code, name] of electronicsSubjects) {
      const subjectId = await ensureSubject(connection, electronicsDepartment.department_id, null, code, name)
      subjectIds.set(code, subjectId)
      await connection.query(
        'INSERT INTO subject_offerings (subject_id, class_section_id) VALUES (?, ?) ON CONFLICT (subject_id, class_section_id) DO NOTHING',
        [subjectId, electronicsPlacement.sectionId]
      )
      await connection.query(
        'INSERT INTO enrollments (student_id, subject_id) SELECT id, ? FROM students WHERE user_id = ? ON CONFLICT (student_id, subject_id) DO NOTHING',
        [subjectId, riyaId]
      )
    }

    const schedule = [
      ['CS201', '09:00', '10:00', 'Room 301', 'Lecture'],
      ['CS202', '10:15', '11:15', 'Lab 2', 'Practical'],
      ['CS203', '11:30', '12:30', 'Room 204', 'Lecture'],
      ['CS204', '14:00', '15:00', 'Room 105', 'Lecture'],
    ]
    for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']) {
      for (const [code, start, end, room, type] of schedule) {
        await ensureTimetable(connection, subjectIds.get(code), day, start, end, room, type)
      }
    }

    await connection.commit()
    process.stdout.write(`Created/confirmed demo student, faculty, and Electronics student accounts. Shared password: ${DEMO_PASSWORD}\n`)
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
    await db.end()
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
})
