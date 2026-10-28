
import { BrowserRouter, Routes, Route } from 'react-router-dom'

import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import UserDashboard from './pages/UserDashboard'
import CloudEngineerDashboard from './pages/CloudEngineerDashboard'
import CloudProviderSelection from './pages/CloudProviderSelection'
import AzureDashboard from './AzureDashboard'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />

        <Route path="/register" element={<Register />} />

        <Route
          path="/cloud-provider"
          element={<CloudProviderSelection />}
        />

        <Route
          path="/user-dashboard"
          element={<UserDashboard />}
        />

        <Route
          path="/azure-dashboard"
          element={<AzureDashboard />}
        />

        <Route
          path="/cloud-engineer-dashboard"
          element={<CloudEngineerDashboard />}
        />

        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
