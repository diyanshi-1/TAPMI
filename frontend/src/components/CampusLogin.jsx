import React, { useState } from 'react';
import { api, setToken } from '../api/client';
import { Shield, KeyRound, ArrowRight, UserCheck, AlertCircle, CheckCircle2 } from 'lucide-react';

export function CampusLogin({ onLoginSuccess }) {
  const [mode, setMode] = useState('login'); // 'login' or 'activate'
  
  // Login State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Activation State
  const [actStep, setActStep] = useState(1); // 1: request, 2: verify, 3: complete
  const [studentId, setStudentId] = useState('');
  const [actEmail, setActEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [actLoading, setActLoading] = useState(false);
  const [actError, setActError] = useState('');
  const [actSuccessMsg, setActSuccessMsg] = useState('');

  async function handleLogin(e) {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);

    try {
      const res = await api.login({ email, password });
      setToken(res.data.token);
      onLoginSuccess(res.data.user);
    } catch (err) {
      setLoginError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleRequestOtp(e) {
    e.preventDefault();
    setActError('');
    setActLoading(true);
    try {
      const res = await api.requestActivation({ student_id: studentId, email: actEmail });
      setActSuccessMsg(res.meta.message || 'OTP sent! Please check the server logs / email.');
      setActStep(2);
    } catch (err) {
      setActError(err.message || 'Failed to request activation OTP.');
    } finally {
      setActLoading(false);
    }
  }

  async function handleVerifyOtp(e) {
    e.preventDefault();
    setActError('');
    setActLoading(true);
    try {
      await api.verifyActivation({ student_id: studentId, email: actEmail, otp });
      setActSuccessMsg('OTP verified successfully! Now set your new account password.');
      setActStep(3);
    } catch (err) {
      setActError(err.message || 'OTP verification failed.');
    } finally {
      setActLoading(false);
    }
  }

  async function handleCompleteActivation(e) {
    e.preventDefault();
    setActError('');
    setActLoading(true);
    try {
      const res = await api.completeActivation({
        student_id: studentId,
        email: actEmail,
        password: newPassword
      });
      setActSuccessMsg(res.meta.message || 'Activation complete! You can now log in.');
      setMode('login');
      setEmail(actEmail);
      setPassword(newPassword);
      setActStep(1);
    } catch (err) {
      setActError(err.message || 'Activation failed.');
    } finally {
      setActLoading(false);
    }
  }

  return (
    <div className="campus-login-page">
      {/* Background layer */}
      <div className="campus-bg-image" />
      {/* Translucent overlay softening background */}
      <div className="campus-bg-overlay" />

      {/* Fully Opaque Login Card Container */}
      <div className="login-card-container">
        {/* TAPMI Branding */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '44px',
            height: '44px',
            backgroundColor: 'var(--color-primary-soft)',
            borderRadius: '10px',
            color: 'var(--color-primary)',
            marginBottom: '12px'
          }}>
            <Shield size={24} />
          </div>
          <h2 className="h2" style={{ fontSize: '20px', marginBottom: '4px' }}>
            TAPMI Cultural Committee
          </h2>
          <p className="text-muted" style={{ fontSize: '13px' }}>
            Volunteer Management & Resource Allocation
          </p>
        </div>

        {/* Tab switch */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid var(--color-border)',
          marginBottom: '20px'
        }}>
          <button
            type="button"
            onClick={() => { setMode('login'); setLoginError(''); }}
            style={{
              flex: 1,
              padding: '10px',
              border: 'none',
              background: 'transparent',
              fontSize: '13.5px',
              fontWeight: mode === 'login' ? 600 : 400,
              color: mode === 'login' ? 'var(--color-primary)' : 'var(--color-muted)',
              borderBottom: mode === 'login' ? '2px solid var(--color-primary)' : 'none',
              cursor: 'pointer'
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setMode('activate'); setActError(''); }}
            style={{
              flex: 1,
              padding: '10px',
              border: 'none',
              background: 'transparent',
              fontSize: '13.5px',
              fontWeight: mode === 'activate' ? 600 : 400,
              color: mode === 'activate' ? 'var(--color-primary)' : 'var(--color-muted)',
              borderBottom: mode === 'activate' ? '2px solid var(--color-primary)' : 'none',
              cursor: 'pointer'
            }}
          >
            Activate Account (OTP)
          </button>
        </div>

        {mode === 'login' ? (
          <div>
            {loginError && (
              <div className="banner banner-danger" style={{ marginBottom: '16px' }}>
                <AlertCircle size={16} />
                <span>{loginError}</span>
              </div>
            )}

            <form onSubmit={handleLogin}>
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="e.g. convener@tapmi.edu.in"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Password</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="Enter your account password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', height: '42px', marginTop: '8px' }}
                disabled={loginLoading}
              >
                {loginLoading ? 'Signing in...' : 'Sign In'}
                {!loginLoading && <ArrowRight size={16} />}
              </button>
            </form>

          </div>
        ) : (
          <div>
            {actError && (
              <div className="banner banner-danger" style={{ marginBottom: '16px' }}>
                <AlertCircle size={16} />
                <span>{actError}</span>
              </div>
            )}
            {actSuccessMsg && (
              <div className="banner banner-success" style={{ marginBottom: '16px' }}>
                <CheckCircle2 size={16} />
                <span>{actSuccessMsg}</span>
              </div>
            )}

            {actStep === 1 && (
              <form onSubmit={handleRequestOtp}>
                <div style={{ fontSize: '13px', color: 'var(--color-muted)', marginBottom: '14px' }}>
                  Step 1 of 3: Enter your university student ID and registered TAPMI email to receive an activation OTP.
                </div>
                <div className="form-group">
                  <label className="form-label">University Student ID</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. V003"
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Email Address</label>
                  <input
                    type="email"
                    className="form-input"
                    placeholder="e.g. student@tapmi.edu.in"
                    value={actEmail}
                    onChange={(e) => setActEmail(e.target.value)}
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%', height: '42px' }}
                  disabled={actLoading}
                >
                  {actLoading ? 'Requesting OTP...' : 'Send Activation OTP'}
                </button>
              </form>
            )}

            {actStep === 2 && (
              <form onSubmit={handleVerifyOtp}>
                <div style={{ fontSize: '13px', color: 'var(--color-muted)', marginBottom: '14px' }}>
                  Step 2 of 3: Enter the 6-digit OTP code sent to your email / development log.
                </div>
                <div className="form-group">
                  <label className="form-label">6-Digit Verification Code</label>
                  <input
                    type="text"
                    maxLength={6}
                    className="form-input"
                    placeholder="123456"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    required
                    style={{ letterSpacing: '4px', textAlign: 'center', fontSize: '18px', fontWeight: 600 }}
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%', height: '42px' }}
                  disabled={actLoading}
                >
                  {actLoading ? 'Verifying...' : 'Verify OTP'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ width: '100%', marginTop: '8px' }}
                  onClick={() => setActStep(1)}
                >
                  Back
                </button>
              </form>
            )}

            {actStep === 3 && (
              <form onSubmit={handleCompleteActivation}>
                <div style={{ fontSize: '13px', color: 'var(--color-muted)', marginBottom: '14px' }}>
                  Step 3 of 3: Set your personal login password.
                </div>
                <div className="form-group">
                  <label className="form-label">Create Password</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="Minimum 6 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%', height: '42px' }}
                  disabled={actLoading}
                >
                  {actLoading ? 'Completing...' : 'Activate & Set Password'}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
