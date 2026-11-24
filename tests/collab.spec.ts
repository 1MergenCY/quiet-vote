import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import type { Page } from '@playwright/test'

test.skip(loadAllTestAccounts().length < 2, 'Requires two local DeepSpace test accounts.')

async function score(page: Page, value: string, note: string) {
  const cells = page.getByRole('table').getByRole('combobox')
  await expect(cells).toHaveCount(4)
  for (const cell of await cells.all()) await cell.selectOption(value)
  await page.getByLabel('What influenced your scores?').fill(note)
  await page.getByRole('button', { name: 'Submit ballot' }).click()
  await expect(page.getByText('Ballot saved')).toBeVisible()
}

test('two users score privately, see the reveal live, and reopen a saved decision', async ({ users }) => {
  const [host, guest] = await users(2)
  await host.page.goto('/new')
  await host.page.getByLabel('Decision question').fill('Which library project should we start with?')
  await host.page.getByLabel('Option 1', { exact: true }).fill('Reading circles')
  await host.page.getByLabel('Option 2', { exact: true }).fill('Seed library')
  await host.page.getByRole('button', { name: 'Create room' }).click()
  await expect(host.page.getByRole('heading', { name: 'Your ballot' })).toBeVisible()
  const roomUrl = host.page.url()
  const roomId = new URL(roomUrl).pathname.split('/').pop()!

  await guest.page.goto(roomUrl)
  await guest.page.getByRole('button', { name: 'Join room' }).click()
  await expect(host.page.getByText('2 in the room now')).toBeVisible()
  const guestToken = await guest.page.evaluate(async () => {
    const response = await fetch('/api/auth/token', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
    return ((await response.json()) as { token?: string }).token ?? ''
  })
  expect(guestToken.length).toBeGreaterThan(0)
  const authorization = { Authorization: `Bearer ${guestToken}` }
  const response = await guest.page.request.post(`/api/rooms/${roomId}`, { headers: authorization, data: { type: 'reveal' } })
  expect(response.status()).toBe(403)

  await score(host.page, '5', 'Private host note before reveal.')
  await expect(guest.page.getByText('1 of 2 submitted')).toBeVisible()
  const before = await guest.page.request.get(`/api/rooms/${roomId}`, { headers: authorization })
  expect(before.ok()).toBe(true)
  expect(JSON.stringify(await before.json())).not.toContain('Private host note')
  await score(guest.page, '2', 'Guest note for the group.')
  await expect(host.page.getByText('2 of 2 submitted')).toBeVisible()

  await host.page.getByRole('button', { name: 'Reveal results' }).click()
  await expect(guest.page.getByRole('heading', { name: 'Group results' })).toBeVisible()
  await expect(guest.page.getByText('Private host note before reveal.')).toBeVisible()
  await expect(guest.page.getByText('3.50').first()).toBeVisible()
  const after = await guest.page.request.post(`/api/rooms/${roomId}`, {
    headers: authorization, data: { type: 'vote', ballot: { scores: [[1, 1], [1, 1]], note: '' } },
  })
  expect(after.status()).toBe(409)

  await host.page.getByLabel('Chosen option').selectOption('1')
  await host.page.getByLabel('Rationale').fill('We already have a librarian to run the pilot.')
  await host.page.getByLabel('Next step').fill('Make a list of seed donors.')
  await host.page.getByRole('button', { name: 'Save decision' }).click()
  await expect(guest.page.getByText('Make a list of seed donors.')).toBeVisible()
  await guest.page.reload()
  await expect(guest.page.getByText('Make a list of seed donors.')).toBeVisible()
  await guest.page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await guest.page.getByRole('button', { name: 'Copy summary' }).click()
  await expect(guest.page.getByText('Summary copied.')).toBeVisible()
  const summary = await guest.page.evaluate(() => navigator.clipboard.readText())
  expect(summary.replace(/\r\n/g, '\n')).toBe('Which library project should we start with?\n\nDecision: Seed library\nRationale: We already have a librarian to run the pilot.\nNext step: Make a list of seed donors.')
})
