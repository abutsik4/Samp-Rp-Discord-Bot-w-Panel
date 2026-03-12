import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { authApi, formatApiError } from "../lib/api";

export function UserManagementPage({ user }) {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Create form state
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("user");
  const [creating, setCreating] = useState(false);

  // Reset password modal state
  const [resetTarget, setResetTarget] = useState(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetting, setResetting] = useState(false);

  // Change own password state
  const [selfCurrentPw, setSelfCurrentPw] = useState("");
  const [selfNewPw, setSelfNewPw] = useState("");
  const [changingOwnPw, setChangingOwnPw] = useState(false);

  if (user?.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  async function loadUsers() {
    setError("");
    try {
      const data = await authApi.users();
      setUsers(data?.users || []);
    } catch (e) {
      setError(formatApiError(e, "Failed to load users"));
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  function flash(msg) {
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 4000);
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    setCreating(true);
    try {
      await authApi.createUser(newUsername, newPassword, newRole);
      setNewUsername("");
      setNewPassword("");
      setNewRole("user");
      flash(`User "${newUsername}" created.`);
      await loadUsers();
    } catch (e) {
      setError(formatApiError(e, "Failed to create user"));
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(username) {
    if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return;
    setError("");
    try {
      await authApi.deleteUser(username);
      flash(`User "${username}" deleted.`);
      await loadUsers();
    } catch (e) {
      setError(formatApiError(e, "Failed to delete user"));
    }
  }

  async function handleRoleChange(username, role) {
    setError("");
    try {
      await authApi.updateUserRole(username, role);
      flash(`Role updated for "${username}".`);
      await loadUsers();
    } catch (e) {
      setError(formatApiError(e, "Failed to update role"));
    }
  }

  async function handleResetPassword(e) {
    e.preventDefault();
    if (!resetTarget) return;
    setError("");
    setResetting(true);
    try {
      await authApi.adminResetPassword(resetTarget, resetPassword);
      flash(`Password reset for "${resetTarget}".`);
      setResetTarget(null);
      setResetPassword("");
    } catch (e) {
      setError(formatApiError(e, "Failed to reset password"));
    } finally {
      setResetting(false);
    }
  }

  async function handleChangeSelfPassword(e) {
    e.preventDefault();
    setError("");
    setChangingOwnPw(true);
    try {
      await authApi.changeSelfPassword(selfCurrentPw, selfNewPw);
      flash("Your password has been changed.");
      setSelfCurrentPw("");
      setSelfNewPw("");
    } catch (e) {
      setError(formatApiError(e, "Failed to change password"));
    } finally {
      setChangingOwnPw(false);
    }
  }

  return (
    <div className="page">
      <h1>User Management</h1>
      <p className="muted">Manage panel admin and user accounts.</p>

      {error ? <div className="error-box">{error}</div> : null}
      {success ? <div className="success-box">{success}</div> : null}

      {/* Reset Password Modal */}
      {resetTarget ? (
        <div className="modal-overlay" onClick={() => setResetTarget(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3>Reset Password: {resetTarget}</h3>
            <form onSubmit={handleResetPassword}>
              <div className="form-row">
                <label>New Password</label>
                <input
                  type="password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  minLength={8}
                  required
                />
              </div>
              <div className="inline-form" style={{ marginTop: "0.75rem" }}>
                <button type="submit" disabled={resetting}>
                  {resetting ? "Resetting…" : "Reset Password"}
                </button>
                <button type="button" className="btn-secondary" onClick={() => { setResetTarget(null); setResetPassword(""); }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* User list */}
      <div className="card">
        <h3>Panel Users</h3>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr><td colSpan={3} style={{ textAlign: "center", color: "var(--muted)" }}>No users found</td></tr>
              ) : null}
              {users.map((u) => (
                <tr key={u.username}>
                  <td>
                    {u.username}
                    {u.username === user.username ? <span className="badge" style={{ marginLeft: "0.5rem" }}>you</span> : null}
                  </td>
                  <td>
                    {u.username === user.username ? (
                      <span className={`badge ${u.role === "admin" ? "badge-admin" : ""}`}>{u.role}</span>
                    ) : (
                      <select
                        value={u.role}
                        onChange={(e) => handleRoleChange(u.username, e.target.value)}
                        className="role-select"
                      >
                        <option value="admin">admin</option>
                        <option value="user">user</option>
                      </select>
                    )}
                  </td>
                  <td>
                    <div className="inline-form">
                      <button
                        className="btn-secondary"
                        onClick={() => { setResetTarget(u.username); setResetPassword(""); }}
                      >
                        Reset PW
                      </button>
                      {u.username !== user.username ? (
                        <button className="btn-danger" onClick={() => handleDelete(u.username)}>
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create User */}
      <div className="card form-card">
        <h3>Create New User</h3>
        <form onSubmit={handleCreate}>
          <div className="form-row">
            <label>Username</label>
            <input
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="Letters, digits, _ and -"
              pattern="[a-zA-Z0-9_-]+"
              required
            />
          </div>
          <div className="form-row">
            <label>Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min 8 characters"
              minLength={8}
              required
            />
          </div>
          <div className="form-row">
            <label>Role</label>
            <select value={newRole} onChange={(e) => setNewRole(e.target.value)}>
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
          </div>
          <button type="submit" disabled={creating} style={{ marginTop: "0.5rem" }}>
            {creating ? "Creating…" : "Create User"}
          </button>
        </form>
      </div>

      {/* Change own password */}
      <div className="card form-card">
        <h3>Change Your Password</h3>
        <form onSubmit={handleChangeSelfPassword}>
          <div className="form-row">
            <label>Current Password</label>
            <input
              type="password"
              value={selfCurrentPw}
              onChange={(e) => setSelfCurrentPw(e.target.value)}
              required
            />
          </div>
          <div className="form-row">
            <label>New Password</label>
            <input
              type="password"
              value={selfNewPw}
              onChange={(e) => setSelfNewPw(e.target.value)}
              placeholder="Min 8 characters"
              minLength={8}
              required
            />
          </div>
          <button type="submit" disabled={changingOwnPw} style={{ marginTop: "0.5rem" }}>
            {changingOwnPw ? "Saving…" : "Change Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
