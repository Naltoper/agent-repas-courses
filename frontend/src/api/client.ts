import type { AgentSession, HealthResponse, UserProfile } from '../types/domain'

const API_BASE = import.meta.env.VITE_API_URL?.replace(/\/$/, '') ?? '/api'

export function apiBase(): string {
  return API_BASE
}

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
    // ignore JSON parse errors
  }
  return `Erreur API (${response.status})`
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE}/health`, { signal })
  if (!response.ok) {
    throw new Error(await parseError(response))
  }
  return response.json() as Promise<HealthResponse>
}

export async function fetchProfile(signal?: AbortSignal): Promise<UserProfile> {
  const response = await fetch(`${API_BASE}/profile`, { signal })
  if (!response.ok) {
    throw new Error(await parseError(response))
  }
  return response.json() as Promise<UserProfile>
}

export async function saveProfile(profile: UserProfile): Promise<UserProfile> {
  const response = await fetch(`${API_BASE}/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  })
  if (!response.ok) {
    throw new Error(await parseError(response))
  }
  return response.json() as Promise<UserProfile>
}

export async function startAgentRun(prompt: string): Promise<AgentSession> {
  const response = await fetch(`${API_BASE}/agent/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
  if (!response.ok) {
    throw new Error(await parseError(response))
  }
  return response.json() as Promise<AgentSession>
}

export async function fetchAgentRun(
  runId: string,
  signal?: AbortSignal,
): Promise<AgentSession> {
  const response = await fetch(`${API_BASE}/agent/runs/${runId}`, { signal })
  if (!response.ok) {
    throw new Error(await parseError(response))
  }
  return response.json() as Promise<AgentSession>
}

/** Absolute or proxied URL for EventSource (must be same-origin or CORS-friendly). */
export function agentRunStreamUrl(runId: string): string {
  return `${API_BASE}/agent/runs/${runId}/stream`
}
