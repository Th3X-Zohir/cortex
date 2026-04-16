const { chromium } = require('/app/node_modules/playwright');
(async () => {
  const browser = await chromium.connect('ws://localhost:6080');
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0];

  console.log('=== GEMINI PAGE INSPECTION ===');
  console.log('URL:', page.url());

  const info = await page.evaluate(() => {
    const results = {};

    // Find all potential input elements
    const allInputs = document.querySelectorAll('[contenteditable], textarea, [role="textbox"], input[type="text"]');
    results.inputs = Array.from(allInputs).map(el => ({
      tag: el.tagName,
      class: el.className.substring(0, 80),
      id: el.id,
      contentEditable: el.contentEditable,
      visible: el.offsetHeight > 0 && el.offsetWidth > 0,
      rect: el.getBoundingClientRect ? JSON.stringify(el.getBoundingClientRect()) : 'n/a'
    }));

    // Find response containers - try many selectors
    const respSelectors = [
      'STRUCTURED-CONTENT-CONTAINER',
      '.model-response-text',
      '[class*="model-response"]',
      '[class*="response"]',
      '[class*="message"]',
      '[data-message-author]',
      '.ql-editor'
    ];
    results.responses = [];
    for (const sel of respSelectors) {
      try {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) {
          results.responses.push({
            selector: sel,
            count: els.length,
            texts: Array.from(els).slice(-3).map(el => el.textContent.trim().slice(0, 60))
          });
        }
      } catch(e) {}
    }

    // Get page text content
    results.pageText = document.body.innerText.slice(0, 500);

    return results;
  });

  console.log('\n--- INPUTS ---');
  for (const inp of info.inputs) {
    console.log(JSON.stringify(inp));
  }

  console.log('\n--- RESPONSE CONTAINERS ---');
  for (const r of info.responses) {
    console.log(JSON.stringify(r));
  }

  console.log('\n--- PAGE TEXT ---');
  console.log(info.pageText);

  await browser.close();
  console.log('\n=== DONE ===');
})().catch(e => console.error('ERROR:', e.message));
