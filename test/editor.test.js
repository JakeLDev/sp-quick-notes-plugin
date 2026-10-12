// Runs index.html in headless Chromium with a fake PluginAPI. The editor depends on Chromium editing behavior, so a fake DOM is not enough.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
let browser;

before(async () => { browser = await chromium.launch(); });
after(async () => { await browser?.close(); });

// Opens the pane with `notes` as the saved data. `window.saved` holds the last persisted text.
async function open(notes = '', { loadDelay = 0 } = {}) {
  const page = await browser.newPage();
  page.setDefaultTimeout(2000);
  // setContent does not run addInitScript, so the fake API goes in front of the page.
  const mock = `<script>
    window.saves = [];
    window.PluginAPI = {
      loadSyncedData: () => new Promise((r) => setTimeout(() => r(${JSON.stringify(notes).replace(/</g, '\\u003c')}), ${loadDelay})),
      persistDataSynced: async (t) => { window.saves.push(t); },
    };
  </script>`;
  await page.setContent(mock + html);
  if (!loadDelay) await page.waitForSelector('#editor[contenteditable="true"]');
  return page;
}

// Blur flushes the debounced save, so tests do not wait 500 ms.
async function savedText(page) {
  await page.evaluate(() => document.getElementById('editor').blur());
  await page.waitForFunction(() => document.getElementById('status').textContent === 'Saved');
  return page.evaluate(() => window.saves.at(-1));
}

async function typeLines(page, lines) {
  for (const [i, line] of lines.entries()) {
    if (i) await page.keyboard.press('Enter');
    await page.keyboard.type(line);
  }
}

const SAMPLE = [
  '# Back from break',
  '- [x] reply to Sam',
  '- [ ] rerun build',
  '  - check flaky test',
  '## Later',
  '3. lunch',
  '4. 1:1 prep',
  '',
  'plain line',
].join('\n');

test('loads markdown as formatted blocks', async () => {
  const page = await open(SAMPLE);
  const shape = await page.evaluate(() => [...document.querySelectorAll('#editor h2, #editor h3, #editor li, #editor p')]
    .map((el) => `${el.tagName}.${el.className}:${el.textContent}`));
  assert.deepEqual(shape, [
    'H2.:Back from break',
    'LI.task done:reply to Sam',
    'LI.task:rerun build',
    'LI.:check flaky test',
    'H3.:Later',
    'LI.:lunch',
    'LI.:1:1 prep',
    'P.:',
    'P.:plain line',
  ]);
  assert.equal(await page.$eval('#editor ol', (ol) => ol.start), 3);
  await page.close();
});

test('saves loaded markdown back unchanged', async () => {
  const page = await open(SAMPLE);
  await page.click('#editor p:last-child');
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  assert.equal(await savedText(page), SAMPLE + '!');
  await page.close();
});

test('markdown shortcuts while typing', async () => {
  const page = await open();
  await typeLines(page, ['# Title', '## Sub', '### Small', '- bullet', '']);
  await page.keyboard.press('Enter'); // empty item ends the list
  await typeLines(page, ['[] task', '[x] done', '- [ ] dash task', '']);
  await page.keyboard.press('Enter');
  await typeLines(page, ['5. five', 'six']);
  assert.equal(await savedText(page), [
    '# Title', '## Sub', '### Small', '- bullet', '- [ ] task', '- [x] done', '- [ ] dash task', '5. five', '6. six',
  ].join('\n'));
  await page.close();
});

test('Enter after a ticked task gives an unticked task', async () => {
  const page = await open('- [x] done');
  await page.click('#editor li');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('next');
  assert.equal(await savedText(page), '- [x] done\n- [ ] next');
  await page.close();
});

test('Tab nests and Shift+Tab un-nests', async () => {
  const page = await open();
  await typeLines(page, ['1. first', '']);
  await page.keyboard.press('Tab');
  await page.keyboard.type('sub');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('deep');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.type('second');
  assert.equal(await savedText(page), '1. first\n  1. sub\n    1. deep\n2. second');
  const styles = await page.$$eval('#editor li', (lis) => lis.map((li) => getComputedStyle(li).listStyleType));
  assert.deepEqual(styles, ['decimal', 'lower-alpha', 'lower-roman', 'decimal']);
  await page.close();
});

test('click on the box ticks, click on the text does not', async () => {
  const page = await open('- [ ] one\n- [ ] two');
  const [one, two] = await page.$$('#editor li');
  await one.click({ position: { x: 6, y: 10 } });
  await two.click({ position: { x: 60, y: 10 } });
  assert.equal(await savedText(page), '- [x] one\n- [ ] two');
  await page.close();
});

test('Cmd/Ctrl+Enter ticks the task at the caret', async () => {
  const page = await open('- [ ] one');
  await page.click('#editor li', { position: { x: 40, y: 10 } });
  await page.keyboard.press('ControlOrMeta+Enter');
  assert.equal(await savedText(page), '- [x] one');
  await page.close();
});

test('Backspace at line start removes heading and task format', async () => {
  const page = await open('# Head\n- [ ] task');
  await page.click('#editor h2');
  await page.keyboard.press('Home');
  await page.keyboard.press('Backspace');
  await page.click('#editor li', { position: { x: 40, y: 10 } });
  await page.keyboard.press('Home');
  await page.keyboard.press('Backspace');
  assert.equal(await savedText(page), 'Head\n- task');
  await page.close();
});

test('bold shortcut is blocked', async () => {
  const page = await open();
  await page.keyboard.press('ControlOrMeta+b');
  await page.keyboard.type('text');
  assert.equal(await page.$('#editor b, #editor strong'), null);
  assert.equal(await savedText(page), 'text');
  await page.close();
});

test('note text never becomes HTML', async () => {
  const page = await open('<img src=x onerror="window.hacked=1">\n- <b>bold</b>');
  assert.equal(await page.$('#editor img, #editor b'), null);
  assert.equal(await page.evaluate(() => window.hacked), undefined);
  await page.close();
});

test('editor is locked until notes load', async () => {
  const page = await open('saved notes', { loadDelay: 300 });
  assert.equal(await page.$eval('#editor', (e) => e.contentEditable), 'false');
  await page.waitForSelector('#editor[contenteditable="true"]');
  assert.equal(await page.$eval('#editor', (e) => e.textContent), 'saved notes');
  assert.deepEqual(await page.evaluate(() => window.saves), []);
  await page.close();
});
