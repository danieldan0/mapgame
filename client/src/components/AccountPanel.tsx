import React, { useState } from 'react';

interface AccountPanelProps {
  accountUsername: string | null;
  authError: string | null;
  onLogin: (username: string, password: string) => void;
  onRegister: (username: string, password: string) => void;
  onLogout: () => void;
  onDismissAuthError: () => void;
}

type AuthMode = 'none' | 'login' | 'register';

export const AccountPanel: React.FC<AccountPanelProps> = ({
  accountUsername,
  authError,
  onLogin,
  onRegister,
  onLogout,
  onDismissAuthError,
}) => {
  const [authMode, setAuthMode] = useState<AuthMode>('none');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');

  const openMode = (mode: AuthMode) => {
    setAuthMode(mode);
    setUsername('');
    setPassword('');
    setPasswordConfirm('');
    onDismissAuthError();
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (authMode === 'login') {
      onLogin(username, password);
    } else if (authMode === 'register') {
      if (password !== passwordConfirm) return;
      onRegister(username, password);
    }
  };

  const passwordMismatch = authMode === 'register' && passwordConfirm.length > 0 && password !== passwordConfirm;

  return (
    <div style={{ padding: '14px', border: '1px solid #444', borderRadius: '6px' }}>
      {accountUsername ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ color: '#aaa', fontSize: '14px' }}>Signed in as</span>
          <strong>{accountUsername}</strong>
          <button type="button" onClick={onLogout} style={{ marginLeft: 'auto', padding: '4px 8px', fontSize: '12px' }}>
            Logout
          </button>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '8px', marginBottom: authMode !== 'none' ? '12px' : '0' }}>
            <button
              onClick={() => openMode(authMode === 'login' ? 'none' : 'login')}
              style={{ padding: '6px 14px', background: authMode === 'login' ? '#555' : '#333', color: 'white', border: '1px solid #666', borderRadius: '4px', cursor: 'pointer' }}
            >
              Log In
            </button>
            <button
              onClick={() => openMode(authMode === 'register' ? 'none' : 'register')}
              style={{ padding: '6px 14px', background: authMode === 'register' ? '#555' : '#333', color: 'white', border: '1px solid #666', borderRadius: '4px', cursor: 'pointer' }}
            >
              Register
            </button>
            <span style={{ color: '#777', fontSize: '13px', alignSelf: 'center', marginLeft: '4px' }}>
              to play across devices
            </span>
          </div>

          {authMode !== 'none' && (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => { setUsername(e.target.value); onDismissAuthError(); }}
                autoComplete="username"
                style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #555', background: '#222', color: 'white' }}
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); onDismissAuthError(); }}
                autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
                style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #555', background: '#222', color: 'white' }}
              />
              {authMode === 'register' && (
                <input
                  type="password"
                  placeholder="Confirm password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  autoComplete="new-password"
                  style={{ padding: '6px 10px', borderRadius: '4px', border: `1px solid ${passwordMismatch ? '#c0392b' : '#555'}`, background: '#222', color: 'white' }}
                />
              )}
              {passwordMismatch && (
                <span style={{ color: '#e74c3c', fontSize: '13px' }}>Passwords do not match</span>
              )}
              {authError && (
                <span style={{ color: '#e74c3c', fontSize: '13px' }}>{authError}</span>
              )}
              <button
                type="submit"
                disabled={passwordMismatch}
                style={{ padding: '7px 18px', background: '#2d7a2d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', alignSelf: 'flex-start' }}
              >
                {authMode === 'login' ? 'Log In' : 'Register'}
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
};
