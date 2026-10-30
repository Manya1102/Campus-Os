import { NavLink } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

const studentLinks = [
  { to: '/', label: 'Dashboard', icon: '🏠' },
  { to: '/timetable', label: 'Timetable', icon: '🗓️' },
  { to: '/assignments', label: 'Assignments', icon: '📝' },
  { to: '/attendance', label: 'Attendance', icon: '✅' },
  { to: '/announcements', label: 'Announcements', icon: '📢' },
  { to: '/calendar', label: 'Academic calendar', icon: '📅' },
  { to: '/events', label: 'Events', icon: '🎉' },
  { to: '/resources', label: 'Resources', icon: '📚' },
  { to: '/career', label: 'Career', icon: '💼' },
  { to: '/profile', label: 'Profile', icon: '👤' },
]

const facultyLinks = [
  { to: '/', label: 'Dashboard', icon: '🏠' },
  { to: '/attendance', label: 'Mark Attendance', icon: '✅' },
  { to: '/assignments', label: 'Assignments', icon: '📝' },
  { to: '/announcements', label: 'Announcements', icon: '📢' },
  { to: '/calendar', label: 'Academic calendar', icon: '📅' },
  { to: '/events', label: 'Events', icon: '🎉' },
  { to: '/resources', label: 'Resources', icon: '📚' },
  { to: '/profile', label: 'Profile', icon: '👤' },
]

const adminLinks = [
  { to: '/admin/overview', label: 'Overview', icon: '🏛️' },
  { to: '/admin/structure', label: 'Institution structure', icon: '🏢' },
  { to: '/admin/academics', label: 'Academic setup', icon: '📚' },
  { to: '/admin/access', label: 'Accounts and access', icon: '🔐' },
  { to: '/admin/content', label: 'Content and sharing', icon: '📢' },
  { to: '/calendar', label: 'Academic calendar', icon: '📅' },
]
const platformAdminLinks = [
  { to: '/', label: 'Platform administration', icon: '🌐' },
]

function Sidebar() {
  const { user, logout } = useAuth()
  const links = user.role === 'platform_admin' ? platformAdminLinks : user.role === 'admin' ? adminLinks : user.role === 'faculty' ? facultyLinks : studentLinks

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span aria-hidden="true">🎓</span> Campus OS
      </div>

      <nav className="sidebar-nav" aria-label="Main navigation">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === '/'}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? 'active' : ''}`
            }
          >
            <span aria-hidden="true">{link.icon}</span>
            {link.label}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-user">
        <div>
          <strong>{user.name}</strong>
          <span>{user.role}</span>
        </div>
        <button type="button" className="logout-button" onClick={logout}>
          Log out
        </button>
      </div>
    </aside>
  )
}

export default Sidebar
