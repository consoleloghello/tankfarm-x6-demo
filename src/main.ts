/**
 * 化工罐区工艺流程交互图 Demo
 * ------------------------------------------------------------------
 *  技术：AntV X6 2.x（MIT）
 *  能力：交互查看 / 拖拽编辑 / 图元连线 / 状态联动 / 流动动画
 *        / 操作规程演示 / 拓扑自动推导 / 画布 → 业务数据导出
 */
import { Graph } from '@antv/x6';
import { Selection } from '@antv/x6-plugin-selection';
import { History } from '@antv/x6-plugin-history';
import { Keyboard } from '@antv/x6-plugin-keyboard';
import { Snapline } from '@antv/x6-plugin-snapline';
import { Export } from '@antv/x6-plugin-export';

import './styles.css';
import { SHAPE, SIZE, PREVIEWS, registerShapes, renderCell, renderAll } from './shapes';
import { buildInitialGraph, OPERATIONS, type DemoOperation } from './demo-data';
import {
  applyFocus,
  applyStep,
  buildStats,
  clearVisual,
  computeWetEdges,
  findPath,
  refreshFlow,
  startFlowLoop,
} from './ops';
import { buildDomainExport } from './domain-export';

/* ================================================================== *
 *  1. 基础准备
 * ================================================================== */
registerShapes();

const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

let mode: 'view' | 'edit' = 'edit';
let animateFlow = true;
let showPipeLabels = true;
let wetEdges: Set<string> = new Set();

/** 连接规则：出口 → 进口；不允许自连、重复连、空白连 */
function portDir(cell: any, portId?: string | null): string {
  if (!cell) return 'bi';
  const ports: any[] = cell.getPorts?.() ?? [];
  const hit = ports.find((p) => p.id === portId);
  return hit?.data?.dir ?? 'bi';
}

/* ================================================================== *
 *  2. 创建画布（图 = 数据的视图）
 * ================================================================== */
const graph = new Graph({
  container: $<HTMLDivElement>('graph-container'),
  background: { color: '#f4f7fb' },
  grid: {
    visible: true,
    type: 'dot',
    size: 20,
    args: { color: '#d8e2ef', thickness: 1.4 },
  },
  panning: {
    enabled: true,
    eventTypes: ['leftMouseDown', 'rightMouseDown'],
  },
  mousewheel: {
    enabled: true,
    modifiers: ['ctrl', 'meta'],
    minScale: 0.4,
    maxScale: 2.4,
  },
  connecting: {
    snap: { radius: 32 },
    allowBlank: false,
    allowLoop: false,
    allowMulti: false,
    allowNode: false,
    allowEdge: false,
    highlight: true,
    createEdge: () => graph.createEdge({ shape: SHAPE.pipe }),
    validateMagnet: ({ cell, magnet }: any) =>
      portDir(cell, magnet?.getAttribute('port')) !== 'in',
    validateConnection: ({ sourceCell, sourcePort, targetCell, targetPort }: any) => {
      if (!sourceCell || !targetCell || sourceCell.id === targetCell.id) return false;
      if (portDir(sourceCell, sourcePort) === 'in') return false;
      if (portDir(targetCell, targetPort) === 'out') return false;
      return true;
    },
  },
  // 函数式权限：查看模式下不可拖动 / 不可连线
  interacting: () => {
    if (mode === 'view') {
      return {
        nodeMovable: false,
        edgeMovable: false,
        vertexMovable: false,
        edgeLabelMovable: false,
        arrowheadMovable: false,
        edgeEditable: false,
        edgeConnectable: false,
        magnetConnectable: false,
      };
    }
    return {
      nodeMovable: true,
      edgeMovable: true,
      vertexMovable: true,
      edgeLabelMovable: false,
      arrowheadMovable: false,
      edgeEditable: false,
      edgeConnectable: true,
      magnetConnectable: true,
    };
  },
  highlighting: {
    magnetAvailable: {
      name: 'stroke',
      args: { padding: 4, attrs: { stroke: '#f59e0b', strokeWidth: 3 } },
    },
    magnetAdsorbed: {
      name: 'stroke',
      args: { padding: 4, attrs: { stroke: '#1d6fe0', strokeWidth: 4 } },
    },
  },
} as any);

