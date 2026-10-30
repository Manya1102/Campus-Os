import { useEffect, useState } from 'react'
import { api } from '../services/api'
import DetailModal from '../components/DetailModal'

function formatDate(dateString) {
  return new Date(`${dateString}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function Assignments() {
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [selectedAssignmentId, setSelectedAssignmentId] = useState(null)
  const selectedAssignment = assignments.find((item) => item.id === selectedAssignmentId)

  useEffect(() => {
    let cancelled = false

    api
      .getAssignments()
      .then((data) => {
        if (!cancelled) setAssignments(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const filteredAssignments = assignments.filter((assignment) => {
    const matchesFilter =
      filter === 'All' || assignment.status === filter

    const matchesSearch =
      assignment.title.toLowerCase().includes(search.toLowerCase()) ||
      assignment.subject.toLowerCase().includes(search.toLowerCase())

    return matchesFilter && matchesSearch
  })

  const pendingCount = assignments.filter(
    (item) => item.status === 'Pending'
  ).length

  const completedCount = assignments.filter(
    (item) => item.status === 'Completed'
  ).length

  // Updates the screen immediately, saves to the database, and rolls back if saving fails.
  async function toggleStatus(id) {
    const target = assignments.find((item) => item.id === id)
    if (!target) return

    const previousStatus = target.status
    const nextStatus = previousStatus === 'Completed' ? 'Pending' : 'Completed'

    setError('')
    setAssignments((current) =>
      current.map((item) =>
        item.id === id ? { ...item, status: nextStatus } : item
      )
    )

    try {
      const saved = await api.updateAssignmentStatus(id, nextStatus)
      setAssignments((current) =>
        current.map((item) => (item.id === id ? saved : item))
      )
    } catch (err) {
      setAssignments((current) =>
        current.map((item) =>
          item.id === id ? { ...item, status: previousStatus } : item
        )
      )
      setError(`Could not save your change: ${err.message}`)
    }
  }

  return (
    <section className="assignments-page">
      <div className="assignments-heading">
        <div>
          <h1>My Assignments</h1>
          <p>Keep track of your coursework and deadlines.</p>
        </div>

        <span className="assignments-label">Academic Tasks</span>
      </div>

      <div className="assignment-stats">
        <div className="assignment-stat">
          <span>Total Assignments</span>
          <h2>{assignments.length}</h2>
        </div>

        <div className="assignment-stat">
          <span>Pending</span>
          <h2>{pendingCount}</h2>
        </div>

        <div className="assignment-stat">
          <span>Completed</span>
          <h2>{completedCount}</h2>
        </div>
      </div>

      <div className="assignments-toolbar">
        <input
          type="text"
          placeholder="Search assignments or subjects..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search assignments"
        />

        <div className="assignment-filters">
          {['All', 'Pending', 'Completed'].map((option) => (
            <button
              key={option}
              type="button"
              className={`filter-button ${
                filter === option ? 'selected' : ''
              }`}
              onClick={() => setFilter(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="assignments-empty" role="alert">
          <h3>Something went wrong</h3>
          <p>{error}</p>
        </div>
      )}

      <div className="assignments-list">
        {loading ? (
          <div className="assignments-empty">
            <h3>Loading assignments...</h3>
          </div>
        ) : filteredAssignments.length > 0 ? (
          filteredAssignments.map((assignment) => (
            <article className="assignment-card" key={assignment.id}>
              <div className="assignment-icon" aria-hidden="true">
                {assignment.status === 'Completed' ? '✓' : '📝'}
              </div>

              <div className="assignment-info">
                <div className="assignment-title-row">
                  <h3><button type="button" className="text-button" onClick={() => setSelectedAssignmentId(assignment.id)}>{assignment.title}</button></h3>

                  <span
                    className={`priority priority-${(assignment.priority || 'Medium').toLowerCase()}`}
                  >
                    {assignment.priority || 'Medium'} priority
                  </span>
                </div>

                <p className="assignment-subject">
                  {assignment.subject} · {assignment.code}
                </p>

                <p className="assignment-due">
                  Due: {formatDate(assignment.dueDate)}
                </p>
              </div>

              <div className="assignment-actions">
                <span
                  className={`assignment-status ${
                    assignment.status === 'Completed'
                      ? 'status-completed'
                      : 'status-pending'
                  }`}
                >
                  {assignment.status}
                </span>

                <button
                  type="button"
                  className="status-button"
                  onClick={() => toggleStatus(assignment.id)}
                >
                  {assignment.status === 'Completed'
                    ? 'Mark Pending'
                    : 'Mark Complete'}
                </button>
                <button type="button" className="text-link-button" onClick={() => setSelectedAssignmentId(assignment.id)}>View details</button>
              </div>
            </article>
          ))
        ) : (
          !error && (
            <div className="assignments-empty">
              <h3>No assignments found</h3>
              <p>Try a different search or filter.</p>
            </div>
          )
        )}
      </div>
      {selectedAssignment && (
        <DetailModal title={selectedAssignment.title} onClose={() => setSelectedAssignmentId(null)}>
          <p className="detail-modal-lead">{selectedAssignment.subject} · {selectedAssignment.code}</p>
          <p><strong>Due:</strong> {formatDate(selectedAssignment.dueDate)}</p>
          <p><strong>Priority:</strong> {selectedAssignment.priority}</p>
          <p><strong>Your status:</strong> {selectedAssignment.status}</p>
          <p>{selectedAssignment.description || 'No additional instructions were provided for this assignment.'}</p>
          <p className="detail-modal-note">This version records completion status only; it does not accept or store a file submission.</p>
          <button type="button" className="primary-button" onClick={() => toggleStatus(selectedAssignment.id)}>
            {selectedAssignment.status === 'Completed' ? 'Mark as pending' : 'Mark complete'}
          </button>
        </DetailModal>
      )}
    </section>
  )
}

export default Assignments
