import { Link } from 'react-router-dom'
import { api } from '../services/api'
import { useFetch } from '../hooks/useFetch'
import PageStatus from '../components/PageStatus'
import AcademicCalendarSummary from '../components/AcademicCalendarSummary'

function FacultyDashboard() {
  const { data, loading, error } = useFetch(api.getFacultyDashboard)

  if (loading || error) return <PageStatus loading={loading} error={error} />

  const totalEnrolments = data.subjects.reduce((sum, subject) => sum + subject.students, 0)

  return (
    <div className="dashboard">
      <div className="welcome">
        <h1>Welcome, {data.name}</h1>
        <p>Here's an overview of your classes and students.</p>
      </div>

      <div className="cards">
        <Link className="card dashboard-action-card" to="/assignments">
          <h3>Subjects you teach</h3>
          <p>{data.subjects.length}</p>
          <span className="dashboard-card-action">View assignments →</span>
        </Link>

        <Link className="card dashboard-action-card" to="/attendance">
          <h3>Student enrolments</h3>
          <p>{totalEnrolments}</p>
          <span className="dashboard-card-action">Open attendance →</span>
        </Link>

        <Link className="card dashboard-action-card" to="/assignments">
          <h3>Assignments posted</h3>
          <p>{data.assignmentsPosted}</p>
          <span className="dashboard-card-action">Manage assignments →</span>
        </Link>
      </div>

      <div className="dashboard-sections">
        <div className="section-box">
          <h2>Today's Classes</h2>
          {data.todaysClasses.length > 0 ? (
            data.todaysClasses.map((item) => (
              <Link className="dashboard-upcoming-link" key={`${item.code}-${item.time}`} to={`/attendance?subject=${item.subjectId}`}>
                {item.time} — {item.subject} ({item.room})
                <span className="dashboard-card-action">Take attendance →</span>
              </Link>
            ))
          ) : (
            <p>No classes today.</p>
          )}
        </div>

        <div className="section-box">
          <h2>Students Below 75% Attendance</h2>
          {data.lowAttendance.length > 0 ? (
            data.lowAttendance.map((item) => (
              <Link className="dashboard-upcoming-link" key={`${item.student}-${item.code}`} to={`/attendance?subject=${item.subjectId}`}>
                <span>{item.student} — {item.code}: {item.percentage}% ({item.attended}/{item.total})</span>
                <span className="dashboard-card-action">Review attendance →</span>
              </Link>
            ))
          ) : (
            <p>Everyone is on track.</p>
          )}
        </div>
      </div>

      <AcademicCalendarSummary />

      <div className="section-box">
        <h2>Your Subjects</h2>
        {data.subjects.length > 0 ? (
          data.subjects.map((subject) => (
              <div className="faculty-subject-row" key={subject.id}>
                <span>{subject.code} · {subject.name} — {subject.students} students</span>
                <span>
                  <Link className="text-link" to={`/attendance?subject=${subject.id}`}>Attendance</Link>
                  {' · '}
                  <Link className="text-link" to={`/assignments?subject=${subject.id}`}>Assignments</Link>
                </span>
              </div>
          ))
        ) : (
          <p>You are not assigned to any subjects yet.</p>
        )}
        {data.subjects.length > 0 && (
          <p>
            <Link className="text-link" to="/attendance">Mark attendance</Link>
            {' · '}
            <Link className="text-link" to="/assignments">Manage assignments</Link>
          </p>
        )}
      </div>
    </div>
  )
}

export default FacultyDashboard
