import { describe, expect, it } from 'vitest'
import { applyCommand, newRoom, roomView, setupSchema, type Setup } from './decision'

const host = { id: 'host', name: 'Host' }
const guest = { id: 'guest', name: 'Guest' }
const setup: Setup = { title: 'Pick a project', context: '', options: ['Library', 'Museum'],
  criteria: [{ name: 'Reach', weight: 3 }, { name: 'Cost', weight: 1 }] }

describe('decision room rules', () => {
  it('keeps ballots private, weights results, and locks voting at reveal', () => {
    let room = newRoom(setup, host)
    room = applyCommand(room, guest, { type: 'join' })
    const ballot = { scores: [[5, 1], [2, 5]], note: 'Host note' }
    room = applyCommand(room, host, { type: 'vote', ballot })
    expect(roomView(room, guest.id)).toMatchObject({ participants: [{ submitted: true }, { submitted: false }] })
    expect(JSON.stringify(roomView(room, guest.id))).not.toContain('Host note')
    expect(() => applyCommand(room, guest, { type: 'reveal' })).toThrow('Only the host')
    room = applyCommand(room, guest, { type: 'vote', ballot: { scores: [[3, 1], [2, 4]], note: '' } })
    room = applyCommand(room, host, { type: 'reveal' })
    expect(roomView(room, guest.id).results?.ranked.map(o => [o.name, o.score])).toEqual([['Library', 3.25], ['Museum', 2.625]])
    expect(roomView(room, guest.id).results?.gap).toMatchObject({ option: 'Library', name: 'Reach', low: 3, high: 5 })
    expect(roomView(room, 'outsider').results).toBeUndefined()
    expect(() => applyCommand(room, guest, { type: 'vote', ballot })).toThrow('Voting has closed')
  })

  it('rejects duplicate setup names and incomplete ballots', () => {
    expect(setupSchema.safeParse({ ...setup, options: ['Museum', ' museum '] }).success).toBe(false)
    const room = newRoom(setup, host)
    expect(() => applyCommand(room, host, { type: 'vote', ballot: { scores: [[1, 1]], note: '' } })).toThrow('every option')
    expect(() => applyCommand(room, host, { type: 'reveal' })).toThrow('at least one ballot')
  })
})