graph.use(
  new Selection({
    enabled: true,
    multiple: true,
    rubberband: true,
    modifiers: 'shift',
    showNodeSelectionBox: true,
    pointerEvents: 'none',
  }),
);
graph.use(new History({ enabled: true }));
graph.use(new Keyboard({ enabled: true, global: true }));
graph.use(new Snapline({ enabled: true, sharp: true }));
graph.use(new Export() as any);

graph.bindKey(['ctrl+z', 'meta+z'], () => {
  if (graph.canUndo()) graph.undo();
  return false;
});
graph.bindKey(['ctrl+shift+z', 'meta+shift+z'], () => {
  if (graph.canRedo()) graph.redo();
  return false;
});
graph.bindKey(['delete', 'backspace'], () => {
  const cells = graph.getSelectedCells();
  if (cells.length && mode === 'edit') graph.removeCells(cells);
  return false;
});

/* ================================================================== *
 *  3. 图元库（点击添加到画布中心）
 * ================================================================== */
interface PaletteItem {
  shape: string;
  label: string;
  size: { width: number; height: number };
  data: Record<string, unknown>;
}

const PALETTE: PaletteItem[] = [
  {
    shape: SHAPE.tank,
    label: '储罐',
    size: SIZE.tank,
    data: { kind: 'tank', tag: '', name: '储罐', level: 0.5, medium: '' },
  },
  {
    shape: SHAPE.pump,
    label: '泵',
    size: SIZE.pump,
    data: { kind: 'pump', tag: '', name: '泵', state: 'stopped', medium: '' },
  },
  {
    shape: SHAPE.valve,
    label: '切断阀',
    size: SIZE.valve,
    data: { kind: 'valve', tag: '', name: '切断阀', state: 'closed', medium: '' },
  },
  {
    shape: SHAPE.cvalve,
    label: '调节阀',
    size: SIZE.cvalve,
    data: { kind: 'cvalve', tag: '', name: '调节阀', state: 'closed', medium: '' },
  },
  {
    shape: SHAPE.tee,
    label: '汇管',
    size: SIZE.tee,
    data: { kind: 'tee', tag: '', name: '汇管' },
  },
  {
    shape: SHAPE.boundary,
    label: '界区',
    size: SIZE.boundary,
    data: { kind: 'boundary', tag: '', name: '界区' },
  },
];

let dropOffset = 0;

/** 保证 cell id 唯一（便于在数据结构里一眼认出设备） */
function uniqueId(base: string): string {
  if (!graph.getCellById(base)) return base;
  let i = 2;
  while (graph.getCellById(`${base}-${i}`)) i += 1;
  return `${base}-${i}`;
}

/** 在画布可视区域中心添加一个图元 */
function addAtCenter(item: PaletteItem) {
  if (mode !== 'edit') {
    setCaption('当前是<b>查看模式</b>，无法新增图元。请点击右上角「编辑模式」。');
    return;
  }
  const rect = graph.container.getBoundingClientRect();
  const center = graph.clientToLocal(rect.left + rect.width / 2, rect.top + rect.height / 2);
  const step = (dropOffset % 5) * 26;
  dropOffset += 1;

  const tag = (item.data.tag as string) || nextTag(item.shape);
  const node = graph.addNode({
    id: uniqueId(tag),
    shape: item.shape,
    x: Math.round(center.x - item.size.width / 2 + step),
    y: Math.round(center.y - item.size.height / 2 + step),
    data: { ...item.data, tag },
  });
  graph.cleanSelection();
  graph.select(node);
  setCaption(
    `已添加 <b>${node.getData()?.tag}</b>。选中后可在右侧属性面板修改位号、状态等数据；从黄色连接桩拖拽即可连线。`,
  );
}

function buildPalette() {
  const box = $<HTMLDivElement>('palette');
  box.innerHTML = '';
  PALETTE.forEach((item) => {
    const btn = document.createElement('button');
    btn.className = 'pal-item';
    btn.type = 'button';
    btn.innerHTML = `<span class="pal-icon">${PREVIEWS[item.shape] ?? ''}</span><span class="pal-label">${item.label}</span>`;
    btn.addEventListener('click', () => addAtCenter(item));
    box.appendChild(btn);
  });
}

buildPalette();

/* ================================================================== *
 *  4. 数据 → 画面（自动渲染 & 自动编号）
 * ================================================================== */
