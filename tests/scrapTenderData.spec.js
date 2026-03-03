// @ts-nocheck
import { test, expect } from '@playwright/test';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import { API_KEY, MAX_RETRIES, retryDelay } from '../data/constant';

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

test('fetch tender details', async ({ page }) => {

    await page.goto('https://eprocure.gov.in/eprocure/app');
    await expect(page.getByRole('cell', { name: 'Welcome to eProcurement System', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Search', exact: true }).click();
    await page.locator('#TenderType').selectOption('1');
    await page.locator('#tenderRefNo').fill('04/UE(C)/ALLD/PRYJ/2025-26');

    await checkCaptchaIsValid(page);

    await checkIfTenderFound(page);

    await page.screenshot({path:'tenderFound.png'});
    await goToTenderDetails(page);    
});

/**
 * @param {import('@playwright/test').Page} page
 */
async function getBasicDetails(page){
    
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
            const fileName = 'test-results/tender_details.json';
            try {
                fs.writeFileSync(fileName, JSON.stringify(nestedTablesJson, null, 2), 'utf-8');
                console.log(`Successfully saved data to ${fileName}`);
            } catch (err) {
                console.error('Error writing file:', err);
            }

    // fs.writeFileSync('test-results/Tender_details.json', JSON.stringify(nestedTablesJson, null, 2));
}

/**
 * @param {import('@playwright/test').Page} page
 */
async function goToTenderDetails(page){
    await page.locator('#table tbody tr')
    .locator('a[title="View Tender Information"]')
    .first()
    .click();

    await page.waitForTimeout(3000);

    await page.screenshot({path:'tenderInfo.png'});

    if (await page.getByRole('cell', { name: 'Tender Details', exact: true }).isVisible()) {
        //clickOnViewMoreDetails(page)
        await getBasicDetails(page);
    }else{
        throw new Error('Error occurred while clicking on- View Tender Information');
    }
}

/**
 * @param {import('@playwright/test').Page} page
*/
async function clickOnViewMoreDetails(page){
    const page1Promise = page.waitForEvent('popup');
    await page.getByRole('link', { name: 'View More Details' }).click();
    const page1 = await page1Promise;
    await expect(page1.getByRole('cell', { name: 'Print Basic Details' }).nth(2)).toBeVisible();
}

/**
 * @param {import('@playwright/test').Page} page
*/
async function checkIfTenderFound(page){
    const totalRows = await page.locator('#table tr').count();

    if(totalRows==1){
        throw new Error('Tender not found!')
    }
}

/**
 * @param {import('@playwright/test').Page} page
 */
async function checkCaptchaIsValid(page){

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const captchaText = await getCaptchaText(page);
            if(captchaText==undefined){
                continue;
            }

            await page.locator('#captchaText').fill(captchaText);

            await page.getByRole('button', { name: 'Search' }).click();

            await page.waitForTimeout(3000);

            if (await page.getByText('Invalid Captcha! Please Enter').isVisible()) {
                continue;
            } else {
                await page.screenshot({path:'tenderFound.png'})

                await expect(page.locator('#table')).toBeVisible();
                break;
            }
            
        }catch(error){

            if (error instanceof Error) {
                throw new Error(error.message);
            }else{
                if (attempt === MAX_RETRIES) throw new Error("Failed to solve captcha after maximum retries.");
            
                await page.waitForTimeout(retryDelay);
            }
        }
    }
}

/**
 * @param {import('@playwright/test').Page} page
 */
async function getCaptchaText(page){
    const captchaSelector = '#captchaImage';

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const captchaLocator = page.locator(captchaSelector);
            await captchaLocator.waitFor({ state: 'visible' });

            const buffer = await captchaLocator.screenshot();

            const base64String = buffer.toString('base64');
            fs.writeFileSync(`captcha${attempt}.png`, base64String, { encoding: 'base64' });

            const prompt = `Extract the text from the provided captcha image. 
    Strict Rules:
    1. Use ONLY alphanumeric characters: uppercase (A-Z), lowercase (a-z), and numbers (0-9).
    2. DO NOT include special characters, punctuation, or accented letters (no Å, Ý, etc).
    3. Ignore background lines or noise.
    4. Return strictly in this JSON schema:
    {
        "type": "object",
        "properties": {
            "captchaText": { "type": "string" }
        },
        "required": ["captchaText"]
    }`;
            const imagePart = {
                inlineData: {
                data: base64String,
                mimeType: "image/png"
                }
            };

            const result = await model.generateContent([prompt, imagePart]);
            const response = await result.response;

            console.log("Gemini Analysis:", response.text());

            const cleanedText = response.text().replace(/```json|```/g, "").trim();

            const data = JSON.parse(cleanedText);
            const captcha = data.captchaText;

            if(captcha!==undefined){
                return captcha;
            }else{
                await page.getByRole('button', { name: 'Refresh' }).click();
                await page.waitForTimeout(retryDelay);
            }
        }catch(error){
            if (error instanceof Error) {
                throw new Error(`API Call Failed: ${error.message}`);
            } else {
                console.error("An unexpected error occurred:", String(error));
            if (attempt === MAX_RETRIES) throw new Error("Failed to extract captcha from gemini after maximum retries.");
            
            await page.waitForTimeout(retryDelay);
            }            
        }
    }
}