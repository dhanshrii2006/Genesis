'use client'

import { ProtectedRoute } from '../components/ProtectedRoute'
import EnhancedDashboard from '../components/EnhancedDashboard'

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <EnhancedDashboard />
    </ProtectedRoute>
  )
}