function nextTag(shape: string): string {
  const prefix =
    shape === SHAPE.tank ? 'T' : shape === SHAPE.pump ? 'P' : shape === SHAPE.tee ? 'J' : 'V';
  let max = 0;
  graph.getNodes().forEach((node: any) => {
    const tag: string = node.getData()?.tag ?? '';
    const m = new RegExp(`^${prefix}-(\\d+)$`).exec(tag);
    if (m) max = Math.max(max, Number(m[1]));
  });
  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
}

function nextPipeTag(): string {
  let max = 0;
  graph.getEdges().forEach((edge: any) => {
    const m = /^L-(\d+)$/.exec(edge.getData()?.tag ?? '');
    if (m) max = Math.max(max, Number(m[1]));
  });
  return `L-${String(max + 1).padStart(3, '0')}`;
}

graph.on('node:added', ({ node }: any) => {
  const data = { ...(node.getData() ?? {}) };
  if (!data.tag) data.tag = nextTag(node.shape);
  if (!data.name) data.name = data.tag;
  if (data.state === undefined) {
    if (node.shape === SHAPE.valve || node.shape === SHAPE.cvalve) data.state = 'closed';
    if (node.shape === SHAPE.pump) data.state = 'stopped';
  }
  if (node.shape === SHAPE.tank && data.level === undefined) data.level = 0.5;
  node.setData(data, { silent: true });
  renderCell(node);
  scheduleRefresh(0);
});

graph.on('edge:added', ({ edge }: any) => {
  const data = { ...(edge.getData() ?? {}) };
  if (!data.tag) data.tag = nextPipeTag();
  if (!data.kind) data.kind = 'pipe';
  edge.setData(data, { silent: true });
  renderCell(edge);
  scheduleRefresh(0);
});

graph.on('node:removed', () => scheduleRefresh(0));
graph.on('edge:removed', () => scheduleRefresh(0));
graph.on('cell:change:data', () => scheduleRefresh(0));
graph.on('edge:connected', () => scheduleRefresh(0));

/* 状态联动：点击阀门 / 泵切换状态，画面与数据同时变化 */
let downPoint = { x: 0, y: 0 };

graph.on('node:mousedown', ({ e }: any) => {
  downPoint = { x: e.clientX, y: e.clientY };
});

graph.on('node:click', ({ node, e }: any) => {
  if (Math.abs(e.clientX - downPoint.x) + Math.abs(e.clientY - downPoint.y) > 4) return;
  const toggleable = [SHAPE.valve, SHAPE.cvalve, SHAPE.pump].includes(node.shape);
  if (!toggleable) return;

  const data = { ...(node.getData() ?? {}) };
  if (node.shape === SHAPE.pump) {
    data.state = data.state === 'running' ? 'stopped' : 'running';
  } else {
    data.state = data.state === 'open' ? 'closed' : 'open';
  }
  node.setData(data, { silent: true });
  renderCell(node);

  exitDemo();
  refreshTopology();
  updateJson();
  renderInspector(node);
  const tag = data.tag;
  const stateText =
    node.shape === SHAPE.pump
      ? data.state === 'running'
        ? '运行'
        : '停止'
      : data.state === 'open'
        ? '开'
        : '关';
  setCaption(
    `<strong>手动操作</strong>　${tag} → <b>${stateText}</b>。` +
      `系统已自动重算拓扑：当前 <b>${wetEdges.size}</b> 段管路存在流动。` +
      `（这就是"图能算"——规则可由系统判定，而不是靠人去记图纸）`,
  );
});

/* ================================================================== *
 *  5. 拓扑刷新（流动动画 + 统计）
 * ================================================================== */
function refreshTopology() {
  wetEdges = computeWetEdges(graph);
  refreshFlow(graph, wetEdges, animateFlow);
  updateStats();
}

let pendingTimer: number | undefined;
function scheduleRefresh(delay = 120) {
  if (pendingTimer) window.clearTimeout(pendingTimer);
  pendingTimer = window.setTimeout(() => {
    refreshTopology();
    updateJson();
  }, delay);
}

