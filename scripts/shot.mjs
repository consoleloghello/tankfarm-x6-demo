/**
 * 用 Playwright 打开本地 Demo，截图（初始 / 流动 / 演示中三张）并收集控制台错误。
 * 仅用于开发期自测。
 *
 * 用法：
 *   npm run dev                       # 另开一个终端
 *   node scripts/shot.mjs [url] [输出文件名前缀]
 */
import { assertReachable, launchBrowser, newPage } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:5188/';
const out = process.argv[3] ?? 'shots/demo.png';

await assertReachable(url);

const browser = await launchBrowser();
const { page, errors: logs } = await newPage(browser, { scale: 2 });

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// 场景 1：初始状态（全部阀关、泵停）
await page.screenshot({ path: out.replace('.png', '-initial.png') });

// 场景 2：点击几个阀门，观察流动变化
const nodes = ['V-101', 'V-103', 'V-104', 'V-105'];
for (const id of nodes) {
  const cell = await page.evaluate((cellId) => {
    const g = window.__graph;
    if (!g) return null;
    const c = g.getCellById(cellId);
    if (!c) return null;
    const view = g.findViewByCell(c);
    const box = view.container.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }, id);
  if (cell) await page.mouse.click(cell.x, cell.y);
  await page.waitForTimeout(220);
}
await page.waitForTimeout(600);
await page.screenshot({ path: out.replace('.png', '-flowing.png') });

// 场景 3：跑一遍操作规程演示
await page.selectOption('#op-select', 'op1').catch(() => {});
await page.waitForTimeout(400);
for (let i = 0; i < 5; i += 1) {
  await page.click('#btn-next').catch(() => {});
  await page.waitForTimeout(260);
}
await page.click('#btn-json-toggle').catch(() => {});
await page.waitForTimeout(700);
await page.screenshot({ path: out.replace('.png', '-demo.png') });

const stats = await page.textContent('#stats').catch(() => '');
const caption = await page.textContent('#step-caption').catch(() => '');
console.log('--- stats ---\n' + (stats ?? '').trim());
console.log('--- caption ---\n' + (caption ?? '').trim().slice(0, 600));
console.log('--- console/errors ---\n' + (logs.length ? logs.join('\n') : '(无)'));
await browser.close();
