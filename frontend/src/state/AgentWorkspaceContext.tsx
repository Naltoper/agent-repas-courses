import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  agentRunStreamUrl,
  fetchAgentRun,
  fetchLatestSession,
  loadHistorySession,
  patchShoppingCheck,
  resetShoppingChecks,
  resetWorkspace,
  sendAgentFollowUp,
  startAgentRun,
  validateMenuSession,
} from '../api/client'
import type {
  AgentLogEvent,
  AgentSession,
  AppView,
  ChatMessage,
  Step1Tab,
  TunnelStep,
} from '../types/domain'
import {
  loadInStockIds,
  loadUiPrefs,
  saveInStockIds,
  saveUiPrefs,
  type UiPrefs,
} from '../utils/uiPrefs'

interface AgentWorkspaceValue {
  appView: AppView
  setAppView: (view: AppView) => void
  tunnelStep: TunnelStep
  setTunnelStep: (step: TunnelStep) => void
  maxReachedStep: TunnelStep
  step1Tab: Step1Tab
  setStep1Tab: (tab: Step1Tab) => void
  uiPrefs: UiPrefs
  setUiPrefs: (prefs: UiPrefs) => void
  inStockIds: Set<string>
  toggleInStock: (itemId: string) => void
  prompt: string
  setPrompt: (value: string) => void
  session: AgentSession | null
  logs: AgentLogEvent[]
  messages: ChatMessage[]
  running: boolean
  error: string | null
  menuValidated: boolean
  restoring: boolean
  startRun: (prompt: string) => Promise<void>
  sendFollowUp: (message: string) => Promise<void>
  validateMenu: () => Promise<void>
  goToStep: (step: TunnelStep) => void
  goToStoreMode: () => void
  editMenu: () => void
  toggleShoppingItem: (itemId: string, checked: boolean) => Promise<void>
  resetChecks: () => Promise<void>
  startFresh: () => Promise<void>
  resumeSession: (runId: string) => Promise<void>
  clearError: () => void
}

const AgentWorkspaceContext = createContext<AgentWorkspaceValue | null>(null)