function updateStats() {
  const s = buildStats(graph);
  const tankLines = graph
    .getNodes()
    .filter((n: any) => n.shape === SHAPE.tank)
    .map((n: any) => `${n.getData()?.tag} ${Math.round((n.getData()?.level ?? 0) * 100)}%`)
    .join('　');
  $('stats').innerHTML = `
    设备总数：<b>${s.devices}</b>　管线：<b>${s.pipes}</b><br/>
    阀门：<b>${s.valves}</b>（开 <b>${s.openValves}</b>）<br/>
    泵：<b>${s.pumps}</b>（运行 <b>${s.runningPumps}</b>）<br/>
    当前带介质流动管段：<b>${wetEdges.size}</b><br/>
    <div style="margin-top:6px;line-height:1.7">罐位：${tankLines || '—'}</div>
  `;
}

/* ================================================================== *
 *  6. 属性面板（选中 → 查看 / 修改数据）
 * ================================================================== */
type FieldDef = {
  key: string;
  label: string;
  type: 'text' | 'select' | 'range';
  options?: string[];
};

function fieldDefs(cell: any): FieldDef[] {
  if (cell.isEdge && cell.isEdge()) {
    return [
      { key: 'tag', label: '管线号', type: 'text' },
      { key: 'dn', label: '公称直径 DN', type: 'text' },
      { key: 'pn', label: '压力等级 PN', type: 'text' },
      { key: 'fluid', label: '介质 / 流体', type: 'text' },
      { key: 'medium', label: '相态', type: 'text' },
    ];
  }
  switch (cell.shape) {
    case SHAPE.tank:
      return [
        { key: 'tag', label: '位号', type: 'text' },
        { key: 'name', label: '设备名称', type: 'text' },
        { key: 'level', label: '液位（%）', type: 'range' },
        { key: 'medium', label: '介质', type: 'text' },
        { key: 'service', label: '工艺说明', type: 'text' },
      ];
    case SHAPE.pump:
      return [
        { key: 'tag', label: '位号', type: 'text' },
        { key: 'name', label: '设备名称', type: 'text' },
        { key: 'state', label: '运行状态', type: 'select', options: ['running', 'stopped'] },
        { key: 'service', label: '工艺说明', type: 'text' },
      ];
    case SHAPE.valve:
    case SHAPE.cvalve:
      return [
        { key: 'tag', label: '位号', type: 'text' },
        { key: 'name', label: '阀门名称', type: 'text' },
        { key: 'state', label: '开关状态', type: 'select', options: ['open', 'closed'] },
        { key: 'medium', label: '介质', type: 'text' },
      ];
    case SHAPE.tee:
      return [
        { key: 'tag', label: '位号', type: 'text' },
        { key: 'name', label: '名称', type: 'text' },
      ];
    default:
      return [
        { key: 'tag', label: '名称', type: 'text' },
        { key: 'name', label: '说明', type: 'text' },
        { key: 'service', label: '工艺说明', type: 'text' },
      ];
  }
}

let currentCell: any = null;

function renderInspector(cell: any) {
  currentCell = cell;
  const box = $('inspector');
  const target = $('inspector-target');

  if (!cell) {
    target.textContent = '未选中';
    box.innerHTML = '<div class="empty">在画布上单击一个设备或管线</div>';
    return;
  }

  const data = { ...(cell.getData() ?? {}) };
  target.textContent = cell.isEdge?.() ? '管段' : String(data.kind ?? cell.shape);
  const defs = fieldDefs(cell);

  box.innerHTML =
    `<div class="tag-chip">${cell.id}</div>` +
    defs
      .map((f) => {
        const raw = data[f.key];
        if (f.type === 'select') {
          return `<div class="field"><label>${f.label}</label>
            <select data-key="${f.key}">
              ${(f.options ?? [])
                .map(
                  (o) =>
                    `<option value="${o}" ${raw === o ? 'selected' : ''}>${o === 'open' ? '开 (open)' : o === 'closed' ? '关 (closed)' : o === 'running' ? '运行 (running)' : '停止 (stopped)'}</option>`,
                )
                .join('')}
            </select></div>`;
        }
        if (f.type === 'range') {
          const v = Math.round(Number(raw ?? 0) * 100);
          return `<div class="field"><label>${f.label} <b id="level-val">${v}%</b></label>
            <input type="range" min="0" max="100" value="${v}" data-key="${f.key}" data-scale="100" /></div>`;
        }
        return `<div class="field"><label>${f.label}</label>
          <input type="text" data-key="${f.key}" value="${String(raw ?? '').replace(/"/g, '&quot;')}" /></div>`;
      })
      .join('') +
    `<div class="field" style="margin-top:14px;border-top:1px solid #e2e8f0;padding-top:10px;">
       <label>图形坐标（表达层，与工艺数据分离）</label>
       <input type="text" value="${JSON.stringify(
         cell.isEdge?.()
           ? { vertices: (cell.getVertices?.() ?? []).length }
           : (() => {
               const p = cell.getPosition();
               return { x: Math.round(p.x), y: Math.round(p.y) };
             })(),
       )}" disabled />
     </div>`;

  box.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-key]').forEach((el) => {
    const key = el.dataset.key as string;
    const handler = () => {
      const d = { ...(currentCell?.getData() ?? {}) };
      if (el instanceof HTMLInputElement && el.type === 'range') {
        d[key] = Number(el.value) / Number(el.dataset.scale ?? 1);
        const lv = document.getElementById('level-val');
        if (lv) lv.textContent = `${el.value}%`;
      } else if (el instanceof HTMLSelectElement) {
        d[key] = el.value;
      } else {
        d[key] = (el as HTMLInputElement).value;
      }
      currentCell.setData(d, { silent: true });
      renderCell(currentCell);
      refreshTopology();
      updateJson();
      updateStats();
    };
    el.addEventListener('input', handler);
    el.addEventListener('change', handler);
  });
}

