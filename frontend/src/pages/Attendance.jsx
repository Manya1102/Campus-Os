import { useState } from 'react'
import { api } from '../services/api'
import { useFetch } from '../hooks/useFetch'
import PageStatus from '../components/PageStatus'

function percentOf(attended, total) {
  return total === 0 ? 0 : Math.round((attended / total) * 100)
}

function Attendance() {
  const { data: subjects, loading, error } = useFetch(api.getAttendance)
  const [search, setSearch] = useState('')

  if (loading || error) return <PageStatus loading={loading} error={error} />

  const totalAttended = subjects.reduce((sum, s) => sum + s.attended, 0)
  const totalClasses = subjects.reduce((sum, s) => sum + s.total, 0)
  const overall = percentOf(totalAttended, totalClasses)

  const filteredSubjects = subjects.filter((subject) =>
    subject.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <section className="attendance-page">
      <div className="attendance-heading">
        <div>
          <h1>My Attendance</h1>
          <p>Track your attendance and stay on top of your classes.</p>
        </div>
        <span className="attendance-term">Current Semester</span>
      </div>

      <div className="attendance-overview">
        <div className="attendance-overview-card attendance-overall">
          <span>Overall Attendance</span>
          <h2>{overall}%</h2>
          <div className="attendance-progress">
            <div style={{ width: `${overall}%` }} />
          </div>
          <p>{totalAttended} of {totalClasses} classes attended</p>
        </div>

        <div className="attendance-overview-card">
          <span>Classes Attended</span>
          <h2>{totalAttended}</h2>
          <p>Across all subjects</p>
        </div>

        <div className="attendance-overview-card">
          <span>Classes Missed</span>
          <h2>{totalClasses - totalAttended}</h2>
          <p>Recorded absences</p>
        </div>
      </div>

      <div className="attendance-list-card">
        <div className="attendance-list-heading">
          <div>
            <h2>Subject-wise Attendance</h2>
            <p>Minimum target: 75%</p>
          </div>
          <input
            type="text"
            placeholder="Search subjects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search subjects"
          />
        </div>

        <div className="attendance-subject-list">
          {filteredSubjects.map((subject) => {
            const percentage = percentOf(subject.attended, subject.total)
            const safe = percentage >= 75

            return (
              <article className="attendance-subject" key={subject.id}>
                <div className="attendance-subject-info">
                  <h3>{subject.name}</h3>
                  <p>{subject.code}</p>
                </div>

                <div className="attendance-subject-progress">
                  <div className="attendance-progress">
                    <div
                      className={safe ? 'progress-safe' : 'progress-low'}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <span>{subject.attended}/{subject.total} classes</span>
                </div>

                <div className="attendance-percentage">
                  <strong>{percentage}%</strong>
                  <span className={safe ? 'attendance-safe' : 'attendance-low'}>
                    {safe ? 'On track' : 'Below target'}
                  </span>
                </div>
              </article>
            )
          })}

          {filteredSubjects.length === 0 && (
            <p className="attendance-empty">No subjects found.</p>
          )}
        </div>
      </div>
    </section>
  )
}

export default Attendance
