import { expect, test, type Page } from '@playwright/test';

// Shared links (account/links.ts): a friend's link opens the online screen
// with their code ready to add. In the phone apps the same link opens the
// app (app links), which reads it the same way.

const NO_STATS = { onlinePlayed: 0, onlineWon: 0, cpuPlayed: 0, cpuWon: 0, popped: 0, damage: 0, streak: 0, bestStreak: 0, selfDamage: 0, selfPopped: 0, rating: 1000, ratedGames: 0 };
const cors = { 'access-control-allow-origin': 'http://localhost:4173', 'access-control-allow-credentials': 'true' };

async function signedIn(page: Page): Promise<void> {
  await page.route('http://localhost:8787/api/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ user: { id: 'u', name: 'Sam', email: 's@example.com', createdAt: '2026-01-01' }, owned: [], wallet: { coins: 0, slime: 0 }, stats: NO_STATS, shop: false, providers: [] }) }),
  );
  await page.route('http://localhost:8787/api/friends', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ code: 'MYCODE12', friends: [], requests: [], sent: [] }) }),
  );
}

test("a friend's link fills in their code, ready to add", async ({ page }) => {
  await signedIn(page);
  await page.goto('/?friend=K7P2Q9XZ');
  await expect(page.locator('.code-input').last()).toHaveValue('K7P2Q9XZ');
  await expect(page.getByText('Your friend’s code is filled in: tap Add.')).toBeVisible();
  // Taken out of the address bar, and used once.
  expect(new URL(page.url()).search).toBe('');
  await page.reload();
  await expect(page.locator('.lobby, .lobby-nav').first()).toBeVisible();
});

test("signed out, a friend's link says to sign in first and keeps the code", async ({ page }) => {
  await page.goto('/?friend=K7P2Q9XZ');
  await expect(page.getByText('To add your friend, sign in first (Account). Their code will be waiting.')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('tardigeddon.friendLink'))).toBe('K7P2Q9XZ');
});

test('sharing your friend code shares a link that adds you', async ({ page }) => {
  await signedIn(page);
  await page.addInitScript(() => {
    // No share sheet here: the text goes to the clipboard.
    Object.defineProperty(navigator, 'share', { value: undefined });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: (s: string) => ((window as unknown as { copied: string }).copied = s, Promise.resolve()) } });
  });
  await page.goto('/?friend=MYCODE12'); // your own code: opens the online screen, nothing filled in
  await expect(page.locator('.code-input').last()).toHaveValue('');
  await page.getByRole('button', { name: /Your code: MYCODE12/ }).click();
  const copied = await page.evaluate(() => (window as unknown as { copied: string }).copied);
  expect(copied).toContain('?friend=MYCODE12');
});
