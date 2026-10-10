/**
 * 交互自测：图元添加 / 拖动 / 模式权限 / 撤销 / 导出 / 业务数据 / 演示播放
 *
 * 用法：
 *   npm run dev        # 另开一个终端
 *   npm test           # 或 node scripts/test-interactions.mjs [url]
 *
 * 失败时退出码为 1，可直接用于 CI。
 */
import { assertReachable, launchBrowser, newPage } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:5188/';

await assertReachable(url);

const browser = await launchBrowser();
const { page, errors } = await newPage(browser);
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

const pass = [], fail = [];
const check = (name, ok, extra = '') => (ok ? pass : fail).push(`${ok ? '✅' : '❌'} ${name} ${extra}`);
const count = () => page.evaluate(() => window.__graph.getNodes().length);
const pos = (id) => page.evaluate((i) => {
  const p = window.__graph.getCellById(i).getPosition();
  return { x: Math.round(p.x), y: Math.round(p.y) };
}, id);
const screen = (id) => page.evaluate((i) => {
  const g = window.__graph, c = g.getCellById(i), v = g.findViewByCell(c);
  const r = v.container.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}, id);

// 1) 图元添加
const before = await count();
await page.click('.pal-item >> nth=0');
await page.click('.pal-item >> nth=2');
await page.waitForTimeout(300);
const after = await count();
check('图元面板新增设备', after === before + 2, `(${before} → ${after})`);
const newTags = await page.evaluate(() =>
  window.__graph.getNodes().map((n) => n.getData()?.tag).filter((t) => t && /-1$|05$|06$/.test(t)).slice(-3));
check('自动编号位号', newTags.length > 0, JSON.stringify(newTags));

// 2) 编辑模式拖动
const p0 = await pos('T-101');
let s = await screen('T-101');
await page.mouse.move(s.x, s.y);
await page.mouse.down();
await page.mouse.move(s.x + 90, s.y + 60, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(250);
const p1 = await pos('T-101');
check('编辑模式可拖动设备', p1.x !== p0.x || p1.y !== p0.y, `${JSON.stringify(p0)} → ${JSON.stringify(p1)}`);

// 3) 撤销
await page.click('#btn-undo');
await page.waitForTimeout(250);
const p2 = await pos('T-101');
check('撤销生效', p2.x === p0.x && p2.y === p0.y, JSON.stringify(p2));

// 4) 查看模式禁止拖动
await page.click('[data-mode="view"]');
await page.waitForTimeout(200);
const pvBefore = await pos('T-103');
s = await screen('T-103');
await page.mouse.move(s.x, s.y);
await page.mouse.down();
await page.mouse.move(s.x - 120, s.y + 40, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(250);
const pv = await pos('T-103');
check('查看模式锁定布局', pv.x === pvBefore.x && pv.y === pvBefore.y, JSON.stringify(pv));

// 5) 查看模式下仍可点击阀门切换状态
await page.click('[data-mode="edit"]');
const v = await screen('V-101');
await page.mouse.click(v.x, v.y);
await page.waitForTimeout(300);
const st = await page.evaluate(() => window.__graph.getCellById('V-101').getData().state);
check('点击阀门切换状态', st === 'open', `state=${st}`);

// 6) 导出 JSON / PNG
await page.click('#btn-json-toggle');
await page.waitForTimeout(300);
const dl1 = page.waitForEvent('download', { timeout: 8000 });
await page.click('#btn-export-json');
check('导出业务数据 JSON', !!(await dl1), '');
const dl2 = page.waitForEvent('download', { timeout: 15000 });
await page.click('#btn-export-png');
check('导出 PNG', !!(await dl2), '');

// 7) 业务数据里包含自动推导的流动信息
const domain = await page.evaluate(() => document.getElementById('json-view').textContent);
check('业务数据含邻接表', domain.includes('adjacency'));
check('业务数据含连通判定', domain.includes('flowingPipes') || domain.includes('connectivity'));

// 8) 演示播放
await page.selectOption('#op-select', 'op3');
await page.waitForTimeout(300);
await page.click('#btn-next');
await page.click('#btn-next');
await page.waitForTimeout(400);
const caption = await page.textContent('#step-caption');
check('演示脚本可播放', /界区/.test(caption ?? ''), '');

console.log([...pass, ...fail].join('\n'));
console.log(`\n通过 ${pass.length} 项，失败 ${fail.length} 项`);
console.log('控制台错误：' + (errors.length ? errors.join(' | ') : '无'));
await browser.close();

// 失败时返回非 0 退出码，方便接入 CI
if (fail.length || errors.length) process.exit(1);
