import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import Sidebar from './components/Sidebar'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Dashboard from './pages/Dashboard'
import Timetable from './pages/Timetable'
import Assignments from './pages/Assignments'
import Attendance from './pages/Attendance'
import Announcements from './pages/Announcements'
import Events from './pages/Events'
import Resources from './pages/Resources'
import Career from './pages/Career'
import Profile from './pages/Profile'
import FacultyDashboard from './pages/FacultyDashboard'
import MarkAttendance from './pages/MarkAttendance'
import ManageAssignments from './pages/ManageAssignments'
import AdminDashboard from './pages/AdminDashboard'
import PlatformAdminDashboard from './pages/PlatformAdminDashboard'
import AcademicCalendar from './pages/AcademicCalendar'

function App() {
  const { user, loading, logout } = useAuth()

  // Checking a saved login with the server
  if (loading) return <p className="auth-loading">Loading...</p>

  // Not logged in: only the login and signup pages exist
  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  const isStudent = user.role === 'student'
  const isFaculty = user.role === 'faculty'
  const isAdmin = user.role === 'admin'
  const isPlatformAdmin = user.role === 'platform_admin'

  // Unknown roles stop here instead of falling through to a student dashboard.
  if (!isStudent && !isFaculty && !isAdmin && !isPlatformAdmin) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>No pages for this account yet</h1>
          <p className="auth-subtitle">Your account role ({user.role}) does not have a dashboard yet.</p>
          <button type="button" className="primary-button" onClick={logout}>
            Log out
          </button>
        </div>
      </div>
    )
  }

  // Role-specific pages are rendered only for the matching account type.
  return (
    <div className="app-shell">
      <Sidebar />

      <main className="app-main">
        <Routes>
          <Route path="/" element={isPlatformAdmin ? <PlatformAdminDashboard /> : isAdmin ? <Navigate to="/admin/overview" replace /> : isFaculty ? <FacultyDashboard /> : <Dashboard />} />
          {isAdmin && <Route path="/admin/*" element={<AdminDashboard />} />}

          {isStudent && <Route path="/timetable" element={<Timetable />} />}
          {isStudent && <Route path="/assignments" element={<Assignments />} />}
          {isStudent && <Route path="/attendance" element={<Attendance />} />}
          {isStudent && <Route path="/career" element={<Career />} />}

          {isFaculty && <Route path="/assignments" element={<ManageAssignments />} />}
          {isFaculty && <Route path="/attendance" element={<MarkAttendance />} />}

          <Route path="/announcements" element={<Announcements />} />
          {!isPlatformAdmin && <Route path="/calendar" element={<AcademicCalendar />} />}
          <Route path="/events" element={<Events />} />
          <Route path="/resources" element={<Resources />} />
          <Route path="/profile" element={<Profile />} />

          {/* Any unknown address (including /login when already logged in) goes to the dashboard */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
