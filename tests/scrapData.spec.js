// @ts-check
import { test, expect } from '@playwright/test';

test('Extract Latest Tenders and Corrigendums for Central Govt', async ({ page }) => {
    await page.goto('https://eprocure.gov.in/eprocure/app');

    await scrapTableData(page, '#activeTenders tbody tr', 'test-results/Govt-Tenders.json');

    await scrapTableData(page, '#activeCorrigendums tbody tr', 'test-results/Govt-Corrigendums.json');
});

test('Extract Latest Tenders and Corrigendums for Defense', async ({ page }) => {
    await page.goto('https://defproc.gov.in/nicgep/app');

    await scrapTableData(page, '#activeTenders tbody tr', 'test-results/Defense-Tenders.json');

    await scrapTableData(page, '#activeCorrigendums tbody tr', 'test-results/Defense-Corrigendums.json');
});

test('Extract Latest Tenders and Corrigendums for PMGSY', async ({ page }) => {
    await page.goto('https://pmgsytenders.gov.in/nicgep/app');

    await scrapTableData(page, '#activeTenders tbody tr', 'test-results/PMGSY-Tenders.json');

    await scrapTableData(page, '#activeCorrigendums tbody tr', 'test-results/PMGSY-Corrigendums.json');
});

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} filePath
 * @param {string} rowLocator
 */
async function scrapTableData(page, rowLocator, filePath) {

    await expect(page.getByRole('cell', { name: 'Welcome to eProcurement System', exact: true })).toBeVisible()
    
    const rows = await page.locator(rowLocator);

    const count = await rows.count();

    let tableData = [];

    for (let i = 0; i < count; i++) {
        const cells = rows.nth(i).locator('td');

        tableData.push({
            title: await cells.nth(0).innerText(),
            reference: await cells.nth(1).innerText(),
            startDate: await cells.nth(2).innerText(),
            endDate: await cells.nth(3).innerText()
        });
    }

    const fs = require('fs');
    fs.writeFileSync(filePath, JSON.stringify(tableData, null, 2));
}

