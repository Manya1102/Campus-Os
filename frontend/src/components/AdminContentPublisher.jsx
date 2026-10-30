import { useState } from 'react'
import { api } from '../services/api'

const initial = {
  title: '', category: 'General', message: '', description: '',
  location: '', seats: '', startsAt: '', endsAt: '', visibility: 'university', audience: 'everyone', eligibleProgramId: '',
  subject: '', type: 'Notes', format: 'PDF', author: '', url: '',
  company: '', mode: 'Hybrid', stipend: '', deadline: '', skills: '', applicationUrl: '',
}

function AdminContentPublisher({ programs = [], onPublished }) {
  const [kind, setKind] = useState('announcement')
  const [form, setForm] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  function update(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      if (kind === 'announcement') {
        await api.publishAnnouncement({ title: form.title, message: form.message, category: form.category })
      } else if (kind === 'event') {
        await api.createCampusEvent({ ...form, eligibleProgramId: form.eligibleProgramId || null })
      } else if (kind === 'resource') {
        await api.createResource({ ...form, eligibleProgramId: form.eligibleProgramId || null })
      } else {
        await api.createOpportunity({
          ...form,
          eligibleProgramId: form.eligibleProgramId || null,
          skills: form.skills.split(',').map((skill) => skill.trim()).filter(Boolean),
        })
      }
      setForm(initial)
      setSuccess('Published successfully.')
      await onPublished()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="section-box admin-publisher">
      <div className="page-heading">
        <div><h2>Publish campus content</h2><p>Choose who can discover events, resources and opportunities.</p></div>
      </div>
      <label className="form-field admin-publisher-kind">
        Content type
        <select value={kind} onChange={(event) => {
          const nextKind = event.target.value
          setKind(nextKind)
          setForm((current) => ({
            ...current,
            category: nextKind === 'announcement' ? 'General' : '',
            type: nextKind === 'resource' ? 'Notes' : nextKind === 'opportunity' ? 'Internship' : current.type,
          }))
          setError('')
          setSuccess('')
        }}>
          <option value="announcement">University announcement</option>
          <option value="event">Campus event</option>
          <option value="resource">Learning resource</option>
          <option value="opportunity">Career opportunity</option>
        </select>
      </label>

      <form className="admin-publisher-form" onSubmit={submit}>
        <label className="form-field admin-publisher-wide">
          Title
          <input name="title" value={form.title} onChange={update} maxLength={200} required />
        </label>

        {kind === 'announcement' && <>
          <label className="form-field">
            Category
            <select name="category" value={form.category} onChange={update}>
              {['General', 'Academic', 'Event', 'Department'].map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label className="form-field admin-publisher-wide">
            Announcement
            <textarea name="message" value={form.message} onChange={update} minLength={3} maxLength={5000} rows={4} required />
          </label>
        </>}

        {kind === 'event' && <>
          <label className="form-field">Category<input name="category" value={form.category === 'General' ? '' : form.category} onChange={update} maxLength={50} required /></label>
          <label className="form-field">Location<input name="location" value={form.location} onChange={update} maxLength={150} /></label>
          <label className="form-field">Starts at<input type="datetime-local" name="startsAt" value={form.startsAt} onChange={update} required /></label>
          <label className="form-field">Ends at (optional)<input type="datetime-local" name="endsAt" value={form.endsAt} onChange={update} /></label>
          <label className="form-field">Registration details<input name="seats" value={form.seats} onChange={update} maxLength={100} /></label>
          <label className="form-field admin-publisher-wide">Description<textarea name="description" value={form.description} onChange={update} rows={3} maxLength={5000} /></label>
        </>}

        {kind === 'resource' && <>
          <label className="form-field">Subject<input name="subject" value={form.subject} onChange={update} maxLength={100} required /></label>
          <label className="form-field">Resource type<select name="type" value={form.type} onChange={update}>{['Notes', 'Practice', 'Tutorial'].map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="form-field">Format<input name="format" value={form.format} onChange={update} maxLength={50} required /></label>
          <label className="form-field">Author or department<input name="author" value={form.author} onChange={update} maxLength={150} /></label>
          <label className="form-field admin-publisher-wide">Resource URL<input type="url" name="url" value={form.url} onChange={update} maxLength={500} placeholder="https://…" /></label>
          <label className="form-field admin-publisher-wide">Description<textarea name="description" value={form.description} onChange={update} rows={3} maxLength={5000} /></label>
        </>}

        {kind === 'opportunity' && <>
          <label className="form-field">Company or organizer<input name="company" value={form.company} onChange={update} maxLength={150} required /></label>
          <label className="form-field">Type<select name="type" value={form.type} onChange={update}>{['Internship', 'Training', 'Competition'].map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="form-field">Mode<input name="mode" value={form.mode} onChange={update} maxLength={30} required /></label>
          <label className="form-field">Location<input name="location" value={form.location} onChange={update} maxLength={100} required /></label>
          <label className="form-field">Stipend (optional)<input name="stipend" value={form.stipend} onChange={update} maxLength={100} /></label>
          <label className="form-field">Application deadline<input type="date" name="deadline" value={form.deadline} onChange={update} required /></label>
          <label className="form-field">Category<input name="category" value={form.category === 'General' ? '' : form.category} onChange={update} maxLength={50} required /></label>
          <label className="form-field">Skills (comma separated)<input name="skills" value={form.skills} onChange={update} placeholder="React, JavaScript, CSS" /></label>
          <label className="form-field admin-publisher-wide">Application URL<input type="url" name="applicationUrl" value={form.applicationUrl} onChange={update} maxLength={500} placeholder="https://…" /></label>
          <label className="form-field admin-publisher-wide">Description<textarea name="description" value={form.description} onChange={update} rows={3} maxLength={5000} /></label>
        </>}

        {kind !== 'announcement' && <label className="form-field">
          Visibility
          <select name="visibility" value={form.visibility} onChange={update}>
            <option value="university">My university</option>
            <option value="cross_campus">All participating universities</option>
          </select>
        </label>}

        {kind !== 'announcement' && <>
          <label className="form-field">Audience<select name="audience" value={form.audience} onChange={update}><option value="everyone">Everyone</option><option value="students">Students</option>{kind !== 'opportunity' && <option value="faculty">Faculty</option>}</select></label>
          <label className="form-field">Eligible program (optional)<select name="eligibleProgramId" value={form.eligibleProgramId} onChange={update}><option value="">All programs</option>{programs.map((program) => <option key={program.id} value={program.id}>{program.department} · {program.name}</option>)}</select></label>
        </>}

        {error && <p className="form-error admin-publisher-wide" role="alert">{error}</p>}
        {success && <p className="form-success admin-publisher-wide" role="status">{success}</p>}
        <div className="admin-publisher-wide"><button className="primary-button" disabled={busy}>{busy ? 'Publishing…' : 'Publish'}</button></div>
      </form>
    </section>
  )
}

export default AdminContentPublisher
