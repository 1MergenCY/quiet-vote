import { getAuthToken } from 'deepspace'
import type { Command } from './decision'

export async function roomRequest<T>(roomId?: string, command?: Command, signal?: AbortSignal): Promise<T> {
  const token = await getAuthToken()
  if (!token) throw new Error('Your session expired. Sign in again to continue.')
  const response = await fetch(`/api/rooms${roomId ? `/${encodeURIComponent(roomId)}` : ''}`, {
    method: command ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(command ? { 'Content-Type': 'application/json' } : {}) },
    body: command ? JSON.stringify(command) : undefined,
    signal,
  })
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
      ? payload.error : 'The room could not be reached. Try again.'
    throw new Error(message)
  }
  return payload as T
}
