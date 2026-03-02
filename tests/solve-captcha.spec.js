// @ts-check
import { test, expect } from '@playwright/test';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';

const genAI = new GoogleGenerativeAI('AIzaSyBSh61ziaqG4dTWwgffVb71Jo8vkzPifLI');
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

test('Get Captcha Text', async ({ page }) => {

    //await page.goto('https://eprocure.gov.in/cppp/latestactivetendersnew/cpppdata');
    //await expect(page.getByText('Search for Latest Active')).toBeVisible();

    await page.goto('https://eprocure.gov.in/eprocure/app');
    await expect(page.getByRole('cell', { name: 'Welcome to eProcurement System', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Search', exact: true }).click();

    const captchaLocator = page.locator('#captchaImage');
    await captchaLocator.waitFor({ state: 'visible' });

    // const overlappingButtons = page.locator('.submit-btn, .close-ads');

    // await overlappingButtons.evaluateAll(elements => {
    // elements.forEach(el => el.style.display = 'none');
    // });
    const buffer = await captchaLocator.screenshot();

    const base64String = buffer.toString('base64');
    fs.writeFileSync('debug_canvas.png', base64String, { encoding: 'base64' });
    
    const prompt = "Extract text from given captcha image.";
    const imagePart = {
        inlineData: {
        data: base64String,
        mimeType: "image/png"
        }
    };

    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    
    console.log("Gemini Analysis:", response.text());
});
