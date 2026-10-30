import { Link } from 'react-router-dom'
import { api } from '../services/api'
import { useFetch } from '../hooks/useFetch'

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatDate(value) {
  if (!value) return ''
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function AcademicCalendarSummary() {
  const { data, loading, error } = useFetch(api.getAcademicCalendar)
  const today = dateKey(new Date())
  const upcoming = (data || [])
    .filter((item) => (item.endsOn || item.startsOn) >= today)
    .slice(0, 4)

  return (
    <section className="section-box dashboard-calendar-summary" aria-labelledby="dashboard-calendar-title">
      <div className="dashboard-calendar-heading">
        <div>
          <h2 id="dashboard-calendar-title">Upcoming academic dates</h2>
          <p>Important dates for your campus.</p>
        </div>
        <Link className="text-link" to="/calendar">Open calendar →</Link>
      </div>

      {loading ? <p>Loading academic dates…</p> : error ? <p>Academic dates are temporarily unavailable.</p> : upcoming.length ? (
        <div className="dashboard-calendar-list">
          {upcoming.map((item) => (
            <Link className="dashboard-calendar-item" to="/calendar" key={item.id}>
              <span className="dashboard-calendar-date">
                {formatDate(item.startsOn)}{item.endsOn && item.endsOn !== item.startsOn ? ` – ${formatDate(item.endsOn)}` : ''}
              </span>
              <span className="dashboard-calendar-title">
                <strong>{item.title}</strong>
                <small>{item.category}{item.eligibleProgram ? ` · ${item.eligibleProgram}` : ''}</small>
              </span>
              <span className="dashboard-calendar-arrow" aria-hidden="true">→</span>
            </Link>
          ))}
        </div>
      ) : <p>No upcoming academic dates have been published.</p>}
    </section>
  )
}

export default AcademicCalendarSummary
