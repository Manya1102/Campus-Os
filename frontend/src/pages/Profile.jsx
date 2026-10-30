import { useState } from 'react'
import { api } from '../services/api'
import { useFetch } from '../hooks/useFetch'
import PageStatus from '../components/PageStatus'

// Loads the profile, then shows the form. Splitting it lets the form start with real data.
function Profile() {
  const { data, loading, error } = useFetch(api.getProfile)

  if (loading || error) return <PageStatus loading={loading} error={error} />

  return <ProfileContent initialProfile={data} />
}

function ProfileContent({ initialProfile }) {
  const [profile, setProfile] = useState(initialProfile)
  const [savedProfile, setSavedProfile] = useState(initialProfile)
  const [editing, setEditing] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  function handleChange(event) {
    const { name, value } = event.target
    setProfile((current) => ({ ...current, [name]: value }))
    setSaved(false)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setSaveError('')

    try {
      // Only name and email are editable; the rest comes from your student records.
      const updated = await api.updateProfile({
        name: profile.name,
        email: profile.email,
      })
      setProfile(updated)
      setSavedProfile(updated)
      setEditing(false)
      setSaved(true)
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="profile-page">
      <div className="profile-page-heading">
        <div>
          <h1>My Profile</h1>
          <p>View and manage your student information.</p>
        </div>
      </div>

      <div className="profile-layout">
        <aside className="profile-summary-card">
          <div className="profile-avatar">
            {profile.name.trim().charAt(0).toUpperCase() || 'S'}
          </div>
          <h2>{profile.name || 'Student'}</h2>
          <p className="profile-summary-department">{profile.department}</p>
          <span className="profile-role">Student</span>

          <div className="profile-summary-divider" />

          <div className="profile-summary-detail">
            <span>Student ID</span>
            <strong>{profile.studentId}</strong>
          </div>
          <div className="profile-summary-detail">
            <span>Program</span>
            <strong>{profile.program}</strong>
          </div>
          <div className="profile-summary-detail">
            <span>Academic Year</span>
            <strong>{profile.year}</strong>
          </div>
        </aside>

        <div className="profile-form-card">
          <div className="profile-form-heading">
            <div>
              <h2>Personal Information</h2>
              <p>Keep your student details up to date.</p>
            </div>

            {!editing && (
              <button
                type="button"
                className="profile-edit-button"
                onClick={() => {
                  setEditing(true)
                  setSaved(false)
                  setSaveError('')
                }}
              >
                Edit Profile
              </button>
            )}
          </div>

          {saved && (
            <p className="profile-success" role="status">
              Profile updated.
            </p>
          )}

          {saveError && (
            <p role="alert" style={{ margin: '12px 0', color: '#b91c1c' }}>
              {saveError}
            </p>
          )}

          <form onSubmit={handleSubmit}>
            <div className="profile-fields">
              <label>
                Full Name
                <input
                  name="name"
                  value={profile.name}
                  onChange={handleChange}
                  disabled={!editing}
                  required
                />
              </label>

              <label>
                Student ID
                <input name="studentId" value={profile.studentId} disabled />
              </label>

              <label>
                Email Address
                <input
                  type="email"
                  name="email"
                  value={profile.email}
                  onChange={handleChange}
                  disabled={!editing}
                  required
                />
              </label>

              <label>
                University
                <input name="university" value={profile.university} disabled />
              </label>

              <label>
                College
                <input name="college" value={profile.college} disabled />
              </label>

              <label>
                Department
                <input name="department" value={profile.department} disabled />
              </label>

              <label>
                Program
                <input name="program" value={profile.program} disabled />
              </label>

              <label>
                Academic Year
                <input name="year" value={profile.year} disabled />
              </label>

              <label>
                Semester
                <input name="semester" value={profile.semester} disabled />
              </label>
            </div>

            {editing && (
              <div className="profile-form-actions">
                <button
                  type="button"
                  className="profile-cancel-button"
                  disabled={saving}
                  onClick={() => {
                    setProfile(savedProfile)
                    setSaveError('')
                    setEditing(false)
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="profile-save-button" disabled={saving}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            )}
          </form>
        </div>
      </div>
    </section>
  )
}

export default Profile