graph.on('selection:changed', ({ selected }: any) => {
  renderInspector(selected && selected.length ? selected[0] : null);
});
graph.on('blank:click', () => renderInspector(null));
graph.on('node:click', ({ node }: any) => {
  if (!graph.getSelectedCells().length) renderInspector(node);
});

/* ================================================================== *
 *  7. 操作规程演示（步骤脚本 → 改数据 → 画面自动跟随）
 * ================================================================== */
let currentOp: DemoOperation | null = null;
let stepIndex = -1;
let playTimer: number | undefined;

/** 初始数据基线：演示时只回滚「工艺数据」，不动用户调整过的布局 */
const BASELINE: Record<string, { state?: string; level?: number }> = {};
buildInitialGraph().nodes.forEach((nd: any) => {
  BASELINE[nd.id] = { state: nd.data.state, level: nd.data.level };
});

function resetStateData() {
  Object.entries(BASELINE).forEach(([id, st]) => {
    const cell: any = graph.getCellById(id);
    if (!cell) return;
    const d = { ...(cell.getData() ?? {}) };
    if (st.state !== undefined) d.state = st.state;
    if (st.level !== undefined) d.level = st.level;
    cell.setData(d, { silent: true });
    renderCell(cell);
  });
}

function setCaption(html: string) {
  $('step-caption').innerHTML = html;
}

function showStep(index: number) {
  if (!currentOp) return;
  const step = currentOp.steps[index];
  if (!step) return;
  stepIndex = index;

  // ① 回滚到基线，再从第 0 步累积执行到当前步 → 保证「上一步」也正确
  resetStateData();
  for (let k = 0; k <= index; k += 1) applyStep(graph, currentOp.steps[k]);

  // ② 拓扑推导：路径 + 流动
  const path = step.flow ? findPath(graph, step.flow.from, step.flow.to) : null;
  wetEdges = computeWetEdges(graph);
  refreshFlow(graph, wetEdges, animateFlow);
  applyFocus(graph, step.focus, path?.edges ?? []);

  // ③ 文案与提示
  setCaption(
    (step.warn ? '<span class="warn">⚠ 风险提示</span>　' : '') +
      step.text +
      (path
        ? `<br/><span class="path-tip">系统识别到通路：${path.nodes
            .map((id) => {
              const c: any = graph.getCellById(id);
              return c?.getData?.()?.tag ?? id;
            })
            .join(' → ')}（${path.edges.length} 段管路）</span>`
        : ''),
  );
  $('step-indicator').textContent = `第 ${index + 1} / ${currentOp.steps.length} 步`;

  updateJson();
  updateStats();
  if (!document.activeElement?.closest('.inspector')) renderInspector(null);
}

function startDemo(op: DemoOperation) {
  currentOp = op;
  playTimer && window.clearInterval(playTimer);
  showStep(0);
}

function exitDemo() {
  if (playTimer) window.clearInterval(playTimer);
  playTimer = undefined;
  currentOp = null;
  stepIndex = -1;
  $('step-indicator').textContent = '—';
  clearVisual(graph);
}

