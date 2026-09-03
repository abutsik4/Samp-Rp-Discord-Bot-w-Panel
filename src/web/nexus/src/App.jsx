import { useRoutes, Navigate } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import BotOverviewPage from './pages/BotOverviewPage.jsx'
import GangHQ from './pages/GangHQ.jsx'
import LiveEconomy from './pages/LiveEconomy.jsx'
import Casino from './pages/Casino.jsx'
import Crafting from './pages/Crafting.jsx'
import Settings from './pages/Settings.jsx'
import ModerationPage from './pages/ModerationPage.jsx'
import MessagesPage from './pages/MessagesPage.jsx'
import StatsPage from './pages/StatsPage.jsx'
import AnalyticsPage from './pages/AnalyticsPage.jsx'
import AutomationPage from './pages/AutomationPage.jsx'
import OperationsPage from './pages/OperationsPage.jsx'
import VerificationPage from './pages/VerificationPage.jsx'
import SampServersPage from './pages/SampServersPage.jsx'
import DiscordMessageToolsPage from './pages/DiscordMessageToolsPage.jsx'
import UserManagementPage from './pages/UserManagementPage.jsx'
import GameplayPage from './pages/GameplayPage.jsx'
import LoginPage from './pages/LoginPage.jsx'

const routes = [
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <BotOverviewPage /> },
      { path: 'gang-hq', element: <GangHQ /> },
      { path: 'economy', element: <LiveEconomy /> },
      { path: 'casino', element: <Casino /> },
      { path: 'crafting', element: <Crafting /> },
      { path: 'messages', element: <MessagesPage /> },
      { path: 'stats', element: <StatsPage /> },
      { path: 'analytics', element: <AnalyticsPage /> },
      { path: 'moderation', element: <ModerationPage /> },
      { path: 'automation', element: <AutomationPage /> },
      { path: 'samp-servers', element: <SampServersPage /> },
      { path: 'discord-tools', element: <DiscordMessageToolsPage /> },
      { path: 'verification', element: <VerificationPage /> },
      { path: 'operations', element: <OperationsPage /> },
      { path: 'gameplay', element: <GameplayPage /> },
      { path: 'users', element: <UserManagementPage /> },
      { path: 'settings', element: <Settings /> },
      { path: '*', element: <Navigate to="/" /> }
    ]
  },
  { path: '*', element: <Navigate to="/" /> }
]

export default function App() {
  return useRoutes(routes)
}
