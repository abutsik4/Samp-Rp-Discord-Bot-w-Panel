import { Navigate, NavLink, Route, Routes, Link, useNavigate, useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import {
  Bot, LayoutDashboard, Users, LogOut, User,
  MessageSquare, Wrench, BarChart2, TrendingUp,
  CheckCircle2, Shield, History, Server, Gamepad2,
} from "lucide-react";
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

  return { loading, user, setUser, refresh };
}

function ProtectedRoute({ user, loading, children }) {
  if (loading) {
    return (
      <div className="fullscreen-center">
        <span className="text-muted">Loading panel…</span>
      </div>
    );
  }
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
    <div>
      <div className="page-header">
        <div className="page-header__left">
          <div className="page-header__icon">
            <LayoutDashboard size={20} />
          </div>
          <div>
            <h1 className="page-header__title">Control Center</h1>
            <p className="page-header__subtitle">
              Signed in as <strong>{user.username}</strong> · {user.role}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="alert alert--error mb-4">
          <span>{error}</span>
        </div>
      )}

      <div className="grid">
        {bots.map((bot) => (
          <Link className="card card--interactive" key={bot.key} to={`/bot/${bot.key}`}>
            <div className="flex items-center gap-2 mb-3">
              <Bot size={18} className="text-accent" />
              <span className="badge">{bot.key}</span>
            </div>
            <h3 className="font-semibold text-lg">{bot.name || bot.key}</h3>
            <p className="text-muted text-sm mt-2">Guild: {bot.guild_id || "n/a"}</p>
          </Link>
        ))}
        {bots.length === 0 && !error && (
          <p className="text-muted text-sm">No bots available.</p>
        )}
      </div>
    </div>
  );
}

const BOT_NAV = [
  { to: "",             end: true, icon: LayoutDashboard, label: "Overview" },
  { to: "/messages",              icon: MessageSquare,    label: "Messages" },
  { to: "/discord-tools",         icon: Wrench,           label: "Discord Tools" },
  { to: "/stats",                 icon: BarChart2,        label: "Stats" },
  { to: "/analytics",             icon: TrendingUp,       label: "Analytics" },
  { to: "/verification",          icon: CheckCircle2,     label: "Verification" },
  { to: "/moderation",            icon: Shield,           label: "Moderation" },
  { to: "/automation",            icon: Bot,              label: "Automation" },
  { to: "/operations",            icon: History,          label: "Operations" },
  { to: "/samp-servers",          icon: Server,           label: "SA-MP Servers" },
  { to: "/gameplay",              icon: Gamepad2,         label: "Gameplay" },
];

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
    return (
      <div className="fullscreen-center">
        <span className="text-muted">Loading bot…</span>
      </div>
    );
  }

  if (!bot) return <Navigate to="/" replace />;

  const base = `/bot/${botKey}`;

  return (
    <div>
      <div className="bot-header">
        <div className="bot-header__name">
          <Bot size={18} />
          {bot.name || bot.key}
        </div>
        <span className="bot-header__guild">Guild: {bot.guild_id || "n/a"}</span>
      </div>

      <nav className="subnav">
        {BOT_NAV.map(({ to, end, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={`${base}${to}`}
            end={end}
            className={({ isActive }) => `subnav-tab${isActive ? " active" : ""}`}
          >
            <Icon size={13} />
            {label}
          </NavLink>
        ))}
      </nav>

      <Routes>
        <Route path="/"              element={<BotOverviewPage bot={bot} botKey={botKey} user={user} />} />
        <Route path="/messages"      element={<MessagesPage botKey={botKey} user={user} />} />
        <Route path="/discord-tools" element={<DiscordMessageToolsPage botKey={botKey} user={user} />} />
        <Route path="/stats"         element={<StatsPage bot={bot} botKey={botKey} user={user} />} />
        <Route path="/analytics"     element={<AnalyticsPage botKey={botKey} />} />
        <Route path="/verification"  element={<VerificationPage bot={bot} user={user} />} />
        <Route path="/moderation"    element={<ModerationPage bot={bot} />} />
        <Route path="/automation"    element={<AutomationPage bot={bot} />} />
        <Route path="/operations"    element={<OperationsPage bot={bot} />} />
        <Route path="/samp-servers"  element={<SampServersPage bot={bot} />} />
        <Route path="/gameplay"      element={<GameplayPage bot={bot} />} />
        <Route path="*"              element={<Navigate to={base} replace />} />
      </Routes>
    </div>
  );
}

function AppLayout({ user, onLogout, children }) {
  const navigate = useNavigate();

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Bot size={20} />
          JepsenCloud Panel
        </div>

        <span className="sidebar-section-label">Navigation</span>

        <nav className="sidebar-nav">
          <NavLink
            to="/"
            end
            className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
          >
            <LayoutDashboard size={16} />
            Dashboard
          </NavLink>

          {user?.role === "admin" && (
            <NavLink
              to="/users"
              className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
            >
              <Users size={16} />
              Users
            </NavLink>
          )}
        </nav>

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
            onClick={async () => {
              await onLogout();
              navigate("/login", { replace: true });
            }}
          >
            <LogOut size={16} />
            Log out
          </button>
        </div>
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
                <Route path="/"             element={<DashboardHome user={session.user} />} />
                <Route path="/users"        element={<UserManagementPage user={session.user} />} />
                <Route path="/bot/:botKey/*" element={<BotLayout user={session.user} />} />
                <Route path="*"             element={<Navigate to="/" replace />} />
              </Routes>
            </AppLayout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