function nextStep(delta: number) {
  if (!currentOp) {
    const first = OPERATIONS[0];
    (($('op-select') as HTMLSelectElement).value = first.id);
    startDemo(first);
    return;
  }
  const next = stepIndex + delta;
  if (next < 0 || next > currentOp.steps.length - 1) return;
  showStep(next);
}

OPERATIONS.forEach((op, i) => {
  const opt = document.createElement('option');
  opt.value = op.id;
  opt.textContent = `${i + 1}. ${op.name}`;
  $('op-select').appendChild(opt);
});

($('op-select') as HTMLSelectElement).addEventListener('change', (e) => {
  const op = OPERATIONS.find((o) => o.id === (e.target as HTMLSelectElement).value);
  if (op) startDemo(op);
});

$('btn-prev').addEventListener('click', () => nextStep(-1));
$('btn-next').addEventListener('click', () => nextStep(1));
$('btn-op-reset').addEventListener('click', () => {
  if (playTimer) window.clearInterval(playTimer);
  playTimer = undefined;
  exitDemo();
  resetStateData();
  refreshTopology();
  setCaption(
    '<strong>已退出演示，恢复初始状态。</strong>　当前为"全部阀门关闭 / 泵停止"的安全静止状态，可自行点击阀门或选择操作规程。',
  );
  updateJson();
  updateStats();
});

$('btn-play').addEventListener('click', () => {
  if (playTimer) {
    window.clearInterval(playTimer);
    playTimer = undefined;
    return;
  }
  if (!currentOp) startDemo(OPERATIONS[0]);
  playTimer = window.setInterval(() => {
    if (!currentOp) return;
    if (stepIndex >= currentOp.steps.length - 1) {
      window.clearInterval(playTimer);
      playTimer = undefined;
      return;
    }
    showStep(stepIndex + 1);
  }, 2800);
});

/* ================================================================== *
 *  8. 工具栏 / 数据面板
 * ================================================================== */
function setMode(next: 'view' | 'edit') {
  mode = next;
  document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) => {
    b.classList.toggle('active', b.dataset.mode === next);
  });
  const palettePanel = document.querySelector('.panel-left') as HTMLElement;
  palettePanel.style.opacity = next === 'edit' ? '1' : '0.55';
  setCaption(
    next === 'edit'
      ? '<strong>编辑模式</strong>　可拖动设备、拖拽黄色连接桩连线、框选（Shift+拖拽）、Ctrl+Z 撤销、Delete 删除。所有改动都会实时反映到下方数据结构。'
      : '<strong>查看模式</strong>　已锁定布局，新员工只能查看与点击阀门，不会误改图纸。',
  );
}

document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((btn) => {
  btn.addEventListener('click', () => setMode(btn.dataset.mode as 'view' | 'edit'));
});

$('btn-undo').addEventListener('click', () => graph.canUndo() && graph.undo());
$('btn-redo').addEventListener('click', () => graph.canRedo() && graph.redo());
$('btn-fit').addEventListener('click', () => fitView());

$('chk-flow').addEventListener('change', (e) => {
  animateFlow = (e.target as HTMLInputElement).checked;
  refreshFlow(graph, wetEdges, animateFlow);
});
$('chk-labels').addEventListener('change', (e) => {
  showPipeLabels = (e.target as HTMLInputElement).checked;
  graph.getEdges().forEach((edge: any) => {
    if (!showPipeLabels) {
      edge.setLabels([]);
    } else {
      renderCell(edge);
    }
  });
});

/* ---------------- 数据面板 ---------------- */
let jsonMode: 'domain' | 'raw' = 'domain';
let lastJsonText = '';

function currentJsonText(): string {
  if (jsonMode === 'domain') {
    return JSON.stringify(buildDomainExport(graph, '罐区工艺流程图', wetEdges), null, 2);
  }
  return JSON.stringify(graph.toJSON(), null, 2);
}

function updateJson(force = false) {
  const text = currentJsonText();
  if (!force && text === lastJsonText) return;
  lastJsonText = text;
  const view = $('json-view');
  const atBottom = view.scrollTop + view.clientHeight >= view.scrollHeight - 24;
  view.textContent = text.length > 20000 ? `${text.slice(0, 20000)}\n…（已截断显示）` : text;
  if (atBottom) view.scrollTop = 0;
}

$('btn-json-toggle').addEventListener('click', () => {
  $('json-view').classList.toggle('hidden');
  updateJson(true);
});
$('btn-json-refresh').addEventListener('click', () => updateJson(true));

