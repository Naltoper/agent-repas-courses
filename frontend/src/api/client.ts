import type {
  AgentSession,
  GeminiModelsResponse,
  HealthResponse,
  SessionSummary,
  UserProfile,
} from '../types/domain'

const API_BASE = import.meta.env.VITE_API_URL?.replace(/\/$/, '') ?? '/api'

async function parseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      detail?: string | Array<{ msg?: string }>
    }
    if (typeof body.detail === 'string') return body.detail
    if (Array.isArray(body.detail) && body.detail[0]?.msg) {
      return body.detail.map((d) => d.msg).join(' · ')
    }
  } catch {
    // ignore
  }
  return `Erreur API (${response.status})`
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE}/health`, { signal })
  if (!response.ok) throw new Error(await parseError(response))
  return response.json() as Promise<HealthResponse>
}

export async function fetchProfile(signal?: AbortSignal): Promise<UserProfile> {
  const response = await fetch(`${API_BASE}/profile`, { signal })
  if (!response.ok) throw new Error(await parseError(response))
  return response.json() as Promise<UserProfile>
}

export async function saveProfile(profile: UserProfile): Promise<UserProfile> {
  const response = await fetch(`${API_BASE}/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  })
  if (!response.ok) throw new Error(await parseError(response))
  return response.json() as Promise<UserProfile>
}

export async function fetchGeminiModels(
  signal?: AbortSignal,
): Promise<GeminiModelsResponse> {
  const response = await fetch(`${API_BASE}/models`, { signal })
  if (!response.ok) throw new Error(await parseError(response))
  return response.json() as Promise<GeminiModelsResponse>
}

export async function startAgentRun(prompt: string): Promise<AgentSession> {
  const response = await fetch(`${API_BASE}/agent/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
  if (!response.ok) throw new Error(await parseError(response))
  return response.json() as Promise<AgentSession>
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
  return response.json() as Promise<AgentSession>
}

export async function fetchAgentRun(
  runId: string,
  signal?: AbortSignal,
): Promise<AgentSession> {
  const response = await fetch(`${API_BASE}/agent/runs/${runId}`, { signal })
  if (!response.ok) throw new Error(await parseError(response))
  return response.json() as Promise<AgentSession>
}

export async function fetchLatestSession(
  signal?: AbortSignal,
): Promise<AgentSession | null> {
  const response = await fetch(`${API_BASE}/agent/sessions/latest`, { signal })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(await parseError(response))
  return response.json() as Promise<AgentSession>
}

export async function fetchSessionHistory(
  signal?: AbortSignal,
): Promise<SessionSummary[]> {
  const response = await fetch(`${API_BASE}/agent/sessions`, { signal })
  if (!response.ok) throw new Error(await parseError(response))
  return response.json() as Promise<SessionSummary[]>
}

export async function loadHistorySession(runId: string): Promise<AgentSession> {
  const response = await fetch(`${API_BASE}/agent/sessions/${runId}/load`, {
    method: 'POST',
  })
  if (!response.ok) throw new Error(await parseError(response))
  return response.json() as Promise<AgentSession>
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
  return response.json() as Promise<AgentSession>
}

export async function deleteHistorySession(runId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/agent/sessions/${runId}`, {
    method: 'DELETE',
  })
  if (!response.ok) throw new Error(await parseError(response))
}

export async function validateMenuSession(runId: string): Promise<AgentSession> {
  const response = await fetch(`${API_BASE}/agent/runs/${runId}/validate`, {
    method: 'POST',
  })
  if (!response.ok) throw new Error(await parseError(response))
  return response.json() as Promise<AgentSession>
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
  return response.json() as Promise<AgentSession>
}

export async function resetShoppingChecks(runId: string): Promise<AgentSession> {
  const response = await fetch(
    `${API_BASE}/agent/runs/${runId}/shopping/reset`,
    { method: 'POST' },
  )
  if (!response.ok) throw new Error(await parseError(response))
  return response.json() as Promise<AgentSession>
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
