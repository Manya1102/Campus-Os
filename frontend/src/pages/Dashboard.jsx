import { Link } from 'react-router-dom'
import { api } from '../services/api'
import { useFetch } from '../hooks/useFetch'
import PageStatus from '../components/PageStatus'
import AcademicCalendarSummary from '../components/AcademicCalendarSummary'

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function plural(count, singular, pluralForm) {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

function formatUpcomingDate(value) {
  if (!value) return ''
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function Dashboard() {
  const { data, loading, error } = useFetch(api.getDashboard)

  if (loading || error) return <PageStatus loading={loading} error={error} />

  return (
    <div className="dashboard">

      <div className="welcome">
        <h1>{getGreeting()}! 👋</h1>
        <p>Here's what's happening on your campus today.</p>
      </div>

      <div className="cards">
        <Link className="card dashboard-action-card" to="/timetable" aria-label="Open today's timetable">
          <h3>Today's Classes</h3>
          <p>{plural(data.todaysClasses, 'class', 'classes')}</p>
          <span className="dashboard-card-action">View timetable →</span>
        </Link>

        <Link className="card dashboard-action-card" to="/assignments" aria-label="View your assignments">
          <h3>Pending Assignments</h3>
          <p>{plural(data.pendingAssignments, 'assignment', 'assignments')}</p>
          <span className="dashboard-card-action">View assignments →</span>
        </Link>

        <Link className="card dashboard-action-card" to="/attendance" aria-label="View your attendance">
          <h3>Attendance</h3>
          <p>{data.attendance}%</p>
          <span className="dashboard-card-action">View attendance →</span>
        </Link>
      </div>

      <div className="dashboard-sections">
        <div className="section-box">
          <h2>Today's Timetable</h2>
          {data.timetable.length > 0 ? (
            data.timetable.map((item) => (
              <p key={`${item.time}-${item.subject}`}>
                {item.time} — {item.subject}
              </p>
            ))
          ) : (
            <p>No classes today.</p>
          )}
          <Link className="text-link" to="/timetable">Open weekly timetable →</Link>
        </div>

        <div className="section-box">
          <h2>Coming up in the next 7 days</h2>
          {data.upcoming.length > 0 ? (
            data.upcoming.map((item) => (
              <Link className="dashboard-upcoming-link" key={`${item.type}-${item.label}`} to={item.type === 'assignment' ? '/assignments' : '/events'}>
                <span><small>{item.type === 'assignment' ? 'Assignment' : 'Event'}</small>{item.label}</span>
                <time>{formatUpcomingDate(item.date)}</time>
              </Link>
            ))
          ) : (
            <p>Nothing coming up.</p>
          )}
        </div>
      </div>

      <AcademicCalendarSummary />

    </div>
  )
}

export default Dashboard
