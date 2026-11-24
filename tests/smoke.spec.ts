import { test, expect } from '@playwright/test'
import { captureConsoleErrors } from './helpers/errors'

test('the public example can be completed on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const errors = captureConsoleErrors(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Score independently/ })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  const cells = page.getByRole('table').getByRole('combobox')
  await expect(cells).toHaveCount(9)
  for (const cell of await cells.all()) await cell.selectOption('4')
  await page.getByRole('button', { name: 'Submit ballot' }).click()
  await expect(page.getByText('3 of 3 submitted')).toBeVisible()
  await page.getByRole('button', { name: 'Reveal results' }).click()
  await expect(page.getByRole('heading', { name: 'Discuss the widest split' })).toBeVisible()
  await page.getByLabel('Rationale').fill('We can organize it within a week.')
  await page.getByLabel('Next step').fill('Contact the volunteer coordinator.')
  await page.getByRole('button', { name: 'Save decision' }).click()
  await expect(page.getByText('Contact the volunteer coordinator.')).toBeVisible()
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, 'writeText', {
      value: () => Promise.reject(new DOMException('Clipboard blocked', 'NotAllowedError')),
    })
  })
  await page.getByRole('button', { name: 'Copy summary' }).click()
  await expect(page.getByLabel('Select and copy the summary')).toHaveValue(/Next step: Contact the volunteer coordinator/)
  await page.getByRole('button', { name: 'Restart example' }).click()
  await expect(page.getByText('2 of 3 submitted')).toBeVisible()
  expect(errors).toEqual([])
})

test('creating a real room asks visitors to sign in', async ({ page, request }) => {
  await page.goto('/new')
  await expect(page.getByRole('heading', { name: 'Sign in to your room' })).toBeVisible()
  expect((await request.post('/api/rooms', { data: { type: 'create' } })).status()).toBe(401)
})
