import { BaseRoom, authenticatedRoomRequest, verifyJwt } from 'deepspace/worker'
import { bodyLimit } from 'hono/body-limit'
import type { Context, Hono } from 'hono'
import type { AppContext, Env } from '../../worker'
import { applyCommand, commandSchema, newRoom, roomView, RoomError, type Actor, type Room } from '../decision'
import { resolveAuth } from './http-routes'

export const roomIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const revisionChanged = new Uint8Array([1])

export class DecisionRoom extends BaseRoom<Env> {
  constructor(state: DurableObjectState, env: Env) {
    super(state, env)
    this.sql.exec('CREATE TABLE IF NOT EXISTS decision (id INTEGER PRIMARY KEY CHECK (id = 1), snapshot TEXT NOT NULL)')
  }

  private read(): Room | undefined {
    const [row] = this.sql.exec<{ snapshot: string }>('SELECT snapshot FROM decision WHERE id = 1').toArray()
    return row ? JSON.parse(row.snapshot) as Room : undefined
  }

  // The socket only broadcasts that a new revision exists. Each member reads a
  // fresh, caller-specific projection over HTTP, including after reconnecting.
  protected onMessage(): void {}

  override fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      const id = request.headers.get('x-quiet-vote-id')
      if (!id || !this.read()?.participants.some(p => p.id === id)) {
        return Promise.resolve(new Response('Join the room first.', { status: 403 }))
      }
    }
    return super.fetch(request)
  }

  protected async onRequest(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname
    if (path === '/member') {
      const id = request.headers.get('x-quiet-vote-id')
      return new Response(null, { status: this.read()?.participants.some(p => p.id === id) ? 204 : 403 })
    }

    if (request.method === 'GET' && path === '/view') {
      const id = request.headers.get('x-quiet-vote-id')!
      const room = this.read()
      if (!room) return Response.json({ error: 'Room not found. Check the invite link.' }, { status: 404 })
      return Response.json(roomView(room, id))
    }

    if (request.method !== 'POST' || path !== '/command') return new Response(null, { status: 404 })
    const input = await request.json() as { actor: Actor; command: unknown }
    const parsed = commandSchema.safeParse(input.command)
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path.join('.')
      return Response.json({ error: field ? `Check the value for ${field.replace(/^setup\./, '')}.` : 'That action is invalid.' }, { status: 400 })
    }

    // No await between read and write. The per-room Durable Object serializes
    // ballots and reveal against one SQLite snapshot, including concurrent requests.
    try {
      const current = this.read()
      const command = parsed.data
      let next: Room
      if (command.type === 'create') {
        if (current) throw new RoomError('This room already exists.', 409)
        next = newRoom(command.setup, input.actor)
      } else {
        if (!current) throw new RoomError('Room not found. Check the invite link.', 404)
        next = applyCommand(current, input.actor, command)
      }
      if (next !== current) {
        this.sql.exec('INSERT OR REPLACE INTO decision (id, snapshot) VALUES (1, ?)', JSON.stringify(next))
        this.broadcastBinary(revisionChanged)
      }
      return Response.json(roomView(next, input.actor.id))
    } catch (error) {
      if (error instanceof RoomError) return Response.json({ error: error.message }, { status: error.status })
      throw error
    }
  }
}

function stub(env: Env, id: string) {
  return env.DECISION_ROOMS.get(env.DECISION_ROOMS.idFromName(id))
}

export function registerDecisionRoutes(app: Hono<AppContext>) {
  const commandLimit = bodyLimit({ maxSize: 8192 })
  app.on(['GET', 'POST'], ['/api/rooms', '/api/rooms/:roomId'], commandLimit, async c => {
    c.header('Cache-Control', 'no-store')
    const auth = await resolveAuth(c.req.raw, c.env)
    if (!auth || auth.userId.startsWith('anon-')) return c.json({ error: 'Sign in to continue.' }, 401)
    const roomId = c.req.param('roomId')
    if (roomId && !roomIdPattern.test(roomId)) return c.json({ error: 'Invalid room link.' }, 404)
    if (c.req.method === 'GET') {
      if (!roomId) return c.json({ error: 'Choose a room.' }, 404)
      return stub(c.env, roomId).fetch('https://internal/view', { headers: { 'x-quiet-vote-id': auth.userId } })
    }
    const command = await c.req.json<{ type?: string }>().catch(() => null)
    if (!command || (command.type === 'create') !== !roomId) return c.json({ error: 'Invalid room action.' }, 400)
    const id = roomId ?? crypto.randomUUID()
    const actor = { id: auth.userId, name: auth.claims.name?.trim().slice(0, 70) || 'Participant' }
    const response = await stub(c.env, id).fetch('https://internal/command', {
      method: 'POST', body: JSON.stringify({ actor, command }),
    })
    if (!response.ok || roomId) return response
    return c.json({ id }, 201)
  })

  async function socketAuth(c: Context<AppContext>) {
    const token = c.req.query('token')
    if (!token) return null
    const { result } = await verifyJwt({ publicKey: c.env.AUTH_JWT_PUBLIC_KEY, issuer: c.env.AUTH_JWT_ISSUER }, token)
    return result?.userId.startsWith('anon-') ? null : result
  }

  app.get('/ws/decision/:roomId', async c => {
    const id = c.req.param('roomId')
    if (!roomIdPattern.test(id) || c.req.header('Upgrade')?.toLowerCase() !== 'websocket') return c.notFound()
    const auth = await socketAuth(c)
    if (!auth) return new Response('Unauthorized', { status: 401 })
    const request = authenticatedRoomRequest(c.req.raw, auth)
    request.headers.set('x-quiet-vote-id', auth.userId)
    return stub(c.env, id).fetch(request)
  })

  // Register ahead of the scaffold's generic presence route so a room's roster
  // is only visible to authenticated members of that room.
  app.get('/ws/presence/:scope{decision-[0-9a-f-]+}', async c => {
    const id = c.req.param('scope').slice('decision-'.length)
    if (!roomIdPattern.test(id)) return c.notFound()
    const auth = await socketAuth(c)
    if (!auth) return new Response('Unauthorized', { status: 401 })
    const membership = await stub(c.env, id).fetch('https://internal/member', { headers: { 'x-quiet-vote-id': auth.userId } })
    if (!membership.ok) return new Response('Join the room first.', { status: 403 })
    const presence = c.env.PRESENCE_ROOMS
    return presence.get(presence.idFromName(`decision-${id}`)).fetch(authenticatedRoomRequest(c.req.raw, auth))
  })
}
