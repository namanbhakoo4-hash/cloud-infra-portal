
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './Register.css'

function Register() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const navigate = useNavigate()

  const handleRegister = async (e) => {
    e.preventDefault()
    setMessage('')
    setLoading(true)

    try {
      const response = await fetch(
        'http://localhost:5000/api/auth/register',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name,
            email,
            password
          })
        }
      )

      const data = await response.json()

      if (response.ok) {
        navigate('/')
      } else {
        setMessage(data.message || 'Registration failed')
      }
    } catch (error) {
      console.error(error)
      setMessage('Unable to connect to server')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="register-page">
      <section className="register-brand">
        <div className="register-logo">
          <span className="register-logo-icon">☁</span>
          <span>CloudOps Portal</span>
        </div>

        <div className="register-brand-content">
          <span className="register-tag">
            CLOUD INFRASTRUCTURE MANAGEMENT
          </span>

          <h1>
            Build your cloud
            <br />
            <span>with confidence.</span>
          </h1>

          <p>
            A unified platform to request, review,
            and manage cloud infrastructure with
            automated Terraform workflows.
          </p>

          <div className="register-features">
            <div><span>✓</span> Streamlined infrastructure requests</div>
            <div><span>✓</span> Role-based approval workflows</div>
            <div><span>✓</span> Terraform automation and validation</div>
          </div>
        </div>

        <div className="register-brand-footer">
          Cloud Infrastructure Provisioning Portal
        </div>
      </section>

      <section className="register-panel">
        <div className="register-form-container">
          <span className="register-access-tag">
            GET STARTED
          </span>

          <h2>Create an account</h2>

          <p className="register-description">
            Enter your details to get started with
            your cloud infrastructure workspace.
          </p>

          <form onSubmit={handleRegister}>
            <div className="register-field">
              <label htmlFor="register-name">Full name</label>
              <input
                id="register-name"
                type="text"
                placeholder="Enter your full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                required
              />
            </div>

            <div className="register-field">
              <label htmlFor="register-email">Email address</label>
              <input
                id="register-email"
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <div className="register-field">
              <label htmlFor="register-password">Password</label>

              <div className="register-password-wrapper">
                <input
                  id="register-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />

                <button
                  type="button"
                  className="register-show-password"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {message && (
              <div className="register-error" role="alert">
                {message}
              </div>
            )}

            <button
              type="submit"
              className="register-submit"
              disabled={loading}
            >
              {loading ? 'Creating account...' : 'Create Account →'}
            </button>
          </form>

          <p className="register-login-link">
            Already have an account?{' '}
            <button type="button" onClick={() => navigate('/')}>
              Sign in
            </button>
          </p>

          <p className="register-security">
            ◈ Secure, role-based access
          </p>
        </div>
      </section>
    </div>
  )
}

export default Register
