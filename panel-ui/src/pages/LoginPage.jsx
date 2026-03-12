import { useState } from "react";
import { authApi } from "../lib/api";

export function LoginPage({ onLoginSuccess, loading }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setPending(true);
    setError("");

    try {
      const data = await authApi.login(username, password);
      await onLoginSuccess(data?.user || null);
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <h1>JepsenCloud Panel</h1>
        <p className="muted">Sign in to manage your Discord bot</p>

        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
        </label>

        <label>
          Password
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
            minLength={8}
          />
        </label>

        {error ? <div className="error-box">{error}</div> : null}

        <button type="submit" disabled={pending || loading}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
