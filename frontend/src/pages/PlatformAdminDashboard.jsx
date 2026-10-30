import { useState } from 'react'
import { api } from '../services/api'

const empty = { universityName: '', city: '', collegeName: '', departmentName: '', adminName: '', adminEmail: '', adminPassword: '' }

export default function PlatformAdminDashboard() {
  const [form, setForm] = useState(empty)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState(null)
  function update(event) { setForm((current) => ({ ...current, [event.target.name]: event.target.value })) }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(''); setCreated(null)
    try {
      const result = await api.createInstitution(form)
      setCreated(result); setForm(empty)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return <div className="admin-page">
    <header className="page-heading"><div><h1>Platform administration</h1><p>Onboard a university and its first institution administrator.</p></div><span className="day-badge">Platform administrator</span></header>
    {error && <p className="form-error" role="alert">{error}</p>}
    {created && <section className="section-box"><h2>Institution created</h2><p>{created.universityName} · {created.collegeName} · {created.departmentName}</p><p>Admin login: <strong>{created.adminEmail}</strong>. They can now sign in and configure programs, class sections, subjects, and the verification roster.</p></section>}
    <form className="admin-forms" onSubmit={submit}>
      <section className="form-card"><h2>University</h2><label className="form-field">Name<input name="universityName" value={form.universityName} onChange={update} required maxLength={200} /></label><label className="form-field">City<input name="city" value={form.city} onChange={update} maxLength={100} /></label></section>
      <section className="form-card"><h2>First college and department</h2><label className="form-field">College name<input name="collegeName" value={form.collegeName} onChange={update} required maxLength={200} /></label><label className="form-field">Department name<input name="departmentName" value={form.departmentName} onChange={update} required maxLength={200} /></label></section>
      <section className="form-card"><h2>First institution administrator</h2><label className="form-field">Full name<input name="adminName" value={form.adminName} onChange={update} required maxLength={150} /></label><label className="form-field">Email<input type="email" name="adminEmail" value={form.adminEmail} onChange={update} required maxLength={255} /></label><label className="form-field">Password<input type="password" name="adminPassword" value={form.adminPassword} onChange={update} minLength={8} required /><span className="form-help">At least 8 characters, including a letter and a number. Share it with the administrator through a secure channel.</span></label></section>
      <div className="admin-publisher-wide"><button className="primary-button" disabled={busy}>{busy ? 'Creating…' : 'Create university and admin'}</button></div>
    </form>
  </div>
}
