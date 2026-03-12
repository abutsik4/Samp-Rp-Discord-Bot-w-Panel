import { Navigate, NavLink, Route, Routes, Link, useNavigate, useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { authApi } from "./lib/api";
import { LoginPage } from "./pages/LoginPage";
import { BotOverviewPage } from "./pages/BotOverviewPage";
import { MessagesPage } from "./pages/MessagesPage";
import { StatsPage } from "./pages/StatsPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { ModerationPage } from "./pages/ModerationPage";
import { AutomationPage } from "./pages/AutomationPage";
import { OperationsPage } from "./pages/OperationsPage";
import { SampServersPage } from "./pages/SampServersPage";
import { GameplayPage } from "./pages/GameplayPage";
import { VerificationPage } from "./pages/VerificationPage";
import { DiscordMessageToolsPage } from "./pages/DiscordMessageToolsPage";
import { UserManagementPage } from "./pages/UserManagementPage";

function useSession() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  const refresh = async () => {
    try {
      const data = await authApi.me();
      setUser(data?.user || null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  return {
    loading,
    user,
    setUser,
    refresh,
  };
}

function ProtectedRoute({ user, loading, children }) {
  if (loading) return <div className="panel-loading">Loading panel…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function DashboardHome({ user }) {
  const [bots, setBots] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    authApi
      .bots()
      .then((data) => setBots(data?.items || []))
      .catch((err) => setError(err.message || "Failed to load bots"));
  }, []);

  return (
    <div className="page">
      <h1>Control Center</h1>
      <p className="muted">Signed in as {user.username} ({user.role})</p>
      {error ? <div className="error-box">{error}</div> : null}
      <div className="grid">
        {bots.map((bot) => (
          <Link className="card" key={bot.key} to={`/bot/${bot.key}`}>
            <h3>{bot.name || bot.key}</h3>
            <p>Bot key: {bot.key}</p>
            <p>Guild: {bot.guild_id || "n/a"}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

function BotLayout({ user }) {
  const { botKey } = useParams();
  const [bot, setBot] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    authApi
      .bots()
      .then((data) => {
        const found = (data?.items || []).find((item) => item.key === botKey);
        setBot(found || null);
      })
      .finally(() => setLoading(false));
  }, [botKey]);

  if (loading) {
    return <div className="panel-loading">Loading bot…</div>;
  }

  if (!bot) {
    return <Navigate to="/" replace />;
  }

  const base = `/bot/${botKey}`;

  return (
    <div className="page">
      <div className="subnav-wrap">
        <NavLink to={base} end className="subnav-link">
          Overview
        </NavLink>
        <NavLink to={`${base}/messages`} className="subnav-link">
          Messages
        </NavLink>
        <NavLink to={`${base}/discord-tools`} className="subnav-link">
          Discord Tools
        </NavLink>
        <NavLink to={`${base}/stats`} className="subnav-link">
          Stats
        </NavLink>
        <NavLink to={`${base}/analytics`} className="subnav-link">
          Analytics
        </NavLink>
        <NavLink to={`${base}/verification`} className="subnav-link">
          Verification
        </NavLink>
        <NavLink to={`${base}/moderation`} className="subnav-link">
          Moderation
        </NavLink>
        <NavLink to={`${base}/automation`} className="subnav-link">
          Automation
        </NavLink>
        <NavLink to={`${base}/operations`} className="subnav-link">
          Operations
        </NavLink>
        <NavLink to={`${base}/samp-servers`} className="subnav-link">
          SA-MP Servers
        </NavLink>
        <NavLink to={`${base}/gameplay`} className="subnav-link">
          Gameplay
        </NavLink>
      </div>

      <Routes>
        <Route path="/" element={<BotOverviewPage bot={bot} botKey={botKey} user={user} />} />
        <Route path="/messages" element={<MessagesPage botKey={botKey} user={user} />} />
        <Route path="/discord-tools" element={<DiscordMessageToolsPage botKey={botKey} user={user} />} />
        <Route path="/stats" element={<StatsPage bot={bot} botKey={botKey} user={user} />} />
        <Route path="/analytics" element={<AnalyticsPage botKey={botKey} />} />
        <Route path="/verification" element={<VerificationPage bot={bot} user={user} />} />
        <Route path="/moderation" element={<ModerationPage bot={bot} />} />
        <Route path="/automation" element={<AutomationPage bot={bot} />} />
        <Route path="/operations" element={<OperationsPage bot={bot} />} />
        <Route path="/samp-servers" element={<SampServersPage bot={bot} />} />
        <Route path="/gameplay" element={<GameplayPage bot={bot} />} />
        <Route path="*" element={<Navigate to={base} replace />} />
      </Routes>
    </div>
  );
}

function AppLayout({ user, onLogout, children }) {
  const navigate = useNavigate();
  const [theme, setTheme] = useState(() => localStorage.getItem("panel-theme") || "dark");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("panel-theme", theme);
  }, [theme]);

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">JepsenCloud Panel</div>
        <nav>
          <Link to="/">Dashboard</Link>
          {user?.role === "admin" ? <Link to="/users">Users</Link> : null}
        </nav>
        <button
          className="logout-btn"
          onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
        >
          Theme: {theme}
        </button>
        <button
          className="logout-btn"
          onClick={async () => {
            await onLogout();
            navigate("/login", { replace: true });
          }}
        >
          Logout
        </button>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}

export function App() {
  const session = useSession();

  const actions = useMemo(
    () => ({
      async onLoginSuccess(user) {
        session.setUser(user);
      },
      async onLogout() {
        try {
          await authApi.logout();
        } finally {
          session.setUser(null);
        }
      },
    }),
    [session]
  );

  return (
    <Routes>
      <Route
        path="/login"
        element={
          session.user ? (
            <Navigate to="/" replace />
          ) : (
            <LoginPage onLoginSuccess={actions.onLoginSuccess} loading={session.loading} />
          )
        }
      />

      <Route
        path="/*"
        element={
          <ProtectedRoute user={session.user} loading={session.loading}>
            <AppLayout user={session.user} onLogout={actions.onLogout}>
              <Routes>
                <Route path="/" element={<DashboardHome user={session.user} />} />
                <Route path="/users" element={<UserManagementPage user={session.user} />} />
                <Route path="/bot/:botKey/*" element={<BotLayout user={session.user} />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AppLayout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
