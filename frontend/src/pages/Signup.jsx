import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import { useAuth } from '../hooks/useAuth'
import { useFetch } from '../hooks/useFetch'

function Signup() {
  const { signup } = useAuth()
  const { data: universities, loading, error: loadError } = useFetch(api.getDirectory)

  const [role, setRole] = useState('student')
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    universityId: '',
    collegeId: '',
    departmentId: '',
    institutionalId: '',
    designation: '',
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  function update(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  // Choosing a university clears the college and department below it (and so on)
  function chooseUniversity(event) {
    setForm((current) => ({ ...current, universityId: event.target.value, collegeId: '', departmentId: '' }))
  }

  function chooseCollege(event) {
    setForm((current) => ({ ...current, collegeId: event.target.value, departmentId: '' }))
  }

  if (loading) return <p className="auth-loading">Loading...</p>
  if (loadError) return <p className="auth-loading form-error">Could not load the form: {loadError}</p>

  // Until the user picks something, the first option in each list is selected
  const university = universities.find((u) => String(u.id) === form.universityId) || universities[0]
  const college =
    university && (university.colleges.find((c) => String(c.id) === form.collegeId) || university.colleges[0])
  const department =
    college && (college.departments.find((d) => String(d.id) === form.departmentId) || college.departments[0])

  if (submitted) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-brand"><span aria-hidden="true">🎓</span> Campus OS</div>
          <h1>Request submitted</h1>
        <p className="auth-subtitle">Your account was created. An administrator at your institution must approve it before you can sign in.</p>
          <Link className="primary-button auth-return-link" to="/login">Return to sign in</Link>
        </div>
      </div>
    )
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    if (!department) return setError('Choose your university, college and department')
    if (form.password !== form.confirmPassword) return setError('The two passwords do not match')

    setBusy(true)
    try {
      const result = await signup({
        role,
        name: form.name,
        email: form.email,
        password: form.password,
        universityId: university.id,
        departmentId: department.id,
        ...(role === 'student'
          ? { institutionalId: form.institutionalId }
          : { designation: form.designation }),
      })
      setSubmitted(Boolean(result.pendingApproval))
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <span aria-hidden="true">🎓</span> Campus OS
        </div>
        <h1>Create your account</h1>
        <p className="auth-subtitle">Join your campus in a minute.</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="role-toggle" role="radiogroup" aria-label="I am a">
            {['student', 'faculty'].map((option) => (
              <label key={option} className={`role-option ${role === option ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="role"
                  value={option}
                  checked={role === option}
                  onChange={() => setRole(option)}
                />
                {option === 'student' ? 'Student' : 'Faculty'}
              </label>
            ))}
          </div>

          <label className="form-field">
            Full name
            <input name="name" value={form.name} onChange={update} autoComplete="name" required />
          </label>

          <label className="form-field">
            Email
            <input type="email" name="email" value={form.email} onChange={update} autoComplete="username" required />
          </label>

          <div className="form-row">
            <label className="form-field">
              Password
              <input
                type="password"
                name="password"
                value={form.password}
                onChange={update}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
            <label className="form-field">
              Confirm password
              <input
                type="password"
                name="confirmPassword"
                value={form.confirmPassword}
                onChange={update}
                autoComplete="new-password"
                required
              />
            </label>
          </div>
          <p className="form-help">At least 8 characters, with a letter and a number.</p>

          <label className="form-field">
            University
            <select value={university ? university.id : ''} onChange={chooseUniversity} required>
              {universities.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </label>

          <label className="form-field">
            College
            <select value={college ? college.id : ''} onChange={chooseCollege} required>
              {(university ? university.colleges : []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>

          <label className="form-field">
            Department
            <select name="departmentId" value={department ? department.id : ''} onChange={update} required>
              {(college ? college.departments : []).map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </label>

          {role === 'student' ? (
            <>
              <label className="form-field">University roll number (optional)
                <input name="institutionalId" value={form.institutionalId} onChange={update} />
              </label>
              <p className="form-help">You can create an account without an invite code. Your institution can verify your details during approval.</p>
            </>
          ) : (
            <>
              <label className="form-field">
                Designation (optional)
                <input name="designation" value={form.designation} onChange={update} placeholder="e.g. Assistant Professor" />
              </label>
              <p className="form-help">You can create an account without an invite code. Your institution can verify your details during approval.</p>
            </>
          )}

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="primary-button" disabled={busy}>
            {busy ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p className="auth-switch">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </div>
    </div>
  )
}

export default Signup
