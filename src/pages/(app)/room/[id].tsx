import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getAuthToken, usePresenceRoom } from 'deepspace'
import { ArrowRight, Grid2X2 } from 'lucide-react'
import { RoomBoard } from '../../../components/QuietVote'
import { roomRequest } from '../../../room-client'
import type { Command, RoomView } from '../../../decision'

export default function RoomPage() {
  const { id } = useParams()
  return id ? <RoomSession key={id} id={id} /> : null
}

function RoomSession({ id }: { id: string }) {
  const [room, setRoom] = useState<RoomView>()
  const [error, setError] = useState('')
  const [joining, setJoining] = useState(false)
  const [retry, setRetry] = useState(0)
  const accept = useCallback((next: RoomView) => {
    setRoom(previous => !previous || next.revision >= previous.revision ? next : previous)
    setError('')
  }, [])
  const run = useCallback(async (command: Command) => accept(await roomRequest<RoomView>(id, command)), [id, accept])

  useEffect(() => {
    const controller = new AbortController()
    roomRequest<RoomView>(id, undefined, controller.signal).then(accept).catch(e => {
      if (!controller.signal.aborted) setError(e.message)
    })
    return () => controller.abort()
  }, [id, accept, retry])

  if (!room) return <div className="q-setup q-auth">
    {error ? <><h1>Room unavailable</h1><p role="alert">{error}</p><div className="q-actions"><button className="q-button q-secondary" onClick={() => { setError(''); setRetry(n => n + 1) }}>Try again</button><Link to="/" className="q-button q-secondary">Back home</Link></div></> : <p role="status">Opening the room…</p>}
  </div>

  if (!room.joined) return <section className="q-setup q-auth">
    <div className="q-overline"><Grid2X2 size={14} /> ROOM INVITE</div><h1>{room.title}</h1>
    <p>{room.context || 'You’ve been invited to a decision room.'}</p>
    {error && <p role="alert" className="q-error">{error}</p>}
    <button className="q-button q-primary" disabled={joining} onClick={async () => {
      setJoining(true)
      try { await run({ type: 'join' }) }
      catch (e) { setError(e instanceof Error ? e.message : 'Could not join the room.') }
      finally { setJoining(false) }
    }}>{joining ? 'Joining…' : 'Join room'} <ArrowRight size={16} /></button>
  </section>

  return <ActiveRoom id={id} room={room} accept={accept} run={run} />
}

function ActiveRoom({ id, room, accept, run }: {
  id: string; room: RoomView; accept: (view: RoomView) => void; run: (command: Command) => Promise<void>
}) {
  const { peers, connected } = usePresenceRoom(`decision-${id}`)
  const [syncing, setSyncing] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    let socket: WebSocket | undefined
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined
    let reconnectDelay = 1000
    const refresh = () => { void roomRequest<RoomView>(id, undefined, controller.signal).then(accept).catch(() => {}) }

    function retry() {
      if (controller.signal.aborted) return
      setSyncing(true)
      reconnectTimer = setTimeout(() => void connect(), reconnectDelay)
      reconnectDelay = Math.min(reconnectDelay * 2, 15_000)
    }

    async function connect() {
      const token = await getAuthToken().catch(() => null)
      if (controller.signal.aborted) return
      if (!token) { retry(); return }
      const url = new URL(`/ws/decision/${id}`, window.location.href)
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
      url.searchParams.set('token', token)
      socket = new WebSocket(url)
      socket.onopen = () => {
        setSyncing(false)
        reconnectDelay = 1000
        refresh()
      }
      socket.onmessage = refresh
      socket.onclose = retry
    }
    void connect()
    const interval = setInterval(refresh, 15_000)
    window.addEventListener('focus', refresh)
    return () => {
      controller.abort()
      clearInterval(interval)
      clearTimeout(reconnectTimer)
      socket?.close()
      window.removeEventListener('focus', refresh)
    }
  }, [id, accept])

  const memberIds = new Set(room.participants.map(p => p.id))
  const online = connected ? new Set([room.selfId, ...peers.map(p => p.userId).filter(id => memberIds.has(id))]) : undefined
  return <>
    {syncing && <p className="q-sync" role="status">Connecting live updates…</p>}
    <RoomBoard room={room} run={run} online={online} copyInvite={() => navigator.clipboard.writeText(window.location.href)} />
  </>
}
