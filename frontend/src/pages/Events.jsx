import { useState } from 'react'
import { api } from '../services/api'
import { useFetch } from '../hooks/useFetch'
import PageStatus, { ActionError } from '../components/PageStatus'

function Events() {
  const { data: events, setData: setEvents, loading, error } = useFetch(api.getEvents)
  const [filter, setFilter] = useState('All')
  const [actionError, setActionError] = useState('')

  if (loading || error) return <PageStatus loading={loading} error={error} />

  const categories = ['All', ...new Set(events.map((event) => event.category).filter(Boolean))]

  const filteredEvents = events.filter(
    (event) => filter === 'All' || event.category === filter
  )

  function setRegisteredLocally(id, registered) {
    setEvents((current) =>
      current.map((event) => (event.id === id ? { ...event, registered } : event))
    )
  }

  // Updates the screen immediately, saves to the database, and rolls back if saving fails.
  async function toggleRegistration(id) {
    const event = events.find((item) => item.id === id)
    if (!event) return

    const next = !event.registered
    setActionError('')
    setRegisteredLocally(id, next)

    try {
      await (next ? api.registerEvent(id) : api.unregisterEvent(id))
    } catch (err) {
      setRegisteredLocally(id, !next)
      setActionError(`Could not save your registration: ${err.message}`)
    }
  }

  return (
    <section className="events-page">
      <div className="events-heading">
        <div>
          <h1>Campus Events</h1>
          <p>Discover workshops and activities at your university and across campuses.</p>
        </div>
        <span className="events-total">{events.length} upcoming</span>
      </div>

      <div className="events-banner">
        <div>
          <span className="events-banner-label">MAKE THE MOST OF CAMPUS</span>
          <h2>Learn. Connect. Participate.</h2>
          <p>Explore local events and events shared by other universities.</p>
        </div>
        <span className="events-banner-icon">✦</span>
      </div>

      <div className="event-filters">
        {categories.map((item) => (
          <button
            type="button"
            key={item}
            className={`event-filter ${filter === item ? 'selected' : ''}`}
            onClick={() => setFilter(item)}
          >
            {item}
          </button>
        ))}
      </div>

      <ActionError message={actionError} />

      <div className="events-grid">
        {filteredEvents.length ? filteredEvents.map((event) => {
          const date = new Date(`${event.date}T00:00:00`)

          return (
            <article className="event-card" key={event.id}>
              <div className="event-card-banner">
                <span className="event-category">{event.category}</span>
                {event.visibility === 'cross_campus' && <span className="sharing-badge">Cross-campus</span>}
                <div className="event-date">
                  <strong>{date.getDate()}</strong>
                  <span>
                    {date.toLocaleDateString('en-IN', { month: 'short' })}
                  </span>
                </div>
              </div>

              <div className="event-card-content">
                <h2>{event.title}</h2>
                <p className="event-description">{event.description}</p>

                <div className="event-details">
                  <p>🕒 {event.time}</p>
                  <p>📍 {event.location}</p>
                  <p>👥 {event.seats}</p>
                </div>

                <button
                  type="button"
                  className={`event-register ${
                    event.registered ? 'registered' : ''
                  }`}
                  onClick={() => toggleRegistration(event.id)}
                >
                  {event.registered ? '✓ Registered' : 'Register Interest'}
                </button>
              </div>
            </article>
          )
        }) : <div className="events-empty"><h2>No events match this filter</h2><p>Try another category or check back later.</p></div>}
      </div>
    </section>
  )
}

export default Events
