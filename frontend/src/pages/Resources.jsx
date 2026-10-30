import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { useFetch } from '../hooks/useFetch'
import { useAuth } from '../hooks/useAuth'
import PageStatus, { ActionError } from '../components/PageStatus'
import DetailModal from '../components/DetailModal'
import FacultyResourceUploader from '../components/FacultyResourceUploader'

function Resources() {
  const { user } = useAuth()
  const {
    data: resources,
    setData: setResources,
    loading,
    error,
  } = useFetch(api.getResources)
  const [search, setSearch] = useState('')
  const [subject, setSubject] = useState('All')
  const [type, setType] = useState('All')
  const [showFavourites, setShowFavourites] = useState(false)
  const [actionError, setActionError] = useState('')
  const [selectedResource, setSelectedResource] = useState(null)
  const [filePreviewUrl, setFilePreviewUrl] = useState('')
  const [fileError, setFileError] = useState('')
  const [openingFile, setOpeningFile] = useState(false)

  useEffect(() => () => {
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl)
  }, [filePreviewUrl])

  const resourceTypes = ['All', 'Notes', 'Practice', 'Tutorial']

  if (loading || error) return <PageStatus loading={loading} error={error} />

  const subjects = ['All', ...new Set(resources.map((resource) => resource.subject).filter(Boolean))]

  const favouriteCount = resources.filter((item) => item.favourite).length

  const filteredResources = resources.filter((resource) => {
    const matchesSubject = subject === 'All' || resource.subject === subject
    const matchesType = type === 'All' || resource.type === type
    const matchesFavourites = !showFavourites || resource.favourite

    const searchableText = [
      resource.title,
      resource.subject,
      resource.type,
      resource.description,
      resource.author,
    ].join(' ').toLowerCase()

    return (
      matchesSubject &&
      matchesType &&
      matchesFavourites &&
      searchableText.includes(search.toLowerCase())
    )
  })

  function setFavouriteLocally(id, favourite) {
    setResources((current) =>
      current.map((item) => (item.id === id ? { ...item, favourite } : item))
    )
  }

  // Updates the screen immediately, saves to the database, and rolls back if saving fails.
  async function toggleFavourite(id) {
    const resource = resources.find((item) => item.id === id)
    if (!resource) return

    const next = !resource.favourite
    setActionError('')
    setFavouriteLocally(id, next)

    try {
      await (next ? api.addFavourite(id) : api.removeFavourite(id))
    } catch (err) {
      setFavouriteLocally(id, !next)
      setActionError(`Could not save your favourite: ${err.message}`)
    }
  }

  function resetFilters() {
    setSearch('')
    setSubject('All')
    setType('All')
    setShowFavourites(false)
  }

  function addUploadedResource(resource) {
    setResources((current) => [resource, ...current])
  }

  async function openUploadedFile(resource) {
    setOpeningFile(true)
    setFileError('')
    try {
      const blob = await api.getResourceFile(resource.id)
      setFilePreviewUrl(URL.createObjectURL(blob))
    } catch (err) {
      setFileError(err.message)
    } finally {
      setOpeningFile(false)
    }
  }

  return (
    <section className="resources-page">
      <div className="resources-heading">
        <div>
          <h1>Learning Resources</h1>
          <p>Find notes, practice questions, and guides for your subjects.</p>
        </div>
        <span className="resources-heading-badge">Your study library</span>
      </div>

      <div className="resources-hero">
        <div>
          <span className="resources-hero-eyebrow">LEARN AT YOUR OWN PACE</span>
          <h2>Everything you need to keep learning.</h2>
          <p>Explore learning materials shared across your campus community.</p>
        </div>
        <div className="resources-hero-icon" aria-hidden="true">▤</div>
      </div>

      {user.role === 'faculty' && <FacultyResourceUploader onUploaded={addUploadedResource} />}

      <div className="resources-summary">
        <div>
          <span>Total resources</span>
          <strong>{resources.length}</strong>
        </div>
        <div>
          <span>Subjects covered</span>
          <strong>{new Set(resources.map((item) => item.subject)).size}</strong>
        </div>
        <div>
          <span>Your favourites</span>
          <strong>{favouriteCount}</strong>
        </div>
      </div>

      <div className="resources-controls">
        <input
          type="search"
          placeholder="Search notes, topics, or subjects..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search learning resources"
        />

        <div className="resources-select-row">
          <label>
            Subject
            <select
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            >
              {subjects.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>

          <label>
            Resource type
            <select
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              {resourceTypes.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className={`resources-favourites-toggle ${showFavourites ? 'selected' : ''}`}
            onClick={() => setShowFavourites((current) => !current)}
          >
            {showFavourites ? 'All resources' : `★ Favourites (${favouriteCount})`}
          </button>
        </div>
      </div>

      <ActionError message={actionError} />

      <div className="resources-results-heading">
        <div>
          <h2>{showFavourites ? 'Your favourites' : 'Browse resources'}</h2>
          <p>{filteredResources.length} resources found</p>
        </div>

        <button type="button" className="resources-reset" onClick={resetFilters}>
          Reset filters
        </button>
      </div>

      <div className="resources-grid">
        {filteredResources.length > 0 ? (
          filteredResources.map((resource) => {
            const isFavourite = resource.favourite

            return (
              <article className="resource-card" key={resource.id}>
                <div className="resource-card-top">
                  <div className="resource-icon" aria-hidden="true">
                    {resource.icon}
                  </div>

                  <button
                    type="button"
                    className={`resource-favourite ${isFavourite ? 'is-favourite' : ''}`}
                    onClick={() => toggleFavourite(resource.id)}
                    aria-label={isFavourite ? 'Remove from favourites' : 'Add to favourites'}
                  >
                    {isFavourite ? '★' : '☆'}
                  </button>
                </div>

                <div className="resource-tags">
                  <span>{resource.type}</span>
                  <span>{resource.format}</span>
                  <span className="sharing-badge">{resource.visibility === 'cross_campus' ? 'Cross-campus' : 'Your university'}</span>
                </div>

                <h3><button type="button" className="text-button" onClick={() => setSelectedResource(resource)}>{resource.title}</button></h3>
                <p className="resource-subject">{resource.subject}</p>
                <p className="resource-description">{resource.description}</p>

                <div className="resource-card-footer">
                  <span>{resource.author}</span>
                  <button type="button" className="text-link-button" onClick={() => setSelectedResource(resource)}>Open details →</button>
                </div>
              </article>
            )
          })
        ) : (
          <div className="resources-empty">
            <h3>No resources found</h3>
            <p>Try a different search or change your filters.</p>
            <button type="button" onClick={resetFilters}>Clear filters</button>
          </div>
        )}
      </div>

      <div className="resources-contribute">
        <div className="resources-contribute-icon" aria-hidden="true">＋</div>
        <div>
          <h3>{user.role === 'faculty' ? 'Share more knowledge with your campus' : 'Share knowledge with your campus'}</h3>
          <p>
            {user.role === 'faculty'
              ? 'Your uploaded notes appear in the resource library for students at your university.'
              : 'Ask your department administrator to publish verified study materials.'}
          </p>
        </div>
      </div>

      {selectedResource && (
        <DetailModal title={selectedResource.title} onClose={() => { setSelectedResource(null); setFilePreviewUrl(''); setFileError('') }}>
          <p className="detail-modal-lead">{selectedResource.subject} · {selectedResource.type} · {selectedResource.format}</p>
          <p>{selectedResource.description || 'No description was provided.'}</p>
          <p><strong>Shared by:</strong> {selectedResource.author || 'Campus community'}</p>
          {selectedResource.url?.startsWith('/api/resources/') ? (
            <>
              {fileError && <p className="form-error" role="alert">{fileError}</p>}
              {filePreviewUrl ? (
                <>
                  <iframe className="resource-file-preview" src={filePreviewUrl} title={`${selectedResource.title} PDF preview`} />
                  <a className="primary-button detail-modal-action" href={filePreviewUrl} download={`${selectedResource.title}.pdf`}>Download PDF ↓</a>
                </>
              ) : (
                <button type="button" className="primary-button detail-modal-action" onClick={() => openUploadedFile(selectedResource)} disabled={openingFile}>
                  {openingFile ? 'Opening notes…' : 'Open notes'}
                </button>
              )}
            </>
          ) : selectedResource.url ? (
            <a className="primary-button detail-modal-action" href={selectedResource.url} target="_blank" rel="noreferrer">Open learning material ↗</a>
          ) : (
            <p className="detail-modal-note">This resource has no file or link attached yet.</p>
          )}
        </DetailModal>
      )}
    </section>
  )
}

export default Resources
