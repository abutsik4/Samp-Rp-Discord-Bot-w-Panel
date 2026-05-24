import { useRoutes } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Dashboard from './pages/Dashboard.jsx'
import GangHQ from './pages/GangHQ.jsx'
import LiveEconomy from './pages/LiveEconomy.jsx'
import Casino from './pages/Casino.jsx'
import Crafting from './pages/Crafting.jsx'
import Settings from './pages/Settings.jsx'

const routes = [
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'gang-hq', element: <GangHQ /> },
      { path: 'economy', element: <LiveEconomy /> },
      { path: 'casino', element: <Casino /> },
      { path: 'crafting', element: <Crafting /> },
      { path: 'settings', element: <Settings /> }
    ]
  }
]

export default function App() {
  return useRoutes(routes)
}