export function AgentWorkspaceProvider({ children }: { children: ReactNode }) {
  const [appView, setAppView] = useState<AppView>('tunnel')
  const [tunnelStep, setTunnelStep] = useState<TunnelStep>(1)
  const [step1Tab, setStep1Tab] = useState<Step1Tab>('recipes')
  const [uiPrefs, setUiPrefsState] = useState<UiPrefs>(() => loadUiPrefs())
  const [inStockIds, setInStockIds] = useState<Set<string>>(() => new Set())
  const [prompt, setPrompt] = useState(
    'Menu équilibré, plats simples et rapides le soir.',
  )
  const [session, setSession] = useState<AgentSession | null>(null)
  const [logs, setLogs] = useState<AgentLogEvent[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [menuValidated, setMenuValidated] = useState(false)
  const [restoring, setRestoring] = useState(true)
  const esRef = useRef<EventSource | null>(null)

  const setUiPrefs = useCallback((prefs: UiPrefs) => {
    setUiPrefsState(prefs)
    saveUiPrefs(prefs)
  }, [])

  const applySession = useCallback((next: AgentSession) => {
    setSession(next)
    setLogs(next.logs ?? [])
    setMessages(next.messages ?? [])
    if (next.prompt) setPrompt(next.prompt)
    if (typeof next.menu_validated === 'boolean') {
      setMenuValidated(next.menu_validated)
    }
    if (next.status === 'completed' || next.status === 'failed') {
      setRunning(false)
    }
    setInStockIds(loadInStockIds(next.id))
  }, [])

  const watchRun = useCallback(
    (runId: string) => {
      esRef.current?.close()
      const source = new EventSource(agentRunStreamUrl(runId))
      esRef.current = source

      source.addEventListener('log', (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data) as {
            log: AgentLogEvent
            status: string
          }
          setLogs((prev) => [...prev, payload.log])
          setSession((prev) =>
            prev
              ? {
                  ...prev,
                  status: payload.status,
                  logs: [...(prev.logs ?? []), payload.log],
                }
              : prev,
          )
        } catch {
          // ignore
        }
      })

      source.addEventListener('chat', (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data) as {
            message: ChatMessage
          }
          setMessages((prev) => {
            const exists = prev.some(
              (m) =>
                m.role === payload.message.role &&
                m.content === payload.message.content &&
                m.timestamp === payload.message.timestamp,
            )
            return exists ? prev : [...prev, payload.message]
          })
        } catch {
          // ignore
        }
      })

      source.addEventListener('done', (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data) as {
            session: AgentSession
          }
          applySession(payload.session)
        } catch {
          void fetchAgentRun(runId).then(applySession).catch(() => undefined)
        } finally {
          source.close()
          setRunning(false)
        }
      })

      source.addEventListener('error', () => {
        source.close()
        void (async () => {
          try {
            for (let i = 0; i < 90; i += 1) {
              const current = await fetchAgentRun(runId)
              applySession(current)
              if (current.status === 'completed' || current.status === 'failed') {
                return
              }
              await new Promise((r) => setTimeout(r, 800))
            }
          } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Suivi impossible')
          } finally {
            setRunning(false)
          }
        })()
      })
    },
    [applySession],
  )

  useEffect(() => {
    const controller = new AbortController()
    fetchLatestSession(controller.signal)
      .then((latest) => {
        if (latest) {
          applySession(latest)
          if (latest.menu_validated && latest.result) {
            setTunnelStep(2)
          } else {
            setTunnelStep(1)
          }
        }
      })
      .catch(() => undefined)
      .finally(() => setRestoring(false))

    return () => {
      controller.abort()
      esRef.current?.close()
    }
  }, [applySession])

  const startRun = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (trimmed.length < 3) {
        setError('La consigne doit contenir au moins 3 caractères.')
        return
      }
      setError(null)
      setRunning(true)
      setLogs([])
      setMessages([])
      setSession(null)
      setMenuValidated(false)
      setTunnelStep(1)
      setStep1Tab('recipes')
      setInStockIds(new Set())
      try {
        const started = await startAgentRun(trimmed)
        applySession(started)
        setRunning(true)
        watchRun(started.id)
      } catch (err: unknown) {
        setRunning(false)
        setError(err instanceof Error ? err.message : 'Lancement impossible')
      }
    },
    [applySession, watchRun],
  )

  const sendFollowUp = useCallback(
    async (message: string) => {
      if (!session?.id) return
      const trimmed = message.trim()
      if (trimmed.length < 2) return
      setError(null)
      setRunning(true)
      setMenuValidated(false)
      setTunnelStep(1)
      try {
        await sendAgentFollowUp(session.id, trimmed)
        setRunning(true)
        watchRun(session.id)
      } catch (err: unknown) {
        setRunning(false)
        setError(err instanceof Error ? err.message : 'Follow-up impossible')
      }
    },
    [session?.id, watchRun],
  )

  const validateMenu = useCallback(async () => {
    if (!session?.id || !session.result) return
    setError(null)
    try {
      const updated = await validateMenuSession(session.id)
      applySession(updated)
      setMenuValidated(true)
      setTunnelStep(2)
      setAppView('tunnel')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Validation impossible')
    }
  }, [applySession, session?.id, session?.result])

  const maxReachedStep: TunnelStep = useMemo(() => {
    if (!session?.result) return 1
    if (!menuValidated) return 1
    if (tunnelStep >= 3) return 3
    return 2
  }, [session?.result, menuValidated, tunnelStep])

  const goToStep = useCallback(
    (step: TunnelStep) => {
      if (step === 1) {
        setTunnelStep(1)
        return
      }
      if (step === 2 && menuValidated && session?.result) {
        setTunnelStep(2)
        return
      }
      if (step === 3 && menuValidated && session?.result && maxReachedStep >= 3) {
        setTunnelStep(3)
      }
    },
    [menuValidated, session?.result, maxReachedStep],
  )

  const goToStoreMode = useCallback(() => {
    if (!menuValidated || !session?.result) return
    setTunnelStep(3)
    setAppView('tunnel')
  }, [menuValidated, session?.result])

  const editMenu = useCallback(() => {
    setMenuValidated(false)
    setTunnelStep(1)
    setAppView('tunnel')
  }, [])

  const toggleInStock = useCallback(
    (itemId: string) => {
      setInStockIds((prev) => {
        const next = new Set(prev)
        if (next.has(itemId)) next.delete(itemId)
        else next.add(itemId)
        saveInStockIds(session?.id ?? null, next)
        return next
      })
    },
    [session?.id],
  )

  const toggleShoppingItem = useCallback(
    async (itemId: string, checked: boolean) => {
      if (!session?.id || !session.result) return
      setSession((prev) => {
        if (!prev?.result) return prev
        const shopping_list = prev.result.shopping_list.map((item) =>
          item.id === itemId ? { ...item, checked } : item,
        )
        return {
          ...prev,
          result: { ...prev.result, shopping_list },
        }
      })
      try {
        const updated = await patchShoppingCheck(session.id, itemId, checked)
        applySession(updated)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Mise à jour impossible')
        try {
          const fresh = await fetchAgentRun(session.id)
          applySession(fresh)
        } catch {
          // ignore
        }
      }
    },
    [applySession, session?.id, session?.result],
  )

  const resetChecks = useCallback(async () => {
    if (!session?.id) return
    try {
      const updated = await resetShoppingChecks(session.id)
      applySession(updated)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Réinitialisation impossible')
    }
  }, [applySession, session?.id])

  const startFresh = useCallback(async () => {
    esRef.current?.close()
    try {
      await resetWorkspace()
    } catch {
      // still clear locally
    }
    setSession(null)
    setLogs([])
    setMessages([])
    setMenuValidated(false)
    setRunning(false)
    setError(null)
    setTunnelStep(1)
    setStep1Tab('recipes')
    setInStockIds(new Set())
    setAppView('tunnel')
    setPrompt('Menu équilibré, plats simples et rapides le soir.')
  }, [])

  const resumeSession = useCallback(
    async (runId: string) => {
      setError(null)
      setRestoring(true)
      try {
        const loaded = await loadHistorySession(runId)
        applySession(loaded)
        setAppView('tunnel')
        if (loaded.menu_validated && loaded.result) {
          setTunnelStep(2)
        } else {
          setTunnelStep(1)
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Reprise impossible')
      } finally {
        setRestoring(false)
      }
    },
    [applySession],
  )

  const value = useMemo<AgentWorkspaceValue>(
    () => ({
      appView,
      setAppView,
      tunnelStep,
      setTunnelStep,
      maxReachedStep,
      step1Tab,
      setStep1Tab,
      uiPrefs,
      setUiPrefs,
      inStockIds,
      toggleInStock,
      prompt,
      setPrompt,
      session,
      logs,
      messages,
      running,
      error,
      menuValidated,
      restoring,
      startRun,
      sendFollowUp,
      validateMenu,
      goToStep,
      goToStoreMode,
      editMenu,
      toggleShoppingItem,
      resetChecks,
      startFresh,
      resumeSession,
      clearError: () => setError(null),
    }),
    [
      appView,
      tunnelStep,
      maxReachedStep,
      step1Tab,
      uiPrefs,
      setUiPrefs,
      inStockIds,
      toggleInStock,
      prompt,
      session,
      logs,
      messages,
      running,
      error,
      menuValidated,
      restoring,
      startRun,
      sendFollowUp,
      validateMenu,
      goToStep,
      goToStoreMode,
      editMenu,
      toggleShoppingItem,
      resetChecks,
      startFresh,
      resumeSession,
    ],
  )

  return (
    <AgentWorkspaceContext.Provider value={value}>
      {children}
    </AgentWorkspaceContext.Provider>
  )
}

export function useAgentWorkspace(): AgentWorkspaceValue {
  const ctx = useContext(AgentWorkspaceContext)
  if (!ctx) {
    throw new Error('useAgentWorkspace must be used within AgentWorkspaceProvider')
  }
  return ctx
}
