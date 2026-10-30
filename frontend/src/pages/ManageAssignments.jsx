import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../services/api'
import { useFetch } from '../hooks/useFetch'
import PageStatus, { ActionError } from '../components/PageStatus'
import DetailModal from '../components/DetailModal'

function formatDate(dateString) {
  return new Date(`${dateString}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

const emptyForm = { title: '', description: '', dueDate: '', priority: 'Medium' }

function ManageAssignments() {
  const {
    data: loadedAssignments,
    setData: setAssignments,
    loading: assignmentsLoading,
    error: assignmentsError,
  } = useFetch(api.getFacultyAssignments)
  const { data: loadedSubjects, loading: subjectsLoading, error: subjectsError } = useFetch(api.getFacultySubjects)
  const assignments = loadedAssignments || []
  const subjects = loadedSubjects || []
  const [searchParams] = useSearchParams()

  const [chosenSubjectId, setChosenSubjectId] = useState('')
  const [selectedAssignment, setSelectedAssignment] = useState(null)
  const [submissions, setSubmissions] = useState([])
  const [submissionsLoading, setSubmissionsLoading] = useState(false)
  const [submissionsError, setSubmissionsError] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [actionError, setActionError] = useState('')

  const loading = assignmentsLoading || subjectsLoading
  const error = assignmentsError || subjectsError

  const requestedSubjectId = searchParams.get('subject')
  const validRequestedSubject = subjects.some((subject) => String(subject.id) === requestedSubjectId)
  const subjectId = chosenSubjectId || (validRequestedSubject ? requestedSubjectId : subjects.length > 0 ? String(subjects[0].id) : '')

  useEffect(() => {
    if (!selectedAssignment) return undefined
    let cancelled = false
    setSubmissionsLoading(true)
    setSubmissionsError('')
    api.getFacultyAssignmentSubmissions(selectedAssignment.id)
      .then((result) => { if (!cancelled) setSubmissions(result) })
      .catch((err) => { if (!cancelled) setSubmissionsError(err.message) })
      .finally(() => { if (!cancelled) setSubmissionsLoading(false) })
    return () => { cancelled = true }
  }, [selectedAssignment])

  if (loading || error) return <PageStatus loading={loading} error={error} />

  function update(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setFormError('')

    try {
      const created = await api.createFacultyAssignment({
        subjectId: Number(subjectId),
        title: form.title,
        description: form.description,
        dueDate: form.dueDate,
        priority: form.priority,
      })
      setAssignments((current) => [created, ...current])
      setForm(emptyForm)
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(assignment) {
    const confirmed = window.confirm(
      `Delete "${assignment.title}"? Students will no longer see it, and their progress on it is removed.`
    )
    if (!confirmed) return

    setActionError('')
    try {
      await api.deleteFacultyAssignment(assignment.id)
      setAssignments((current) => current.filter((item) => item.id !== assignment.id))
    } catch (err) {
      setActionError(`Could not delete the assignment: ${err.message}`)
    }
  }

  return (
    <section className="assignments-page">
      <div className="assignments-heading">
        <div>
          <h1>Assignments</h1>
          <p>Post coursework for your subjects and see who has finished it.</p>
        </div>
        <span className="assignments-label">Faculty</span>
      </div>

      {subjects.length === 0 ? (
        <div className="assignments-empty">
          <h3>No subjects yet</h3>
          <p>You need to be assigned to a subject before you can post assignments.</p>
        </div>
      ) : (
        <form className="form-card" onSubmit={handleSubmit}>
          <h2>Post a new assignment</h2>

          <div className="form-row">
            <label className="form-field">
              Subject
              <select value={subjectId} onChange={(event) => setChosenSubjectId(event.target.value)}>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.code} · {subject.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-field">
              Due date
              <input type="date" name="dueDate" value={form.dueDate} onChange={update} required />
            </label>

            <label className="form-field">
              Priority
              <select name="priority" value={form.priority} onChange={update}>
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </label>
          </div>

          <label className="form-field">
            Title
            <input name="title" value={form.title} onChange={update} maxLength={200} required />
          </label>

          <label className="form-field">
            Description (optional)
            <textarea name="description" value={form.description} onChange={update} maxLength={5000} rows={3} />
          </label>

          {formError && (
            <p className="form-error" role="alert">
              {formError}
            </p>
          )}

          <div className="form-actions">
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? 'Posting...' : 'Post assignment'}
            </button>
          </div>
        </form>
      )}

      <ActionError message={actionError} />

      <div className="assignments-list">
        {assignments.length > 0 ? (
          assignments.map((assignment) => {
            const percent =
              assignment.totalStudents === 0
                ? 0
                : Math.round((assignment.completed / assignment.totalStudents) * 100)

            return (
              <article className="assignment-card" key={assignment.id}>
                <div className="assignment-icon" aria-hidden="true">📝</div>

                <div className="assignment-info">
                  <div className="assignment-title-row">
                    <h3><button type="button" className="text-button" onClick={() => setSelectedAssignment(assignment)}>{assignment.title}</button></h3>
                    <span className={`priority priority-${(assignment.priority || 'Medium').toLowerCase()}`}>
                      {assignment.priority || 'Medium'} priority
                    </span>
                  </div>

                  <p className="assignment-subject">
                    {assignment.subject} · {assignment.code}
                  </p>
                  <p className="assignment-due">Due: {formatDate(assignment.dueDate)}</p>

                  <div className="attendance-progress">
                    <div className="progress-safe" style={{ width: `${percent}%` }} />
                  </div>
                  <p className="assignment-due">
                    {assignment.completed} of {assignment.totalStudents} students completed
                  </p>
                </div>

                <div className="assignment-actions">
                    <button type="button" className="text-link-button" onClick={() => setSelectedAssignment(assignment)}>View student progress</button>
                  <button type="button" className="danger-button" onClick={() => handleDelete(assignment)}>
                    Delete
                  </button>
                </div>
              </article>
            )
          })
        ) : (
          <div className="assignments-empty">
            <h3>No assignments posted yet</h3>
            <p>Assignments you post will appear here.</p>
          </div>
        )}
      </div>
      {selectedAssignment && (
        <DetailModal title={selectedAssignment.title} onClose={() => setSelectedAssignment(null)}>
          <p className="detail-modal-lead">{selectedAssignment.subject} · {selectedAssignment.code}</p>
          <p><strong>Due:</strong> {formatDate(selectedAssignment.dueDate)} · <strong>Priority:</strong> {selectedAssignment.priority}</p>
          <p>{selectedAssignment.description || 'No additional instructions were provided.'}</p>
          <h3>Student progress</h3>
          {submissionsLoading ? <p>Loading student progress…</p> : null}
          {submissionsError ? <p className="form-error" role="alert">{submissionsError}</p> : null}
          {!submissionsLoading && !submissionsError && submissions.length === 0 ? <p>No students are enrolled in this subject.</p> : null}
          {!submissionsLoading && submissions.length > 0 && (
            <div className="submission-list">
              {submissions.map((submission) => (
                <div className="submission-row" key={submission.studentId}>
                  <span><strong>{submission.student}</strong><small>{submission.rollNumber}</small></span>
                  <span className={`assignment-status ${submission.status === 'Completed' ? 'status-completed' : 'status-pending'}`}>
                    {submission.status === 'Completed' ? 'Marked complete' : 'Pending'}
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="detail-modal-note">Student progress currently records completion status; file uploads and graded submissions are not supported yet.</p>
        </DetailModal>
      )}
    </section>
  )
}

export default ManageAssignments
