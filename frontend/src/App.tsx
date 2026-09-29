import { AppShell } from './components/layout/AppShell'
import { HistoryScreen } from './components/HistoryScreen'
import { SettingsScreen } from './components/SettingsScreen'
import { TunnelScreen } from './components/TunnelScreen'
import {
  AgentWorkspaceProvider,
  useAgentWorkspace,
} from './state/AgentWorkspaceContext'

function AppViews() {
  const { appView } = useAgentWorkspace()

  return (
    <AppShell>
      {appView === 'tunnel' ? <TunnelScreen /> : null}
      {appView === 'history' ? <HistoryScreen /> : null}
      {appView === 'settings' ? <SettingsScreen /> : null}
    </AppShell>
  )
}

export default function App() {
  return (
    <AgentWorkspaceProvider>
      <AppViews />
    </AgentWorkspaceProvider>
  )
}
