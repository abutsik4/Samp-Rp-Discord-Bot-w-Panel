import { useState, useEffect, useCallback } from "react";
import { NavLink } from "react-router-dom";
import {
  Bot, LayoutDashboard, Users, LogOut, User,
  Menu, ChevronLeft, X,
} from "lucide-react";

/**
 * Responsive sidebar with:
 *  - Desktop: full (240px) or collapsed (60px icon-only) — toggle button
 *  - Mobile (<900px): hidden, opens as a slide-in drawer with overlay
 */

export function ResponsiveSidebar({ user, onLogout }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close drawer on route change (handled by consumer via key prop)
  // Close drawer on Escape
  useEffect(() => {
    if (!mobileOpen) return;
    const handler = (e) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mobileOpen]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const handleLogout = useCallback(async () => {
    setMobileOpen(false);
    await onLogout();
  }, [onLogout]);

  const navLinks = (
    <>
      <span className="sidebar-section-label">Navigation</span>
      <nav className="sidebar-nav">
        <NavLink
          to="/"
          end
          className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
          onClick={() => setMobileOpen(false)}
        >
          <LayoutDashboard size={16} />
          <span>Dashboard</span>
        </NavLink>

        {user?.role === "admin" && (
          <NavLink
            to="/users"
            className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
            onClick={() => setMobileOpen(false)}
          >
            <Users size={16} />
            <span>Users</span>
          </NavLink>
        )}
      </nav>
    </>
  );

  const footer = (
    <div className="sidebar-footer">
      <div className="sidebar-user">
        <User size={14} />
        <span className="username">{user?.username}</span>
        <span className={`badge ${user?.role === "admin" ? "badge--admin" : ""}`}>
          {user?.role}
        </span>
      </div>
      <button
        className="sidebar-link sidebar-link--danger"
        onClick={handleLogout}
      >
        <LogOut size={16} />
        <span>Log out</span>
      </button>
    </div>
  );

  return (
    <>
      {/* Mobile header bar */}
      <div className="mobile-header">
        <div className="mobile-header__brand">
          <Bot size={20} style={{ color: "var(--color-accent)" }} />
          <span>JepsenCloud</span>
        </div>
        <button
          className="mobile-header__toggle"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
        >
          <Menu size={18} />
        </button>
      </div>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="sidebar-drawer">
          <div className="sidebar-brand">
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <Bot size={20} style={{ color: "var(--color-accent)" }} />
              <span>JepsenCloud Panel</span>
            </div>
            <button
              className="sidebar-drawer__close"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
            >
              <X size={16} />
            </button>
          </div>
          {navLinks}
          {footer}
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className={`sidebar${collapsed ? " sidebar--collapsed" : ""}`}>
        <button
          className="sidebar-toggle"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand" : "Collapse"}
        >
          <ChevronLeft
            size={16}
            style={{
              transform: collapsed ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform var(--t-base)",
            }}
          />
        </button>

        <div className="sidebar-brand">
          <Bot size={20} />
          <span>JepsenCloud Panel</span>
        </div>

        {navLinks}
        {footer}
      </aside>
    </>
  );
}