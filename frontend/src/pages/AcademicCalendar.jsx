import { useMemo, useState } from 'react'
import { api } from '../services/api'
import { useFetch } from '../hooks/useFetch'
import PageStatus from '../components/PageStatus'
import DetailModal from '../components/DetailModal'

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatDate(value) {
  if (!value) return ''
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
}

function AcademicCalendar() {
  const { data: loadedItems, loading, error } = useFetch(api.getAcademicCalendar)
  const items = loadedItems || []
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [selectedItem, setSelectedItem] = useState(null)

  const calendarDays = useMemo(() => {
    const offset = (month.getDay() + 6) % 7
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
    return [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)]
  }, [month])

  if (loading || error) return <PageStatus loading={loading} error={error} />

  function itemsOn(day) {
    if (!day) return []
    const key = dateKey(new Date(month.getFullYear(), month.getMonth(), day))
    return items.filter((item) => item.startsOn <= key && (item.endsOn || item.startsOn) >= key)
  }

  function moveMonth(offset) {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1))
  }

  return (
    <section className="calendar-page">
      <header className="page-heading">
        <div><h1>Academic calendar</h1><p>Keep track of important dates from your university.</p></div>
        <span className="announcements-count">{items.length} dates</span>
      </header>

      <section className="calendar-panel" aria-label="Academic calendar month view">
        <div className="calendar-toolbar">
          <button type="button" className="profile-cancel-button" onClick={() => moveMonth(-1)} aria-label="Previous month">←</button>
          <h2>{month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</h2>
          <button type="button" className="profile-cancel-button" onClick={() => moveMonth(1)} aria-label="Next month">→</button>
          <button type="button" className="calendar-today-button" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Today</button>
        </div>

        <div className="calendar-grid" role="grid">
          {weekdays.map((weekday) => <div className="calendar-weekday" role="columnheader" key={weekday}>{weekday}</div>)}
          {calendarDays.map((day, index) => {
            const dayItems = itemsOn(day)
            const isToday = day && dateKey(new Date(month.getFullYear(), month.getMonth(), day)) === dateKey(new Date())
            return (
              <div className={`calendar-day ${!day ? 'calendar-day-empty' : ''} ${isToday ? 'calendar-day-today' : ''}`} role="gridcell" key={`${month.getFullYear()}-${month.getMonth()}-${index}`}>
                {day && <span className="calendar-day-number">{day}</span>}
                {dayItems.slice(0, 2).map((item) => (
                  <button type="button" className="calendar-item-chip" key={item.id} onClick={() => setSelectedItem(item)} title={item.title}>
                    {item.title}
                  </button>
                ))}
                {dayItems.length > 2 && <span className="calendar-more">+{dayItems.length - 2} more</span>}
              </div>
            )
          })}
        </div>
      </section>

      <section className="calendar-upcoming">
        <div className="page-heading"><div><h2>Upcoming dates</h2><p>Open any item for its details.</p></div></div>
        {items.filter((item) => (item.endsOn || item.startsOn) >= dateKey(new Date())).length ? (
          items.filter((item) => (item.endsOn || item.startsOn) >= dateKey(new Date())).map((item) => (
            <button type="button" className="calendar-upcoming-row" key={item.id} onClick={() => { setSelectedItem(item); setMonth(new Date(`${item.startsOn}T00:00:00`)) }}>
              <span className="calendar-upcoming-date">{formatDate(item.startsOn)}{item.endsOn && item.endsOn !== item.startsOn ? ` – ${formatDate(item.endsOn)}` : ''}</span>
              <span className="calendar-upcoming-title"><strong>{item.title}</strong><small>{item.category}{item.eligibleProgram ? ` · ${item.eligibleProgram}` : ''}</small></span>
              <span className="calendar-upcoming-arrow">View details →</span>
            </button>
          ))
        ) : <p className="empty-state">No upcoming academic dates have been published.</p>}
      </section>

      {selectedItem && (
        <DetailModal title={selectedItem.title} onClose={() => setSelectedItem(null)}>
          <p className="detail-modal-lead">{selectedItem.category}</p>
          <p><strong>Dates:</strong> {formatDate(selectedItem.startsOn)}{selectedItem.endsOn && selectedItem.endsOn !== selectedItem.startsOn ? ` – ${formatDate(selectedItem.endsOn)}` : ''}</p>
          {selectedItem.eligibleProgram && <p><strong>Program:</strong> {selectedItem.eligibleProgram}</p>}
          <p>{selectedItem.description || 'No additional details were provided.'}</p>
        </DetailModal>
      )}
    </section>
  )
}

export default AcademicCalendar
