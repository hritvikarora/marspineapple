#!/usr/bin/env node
/**
 * Viewport screenshot capture for UI review.
 */
import { chromium } from 'playwright-core';

const url = process.argv[2] || 'http://localhost:4177/';
const executablePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const browser = await chromium.launch({ executablePath, headless: true });

// Desktop 1440x900
const pageDesktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await pageDesktop.goto(url, { waitUntil: 'load' });
await pageDesktop.waitForTimeout(1000);
await pageDesktop.screenshot({ path: 'handoffs/task-001-desktop-1440x900.png', fullPage: true });
console.log('Saved handoffs/task-001-desktop-1440x900.png');

// Mobile 390x844
const pageMobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
await pageMobile.goto(url, { waitUntil: 'load' });
await pageMobile.waitForTimeout(1000);
await pageMobile.screenshot({ path: 'handoffs/task-001-mobile-390x844.png', fullPage: true });
console.log('Saved handoffs/task-001-mobile-390x844.png');

await browser.close();
