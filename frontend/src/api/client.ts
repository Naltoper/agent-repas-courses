import type {
  AgentSession,
  GeminiModelsResponse,
  HealthResponse,
  SessionSummary,
  UserProfile,
} from '../types/domain'

/** Empty VITE_API_URL= must NOT win over the default `/api` proxy prefix. */
const rawApiUrl = import.meta.env.VITE_API_URL
export const API_BASE =
  typeof rawApiUrl === 'string' && rawApiUrl.trim().length > 0
    ? rawApiUrl.trim().replace(/\/$/, '')
    : '/api'

async function parseError(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') || ''
  try {
    if (contentType.includes('application/json')) {
      const body = (await response.json()) as {
        detail?: string | Array<{ msg?: string }>
      }
      if (typeof body.detail === 'string') return body.detail
      if (Array.isArray(body.detail) && body.detail[0]?.msg) {
        return body.detail.map((d) => d.msg).join(' · ')
      }
    } else {
      const text = await response.text()
      if (/^\s*<!doctype/i.test(text)) {
        return (
          'API injoignable (réponse HTML). Vérifiez uvicorn sur :8000 ' +
          'et que les appels passent par /api (redémarrez Vite).'
        )
      }
    }
  } catch {
    // ignore
  }
  return `Erreur API (${response.status})`
}

async function parseJson<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    const text = await response.text()
    if (/^\s*<!doctype/i.test(text)) {
      throw new Error(
        'API injoignable (réponse HTML). Lancez uvicorn sur :8000 et redémarrez Vite.',
      )
    }
    throw new Error(`Réponse API non-JSON (${response.status})`)
  }
  return response.json() as Promise<T>
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE}/health`, { signal })
  if (!response.ok) throw new Error(await parseError(response))
  return parseJson<HealthResponse>(response)
}

export async function fetchProfile(signal?: AbortSignal): Promise<UserProfile> {
  const response = await fetch(`${API_BASE}/profile`, { signal })
  if (!response.ok) throw new Error(await parseError(response))
  return parseJson<UserProfile>(response)
}

export async function saveProfile(profile: UserProfile): Promise<UserProfile> {
  const response = await fetch(`${API_BASE}/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  })
  if (!response.ok) throw new Error(await parseError(response))
  return parseJson<UserProfile>(response)
}

export async function fetchGeminiModels(
  signal?: AbortSignal,
): Promise<GeminiModelsResponse> {
  const response = await fetch(`${API_BASE}/models`, { signal })
  if (!response.ok) throw new Error(await parseError(response))
  return parseJson<GeminiModelsResponse>(response)
}

export async function startAgentRun(prompt: string): Promise<AgentSession> {
  const response = await fetch(`${API_BASE}/agent/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
  if (!response.ok) throw new Error(await parseError(response))
  return parseJson<AgentSession>(response)
}

export async function sendAgentFollowUp(
  runId: string,
  message: string,
): Promise<AgentSession> {
  const response = await fetch(`${API_BASE}/agent/runs/${runId}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  })
  if (!response.ok) throw new Error(await parseError(response))
  return parseJson<AgentSession>(response)
}

export async function fetchAgentRun(
  runId: string,
  signal?: AbortSignal,
): Promise<AgentSession> {
  const response = await fetch(`${API_BASE}/agent/runs/${runId}`, { signal })
  if (!response.ok) throw new Error(await parseError(response))
  return parseJson<AgentSession>(response)
}

export async function fetchLatestSession(
  signal?: AbortSignal,
): Promise<AgentSession | null> {
  const response = await fetch(`${API_BASE}/agent/sessions/latest`, { signal })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(await parseError(response))
  return parseJson<AgentSession>(response)
}

export async function fetchSessionHistory(
  signal?: AbortSignal,
): Promise<SessionSummary[]> {
  const response = await fetch(`${API_BASE}/agent/sessions`, { signal })
  if (!response.ok) throw new Error(await parseError(response))
  return parseJson<SessionSummary[]>(response)
}

export async function loadHistorySession(runId: string): Promise<AgentSession> {
  const response = await fetch(`${API_BASE}/agent/sessions/${runId}/load`, {
    method: 'POST',
  })
  if (!response.ok) throw new Error(await parseError(response))
  return parseJson<AgentSession>(response)
}

export async function renameHistorySession(
  runId: string,
  title: string,
): Promise<AgentSession> {
  const response = await fetch(`${API_BASE}/agent/sessions/${runId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
  if (!response.ok) throw new Error(await parseError(response))
  return parseJson<AgentSession>(response)
}

export async function deleteHistorySession(runId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/agent/sessions/${runId}`, {
    method: 'DELETE',
  })
  if (!response.ok) throw new Error(await parseError(response))
}

export async function validateMenuSession(runId: string): Promise<AgentSession> {
  let response = await fetch(
    `${API_BASE}/agent/runs/${encodeURIComponent(runId)}/validate`,
    { method: 'POST' },
  )
  if (response.status === 404) {
    response = await fetch(`${API_BASE}/agent/sessions/latest/validate`, {
      method: 'POST',
    })
  }
  if (!response.ok) throw new Error(await parseError(response))
  return parseJson<AgentSession>(response)
}

export async function patchShoppingCheck(
  runId: string,
  itemId: string,
  checked: boolean,
): Promise<AgentSession> {
  const response = await fetch(`${API_BASE}/agent/runs/${runId}/shopping/check`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item_id: itemId, checked }),
  })
  if (!response.ok) throw new Error(await parseError(response))
  return parseJson<AgentSession>(response)
}

export async function resetShoppingChecks(runId: string): Promise<AgentSession> {
  const response = await fetch(
    `${API_BASE}/agent/runs/${runId}/shopping/reset`,
    { method: 'POST' },
  )
  if (!response.ok) throw new Error(await parseError(response))
  return parseJson<AgentSession>(response)
}

export async function resetWorkspace(): Promise<void> {
  const response = await fetch(`${API_BASE}/agent/workspace/reset`, {
    method: 'POST',
  })
  if (!response.ok) throw new Error(await parseError(response))
}

export function agentRunStreamUrl(runId: string): string {
  return `${API_BASE}/agent/runs/${runId}/stream`
}
