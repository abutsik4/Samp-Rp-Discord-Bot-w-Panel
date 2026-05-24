import { Navigate, NavLink, Route, Routes, Link, useNavigate, useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import {
  Bot, LayoutDashboard, Users, LogOut, User,
  MessageSquare, Wrench, BarChart2, TrendingUp,
  CheckCircle2, Shield, History, Server, Gamepad2,
} from "lucide-react";
import { QueryClientProvider } from "./lib/QueryClient";
import { authApi } from "./lib/api";
import { useQuery } from "./hooks/useQuery";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { ToastProvider } from "./components/Toaster";
import { ResponsiveSidebar } from "./components/ResponsiveSidebar";
import { BotHeader, ResponsiveSubnav } from "./components/ResponsiveSubnav";
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

  useEffect(() => { refresh(); }, []);

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
  const { data: botsData, error: botsError } = useQuery("/panel/api/auth/bots");
  const bots = botsData?.items || [];
  const error = botsError?.message || null;

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

const BOT_NAV_ITEMS = [
  { key: "overview",    to: "",             end: true, icon: LayoutDashboard, label: "Overview" },
  { key: "messages",    to: "/messages",              icon: MessageSquare,   label: "Messages" },
  { key: "discord-tools", to: "/discord-tools",      icon: Wrench,           label: "Discord Tools" },
  { key: "stats",       to: "/stats",                 icon: BarChart2,        label: "Stats" },
  { key: "analytics",   to: "/analytics",             icon: TrendingUp,       label: "Analytics" },
  { key: "verification", to: "/verification",          icon: CheckCircle2,    label: "Verification" },
  { key: "moderation",  to: "/moderation",             icon: Shield,           label: "Moderation" },
  { key: "automation",  to: "/automation",             icon: Bot,              label: "Automation" },
  { key: "operations",  to: "/operations",             icon: History,           label: "Operations" },
  { key: "samp-servers", to: "/samp-servers",           icon: Server,            label: "SA-MP Servers" },
  { key: "gameplay",    to: "/gameplay",               icon: Gamepad2,          label: "Gameplay" },
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

  // Resolve which subnav tab is active based on current path
  const location = window.location.pathname;
  const base = `/bot/${botKey}`;
  const subnavItems = BOT_NAV_ITEMS.map((item) => ({
    key: item.key,
    icon: <item.icon size={13} />,
    label: item.label,
    onClick: () => {}, // NavLink handles navigation
  }));

  // Determine active key from path
  const relativePath = location.startsWith(base) ? location.slice(base.length) || "/" : "/";
  const activeKey = BOT_NAV_ITEMS.find((item) => {
    const itemPath = item.to || "/";
    if (item.end) return relativePath === "/";
    return relativePath.startsWith(itemPath);
  })?.key || "overview";

  if (loading) {
    return (
      <div className="fullscreen-center">
        <span className="text-muted">Loading bot…</span>
      </div>
    );
  }

  if (!bot) return <Navigate to="/" replace />;

  return (
    <div>
      <BotHeader
        botName={bot.name || bot.key}
        guildName={`Guild: ${bot.guild_id || "n/a"}`}
        botIcon={<Bot size={18} style={{ color: "var(--color-accent)" }} />}
        subnavItems={subnavItems}
        activeKey={activeKey}
        onTabChange={() => {}}
      />

      {/* Actual nav links rendered as NavLink for routing */}
      <nav className="subnav">
        {BOT_NAV_ITEMS.map(({ to, end, icon: Icon, label }) => (
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

function AppLayout({ user, onLogout }) {
  return (
    <div className="layout">
      <ResponsiveSidebar user={user} onLogout={onLogout} />
      <main className="content">
        <Routes>
          <Route path="/"             element={<DashboardHome user={user} />} />
          <Route path="/users"        element={<UserManagementPage user={user} />} />
          <Route path="/bot/:botKey/*" element={<BotLayout user={user} />} />
          <Route path="*"             element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export function App() {
  const session = useSession();
  const navigate = useNavigate();

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
          navigate("/login", { replace: true });
        }
      },
    }),
    [session]
  );

  return (
    <QueryClientProvider><AppErrorBoundary>
      <ToastProvider>
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
                <AppLayout user={session.user} onLogout={actions.onLogout} />
              </ProtectedRoute>
            }
          />
        </Routes>
      </ToastProvider>
    </AppErrorBoundary></QueryClientProvider>
  );
}