function makeJsonModeSelect() {
  const sel = document.createElement('select');
  sel.className = 'select';
  sel.style.minWidth = '230px';
  sel.innerHTML = `
    <option value="domain">业务数据视图（推荐）</option>
    <option value="raw">X6 原始 JSON（含样式）</option>`;
  sel.addEventListener('change', () => {
    jsonMode = sel.value as 'domain' | 'raw';
    updateJson(true);
  });
  const head = document.querySelector('.json-head');
  head?.insertBefore(sel, $('btn-json-refresh'));
}
makeJsonModeSelect();

/* ---------------- 保存 / 导入 / 导出 ---------------- */
function download(filename: string, content: string, type = 'application/json') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const STORAGE_KEY = 'tankfarm-x6-demo';

$('btn-save-local').addEventListener('click', () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(graph.toJSON()));
  setCaption('<strong>已保存到浏览器本地存储</strong>（localStorage），下次打开可「读取本地」恢复。');
});

$('btn-load-local').addEventListener('click', () => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    setCaption('本地没有已保存的数据，请先点击「保存本地」。');
    return;
  }
  graph.fromJSON(JSON.parse(raw));
  afterLoad('已从本地存储恢复图形与工艺数据。');
});

$('btn-export-json').addEventListener('click', () => {
  const text = currentJsonText();
  const name =
    jsonMode === 'domain'
      ? `tankfarm-domain-${Date.now()}.json`
      : `tankfarm-x6graph-${Date.now()}.json`;
  download(name, text);
  setCaption(
    jsonMode === 'domain'
      ? '已导出<b>业务数据</b>：设备台账 + 管段表 + 拓扑邻接表，可直接入库或对接其他系统。'
      : '已导出 <b>X6 原始 JSON</b>：包含图形坐标与样式，可再次导入还原画布。',
  );
});

$('btn-import-json').addEventListener('click', () => $<HTMLInputElement>('file-input').click());
$<HTMLInputElement>('file-input').addEventListener('change', (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const json = JSON.parse(String(reader.result));
      if (json.devices && json.pipes) {
        setCaption('检测到这是<b>业务数据</b>格式，请导入 X6 原始 JSON（含 nodes / edges）才能还原画布。');
        return;
      }
      graph.fromJSON(json);
      afterLoad('已导入 JSON 并还原画布。');
    } catch (err) {
      setCaption(`导入失败：${String(err)}`);
    }
  };
  reader.readAsText(file);
  (e.target as HTMLInputElement).value = '';
});

$('btn-export-png').addEventListener('click', () => {
  (graph as any).exportPNG('罐区工艺流程图', {
    backgroundColor: '#ffffff',
    padding: 24,
    quality: 1,
  });
  setCaption('已导出 PNG，可直接放进培训手册 / PPT。');
});

$('btn-reset').addEventListener('click', () => {
  exitDemo();
  loadDemo();
  setCaption('<strong>已重置为示例罐区。</strong>');
});

/* ================================================================== *
 *  9. 启动
 * ================================================================== */
function fitView() {
  // 底部留出空间，避免说明条遮住下方设备
  graph.zoomToFit({
    padding: { top: 26, right: 26, bottom: 122, left: 26 },
    maxScale: 1.05,
  } as any);
}

function afterLoad(message: string) {
  renderAll(graph);
  refreshTopology();
  updateJson(true);
  updateStats();
  fitView();
  if (message) setCaption(message);
}

function loadDemo() {
  graph.fromJSON(buildInitialGraph() as any);
  afterLoad('');
}

setMode('edit');
loadDemo();
startFlowLoop(graph);

// 便于调试 / 二次开发：在浏览器控制台可直接访问 graph
(window as any).__graph = graph;
setCaption(
  '<strong>罐区工艺流程交互图（示例）</strong>　' +
    '初始状态为「全部阀门关闭 / 泵停止」的安全静止状态。<br/>' +
    '可以：① 直接点击阀门或泵切换状态，观察管路流动自动变化；② 在「操作规程」里选择倒罐流程，点「自动播放」看分步演示；' +
    '③ 拖动画布上的设备、拖拽黄色连接桩连线；④ 展开下方数据结构，查看"画图 → 数据"的产出。',
);
window.setInterval(() => updateJson(), 1200);
