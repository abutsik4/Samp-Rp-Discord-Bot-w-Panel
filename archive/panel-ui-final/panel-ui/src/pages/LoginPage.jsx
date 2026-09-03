import { useState } from "react";
import { Bot, User, Lock, LogIn } from "lucide-react";
import { authApi } from "../lib/api";
import { Alert } from "../components/Alert";

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
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <Bot size={36} style={{ color: "var(--color-accent)" }} />
          <h1 className="login-brand__title">JepsenCloud Panel</h1>
          <p className="login-brand__subtitle">Sign in to manage your Discord bot</p>
        </div>

        <div className="form-grid">
          <label>
            Username
            <div className="input-group">
              <User size={14} />
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
                placeholder="Enter username"
              />
            </div>
          </label>

          <label>
            Password
            <div className="input-group">
              <Lock size={14} />
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                required
                minLength={8}
                placeholder="Enter password"
              />
            </div>
          </label>
        </div>

        {error && <Alert type="error">{error}</Alert>}

        <button type="submit" disabled={pending || loading} className="w-full">
          <LogIn size={15} />
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
