const { test, expect } = require('@playwright/test');
const fs = require('fs');

test.describe('Tender Details Extraction data', () => {
    // test.use({ headless: false });
    test('Extract and Save Tender Details', async ({ page }) => {
        // 1. Navigate to the portal
        await page.goto('https://eprocure.gov.in/eprocure/app');

        // 2. Validate Title
        await expect(page).toHaveTitle('eProcurement System Government of India');

        // 3. Search with ID/Title/Reference no.
        const searchInput = 'input[name="SearchDescription"]';
        const searchReference = '04/UE(C)/ALLD/PRYJ/2025-26';
        
        await page.fill(searchInput, searchReference);
        
        // Assert the input value
        const inputValue = await page.inputValue(searchInput);
        expect(inputValue).toBe(searchReference);

        // Click Search/Go
        await page.click('input[name="Go"]');

        // 4. Click the search result link
        // Playwright auto-waits for the selector to be visible and enabled
        const tenderLink = page.locator('#DirectLink_0');
        await tenderLink.click();

        // 5. Extraction Logic (Running inside the browser context)
        // We use page.evaluate just like in Puppeteer, but with Playwright's cleaner syntax
        const nestedTablesJson = await page.evaluate(() => {
            const results = {};
            const headerTexts = Array.from(document.querySelectorAll('.textbold1'));

            headerTexts.forEach(headerEl => {
                const sectionName = headerEl.innerText.replace(/\s+/g, ' ').trim();
                if (!sectionName || sectionName === "Tender Details") return;

                let headerRow = headerEl.closest('td.pageheader')?.parentElement;
                if (!headerRow) return;

                let dataRow = headerRow.nextElementSibling;
                while (dataRow && dataRow.innerText.trim() === "") {
                    dataRow = dataRow.nextElementSibling;
                }

                if (!dataRow) return;

                const dataTable = dataRow.querySelector('table.tablebg, table.list_table, table#packetTableView');
                if (!dataTable) return;

                // --- SPECIFIC FIX FOR COVERS INFORMATION ---
                if (sectionName.includes("Covers Information") || dataTable.id === "packetTableView") {
                    const rows = Array.from(dataTable.querySelectorAll('tr'));
                    const headerRowEl = rows.find(r => r.classList.contains('list_header')) || rows[0];
                    const keys = Array.from(headerRowEl.querySelectorAll('td')).map(td => td.innerText.trim());

                    results[sectionName] = rows
                        .filter(row => {
                            const cells = row.querySelectorAll('td');
                            const rowText = row.innerText.toLowerCase();
                            if (row === headerRowEl) return false;
                            if (cells.length !== keys.length) return false;
                            if (rowText.includes("cover no") && rowText.includes("document type")) return false;
                            return row.innerText.trim() !== "";
                        })
                        .map(row => {
                            const cells = Array.from(row.querySelectorAll('td'));
                            let obj = {};
                            keys.forEach((key, i) => {
                                if (key && cells[i]) {
                                    obj[key] = cells[i].innerText.trim();
                                }
                            });
                            return obj;
                        });
                } else {
                    // Standard Key-Value logic
                    const sectionData = {};
                    const rows = Array.from(dataTable.querySelectorAll('tr'));

                    rows.forEach(row => {
                        const captions = Array.from(row.querySelectorAll('td.td_caption'));
                        const fields = Array.from(row.querySelectorAll('td.td_field'));

                        captions.forEach((cap, index) => {
                            const key = cap.innerText.replace(/\s+/g, ' ').trim();
                            const field = fields[index];

                            if (key && field) {
                                const nestedTable = field.querySelector('table.list_table');
                                if (nestedTable) {
                                    const subRows = Array.from(nestedTable.querySelectorAll('tr'));
                                    const subHeaderRow = subRows.find(r => r.classList.contains('list_header')) || subRows[0];
                                    const subHeaders = Array.from(subHeaderRow.querySelectorAll('td')).map(td => td.innerText.trim());

                                    sectionData[key] = subRows
                                        .filter(sr => {
                                            const srText = sr.innerText.toLowerCase();
                                            return sr !== subHeaderRow && sr.innerText.trim() !== "" && !srText.includes("document name");
                                        })
                                        .map(subRow => {
                                            const cells = Array.from(subRow.querySelectorAll('td'));
                                            let obj = {};
                                            subHeaders.forEach((h, i) => {
                                                if (h && cells[i]) obj[h] = cells[i].innerText.trim();
                                            });
                                            return obj;
                                        });
                                } else {
                                    sectionData[key] = field.innerText.replace(/\s+/g, ' ').trim();
                                }
                            }
                        });
                    });
                    results[sectionName] = sectionData;
                }
            });

            return results;
        });

        // 6. Save data to file
        const fileName = 'tender_details.json';
        try {
            fs.writeFileSync(fileName, JSON.stringify(nestedTablesJson, null, 2), 'utf-8');
            console.log(`Successfully saved data to ${fileName}`);
        } catch (err) {
            console.error('Error writing file:', err);
        }
    });
});