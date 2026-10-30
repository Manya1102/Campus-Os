import { useState } from 'react'
import { api } from '../services/api'
import { useFetch } from '../hooks/useFetch'
import PageStatus from '../components/PageStatus'

function Announcements() {
  const { data: announcements, loading, error } = useFetch(api.getAnnouncements)
  const [category, setCategory] = useState('All')
  const [search, setSearch] = useState('')

  const categories = ['All', 'Academic', 'Event', 'Department', 'General']

  if (loading || error) return <PageStatus loading={loading} error={error} />

  const filtered = announcements.filter((item) => {
    const matchesCategory =
      category === 'All' || item.category === category

    const matchesSearch =
      `${item.title} ${item.description} ${item.audience}`
        .toLowerCase()
        .includes(search.toLowerCase())

    return matchesCategory && matchesSearch
  })

  return (
    <section className="announcements-page">
      <div className="announcements-heading">
        <div>
          <h1>Announcements</h1>
          <p>Stay updated with news from your campus and department.</p>
        </div>
        <span className="announcements-count">
          {announcements.length} notices
        </span>
      </div>

      <div className="announcements-toolbar">
        <input
          type="text"
          placeholder="Search announcements..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search announcements"
        />

        <div className="announcement-filters">
          {categories.map((item) => (
            <button
              type="button"
              key={item}
              className={`announcement-filter ${
                category === item ? 'selected' : ''
              }`}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="announcement-list">
        {filtered.length > 0 ? (
          filtered.map((item) => (
            <article className="announcement-card" key={item.id}>
              <div className="announcement-card-top">
                <span className={`announcement-category category-${item.category.toLowerCase()}`}>
                  {item.category}
                </span>
                {item.pinned && <span className="pinned-label">📌 Pinned</span>}
              </div>

              <h2>{item.title}</h2>
              <p className="announcement-description">{item.description}</p>

              <div className="announcement-meta">
                <span>🏫 {item.audience}</span>
                <span>
                  {new Date(`${item.date}T00:00:00`).toLocaleDateString(
                    'en-IN',
                    { day: 'numeric', month: 'short', year: 'numeric' }
                  )}
                </span>
              </div>
            </article>
          ))
        ) : (
          <div className="announcement-empty">
            <h3>No announcements found</h3>
            <p>Try changing the search or category.</p>
          </div>
        )}
      </div>
    </section>
  )
}

export default Announcements
