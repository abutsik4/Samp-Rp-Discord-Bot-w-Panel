import { useState } from "react";
import { Navigate } from "react-router-dom";
import { Users, Key, Trash2, UserPlus, Lock, Save, X, Shield } from "lucide-react";
import { authApi, formatApiError } from "../lib/api";
import { useQuery, useMutation } from "../hooks/useQuery";
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";
import { Alert } from "../components/Alert";

export function UserManagementPage({ user }) {
  const [success, setSuccess] = useState("");

  // Create form state
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("user");

  // Reset password modal state
  const [resetTarget, setResetTarget] = useState(null);
  const [resetPassword, setResetPassword] = useState("");

  // Change own password state
  const [selfCurrentPw, setSelfCurrentPw] = useState("");
  const [selfNewPw, setSelfNewPw] = useState("");

  // Inline delete confirm state
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  if (user?.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  // ── Queries ─────────────────────────────────────────────
  const usersUrl = "/panel/api/auth/users";
  const { data: usersData, error: queryError, refresh: refreshUsers } = useQuery(usersUrl);
  const users = usersData?.users || [];
  const error = queryError?.message || null;

  // ── Mutations ───────────────────────────────────────────
  function flash(msg) {
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 4000);
  }

  const [createUserMut, { loading: creating }] = useMutation(authApi.createUser, {
    invalidate: [usersUrl],
    onSuccess: () => { setNewUsername(""); setNewPassword(""); setNewRole("user"); flash(`User "${newUsername}" created.`); },
    onError: (e) => { /* error displayed via queryError after invalidation */ },
  });

  const [deleteUserMut, { loading: deleting }] = useMutation(authApi.deleteUser, {
    invalidate: [usersUrl],
    onSuccess: () => { setDeleteConfirm(null); flash(`User deleted.`); },
  });

  const [updateRoleMut] = useMutation(authApi.updateUserRole, {
    invalidate: [usersUrl],
    onSuccess: () => flash("Role updated."),
  });

  const [resetPasswordMut, { loading: resetting }] = useMutation(authApi.adminResetPassword, {
    onSuccess: () => { flash(`Password reset for "${resetTarget}".`); setResetTarget(null); setResetPassword(""); },
    onError: (e) => { /* error shown via alert */ },
  });

  const [changeSelfPwMut, { loading: changingOwnPw }] = useMutation(authApi.changeSelfPassword, {
    onSuccess: () => { flash("Your password has been changed."); setSelfCurrentPw(""); setSelfNewPw(""); },
  });

  // ── Error aggregation ───────────────────────────────────
  const displayError = error || null;

  return (
    <div className="page">
      <PageHeader
        icon={Users}
        title="User Management"
        subtitle="Manage panel accounts and access levels."
      />

      {displayError ? <Alert type="error">{displayError}</Alert> : null}
      {success ? <Alert type="success">{success}</Alert> : null}

      {/* Reset Password Modal */}
      {resetTarget ? (
        <div className="modal-overlay" onClick={() => { setResetTarget(null); setResetPassword(""); }}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <Key size={16} /> Reset Password: {resetTarget}
              </div>
              <button className="btn--icon" onClick={() => { setResetTarget(null); setResetPassword(""); }}>
                <X size={13} />
              </button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); resetPasswordMut(resetTarget, resetPassword); }}>
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
                  onClick={() => { setResetTarget(null); setResetPassword(""); }}
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
                        onChange={(e) => updateRoleMut(u.username, e.target.value)}
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
                        onClick={() => { setResetTarget(u.username); setResetPassword(""); }}
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
                              onClick={() => deleteUserMut(u.username)}
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
        <form onSubmit={(e) => { e.preventDefault(); createUserMut(newUsername, newPassword, newRole); }}>
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
        <form onSubmit={(e) => { e.preventDefault(); changeSelfPwMut(selfCurrentPw, selfNewPw); }}>
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