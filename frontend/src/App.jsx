import { BrowserRouter, Routes, Route } from 'react-router-dom'

import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import UserDashboard from './pages/UserDashboard'
import CloudEngineerDashboard from './pages/CloudEngineerDashboard'

function App() {

  return (

    <BrowserRouter>

      <Routes>

        {/* LOGIN */}
        <Route
          path="/"
          element={<Login />}
        />


        {/* REGISTER */}
        <Route
          path="/register"
          element={<Register />}
        />


        {/* USER DASHBOARD */}
        <Route
          path="/user-dashboard"
          element={<UserDashboard />}
        />


        {/* CLOUD ENGINEER DASHBOARD */}
        <Route
          path="/cloud-engineer-dashboard"
          element={<CloudEngineerDashboard />}
        />


        {/* CURRENT ADMIN DASHBOARD */}
        <Route
          path="/dashboard"
          element={<Dashboard />}
        />

      </Routes>

    </BrowserRouter>

  )
}

export default App