import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '../features/auth/AuthContext'
import type { AuthService } from '../features/auth/authService'
import ProtectedRoute from '../features/auth/ProtectedRoute'
import Attendance from '../pages/Attendance'
import Dashboard from '../pages/Dashboard'
import Employees from '../pages/Employees'
import Leave from '../pages/Leave'
import Login from '../pages/Login'
import NotFound from '../pages/NotFound'
import Reports from '../pages/Reports'
import RoleManagement from '../pages/RoleManagement'
import Unauthorized from '../pages/Unauthorized'

interface AppRoutesProps {
  authService?: AuthService
}

export function AppRoutes({ authService }: AppRoutesProps) {
  return (
    <AuthProvider authService={authService}>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/unauthorized" element={<Unauthorized />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/employees"
          element={
            <ProtectedRoute
              anyOfPermissions={[
                'employees.read_own',
                'employees.read_team',
                'employees.read_all',
              ]}
            >
              <Employees />
            </ProtectedRoute>
          }
        />
        <Route
          path="/employees/new"
          element={
            <ProtectedRoute requiredPermissions={['employees.create']}>
              <Employees focusRegistration />
            </ProtectedRoute>
          }
        />
        <Route
          path="/attendance"
          element={
            <ProtectedRoute
              anyOfPermissions={[
                'attendance.record_own',
                'attendance.read_own',
                'attendance.read_team',
                'attendance.read_all',
              ]}
            >
              <Attendance />
            </ProtectedRoute>
          }
        />
        <Route
          path="/leave"
          element={
            <ProtectedRoute
              anyOfPermissions={[
                'leave.request',
                'leave.read_own',
                'leave.read_team',
                'leave.read_all',
              ]}
            >
              <Leave />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <ProtectedRoute
              anyOfPermissions={[
                'reports.view_own',
                'reports.view_team',
                'reports.view_all',
              ]}
            >
              <Reports />
            </ProtectedRoute>
          }
        />
        <Route
          path="/roles"
          element={
            <ProtectedRoute requiredPermissions={['roles.manage']}>
              <RoleManagement />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  )
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
