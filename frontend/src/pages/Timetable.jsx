import { useEffect, useState } from 'react'
import { api } from '../services/api'

const DAYS = [
  { code: 'Mon', label: 'Monday' },
  { code: 'Tue', label: 'Tuesday' },
  { code: 'Wed', label: 'Wednesday' },
  { code: 'Thu', label: 'Thursday' },
  { code: 'Fri', label: 'Friday' },
  { code: 'Sat', label: 'Saturday' },
]

function currentDay() {
  const code = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date().getDay()]
  return DAYS.some((day) => day.code === code) ? code : 'Mon'
}

function Timetable() {
  const [selectedDay, setSelectedDay] = useState(currentDay)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    api.getTimetable(selectedDay)
      .then((result) => { if (!cancelled) setData(result) })
      .catch((err) => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [selectedDay])

  if (loading) return <p className="page-loading" role="status">Loading timetable…</p>
  if (error) return <p className="page-error" role="alert">Could not load the timetable: {error}</p>

  const { classes, summary, day, isToday } = data

  return (
    <section className="timetable-page">
      <div className="page-heading">
        <div>
          <h1>My Weekly Timetable</h1>
          <p>Choose a day to see your classes for the week.</p>
        </div>

        <span className="day-badge">
          {isToday ? "Today's Schedule" : `${day}'s Schedule`}
        </span>
      </div>

      <div className="timetable-summary">
        <div className="summary-card">
          <span>Total Classes</span>
          <h2>{summary.total}</h2>
        </div>

        <div className="summary-card">
          <span>Next Class</span>
          <h2>{summary.nextClass || '—'}</h2>
        </div>

        <div className="summary-card">
          <span>Free Periods</span>
          <h2>{summary.freePeriods}</h2>
        </div>
      </div>

      <div className="schedule-card">
        <div className="schedule-heading-row">
          <h2>Class Schedule</h2>
          <div className="day-selector" role="group" aria-label="Choose a timetable day">
            {DAYS.map((item) => (
              <button
                key={item.code}
                type="button"
                className={`day-selector-button ${selectedDay === item.code ? 'selected' : ''}`}
                aria-pressed={selectedDay === item.code}
                onClick={() => setSelectedDay(item.code)}
              >
                {item.label.slice(0, 3)}
              </button>
            ))}
          </div>
        </div>

        <div className="class-list">
          {classes.length === 0 && <p>No classes scheduled for {day}.</p>}

          {classes.map((item) => (
            <div className="class-item" key={`${item.code}-${item.time}`}>
              <div className="class-time">
                <strong>{item.time}</strong>
                <span>{item.endTime}</span>
              </div>

              <div className="class-indicator" />

              <div className="class-details">
                <h3>{item.subject}</h3>
                <p>{item.code} · {item.room}</p>
              </div>

              <span className="class-type">{item.type}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default Timetable
