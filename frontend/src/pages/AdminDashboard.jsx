import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import PageStatus from '../components/PageStatus'
import AdminContentPublisher from '../components/AdminContentPublisher'
import { api } from '../services/api'
import { useFetch } from '../hooks/useFetch'

async function loadAdminWorkspace() {
  const [overview, pendingUsers] = await Promise.all([
    api.getAdminOverview(),
    api.getPendingAdminUsers(),
  ])
  const roster = await api.getAffiliationRoster()
  return { ...overview, pendingUsers, roster }
}

function AdminDashboard() {
  const { data, setData, loading, error } = useFetch(loadAdminWorkspace)
  const location = useLocation()
  const requestedPage = location.pathname.split('/').filter(Boolean).at(-1)
  const allowedPages = ['overview', 'structure', 'academics', 'access', 'content']
  const adminPage = allowedPages.includes(requestedPage) ? requestedPage : 'overview'
  useEffect(() => {
    if (loading) return
    if (location.hash) {
      document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' })
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [location.pathname, location.hash, loading])
  const [collegeName, setCollegeName] = useState('')
  const [department, setDepartment] = useState({ name: '', collegeId: '' })
  const [program, setProgram] = useState({ name: '', departmentId: '' })
  const [section, setSection] = useState({ programId: '', year: '1', semester: '1', sectionName: 'A' })
  const [offering, setOffering] = useState({ subjectId: '', classSectionId: '' })
  const [rosterEntry, setRosterEntry] = useState({ role: 'student', departmentId: '', institutionalId: '', email: '', programId: '', year: '1', semester: '1', sectionName: 'A', designation: '' })
  const [subject, setSubject] = useState({ departmentId: '', code: '', name: '', semester: '1', facultyId: '' })
  const [schedule, setSchedule] = useState({ subjectId: '', day: 'Mon', startTime: '09:00', endTime: '10:00', room: '', classType: 'Lecture' })
  const [calendarItem, setCalendarItem] = useState({ title: '', category: 'Term dates', startsOn: '', endsOn: '', description: '', audience: 'everyone', eligibleProgramId: '' })
  const [editingCalendarId, setEditingCalendarId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const [issuedInvite, setIssuedInvite] = useState(null)

  async function refresh() {
    setData(await loadAdminWorkspace())
  }

  async function addDepartment(event) {
    event.preventDefault()
    setBusy(true)
    setActionError('')
    setNotice('')
    try {
      await api.createDepartment({ name: department.name, collegeId: Number(department.collegeId) })
      setDepartment({ name: '', collegeId: '' })
      await refresh()
      setNotice('Department created.')
    } catch (err) {
      setActionError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function addProgram(event) {
    event.preventDefault(); setBusy(true); setActionError(''); setNotice('')
    try {
      await api.createProgram({ name: program.name, departmentId: Number(program.departmentId) })
      setProgram({ name: '', departmentId: '' }); await refresh(); setNotice('Program created.')
    } catch (err) { setActionError(err.message) } finally { setBusy(false) }
  }

  async function addSection(event) {
    event.preventDefault(); setBusy(true); setActionError(''); setNotice('')
    try {
      await api.createClassSection({ ...section, programId: Number(section.programId), year: Number(section.year), semester: Number(section.semester) })
      setSection({ ...section, programId: '', sectionName: 'A' }); await refresh(); setNotice('Class section created.')
    } catch (err) { setActionError(err.message) } finally { setBusy(false) }
  }

  async function addOffering(event) {
    event.preventDefault(); setBusy(true); setActionError(''); setNotice('')
    try {
      await api.createSubjectOffering({ subjectId: Number(offering.subjectId), classSectionId: Number(offering.classSectionId) })
      setOffering({ subjectId: '', classSectionId: '' }); await refresh(); setNotice('Subject offered to the class section and enrolled students updated.')
    } catch (err) { setActionError(err.message) } finally { setBusy(false) }
  }

  async function addRosterEntry(event) {
    event.preventDefault(); setBusy(true); setActionError(''); setNotice('')
    try {
      const payload = { ...rosterEntry, departmentId: Number(rosterEntry.departmentId) }
      if (payload.role === 'student') Object.assign(payload, { programId: Number(payload.programId), year: Number(payload.year), semester: Number(payload.semester) })
      const result = await api.addAffiliationRosterEntry(payload)
      setIssuedInvite({ email: result.email, code: result.inviteCode })
      setRosterEntry({ ...rosterEntry, institutionalId: '', email: '' }); await refresh(); setNotice('Identity added. Copy the single-use invite code and give it to that person securely.')
    } catch (err) { setActionError(err.message) } finally { setBusy(false) }
  }

  async function renewInvite(id) {
    setActionError(''); setNotice('')
    try {
      const result = await api.renewAffiliationInvite(id)
      setIssuedInvite({ email: result.email, code: result.inviteCode })
      setNotice('A replacement single-use code is ready. The previous code no longer works.')
    } catch (err) { setActionError(err.message) }
  }

  async function addCollege(event) {
    event.preventDefault()
    setBusy(true)
    setActionError('')
    setNotice('')
    try {
      await api.createCollege({ name: collegeName })
      setCollegeName('')
      await refresh()
      setNotice('College created.')
    } catch (err) {
      setActionError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function addSubject(event) {
    event.preventDefault()
    setBusy(true)
    setActionError('')
    setNotice('')
    try {
      await api.createSubject({
        ...subject,
        departmentId: Number(subject.departmentId),
        semester: Number(subject.semester),
        facultyId: subject.facultyId ? Number(subject.facultyId) : null,
      })
      setSubject({ departmentId: '', code: '', name: '', semester: '1', facultyId: '' })
      await refresh()
      setNotice('Subject created and matching current students enrolled.')
    } catch (err) {
      setActionError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function addSchedule(event) {
    event.preventDefault()
    setBusy(true)
    setActionError('')
    setNotice('')
    try {
      await api.createSchedule({ ...schedule, subjectId: Number(schedule.subjectId) })
      setSchedule({ ...schedule, subjectId: '', room: '' })
      await refresh()
      setNotice('Class added to the weekly timetable.')
    } catch (err) {
      setActionError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function removeSchedule(id) {
    if (!window.confirm('Remove this class from the weekly timetable?')) return
    setActionError('')
    setNotice('')
    try {
      await api.deleteSchedule(id)
      await refresh()
      setNotice('Class removed from the timetable.')
    } catch (err) {
      setActionError(err.message)
    }
  }

  async function addCalendarItem(event) {
    event.preventDefault()
    setBusy(true); setActionError(''); setNotice('')
    try {
      const details = {
        ...calendarItem,
        endsOn: calendarItem.endsOn || null,
        eligibleProgramId: calendarItem.eligibleProgramId || null,
      }
      if (editingCalendarId) await api.updateCalendarItem(editingCalendarId, details)
      else await api.createCalendarItem(details)
      setCalendarItem({ title: '', category: 'Term dates', startsOn: '', endsOn: '', description: '', audience: 'everyone', eligibleProgramId: '' })
      setEditingCalendarId(null)
      await refresh()
      setNotice(editingCalendarId ? 'Academic calendar item updated.' : 'Academic calendar item added.')
    } catch (err) { setActionError(err.message) } finally { setBusy(false) }
  }

  function beginCalendarEdit(item) {
    setEditingCalendarId(item.id)
    setCalendarItem({
      title: item.title,
      category: item.category,
      startsOn: item.startsOn,
      endsOn: item.endsOn || '',
      description: item.description || '',
      audience: item.audience,
      eligibleProgramId: item.eligibleProgramId ? String(item.eligibleProgramId) : '',
    })
    setActionError('')
    setNotice('')
    document.getElementById('academic-calendar-form')?.scrollIntoView({ behavior: 'smooth' })
  }

  function cancelCalendarEdit() {
    setEditingCalendarId(null)
    setCalendarItem({ title: '', category: 'Term dates', startsOn: '', endsOn: '', description: '', audience: 'everyone', eligibleProgramId: '' })
  }

  async function removeCalendarItem(id) {
    if (!window.confirm('Remove this academic calendar item?')) return
    setActionError(''); setNotice('')
    try {
      await api.deleteCalendarItem(id)
      if (editingCalendarId === id) cancelCalendarEdit()
      await refresh()
      setNotice('Academic calendar item removed.')
    } catch (err) { setActionError(err.message) }
  }

  async function changeFaculty(subjectId, value) {
    setActionError('')
    setNotice('')
    try {
      const facultyId = value ? Number(value) : null
      await api.assignSubjectFaculty(subjectId, facultyId)
      await refresh()
      setNotice('Faculty assignment updated.')
    } catch (err) {
      setActionError(err.message)
    }
  }

  async function reviewUser(userId, decision) {
    setBusy(true)
    setActionError('')
    setNotice('')
    try {
      if (decision === 'approve') await api.approveAdminUser(userId)
      else await api.rejectAdminUser(userId)
      await refresh()
      setNotice(`Account ${decision === 'approve' ? 'approved' : 'rejected'}.`)
    } catch (err) {
      setActionError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function changeVisibility(kind, itemId, visibility) {
    setActionError('')
    setNotice('')
    try {
      if (kind === 'event') await api.updateEventSharing(itemId, visibility)
      if (kind === 'resource') await api.updateResourceSharing(itemId, visibility)
      if (kind === 'opportunity') await api.updateOpportunitySharing(itemId, visibility)
      await refresh()
      setNotice('Sharing setting updated.')
    } catch (err) {
      setActionError(err.message)
      try { await refresh() } catch { /* keep the original action error visible */ }
    }
  }

  if (loading || error) return <main className="admin-page"><PageStatus loading={loading} error={error} /></main>

  const qualityChecks = [
    {
      label: 'Subjects without faculty',
      count: data.subjects.filter((item) => !item.facultyId).length,
      target: '/admin/structure#faculty-assignment',
      action: 'Assign faculty',
    },
    {
      label: 'Programs without sections',
      count: data.programs.filter((programItem) => !data.sections.some((sectionItem) => sectionItem.programId === programItem.id)).length,
      target: '/admin/academics#academic-settings',
      action: 'Create class sections',
    },
    {
      label: 'Sections without subjects',
      count: data.sections.filter((sectionItem) => !data.offerings.some((offeringItem) => offeringItem.classSectionId === sectionItem.id)).length,
      target: '/admin/academics#academic-offerings',
      action: 'Offer subjects',
    },
    {
      label: 'Signups waiting for approval',
      count: data.pendingUsers.length,
      target: '/admin/access#account-approvals',
      action: 'Review accounts',
    },
  ]

  return (
    <div className="admin-page">
      <header className="page-heading">
        <div>
          <h1>{adminPage === 'overview' ? 'Administration' : ({ structure: 'Institution structure', academics: 'Academic setup', access: 'Accounts and access', content: 'Content and sharing' }[adminPage])}</h1>
          <p>{adminPage === 'overview' ? `Manage academic structure and access for ${data.university?.name || 'your institution'}.` : `Manage ${adminPage === 'access' ? 'institution identities, approvals, and verification' : adminPage === 'content' ? 'campus publishing and visibility' : adminPage === 'academics' ? 'programs, classes, timetables, and academic dates' : 'colleges, departments, subjects, and faculty'} for ${data.university?.name || 'your institution'}.`}</p>
          {adminPage === 'overview' && <p className="form-help">University creation is handled by a platform administrator. This workspace manages colleges and the university’s academic setup.</p>}
        </div>
        <span className="day-badge">Institution administrator</span>
      </header>

      {adminPage === 'overview' && <section className="admin-overview-cards" aria-label="Administration overview">
        <Link className="card admin-overview-card" to="/admin/structure"><span>Colleges</span><strong>{data.colleges.length}</strong><small>Manage institution structure →</small></Link>
        <Link className="card admin-overview-card" to="/admin/academics"><span>Programs and sections</span><strong>{data.programs.length} · {data.sections.length}</strong><small>Set up academic groups →</small></Link>
        <Link className="card admin-overview-card" to="/admin/structure#faculty-assignment"><span>Subjects with faculty</span><strong>{data.subjects.filter((item) => item.facultyId).length} / {data.subjects.length}</strong><small>Manage teaching assignments →</small></Link>
        <Link className="card admin-overview-card" to="/admin/access"><span>Accounts awaiting review</span><strong>{data.pendingUsers.length}</strong><small>Review signups →</small></Link>
      </section>}

      <nav className="admin-task-nav" aria-label="Administration pages">
        <Link className={adminPage === 'overview' ? 'active' : ''} to="/admin/overview">Overview</Link>
        <Link className={adminPage === 'structure' ? 'active' : ''} to="/admin/structure">Institution structure</Link>
        <Link className={adminPage === 'academics' ? 'active' : ''} to="/admin/academics">Academic setup</Link>
        <Link className={adminPage === 'access' ? 'active' : ''} to="/admin/access">Accounts and access</Link>
        <Link className={adminPage === 'content' ? 'active' : ''} to="/admin/content">Content and sharing</Link>
      </nav>

      {adminPage === 'overview' && <section className="section-box admin-quality-panel" aria-label="Institution data quality checks">
        <div className="page-heading"><div><h2>Setup and data quality</h2><p>Review common gaps that can prevent classes and accounts from working as expected.</p></div></div>
        <div className="admin-quality-grid">
          {qualityChecks.map((check) => (
            <Link className={`admin-quality-card ${check.count ? 'needs-attention' : 'clear'}`} to={check.target} key={check.label}>
              <span>{check.label}</span>
              <strong>{check.count}</strong>
              <small>{check.count ? check.action : 'No action needed'} →</small>
            </Link>
          ))}
        </div>
      </section>}

      {actionError && <p className="form-error" role="alert">{actionError}</p>}
      {notice && <p className="form-success" role="status">{notice}</p>}
      {issuedInvite && <section className="section-box" role="status"><h2>One-time signup code for {issuedInvite.email}</h2><p>This code is shown only now. Share it through a secure channel.</p><p><code>{issuedInvite.code}</code></p><button type="button" className="profile-cancel-button" onClick={() => navigator.clipboard?.writeText(issuedInvite.code)}>Copy code</button><button type="button" className="profile-cancel-button" onClick={() => setIssuedInvite(null)}>Dismiss</button></section>}

      {adminPage === 'structure' && <section className="admin-forms" id="institution-structure" aria-label="Create colleges, departments, and subjects">
        <form className="form-card" onSubmit={addCollege}>
          <div>
            <h2>Add a college</h2>
            <p className="form-help">The college will belong to {data.university?.name || 'your institution'}.</p>
          </div>
          <label className="form-field">
            College name
            <input value={collegeName} onChange={(e) => setCollegeName(e.target.value)} minLength={2} maxLength={200} required />
          </label>
          <button className="primary-button" disabled={busy}>{busy ? 'Saving...' : 'Create college'}</button>
        </form>

        <form className="form-card" onSubmit={addDepartment}>
          <div>
            <h2>Add a department</h2>
            <p className="form-help">Departments belong to a college in your institution.</p>
          </div>
          <label className="form-field">
            College
            <select value={department.collegeId} onChange={(e) => setDepartment({ ...department, collegeId: e.target.value })} required>
              <option value="">Choose a college</option>
              {data.colleges.map((college) => <option key={college.id} value={college.id}>{college.name}</option>)}
            </select>
          </label>
          <label className="form-field">
            Department name
            <input value={department.name} onChange={(e) => setDepartment({ ...department, name: e.target.value })} minLength={2} maxLength={200} required />
          </label>
          <button className="primary-button" disabled={busy || !data.colleges.length}>
            {busy ? 'Saving...' : 'Create department'}
          </button>
        </form>

        <form className="form-card" id="subjects" onSubmit={addSubject}>
          <div>
            <h2>Add a subject</h2>
          <p className="form-help">Subjects are linked to class sections through subject offerings below.</p>
          </div>
          <label className="form-field">
            Department
            <select value={subject.departmentId} onChange={(e) => setSubject({ ...subject, departmentId: e.target.value, facultyId: '' })} required>
              <option value="">Choose a department</option>
              {data.departments.map((item) => <option key={item.id} value={item.id}>{item.collegeName} · {item.name}</option>)}
            </select>
          </label>
          <div className="form-row">
            <label className="form-field">
              Subject code
              <input value={subject.code} onChange={(e) => setSubject({ ...subject, code: e.target.value })} maxLength={20} required />
            </label>
            <label className="form-field">
              Semester
              <select value={subject.semester} onChange={(e) => setSubject({ ...subject, semester: e.target.value })}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          </div>
          <label className="form-field">
            Subject name
            <input value={subject.name} onChange={(e) => setSubject({ ...subject, name: e.target.value })} maxLength={150} required />
          </label>
          <label className="form-field">
            Assign faculty (optional)
            <select value={subject.facultyId} onChange={(e) => setSubject({ ...subject, facultyId: e.target.value })}>
              <option value="">Unassigned</option>
              {data.faculty.filter((person) => String(person.departmentId) === subject.departmentId)
                .map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
          </label>
          <button className="primary-button" disabled={busy || !data.departments.length}>
            {busy ? 'Saving...' : 'Create subject'}
          </button>
        </form>

        <form className="form-card" onSubmit={addSchedule}>
          <div>
            <h2>Schedule a class</h2>
            <p className="form-help">Recurring weekly time; overlapping subject or room bookings are blocked.</p>
          </div>
          <label className="form-field">
            Subject
            <select value={schedule.subjectId} onChange={(e) => setSchedule({ ...schedule, subjectId: e.target.value })} required>
              <option value="">Choose a subject</option>
              {data.subjects.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}
            </select>
          </label>
          <div className="form-row">
            <label className="form-field">Day<select value={schedule.day} onChange={(e) => setSchedule({ ...schedule, day: e.target.value })}>{['Mon','Tue','Wed','Thu','Fri','Sat'].map((day) => <option key={day}>{day}</option>)}</select></label>
            <label className="form-field">Class type<select value={schedule.classType} onChange={(e) => setSchedule({ ...schedule, classType: e.target.value })}>{['Lecture','Practical','Tutorial'].map((type) => <option key={type}>{type}</option>)}</select></label>
          </div>
          <div className="form-row">
            <label className="form-field">Starts<input type="time" value={schedule.startTime} onChange={(e) => setSchedule({ ...schedule, startTime: e.target.value })} required /></label>
            <label className="form-field">Ends<input type="time" value={schedule.endTime} onChange={(e) => setSchedule({ ...schedule, endTime: e.target.value })} required /></label>
          </div>
          <label className="form-field">Room<input value={schedule.room} onChange={(e) => setSchedule({ ...schedule, room: e.target.value })} maxLength={50} /></label>
          <button className="primary-button" disabled={busy || !data.subjects.length}>{busy ? 'Saving...' : 'Add class'}</button>
        </form>
      </section>}

      {adminPage === 'academics' && <section className="admin-forms" id="academic-settings" aria-label="Programs, sections, and course offerings">
        <form className="form-card" id="academic-settings-programs" onSubmit={addProgram}>
          <div><h2>Add a program</h2><p className="form-help">Programs are part of a department.</p></div>
          <label className="form-field">Department<select value={program.departmentId} onChange={(e) => setProgram({ ...program, departmentId: e.target.value })} required><option value="">Choose department</option>{data.departments.map((d) => <option key={d.id} value={d.id}>{d.collegeName} · {d.name}</option>)}</select></label>
          <label className="form-field">Program name<input value={program.name} onChange={(e) => setProgram({ ...program, name: e.target.value })} maxLength={100} placeholder="B.Tech Computer Science" required /></label>
          <button className="primary-button" disabled={busy || !data.departments.length}>Create program</button>
        </form>

        <form className="form-card" onSubmit={addSection}>
          <div><h2>Add a class section</h2><p className="form-help">Define the cohort that receives subject offerings.</p></div>
          <label className="form-field">Program<select value={section.programId} onChange={(e) => setSection({ ...section, programId: e.target.value })} required><option value="">Choose program</option>{data.programs.map((p) => <option key={p.id} value={p.id}>{p.department} · {p.name}</option>)}</select></label>
          <div className="form-row"><label className="form-field">Year<select value={section.year} onChange={(e) => setSection({ ...section, year: e.target.value })}>{[1,2,3,4,5,6].map((n) => <option key={n}>{n}</option>)}</select></label><label className="form-field">Semester<select value={section.semester} onChange={(e) => setSection({ ...section, semester: e.target.value })}>{Array.from({ length: 12 }, (_, i) => <option key={i + 1}>{i + 1}</option>)}</select></label></div>
          <label className="form-field">Section<input value={section.sectionName} onChange={(e) => setSection({ ...section, sectionName: e.target.value.toUpperCase() })} maxLength={30} required /></label>
          <button className="primary-button" disabled={busy || !data.programs.length}>Create section</button>
        </form>

        <form className="form-card" onSubmit={addOffering}>
          <div><h2>Offer a subject</h2><p className="form-help">Only enrolled students in this section see its course work.</p></div>
          <label className="form-field">Subject<select value={offering.subjectId} onChange={(e) => setOffering({ ...offering, subjectId: e.target.value })} required><option value="">Choose subject</option>{data.subjects.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}</select></label>
          <label className="form-field">Class section<select value={offering.classSectionId} onChange={(e) => setOffering({ ...offering, classSectionId: e.target.value })} required><option value="">Choose class</option>{data.sections.map((s) => <option key={s.id} value={s.id}>{s.program} · Year {s.year}, sem {s.semester}, section {s.sectionName}</option>)}</select></label>
          <button className="primary-button" disabled={busy || !data.subjects.length || !data.sections.length}>Create offering</button>
        </form>

      </section>}

      {adminPage === 'access' && <section className="admin-forms" aria-label="Add a verified identity">
        <form className="form-card" id="add-verified-identity" onSubmit={addRosterEntry}>
          <div><h2>Verify an institutional identity</h2><p className="form-help">The person must sign up with this exact email and institution ID.</p></div>
          <label className="form-field">Role<select value={rosterEntry.role} onChange={(e) => setRosterEntry({ ...rosterEntry, role: e.target.value })}><option value="student">Student</option><option value="faculty">Faculty</option></select></label>
          <label className="form-field">Department<select value={rosterEntry.departmentId} onChange={(e) => setRosterEntry({ ...rosterEntry, departmentId: e.target.value, programId: '' })} required><option value="">Choose department</option>{data.departments.map((d) => <option key={d.id} value={d.id}>{d.collegeName} · {d.name}</option>)}</select></label>
          <label className="form-field">Institution ID<input value={rosterEntry.institutionalId} onChange={(e) => setRosterEntry({ ...rosterEntry, institutionalId: e.target.value })} required /></label>
          <label className="form-field">Institution email<input type="email" value={rosterEntry.email} onChange={(e) => setRosterEntry({ ...rosterEntry, email: e.target.value })} required /></label>
          {rosterEntry.role === 'student' ? <>
            <label className="form-field">Program<select value={rosterEntry.programId} onChange={(e) => setRosterEntry({ ...rosterEntry, programId: e.target.value })} required><option value="">Choose program</option>{data.programs.filter((p) => String(p.departmentId) === rosterEntry.departmentId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <div className="form-row"><label className="form-field">Year<input type="number" min="1" max="6" value={rosterEntry.year} onChange={(e) => setRosterEntry({ ...rosterEntry, year: e.target.value })} required /></label><label className="form-field">Semester<input type="number" min="1" max="12" value={rosterEntry.semester} onChange={(e) => setRosterEntry({ ...rosterEntry, semester: e.target.value })} required /></label></div>
            <label className="form-field">Section<select value={rosterEntry.sectionName} onChange={(e) => setRosterEntry({ ...rosterEntry, sectionName: e.target.value })} required><option value="A">A</option>{[...new Set(data.sections.filter((s) => String(s.programId) === rosterEntry.programId && String(s.year) === rosterEntry.year && String(s.semester) === rosterEntry.semester).map((s) => s.sectionName))].filter((s) => s !== 'A').map((s) => <option key={s}>{s}</option>)}</select></label>
          </> : <label className="form-field">Designation<input value={rosterEntry.designation} onChange={(e) => setRosterEntry({ ...rosterEntry, designation: e.target.value })} placeholder="Assistant Professor" /></label>}
          <button className="primary-button" disabled={busy || !data.departments.length}>Add verified identity</button>
        </form>
      </section>}

      {adminPage === 'access' && <section className="section-box" id="verified-identities">
        <div className="page-heading"><div><h2>Affiliation roster</h2><p>Identity records are single-use and checked before signup approval.</p></div><span className="announcements-count">{data.roster.length} identities</span></div>
        {data.roster.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Institution ID</th><th>Email</th><th>Role</th><th>Academic placement</th><th>Status</th><th></th></tr></thead><tbody>{data.roster.map((item) => <tr key={item.id}><td>{item.institutionalId}</td><td>{item.email}</td><td>{item.role}</td><td>{item.department}{item.role === 'student' && <span>{item.program} · Year {item.year}, semester {item.semester}, section {item.sectionName}</span>}</td><td>{item.claimed ? 'Claimed' : 'Available'}</td><td>{!item.claimed && <button type="button" className="profile-cancel-button" onClick={() => renewInvite(item.id)}>Generate replacement code</button>}</td></tr>)}</tbody></table></div> : <p className="empty-state">Add an identity above to enable verified signup.</p>}
      </section>}

      {adminPage === 'academics' && <section className="section-box" id="academic-offerings">
        <div className="page-heading"><div><h2>Subject offerings</h2><p>Each offering links a department subject to one program, year, semester, and section.</p></div><span className="announcements-count">{data.offerings.length} offerings</span></div>
        {data.offerings.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Subject</th><th>Class</th></tr></thead><tbody>{data.offerings.map((item) => <tr key={item.id}><td><strong>{item.code}</strong><span>{item.subject}</span></td><td>{item.program} · Year {item.year}, semester {item.semester}, section {item.sectionName}</td></tr>)}</tbody></table></div> : <p className="empty-state">No subjects have been offered to class sections.</p>}
      </section>}

      {adminPage === 'access' && <section className="section-box" id="account-approvals">
        <div className="page-heading">
          <div><h2>Signup approvals</h2><p>Review student and faculty affiliation requests for your institution.</p></div>
          <span className="announcements-count">{data.pendingUsers.length} awaiting review</span>
        </div>
        {data.pendingUsers.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Applicant</th><th>Role</th><th>Affiliation</th><th>Actions</th></tr></thead>
              <tbody>{data.pendingUsers.map((person) => (
                <tr key={person.id}>
                  <td><strong>{person.name}</strong><span>{person.email}</span></td>
                  <td>{person.role}</td>
                  <td>
                    {person.college} · {person.department}
                    {person.role === 'student' && <span>{person.rollNumber} · {person.program} · Year {person.year}, semester {person.semester}</span>}
                    {person.role === 'faculty' && person.designation && <span>{person.designation}</span>}
                  </td>
                  <td className="admin-review-actions">
                    <button className="primary-button" disabled={busy} onClick={() => reviewUser(person.id, 'approve')}>Approve</button>
                    <button className="danger-button" disabled={busy} onClick={() => reviewUser(person.id, 'reject')}>Reject</button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="empty-state">No pending account requests.</p>}
      </section>}

      {adminPage === 'content' && <div id="institution-access"><AdminContentPublisher programs={data.programs} onPublished={refresh} /></div>}

      {adminPage === 'academics' && <section className="section-box" id="weekly-timetable">
        <div className="page-heading">
          <div><h2>Weekly timetable</h2><p>Class schedule changes update student and faculty timetables.</p></div>
          <span className="announcements-count">{data.timetable.length} classes</span>
        </div>
        {data.timetable.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Day</th><th>Time</th><th>Subject</th><th>Room</th><th>Type</th><th></th></tr></thead>
              <tbody>{data.timetable.map((item) => (
                <tr key={item.id}>
                  <td>{item.day}</td><td>{item.startTime}–{item.endTime}</td>
                  <td><strong>{item.code}</strong><span>{item.subject}</span></td>
                  <td>{item.room || '—'}</td><td>{item.classType}</td>
                  <td><button type="button" className="danger-button" onClick={() => removeSchedule(item.id)}>Remove</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="empty-state">No classes scheduled yet.</p>}
      </section>}

      {adminPage === 'academics' && <section className="section-box" id="academic-calendar">
        <div className="page-heading">
          <div><h2>Academic calendar</h2><p>Publish term dates, examinations, registration periods, and holidays to your campus.</p></div>
          <span className="announcements-count">{data.calendarItems.length} items</span>
        </div>
        <form className="admin-publisher-form" id="academic-calendar-form" onSubmit={addCalendarItem}>
          <label className="form-field admin-publisher-wide">Title<input value={calendarItem.title} onChange={(e) => setCalendarItem({ ...calendarItem, title: e.target.value })} maxLength={200} required /></label>
          <label className="form-field">Category<select value={calendarItem.category} onChange={(e) => setCalendarItem({ ...calendarItem, category: e.target.value })}>{['Term dates','Examination','Registration','Holiday','Other'].map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="form-field">Starts on<input type="date" value={calendarItem.startsOn} onChange={(e) => setCalendarItem({ ...calendarItem, startsOn: e.target.value })} required /></label>
          <label className="form-field">Ends on (optional)<input type="date" min={calendarItem.startsOn || undefined} value={calendarItem.endsOn} onChange={(e) => setCalendarItem({ ...calendarItem, endsOn: e.target.value })} /></label>
          <label className="form-field">Audience<select value={calendarItem.audience} onChange={(e) => setCalendarItem({ ...calendarItem, audience: e.target.value })}><option value="everyone">Everyone</option><option value="students">Students</option><option value="faculty">Faculty</option></select></label>
          <label className="form-field">Eligible program (optional)<select value={calendarItem.eligibleProgramId} onChange={(e) => setCalendarItem({ ...calendarItem, eligibleProgramId: e.target.value })}><option value="">All programs</option>{data.programs.map((item) => <option key={item.id} value={item.id}>{item.department} · {item.name}</option>)}</select></label>
          <label className="form-field admin-publisher-wide">Details<textarea value={calendarItem.description} onChange={(e) => setCalendarItem({ ...calendarItem, description: e.target.value })} maxLength={5000} rows={3} /></label>
          <div className="admin-publisher-wide calendar-form-actions">
            <button className="primary-button" disabled={busy}>{busy ? 'Saving…' : editingCalendarId ? 'Save date changes' : 'Add calendar item'}</button>
            {editingCalendarId && <button type="button" className="profile-cancel-button" onClick={cancelCalendarEdit} disabled={busy}>Cancel edit</button>}
          </div>
        </form>
        {data.calendarItems.length ? (
          <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Item</th><th>Dates</th><th>Audience</th><th>Actions</th></tr></thead><tbody>{data.calendarItems.map((item) => <tr key={item.id}><td><strong>{item.title}</strong><span>{item.category}</span></td><td>{item.startsOn}{item.endsOn && item.endsOn !== item.startsOn ? ` – ${item.endsOn}` : ''}</td><td>{item.eligibleProgramId ? data.programs.find((programItem) => programItem.id === item.eligibleProgramId)?.name || 'Selected program' : item.audience}</td><td className="admin-review-actions"><button type="button" className="profile-cancel-button" onClick={() => beginCalendarEdit(item)}>Edit</button><button type="button" className="danger-button" onClick={() => removeCalendarItem(item.id)}>Remove</button></td></tr>)}</tbody></table></div>
        ) : <p className="empty-state">No academic dates have been published.</p>}
      </section>}

      {adminPage === 'content' && <section className="section-box" id="institution-content-access">
        <div className="page-heading">
          <div><h2>Published content</h2><p>Change whether an item is visible within your university or across campuses.</p></div>
        </div>
        {[
          { kind: 'event', label: 'Events', rows: data.events, name: (item) => `${item.title} · ${item.startsAt?.replace('T', ' ') || item.category}` },
          { kind: 'resource', label: 'Resources', rows: data.resources, name: (item) => `${item.title} · ${item.subject}` },
          { kind: 'opportunity', label: 'Opportunities', rows: data.opportunities, name: (item) => `${item.title} · ${item.company}` },
        ].map((group) => (
          <div className="admin-content-group" key={group.kind}>
            <h3>{group.label}</h3>
            {group.rows.length ? group.rows.map((item) => (
              <div className="admin-content-row" key={item.id}>
                <span>{group.name(item)}</span>
                <label className="admin-visibility-control">
                  <span className="sr-only">Sharing for {item.title}</span>
                  <select value={item.visibility} onChange={(event) => changeVisibility(group.kind, item.id, event.target.value)}>
                    <option value="university">My university</option>
                    <option value="cross_campus">All participating universities</option>
                  </select>
                </label>
              </div>
            )) : <p className="form-help">No {group.label.toLowerCase()} published by your institution yet.</p>}
          </div>
        ))}
      </section>}

      {adminPage === 'structure' && <section className="section-box" id="faculty-assignment">
        <div className="page-heading">
          <div><h2>Subjects and faculty</h2><p>Faculty assignments are limited to the subject’s department.</p></div>
          <span className="announcements-count">{data.subjects.length} subjects</span>
        </div>
        {data.subjects.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Subject</th><th>Department</th><th>Semester</th><th>Faculty</th></tr></thead>
              <tbody>{data.subjects.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.code}</strong><span>{item.name}</span></td>
                  <td>{item.department}</td>
                  <td>{item.semester}</td>
                  <td>
                    <select aria-label={`Faculty for ${item.code}`} value={item.facultyId || ''} onChange={(e) => changeFaculty(item.id, e.target.value)}>
                      <option value="">Unassigned</option>
                      {data.faculty.filter((person) => person.departmentId === item.departmentId)
                        .map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                    </select>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="empty-state">No subjects have been created yet.</p>}
      </section>}
    </div>
  )
}

export default AdminDashboard
