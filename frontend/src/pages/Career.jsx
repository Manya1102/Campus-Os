import { useState } from 'react'
import { api } from '../services/api'
import { useFetch } from '../hooks/useFetch'
import PageStatus, { ActionError } from '../components/PageStatus'
import DetailModal from '../components/DetailModal'

function Career() {
  const {
    data: opportunities,
    setData: setOpportunities,
    loading,
    error,
  } = useFetch(api.getOpportunities)
  const [search, setSearch] = useState('')
  const [type, setType] = useState('All')
  const [showSaved, setShowSaved] = useState(false)
  const [actionError, setActionError] = useState('')
  const [selectedOpportunity, setSelectedOpportunity] = useState(null)

  const types = ['All', 'Internship', 'Training', 'Competition']

  if (loading || error) return <PageStatus loading={loading} error={error} />

  const savedCount = opportunities.filter((item) => item.saved).length

  const filteredOpportunities = opportunities.filter((item) => {
    const matchesType = type === 'All' || item.type === type
    const matchesSaved = !showSaved || item.saved
    const searchableText = [
      item.title,
      item.company,
      item.category,
      item.location,
      ...item.skills,
    ].join(' ').toLowerCase()

    return (
      matchesType &&
      matchesSaved &&
      searchableText.includes(search.toLowerCase())
    )
  })

  function setSavedLocally(id, saved) {
    setOpportunities((current) =>
      current.map((item) => (item.id === id ? { ...item, saved } : item))
    )
  }

  // Updates the screen immediately, saves to the database, and rolls back if saving fails.
  async function toggleSaved(id) {
    const item = opportunities.find((entry) => entry.id === id)
    if (!item) return

    const next = !item.saved
    setActionError('')
    setSavedLocally(id, next)

    try {
      await (next ? api.saveOpportunity(id) : api.unsaveOpportunity(id))
    } catch (err) {
      setSavedLocally(id, !next)
      setActionError(`Could not save your change: ${err.message}`)
    }
  }

  return (
    <section className="career-page">
      <div className="career-heading">
        <div>
          <h1>Career & Opportunities</h1>
          <p>Discover internships, programs, and ways to grow your career.</p>
        </div>
        <span className="career-heading-badge">Explore your future</span>
      </div>

      <div className="career-hero">
        <div>
          <span className="career-hero-eyebrow">YOUR NEXT STEP STARTS HERE</span>
          <h2>Turn your skills into opportunities.</h2>
          <p>
            Explore opportunities, discover new skills, and prepare for your
            professional journey.
          </p>
        </div>
        <div className="career-hero-symbol" aria-hidden="true">↗</div>
      </div>

      <div className="career-stats">
        <div className="career-stat-card">
          <span>Opportunities listed</span>
          <strong>{opportunities.length}</strong>
        </div>
        <div className="career-stat-card">
          <span>Saved by you</span>
          <strong>{savedCount}</strong>
        </div>
        <div className="career-stat-card">
          <span>Opportunity types</span>
          <strong>{types.length - 1}</strong>
        </div>
      </div>

      <div className="career-toolbar">
        <input
          type="search"
          placeholder="Search roles, companies, or skills..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search career opportunities"
        />

        <div className="career-filter-row">
          <div className="career-type-filters">
            {types.map((item) => (
              <button
                type="button"
                key={item}
                className={`career-filter ${type === item ? 'selected' : ''}`}
                onClick={() => setType(item)}
              >
                {item}
              </button>
            ))}
          </div>

          <button
            type="button"
            className={`career-saved-toggle ${showSaved ? 'selected' : ''}`}
            onClick={() => setShowSaved((current) => !current)}
          >
            {showSaved ? 'Show all' : `Saved (${savedCount})`}
          </button>
        </div>
      </div>

      <ActionError message={actionError} />

      <div className="career-results-heading">
        <h2>{showSaved ? 'Saved opportunities' : 'Explore opportunities'}</h2>
        <span>{filteredOpportunities.length} found</span>
      </div>

      <div className="career-opportunity-list">
        {filteredOpportunities.length > 0 ? (
          filteredOpportunities.map((item) => {
            const isSaved = item.saved

            return (
              <article className="career-opportunity-card" key={item.id}>
                <div className="career-company-icon" aria-hidden="true">
                  {item.company.charAt(0)}
                </div>

                <div className="career-opportunity-content">
                  <div className="career-title-line">
                    <div>
                      <span className="career-opportunity-type">{item.type}</span>
                      {item.visibility === 'cross_campus' && <span className="sharing-badge">Cross-campus</span>}
                      <h3><button type="button" className="text-button" onClick={() => setSelectedOpportunity(item)}>{item.title}</button></h3>
                      <p className="career-company-name">{item.company}</p>
                    </div>

                    <button
                      type="button"
                      className={`career-save-button ${isSaved ? 'is-saved' : ''}`}
                      onClick={() => toggleSaved(item.id)}
                      aria-label={isSaved ? 'Remove saved opportunity' : 'Save opportunity'}
                    >
                      {isSaved ? '★ Saved' : '☆ Save'}
                    </button>
                  </div>

                  <p className="career-description">{item.description}</p>

                  <div className="career-meta">
                    <span>📍 {item.location}</span>
                    <span>💻 {item.mode}</span>
                    <span>🎓 {item.stipend}</span>
                  </div>

                  <div className="career-skills">
                    {item.skills.map((skill) => (
                      <span key={skill}>{skill}</span>
                    ))}
                  </div>

                  <div className="career-card-footer">
                    <span>
                      Deadline: {new Date(`${item.deadline}T00:00:00`).toLocaleDateString(
                        'en-IN',
                        { day: 'numeric', month: 'short', year: 'numeric' }
                      )}
                    </span>
                    <button type="button" className="text-link-button" onClick={() => setSelectedOpportunity(item)}>View details →</button>
                  </div>
                </div>
              </article>
            )
          })
        ) : (
          <div className="career-empty">
            <h3>No opportunities found</h3>
            <p>Try another search, change the type, or view all opportunities.</p>
          </div>
        )}
      </div>

      <div className="career-tip">
        <span aria-hidden="true">✦</span>
        <div>
          <h3>Build your career profile</h3>
          <p>
            Keep your projects, technical skills, resume, and achievements
            updated so you are ready when the right opportunity appears.
          </p>
        </div>
      </div>

      {selectedOpportunity && (
        <DetailModal title={selectedOpportunity.title} onClose={() => setSelectedOpportunity(null)}>
          <p className="detail-modal-lead">{selectedOpportunity.company} · {selectedOpportunity.type}</p>
          <p>{selectedOpportunity.description || 'No additional details were provided.'}</p>
          <p><strong>Location:</strong> {selectedOpportunity.location} · {selectedOpportunity.mode}</p>
          <p><strong>Stipend:</strong> {selectedOpportunity.stipend || 'Not specified'}</p>
          <p><strong>Deadline:</strong> {new Date(`${selectedOpportunity.deadline}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          {selectedOpportunity.skills.length > 0 && <p><strong>Skills:</strong> {selectedOpportunity.skills.join(', ')}</p>}
          {selectedOpportunity.applicationUrl ? (
            <a className="primary-button detail-modal-action" href={selectedOpportunity.applicationUrl} target="_blank" rel="noreferrer">Apply for this opportunity ↗</a>
          ) : (
            <p className="detail-modal-note">No application link has been added for this opportunity yet.</p>
          )}
        </DetailModal>
      )}
    </section>
  )
}

export default Career
