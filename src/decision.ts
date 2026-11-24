import { z } from 'zod'

const line = (max: number) => z.string().trim().min(1).max(max)
export const setupSchema = z.object({
  title: line(120),
  context: z.string().trim().max(350),
  options: z.array(line(60)).min(2).max(4),
  criteria: z.array(z.object({ name: line(40), weight: z.number().int().min(1).max(3) })).min(2).max(4),
}).superRefine((setup, ctx) => {
  for (const [field, values] of [['options', setup.options], ['criteria', setup.criteria.map(c => c.name)]] as const) {
    if (new Set(values.map(value => value.toLowerCase())).size !== values.length) {
      ctx.addIssue({ code: 'custom', path: [field], message: 'Use distinct names.' })
    }
  }
})

const ballotSchema = z.object({
  scores: z.array(z.array(z.number().int().min(1).max(5)).min(2).max(4)).min(2).max(4),
  note: z.string().trim().max(240),
})

export const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('create'), setup: setupSchema }),
  z.object({ type: z.literal('join') }),
  z.object({ type: z.literal('vote'), ballot: ballotSchema }),
  z.object({ type: z.literal('reveal') }),
  z.object({ type: z.literal('decide'), option: z.number().int().min(0).max(3), reason: line(350), next: line(180) }),
])

export type Setup = z.infer<typeof setupSchema>
export type Ballot = z.infer<typeof ballotSchema>
export type Command = z.infer<typeof commandSchema>
export type Actor = { id: string; name: string }
type Participant = Actor & { ballot?: Ballot }
export type Decision = { option: number; reason: string; next: string }
export type Room = Setup & {
  host: string; participants: Participant[]; phase: 'voting' | 'revealed' | 'decided'; revision: number; decision?: Decision
}

export function newRoom(setup: Setup, actor: Actor): Room {
  return { ...setup, host: actor.id, participants: [actor], phase: 'voting', revision: 1 }
}

export class RoomError extends Error {
  constructor(message: string, readonly status: 400 | 403 | 404 | 409) { super(message) }
}

export function applyCommand(room: Room, actor: Actor, command: Exclude<Command, { type: 'create' }>): Room {
  const participant = room.participants.find(p => p.id === actor.id)
  if (command.type === 'join' && participant) return room
  if (command.type !== 'join' && !participant) throw new RoomError('Join the room to continue.', 403)
  const revision = room.revision + 1

  switch (command.type) {
    case 'join':
      if (room.participants.length >= 12) throw new RoomError('This room has reached its 12-person limit.', 409)
      return { ...room, participants: [...room.participants, actor], revision }
    case 'vote': {
      if (room.phase !== 'voting') throw new RoomError('Voting has closed.', 409)
      const ballot = command.ballot
      if (ballot.scores.length !== room.options.length || ballot.scores.some(row => row.length !== room.criteria.length)) {
        throw new RoomError('Give every option a score for every criterion.', 400)
      }
      const participants = room.participants.map(p => p.id === actor.id ? { ...p, ballot } : p)
      return { ...room, participants, revision }
    }
    case 'reveal':
      if (actor.id !== room.host) throw new RoomError('Only the host can reveal the ballots.', 403)
      if (room.phase !== 'voting') throw new RoomError('The ballots are already revealed.', 409)
      if (!room.participants.some(p => p.ballot)) throw new RoomError('Submit at least one ballot before revealing.', 409)
      return { ...room, phase: 'revealed', revision }
    case 'decide':
      if (actor.id !== room.host) throw new RoomError('Only the host can record the decision.', 403)
      if (room.phase !== 'revealed') throw new RoomError('Reveal the ballots before recording a decision.', 409)
      if (!room.options[command.option]) throw new RoomError('Choose an option from this room.', 400)
      return { ...room, phase: 'decided', revision, decision: { option: command.option, reason: command.reason, next: command.next } }
  }
}

export function roomView(room: Room, userId: string) {
  const self = room.participants.find(p => p.id === userId)
  const { participants, decision, ...setup } = room
  return {
    ...setup, joined: !!self, selfId: userId,
    participants: self ? participants.map(({ id, name, ballot }) => ({ id, name, submitted: !!ballot })) : [],
    decision: self ? decision : undefined,
    ownBallot: self?.ballot,
    results: self && room.phase !== 'voting' ? summarize(room) : undefined,
  }
}

export type RoomView = ReturnType<typeof roomView>

function summarize(room: Room) {
  const { criteria } = room
  const ballots = room.participants.flatMap(p => p.ballot ? [p.ballot] : [])
  const totalWeight = criteria.reduce((total, c) => total + c.weight, 0)
  const ranked = room.options.map((name, option) => {
    const cells = criteria.map((criterion, index) => {
      const scores = ballots.map(ballot => ballot.scores[option][index])
      return { ...criterion, avg: scores.reduce((sum, score) => sum + score, 0) / scores.length,
        low: Math.min(...scores), high: Math.max(...scores) }
    })
    return { name, option, cells, score: cells.reduce((sum, cell) => sum + cell.avg * cell.weight, 0) / totalWeight }
  }).sort((a, b) => b.score - a.score || a.option - b.option)
  const gaps = ranked.flatMap(option => option.cells.map(cell => ({ ...cell, option: option.name })))
    .sort((a, b) => (b.high - b.low) - (a.high - a.low))
  const notes = ballots.flatMap(ballot => ballot.note ? [ballot.note] : []).sort()
  return { ranked, gap: gaps[0].high > gaps[0].low ? gaps[0] : undefined, notes }
}
