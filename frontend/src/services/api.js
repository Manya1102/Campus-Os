// Central place for all backend calls. Pages import from here instead of using fetch directly.
const LOCAL_API_URL = 'http://localhost:5001/api'
// On Vercel the frontend and API share one origin, so production can use /api.
// VITE_API_URL remains available for local or separate-host deployments.
const BASE_URL = (import.meta.env.VITE_API_URL || (import.meta.env.DEV ? LOCAL_API_URL : '/api')).replace(/\/+$/, '')

function getApiBaseUrl() {
  if (!BASE_URL) {
    throw new Error('The API is not configured for this site. Set VITE_API_URL to the API base URL ending in /api.')
  }
  return BASE_URL
}

// ---- The login token (kept in the browser so you stay logged in after a refresh) ----
const TOKEN_KEY = 'campus-os-token'

// Sent to the app when the server says the login is no longer valid
export const AUTH_EXPIRED_EVENT = 'campus-os:auth-expired'

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // storage can be blocked (private windows); you will just need to log in again after a refresh
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // nothing to clear
  }
}

// Every request goes through here. It adds the login token and turns errors into messages.
// Pass { isPublic: true } for calls that must work without logging in (login, signup).
async function request(path, { method = 'GET', body, isPublic = false, rawBody = false } = {}) {
  const headers = rawBody ? { 'Content-Type': 'application/octet-stream' } : { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token && !isPublic) headers.Authorization = `Bearer ${token}`

  let res
  try {
    res = await fetch(`${getApiBaseUrl()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : rawBody ? body : JSON.stringify(body),
    })
  } catch {
    throw new Error('Cannot reach the server. Make sure the backend is running.')
  }

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    // A 401 on a protected call means the login expired or is invalid: sign the user out.
    if (res.status === 401 && !isPublic) {
      clearToken()
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
    }
    throw new Error(data.error || `Request failed (${res.status})`)
  }
  return data
}

const post = (path, body) => request(path, { method: 'POST', body })
const del = (path) => request(path, { method: 'DELETE' })

export const api = {
  health: () => request('/health', { isPublic: true }),

  // ---- Login and signup ----
  login: (email, password) =>
    request('/auth/login', { method: 'POST', body: { email, password }, isPublic: true }),
  signup: (details) => request('/auth/signup', { method: 'POST', body: details, isPublic: true }),
  me: () => request('/auth/me'),
  getDirectory: () => request('/auth/directory', { isPublic: true }),
  createInstitution: (details) => post('/platform/institutions', details),

  // ---- Student pages ----
  getDashboard: () => request('/dashboard'),
  getTimetable: (day) => request(`/timetable${day ? `?day=${day}` : ''}`),

  getAssignments: () => request('/assignments'),
  // status is 'Pending' or 'Completed'
  updateAssignmentStatus: (id, status) =>
    request(`/assignments/${id}/status`, { method: 'PATCH', body: { status } }),

  getAttendance: () => request('/attendance'),

  getOpportunities: () => request('/career'),
  saveOpportunity: (id) => post(`/career/${id}/save`),
  unsaveOpportunity: (id) => del(`/career/${id}/save`),

  // ---- Pages for everyone ----
  getAnnouncements: () => request('/announcements'),
  getAcademicCalendar: () => request('/calendar'),

  getEvents: () => request('/events'),
  registerEvent: (id) => post(`/events/${id}/register`),
  unregisterEvent: (id) => del(`/events/${id}/register`),

  getResources: () => request('/resources'),
  uploadFacultyNotes: (file, { title, subjectId, description }) => {
    const query = new URLSearchParams({ title, subjectId: String(subjectId), filename: file.name })
    if (description) query.set('description', description)
    return request(`/faculty/resources?${query}`, { method: 'POST', body: file, rawBody: true })
  },
  getResourceFile: async (id) => {
    const token = getToken()
    let response
    try {
      response = await fetch(`${getApiBaseUrl()}/resources/${id}/file`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
    } catch {
      throw new Error('Cannot reach the server. Make sure the backend is running.')
    }
    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      if (response.status === 401) {
        clearToken()
        window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
      }
      throw new Error(data.error || `Request failed (${response.status})`)
    }
    return response.blob()
  },
  addFavourite: (id) => post(`/resources/${id}/favourite`),
  removeFavourite: (id) => del(`/resources/${id}/favourite`),

  getProfile: () => request('/profile'),
  updateProfile: (changes) => request('/profile', { method: 'PATCH', body: changes }),

  // ---- Faculty pages ----
  getFacultyDashboard: () => request('/faculty/dashboard'),
  getFacultySubjects: () => request('/faculty/subjects'),
  getRoster: (subjectId, date) => request(`/faculty/subjects/${subjectId}/roster?date=${date}`),
  saveAttendance: (details) => post('/faculty/attendance', details),
  getFacultyAssignments: () => request('/faculty/assignments'),
  getFacultyAssignmentSubmissions: (id) => request(`/faculty/assignments/${id}/submissions`),
  createFacultyAssignment: (details) => post('/faculty/assignments', details),
  deleteFacultyAssignment: (id) => del(`/faculty/assignments/${id}`),
  postAnnouncement: (details) => post('/announcements', details),

  // ---- Institution administration ----
  getAdminOverview: () => request('/admin/overview'),
  createCalendarItem: (details) => post('/admin/calendar', details),
  updateCalendarItem: (id, details) => request(`/admin/calendar/${id}`, { method: 'PATCH', body: details }),
  deleteCalendarItem: (id) => del(`/admin/calendar/${id}`),
  getPendingAdminUsers: () => request('/admin/pending-users'),
  approveAdminUser: (id) => request(`/admin/users/${id}/approve`, { method: 'PATCH', body: {} }),
  rejectAdminUser: (id) => request(`/admin/users/${id}/reject`, { method: 'PATCH', body: {} }),
  createCollege: (details) => post('/admin/colleges', details),
  createDepartment: (details) => post('/admin/departments', details),
  createProgram: (details) => post('/admin/programs', details),
  createClassSection: (details) => post('/admin/sections', details),
  createSubjectOffering: (details) => post('/admin/offerings', details),
  addAffiliationRosterEntry: (details) => post('/admin/roster', details),
  getAffiliationRoster: () => request('/admin/roster'),
  renewAffiliationInvite: (id) => post(`/admin/roster/${id}/renew-code`, {}),
  createSubject: (details) => post('/admin/subjects', details),
  assignSubjectFaculty: (id, facultyId) =>
    request(`/admin/subjects/${id}/faculty`, { method: 'PATCH', body: { facultyId } }),
  createSchedule: (details) => post('/admin/timetable', details),
  deleteSchedule: (id) => del(`/admin/timetable/${id}`),
  publishAnnouncement: (details) => post('/admin/announcements', details),
  createCampusEvent: (details) => post('/admin/events', details),
  createResource: (details) => post('/admin/resources', details),
  createOpportunity: (details) => post('/admin/opportunities', details),
  updateEventSharing: (id, visibility) =>
    request(`/admin/events/${id}/sharing`, { method: 'PATCH', body: { visibility } }),
  updateResourceSharing: (id, visibility) =>
    request(`/admin/resources/${id}/sharing`, { method: 'PATCH', body: { visibility } }),
  updateOpportunitySharing: (id, visibility) =>
    request(`/admin/opportunities/${id}/sharing`, { method: 'PATCH', body: { visibility } }),
}
