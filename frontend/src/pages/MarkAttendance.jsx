import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../services/api'
import { useFetch } from '../hooks/useFetch'
import PageStatus from '../components/PageStatus'

// Today's date as YYYY-MM-DD in the user's own time zone (what a date input expects)
function todayString() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

const STATUSES = [
  { value: 'present', label: 'Present' },
  { value: 'absent', label: 'Absent' },
  { value: 'late', label: 'Late' },
]

function MarkAttendance() {
  const { data: subjects, loading, error } = useFetch(api.getFacultySubjects)
  const [searchParams] = useSearchParams()
  const [chosenSubjectId, setChosenSubjectId] = useState('')
  const [date, setDate] = useState(todayString())
  const [roster, setRoster] = useState(null)
  const [marks, setMarks] = useState({}) // studentId -> 'present' | 'absent' | 'late'
  const [loadedRequest, setLoadedRequest] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [formError, setFormError] = useState('')

  // Until a subject is picked, the first one is selected
  const requestedSubjectId = searchParams.get('subject')
  const validRequestedSubject = subjects?.some((subject) => String(subject.id) === requestedSubjectId)
  const subjectId = chosenSubjectId || (validRequestedSubject ? requestedSubjectId : subjects && subjects.length > 0 ? String(subjects[0].id) : '')

  // Load the student list whenever the subject or date changes
  useEffect(() => {
    if (!subjectId || !date) return undefined

    let cancelled = false
    api
      .getRoster(subjectId, date)
      .then((data) => {
        if (cancelled) return
        setRoster(data)
        // Students already marked for this date keep their mark; the rest start as present
        setMarks(Object.fromEntries(data.students.map((s) => [s.studentId, s.status || 'present'])))
      })
      .catch((err) => {
        if (!cancelled) setFormError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoadedRequest(`${subjectId}:${date}`)
      })

    return () => {
      cancelled = true
    }
  }, [subjectId, date])

  const rosterLoading = Boolean(subjectId && date && loadedRequest !== `${subjectId}:${date}`)

  if (loading || error) return <PageStatus loading={loading} error={error} />

  if (subjects.length === 0) {
    return (
      <section className="attendance-page">
        <div className="attendance-heading">
          <div>
            <h1>Mark Attendance</h1>
            <p>You are not assigned to any subjects yet.</p>
          </div>
        </div>
      </section>
    )
  }

  function setMark(studentId, status) {
    setMarks((current) => ({ ...current, [studentId]: status }))
    setMessage('')
  }

  function markEveryone(status) {
    setMarks(Object.fromEntries(roster.students.map((s) => [s.studentId, status])))
    setMessage('')
  }

  async function handleSave() {
    setSaving(true)
    setFormError('')
    setMessage('')

    try {
      const records = roster.students.map((s) => ({ studentId: s.studentId, status: marks[s.studentId] }))
      const result = await api.saveAttendance({ subjectId: Number(subjectId), date, records })
      setMessage(`Attendance saved for ${result.saved} students.`)
      // Remember that these are now saved, so the "Saved" tags show
      setRoster((current) => ({
        ...current,
        students: current.students.map((s) => ({ ...s, status: marks[s.studentId] })),
      }))
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const counts = { present: 0, absent: 0, late: 0 }
  if (roster) roster.students.forEach((s) => { counts[marks[s.studentId]] += 1 })

  return (
    <section className="attendance-page">
      <div className="attendance-heading">
        <div>
          <h1>Mark Attendance</h1>
          <p>Choose a subject and date, then mark each student.</p>
        </div>
      </div>

      <div className="form-card">
        <div className="faculty-toolbar">
          <label className="form-field">
            Subject
            <select value={subjectId} onChange={(event) => { setChosenSubjectId(event.target.value); setFormError(''); setMessage('') }}>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.code} · {subject.name}
                </option>
              ))}
            </select>
          </label>

          <label className="form-field">
            Date
            <input
              type="date"
              value={date}
              max={todayString()}
              onChange={(event) => { setDate(event.target.value); setFormError(''); setMessage('') }}
              required
            />
          </label>
        </div>
      </div>

      {formError && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}
      {message && (
        <p className="form-success" role="status">
          {message}
        </p>
      )}

      <div className="attendance-list-card">
        {rosterLoading && <p>Loading students...</p>}

        {!rosterLoading && roster && (
          <>
            <div className="attendance-list-heading">
              <div>
                <h2>{roster.students.length} students</h2>
                <p>
                  {counts.present} present · {counts.absent} absent · {counts.late} late
                </p>
              </div>

              <div className="status-choices">
                <button type="button" className="status-choice" onClick={() => markEveryone('present')}>
                  All present
                </button>
                <button type="button" className="status-choice" onClick={() => markEveryone('absent')}>
                  All absent
                </button>
              </div>
            </div>

            {roster.students.length === 0 && <p>No students are enrolled in this subject.</p>}

            <div className="roster-list">
              {roster.students.map((student) => (
                <div className="roster-row" key={student.studentId}>
                  <div className="roster-student">
                    <h3>{student.name}</h3>
                    <p>
                      {student.rollNumber}
                      {student.status && <span className="saved-tag">Saved</span>}
                    </p>
                  </div>

                  <div className="status-choices" role="group" aria-label={`Attendance for ${student.name}`}>
                    {STATUSES.map((status) => (
                      <button
                        type="button"
                        key={status.value}
                        className={`status-choice ${
                          marks[student.studentId] === status.value ? `active-${status.value}` : ''
                        }`}
                        aria-pressed={marks[student.studentId] === status.value}
                        onClick={() => setMark(student.studentId, status.value)}
                      >
                        {status.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {roster.students.length > 0 && (
              <div className="form-actions">
                <button type="button" className="primary-button" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving...' : 'Save attendance'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}

export default MarkAttendance
