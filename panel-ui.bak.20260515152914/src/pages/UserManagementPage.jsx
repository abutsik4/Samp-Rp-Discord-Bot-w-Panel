import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Users, Key, Trash2, UserPlus, Lock, Save, X, Shield } from "lucide-react";
import { authApi, formatApiError } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";
import { Alert } from "../components/Alert";

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

  // Inline delete confirm state
  const [deleteConfirm, setDeleteConfirm] = useState(null);

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
    setError("");
    try {
      await authApi.deleteUser(username);
      flash(`User "${username}" deleted.`);
      setDeleteConfirm(null);
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

  function openModal(u) {
    setResetTarget(u.username);
    setResetPassword("");
  }

  function closeModal() {
    setResetTarget(null);
    setResetPassword("");
  }

  return (
    <div className="page">
      <PageHeader
        icon={Users}
        title="User Management"
        subtitle="Manage panel accounts and access levels."
      />

      {error ? <Alert type="error">{error}</Alert> : null}
      {success ? <Alert type="success">{success}</Alert> : null}

      {/* Reset Password Modal */}
      {resetTarget ? (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <Key size={16} /> Reset Password: {resetTarget}
              </div>
              <button className="btn--icon" onClick={closeModal}>
                <X size={13} />
              </button>
            </div>
            <form onSubmit={handleResetPassword}>
              <div className="form-row">
                <label>New Password</label>
                <div className="input-group">
                  <Lock size={14} />
                  <input
                    type="password"
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    placeholder="Min 8 characters"
                    minLength={8}
                    required
                  />
                </div>
              </div>
              <div className="row-actions" style={{ marginTop: "0.75rem" }}>
                <button type="submit" disabled={resetting}>
                  <Key size={13} /> {resetting ? "Resetting…" : "Reset Password"}
                </button>
                <button
                  type="button"
                  className="btn--ghost btn--sm"
                  onClick={closeModal}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* User list */}
      <SectionCard title="Panel Users" icon={Users}>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: "2rem" }}></th>
                <th>Username</th>
                <th>Role</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: "center", color: "var(--muted)" }}>
                    No users found
                  </td>
                </tr>
              ) : null}
              {users.map((u) => (
                <tr key={u.username}>
                  <td>
                    <div className="avatar">{u.username[0].toUpperCase()}</div>
                  </td>
                  <td>
                    {u.username}
                    {u.username === user.username ? (
                      <span className="badge badge--accent" style={{ marginLeft: "0.5rem" }}>you</span>
                    ) : null}
                  </td>
                  <td>
                    {u.username === user.username ? (
                      <span className={`badge ${u.role === "admin" ? "badge--admin" : ""}`}>
                        {u.role}
                      </span>
                    ) : (
                      <select
                        value={u.role}
                        onChange={(e) => handleRoleChange(u.username, e.target.value)}
                      >
                        <option value="admin">admin</option>
                        <option value="user">user</option>
                      </select>
                    )}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="btn--icon"
                        onClick={() => openModal(u)}
                        title="Reset Password"
                      >
                        <Key size={13} />
                      </button>
                      {u.username !== user.username ? (
                        deleteConfirm === u.username ? (
                          <span className="inline-confirm">
                            Delete?{" "}
                            <button
                              className="btn--sm btn--danger"
                              onClick={() => handleDelete(u.username)}
                            >
                              Yes
                            </button>
                            <button
                              className="btn--sm btn--ghost"
                              onClick={() => setDeleteConfirm(null)}
                            >
                              No
                            </button>
                          </span>
                        ) : (
                          <button
                            className="btn--icon btn--danger-icon"
                            onClick={() => setDeleteConfirm(u.username)}
                            title="Delete user"
                          >
                            <Trash2 size={13} />
                          </button>
                        )
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Create User */}
      <SectionCard title="Create New User" icon={UserPlus}>
        <form onSubmit={handleCreate}>
          <div className="form-grid">
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
              <div className="input-group">
                <Lock size={14} />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  minLength={8}
                  required
                />
              </div>
            </div>
            <div className="form-row">
              <label>Role</label>
              <div className="input-group">
                <Shield size={14} />
                <select value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </select>
              </div>
            </div>
          </div>
          <div className="row-actions" style={{ marginTop: "0.75rem" }}>
            <button type="submit" disabled={creating}>
              <UserPlus size={13} /> {creating ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </SectionCard>

      {/* Change own password */}
      <SectionCard title="Change Your Password" icon={Lock}>
        <form onSubmit={handleChangeSelfPassword}>
          <div className="form-grid">
            <div className="form-row">
              <label>Current Password</label>
              <div className="input-group">
                <Lock size={14} />
                <input
                  type="password"
                  value={selfCurrentPw}
                  onChange={(e) => setSelfCurrentPw(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="form-row">
              <label>New Password</label>
              <div className="input-group">
                <Lock size={14} />
                <input
                  type="password"
                  value={selfNewPw}
                  onChange={(e) => setSelfNewPw(e.target.value)}
                  placeholder="Min 8 characters"
                  minLength={8}
                  required
                />
              </div>
            </div>
          </div>
          <div className="row-actions" style={{ marginTop: "0.75rem" }}>
            <button type="submit" disabled={changingOwnPw}>
              <Save size={13} /> {changingOwnPw ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </SectionCard>
    </div>
  );
}
