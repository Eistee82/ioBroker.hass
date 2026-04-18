import { test, expect } from '@playwright/test';

const HASS_HOST = process.env.HASS_HOST ?? '192.168.178.151';
const HASS_PORT = process.env.HASS_PORT ?? '8123';
const HASS_LLT = process.env.HASS_LLT ?? '';

test.describe('v2 baseline — admin UI reachable', () => {
    test('Admin UI loads on port 8081', async ({ page }) => {
        await page.goto('/');
        await expect(page).toHaveTitle(/ioBroker|Admin/i);
    });

    test('HASS instance config page is reachable', async ({ page }) => {
        await page.goto('/#tab-instances');
        await page.waitForSelector('body', { state: 'visible' });
        expect(HASS_HOST).not.toEqual('');
        expect(HASS_LLT.length).toBeGreaterThan(20);
    });

    test('HASS-VM REST API reachable', async ({ request }) => {
        const response = await request.get(`http://${HASS_HOST}:${HASS_PORT}/api/`, {
            headers: { Authorization: `Bearer ${HASS_LLT}` },
        });
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body).toEqual({ message: 'API running.' });
    });
});
