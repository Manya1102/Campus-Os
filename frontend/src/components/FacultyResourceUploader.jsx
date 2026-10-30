import { useState } from 'react'
import { api } from '../services/api'
import { useFetch } from '../hooks/useFetch'

function FacultyResourceUploader({ onUploaded }) {
  const { data: loadedSubjects, loading, error } = useFetch(api.getFacultySubjects)
  const subjects = loadedSubjects || []
  const [title, setTitle] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [formError, setFormError] = useState('')

  const selectedSubjectId = subjectId || (subjects.length ? String(subjects[0].id) : '')

  async function submit(event) {
    event.preventDefault()
    const formElement = event.currentTarget
    setFormError('')
    setMessage('')
    if (!file) {
      setFormError('Choose a PDF file to upload.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setFormError('The PDF must be 10 MB or smaller.')
      return
    }

    setSaving(true)
    try {
      const created = await api.uploadFacultyNotes(file, {
        title,
        subjectId: selectedSubjectId,
        description,
      })
      onUploaded(created)
      setTitle('')
      setDescription('')
      setFile(null)
      formElement.reset()
      setMessage('Notes uploaded. Students in your university can now open them.')
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="form-card faculty-resource-upload" onSubmit={submit}>
      <div>
        <h2>Upload notes for your students</h2>
        <p>PDF notes are shared with students at your university who can access the selected subject.</p>
      </div>
      {loading ? <p role="status">Loading your subjects…</p> : null}
      {error ? <p className="form-error" role="alert">Could not load your subjects: {error}</p> : null}
      {!loading && !error && subjects.length === 0 ? (
        <p className="detail-modal-note">You need to be assigned to a subject before you can upload notes.</p>
      ) : null}
      {!loading && !error && subjects.length > 0 && (
        <>
          <label className="form-field">
            Subject
            <select value={selectedSubjectId} onChange={(event) => setSubjectId(event.target.value)} required>
              {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.code} · {subject.name}</option>)}
            </select>
          </label>
          <label className="form-field">
            Notes title
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} required />
          </label>
          <label className="form-field">
            Description (optional)
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={5000} rows={3} />
          </label>
          <label className="form-field">
            PDF file (up to 10 MB)
            <input type="file" accept="application/pdf,.pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} required />
          </label>
          {formError ? <p className="form-error" role="alert">{formError}</p> : null}
          {message ? <p className="form-success" role="status">{message}</p> : null}
          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? 'Uploading…' : 'Upload notes'}
          </button>
        </>
      )}
    </form>
  )
}

export default FacultyResourceUploader
