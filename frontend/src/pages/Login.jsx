
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './Login.css'

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (loading) return

    setMessage('')
    setLoading(true)

    try {
      const response = await fetch(
        'http://localhost:5000/api/auth/login',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ email, password })
        }
      )

      const data = await response.json()

      if (response.ok) {
        const role = data.user?.role

        const routes = {
          user: '/user-dashboard',
          cloud_engineer: '/cloud-engineer-dashboard',
          admin: '/dashboard'
        }

        if (!data.token || !routes[role]) {
          setMessage('Invalid login response or unknown user role')
          return
        }

        localStorage.setItem('token', data.token)

        navigate(routes[role], { replace: true })
      } else {
        setMessage(data.message || 'Login failed')
      }
    } catch (error) {
      console.error(error)
      setMessage('Unable to connect to server')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <section className="login-brand-panel">
        <div className="login-brand-top">
          <div className="login-brand-icon">☁</div>
          <span>CloudOps Portal</span>
        </div>

        <div className="login-brand-content">
          <div className="login-eyebrow">
            CLOUD INFRASTRUCTURE MANAGEMENT
          </div>

          <h1>
            Infrastructure
            <br />
            made <span>simple.</span>
          </h1>

          <p>
            A unified platform to request, review, and
            manage cloud infrastructure with automated
            Terraform workflows.
          </p>

          <div className="login-feature-list">
            <div className="login-feature">
              <span className="login-feature-icon">✓</span>
              Streamlined infrastructure requests
            </div>

            <div className="login-feature">
              <span className="login-feature-icon">✓</span>
              Role-based approval workflows
            </div>

            <div className="login-feature">
              <span className="login-feature-icon">✓</span>
              Terraform automation and validation
            </div>
          </div>
        </div>

        <div className="login-brand-footer">
          Cloud Infrastructure Provisioning Portal
        </div>

        <div className="login-decoration login-decoration-one" />
        <div className="login-decoration login-decoration-two" />
      </section>

      <section className="login-form-panel">
        <div className="login-form-wrapper">
          <div className="login-mobile-brand">
            ☁ CloudOps Portal
          </div>

          <div className="login-welcome">
            <div className="login-welcome-badge">
              SECURE ACCESS
            </div>

            <h2>Welcome back</h2>

            <p>
              Enter your credentials to access your
              cloud infrastructure workspace.
            </p>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            <div className="login-field">
              <label htmlFor="login-email">Email address</label>

              <input
                id="login-email"
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <div className="login-field">
              <label htmlFor="login-password">Password</label>

              <div className="login-password-wrapper">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />

                <button
                  type="button"
                  className="login-password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={
                    showPassword ? 'Hide password' : 'Show password'
                  }
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {message && (
              <div className="login-error" role="alert">
                {message}
              </div>
            )}

            <button
              type="submit"
              className="login-submit-button"
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign In'}
              {!loading && <span aria-hidden="true">→</span>}
            </button>
          </form>

          <div className="login-register">
            Don't have an account?{' '}
            <button
              type="button"
              onClick={() => navigate('/register')}
            >
              Create an account
            </button>
          </div>

          <div className="login-security-note">
            <span aria-hidden="true">◈</span>
            Secure, role-based access
          </div>
        </div>
      </section>
    </div>
  )
}

export default Login
