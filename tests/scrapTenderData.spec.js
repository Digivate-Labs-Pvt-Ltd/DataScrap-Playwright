// @ts-check
import { test, expect } from '@playwright/test';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';

const genAI = new GoogleGenerativeAI('Add your gemini key');
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

test('fetch tender details', async ({ page }) => {

    await page.goto('https://eprocure.gov.in/eprocure/app');
    await expect(page.getByRole('cell', { name: 'Welcome to eProcurement System', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Search', exact: true }).click();
    await page.locator('#TenderType').selectOption('1');
    await page.locator('#tenderRefNo').fill('04/UE(C)/ALLD/PRYJ/2025-26');

    await checkCaptchaIsValid(page);

    await checkIfTenderFound(page);

    await goToTenderDetails(page);    
});

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
        clickOnViewMoreDetails(page)
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
    const MAX_RETRIES = 3;

    const retryDelay = 3000;

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
                //await page.screenshot({path:'tenderInfo.png'})

                await expect(page.locator('#table')).toBeVisible();
                break;
            }
            
        }catch(error){
            if (attempt === MAX_RETRIES) throw new Error("Failed to solve captcha after maximum retries.");
            
            await page.waitForTimeout(retryDelay);
        }
    }
}

/**
 * @param {import('@playwright/test').Page} page
 */
async function getCaptchaText(page){
    const captchaSelector = '#captchaImage';

    const MAX_RETRIES = 10;

    const retryDelay = 3000;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const captchaLocator = page.locator(captchaSelector);
            await captchaLocator.waitFor({ state: 'visible' });

            const buffer = await captchaLocator.screenshot();

            const base64String = buffer.toString('base64');
            fs.writeFileSync('debug_canvas.png', base64String, { encoding: 'base64' });

            const prompt = `Give me written letters from given captcha image in the given schema
                    {
                        "type": "object",
                        "properties": {
                            "captchaText": {
                            "type": "string"
                            }
                        },
                        "required": [
                            "captchaText"
                        ]
                    }`
            const imagePart = {
                inlineData: {
                data: base64String,
                mimeType: "image/png"
                }
            };

            const result = await model.generateContent([prompt, imagePart]);
            const response = await result.response;

            console.log("Gemini Analysis:", response.text());

            const data = JSON.parse(response.text());
            const captcha = data.captchaText;

            if(captcha!==undefined){
                return captcha;
            }else{
                await page.getByRole('button', { name: 'Refresh' }).click();
                await page.waitForTimeout(retryDelay);
            }
        }catch(error){
            if (error instanceof Error) {
                console.error("API Call Failed:", error.message);
            } else {
                console.error("An unexpected error occurred:", String(error));
            }

            if (attempt === MAX_RETRIES) throw new Error("Failed to extract captcha from gemini after maximum retries.");
            
            await page.waitForTimeout(retryDelay);
        }
    }
}