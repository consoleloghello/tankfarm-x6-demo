/**
 * 自测脚本共用的浏览器启动器。
 *
 * 不再写死某一台机器的 Chrome 路径，按以下顺序自动查找：
 *   1. 环境变量 CHROME_PATH
 *   2. Playwright 下载的 Chromium（macOS / Linux / Windows 的常见缓存位置）
 *   3. 系统已安装的 Chrome / Chromium
 *   4. 都找不到 → 交给 Playwright 自己按 channel 去找
 *
 * 用法：
 *   node scripts/test-interactions.mjs                        # 默认 http://localhost:5188/
 *   node scripts/test-interactions.mjs http://localhost:5188/
 *   CHROME_PATH="/path/to/chrome" node scripts/shot.mjs
 */
import { chromium } from 'playwright-core';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Playwright 缓存里形如 chromium-1243 的目录，取版本号最大的那个 */
function newestChromiumDir() {
  const roots = [
    join(homedir(), 'Library/Caches/ms-playwright'), // macOS
    join(homedir(), '.cache/ms-playwright'), // Linux
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'ms-playwright') : '', // Windows
  ].filter(Boolean);

  const candidates = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const dir of readdirSync(root)) {
      if (!dir.startsWith('chromium-')) continue;
      const base = join(root, dir);
      candidates.push(
        join(
          base,
          'chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
        ),
        join(base, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
        join(base, 'chrome-linux/chrome'),
        join(base, 'chrome-linux64/chrome'),
        join(base, 'chrome-win/chrome.exe'),
      );
    }
  }
  // 目录名里带版本号，倒序保证先用新版
  return candidates.reverse().find((p) => existsSync(p));
}

function systemChrome() {
  return [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ].find((p) => existsSync(p));
}

export function resolveExecutablePath() {
  const found = process.env.CHROME_PATH || newestChromiumDir() || systemChrome();
  if (found && !existsSync(found)) {
    console.warn(`⚠️  CHROME_PATH 指向的文件不存在：${found}`);
    return undefined;
  }
  return found;
}

/** 启动浏览器；找不到可执行文件时退回 Playwright 的 channel 探测 */
export async function launchBrowser() {
  const executablePath = resolveExecutablePath();
  if (executablePath) return chromium.launch({ executablePath });
  console.warn('⚠️  未找到 Chrome/Chromium，尝试用 Playwright 默认 channel 启动…');
  return chromium.launch({ channel: 'chrome' });
}

/** 确认目标地址可访问，给出比超时更友好的提示 */
export async function assertReachable(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    console.error(`\n❌ 无法访问 ${url}（${err.message}）`);
    console.error('   请先在另一个终端启动开发服务：\n     npm run dev\n');
    process.exit(1);
  }
}

export async function newPage(browser, { viewport = { width: 1680, height: 1000 }, scale = 1 } = {}) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: scale });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return { page, errors };
}
