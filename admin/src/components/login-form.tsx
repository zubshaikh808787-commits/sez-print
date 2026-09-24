'use client';

import { FormEvent, useEffect, useState } from 'react';

export function LoginForm() {
  const [username, setUsername] = useState('seznikadmin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me').then((response) => {
      if (response.ok) window.location.href = '/overview';
    });
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError('');
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email: username, password }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setPending(false);
    if (!response.ok) {
      setError(data.error || 'Could not sign in.');
      return;
    }
    window.location.href = '/overview';
  }

  return (
    <div className="login">
      <section className="login-hero">
        <div>
          <p className="kicker" style={{ color: '#8fd4de' }}>SEZ Print</p>
          <h1>The desk behind the labels.</h1>
          <p>See which phones opened the app, what got printed, and keep the template library in one place.</p>
        </div>
      </section>
      <form className="login-card" onSubmit={onSubmit}>
        <h2>Sign in</h2>
        <p className="lede">This desk is for the SEZ team. The phone app stays sign-in free.</p>
        <label className="field">
          <span>Username</span>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            type="text"
            required
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            type="password"
            required
          />
        </label>
        {error ? <p className="err">{error}</p> : null}
        <div className="form-actions">
          <button className="btn primary" type="submit" disabled={pending}>
            {pending ? 'Logging in…' : 'Login'}
          </button>
        </div>
      </form>
    </div>
  );
}
