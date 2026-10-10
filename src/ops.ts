/**
 * 图形 ↔ 数据的运行时逻辑：
 *  1) 按数据刷新状态（阀门开 / 关、泵运行 / 停止、储罐液位）
 *  2) 由拓扑自动推导「哪些管段在流动」（这就是"图能算"的部分）
 *  3) 由拓扑自动推导「从 A 到 B 的路径」（倒罐路径）
 *  4) 播放演示步骤、聚焦 / 淡化
 */
import type { Graph } from '@antv/x6';
import { SHAPE, renderCell, setDim } from './shapes';
import type { DemoStep } from './demo-data';

/** 设备是否「通」——阀门开、泵运行才算通 */
export function devicePasses(cell: any): boolean {
  if (!cell) return false;
  // 注意：cell.isEdge 是方法而不是布尔属性，必须调用
  if (typeof cell.isEdge === 'function' && cell.isEdge()) return false;
  const state = cell.getData?.()?.state;
  if (cell.shape === SHAPE.valve || cell.shape === SHAPE.cvalve) return state === 'open';
  if (cell.shape === SHAPE.pump) return state === 'running';
  return true; // 储罐 / 汇管 / 界区
}

/**
 * 从所有储罐出发做一次无向遍历，穿过「通」的设备，
 * 得到"管内充满介质"的管段集合 —— 这决定了哪些管线显示流动动画。
 */
export function computeWetEdges(graph: Graph): Set<string> {
  const wet = new Set<string>();
  const visited = new Set<string>();
  const queue: string[] = [];

  graph.getNodes().forEach((node) => {
    if (node.shape === SHAPE.tank) {
      visited.add(node.id);
      queue.push(node.id);
    }
  });

  const edges = graph.getEdges();
  while (queue.length) {
    const current = queue.shift() as string;
    edges.forEach((edge) => {
      const s = edge.getSourceCellId();
      const t = edge.getTargetCellId();
      if (!s || !t) return;
      if (s !== current && t !== current) return;
      const other = s === current ? t : s;
      if (visited.has(other)) {
        wet.add(edge.id);
        return;
      }
      if (!devicePasses(graph.getCellById(other))) return;
      wet.add(edge.id);
      visited.add(other);
      queue.push(other);
    });
  }
  return wet;
}

/** 由拓扑自动推导从 fromId 到 toId 的路径（只经过"通"的设备） */
export function findPath(
  graph: Graph,
  fromId: string,
  toId: string,
): { nodes: string[]; edges: string[] } | null {
  if (!graph.getCellById(fromId) || !graph.getCellById(toId) || fromId === toId) return null;

  const visited = new Set<string>([fromId]);
  const parent = new Map<string, { node: string; edge: string }>();
  const queue: string[] = [fromId];
  const edges = graph.getEdges();

  while (queue.length) {
    const current = queue.shift() as string;
    if (current === toId) break;
    for (const edge of edges) {
      const s = edge.getSourceCellId();
      const t = edge.getTargetCellId();
      if (!s || !t) continue;
      const next = s === current ? t : t === current ? s : null;
      if (!next || visited.has(next)) continue;
      if (next !== toId && !devicePasses(graph.getCellById(next))) continue;
      visited.add(next);
      parent.set(next, { node: current, edge: edge.id });
      queue.push(next);
    }
  }

  if (!visited.has(toId)) return null;

  const nodes: string[] = [toId];
  const pathEdges: string[] = [];
  let cursor = toId;
  while (cursor !== fromId) {
    const p = parent.get(cursor);
    if (!p) return null;
    pathEdges.unshift(p.edge);
    nodes.unshift(p.node);
    cursor = p.node;
  }
  return { nodes, edges: pathEdges };
}

/* ------------------------------------------------------------------ *
 *                          视觉刷新
 * ------------------------------------------------------------------ */

let wetEdges: Set<string> = new Set();
let animated = true;

/** 依据「通 / 断」刷新所有管线的样式（流动 = 蓝色虚线动画） */
export function refreshFlow(graph: Graph, next: Set<string>, animate: boolean) {
  wetEdges = animate ? next : new Set();
  animated = animate;

  graph.getEdges().forEach((edge) => {
    const flowing = next.has(edge.id);
    edge.attr('line/stroke', flowing ? '#1d6fe0' : '#94a3b8');
    edge.attr('line/strokeWidth', flowing ? 3 : 2.5);
    edge.attr('line/strokeOpacity', 1);
    if (flowing && animate) {
      edge.attr('line/strokeDasharray', '11 7');
    } else {
      edge.attr('line/strokeDasharray', null);
      edge.attr('line/strokeDashoffset', 0);
    }
  });
}

/** 流动动画（只驱动"通"的管段） */
export function startFlowLoop(graph: Graph) {
  let phase = 0;
  const tick = () => {
    if (animated && wetEdges.size) {
      phase = (phase + 0.7) % 18;
      wetEdges.forEach((id) => {
        const edge = graph.getCellById(id);
        if (edge) edge.attr('line/strokeDashoffset', -phase);
      });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** 聚焦 + 淡化：只看当前操作相关的设备和路径 */
export function applyFocus(graph: Graph, focus: string[] | undefined, pathEdges: string[]) {
  const noFocus = !focus || focus.length === 0;
  const keep = new Set<string>([...(focus ?? []), ...pathEdges]);

  graph.getNodes().forEach((node) => {
    // 路径上的设备节点也算相关
    const related = keep.has(node.id);
    setDim(node, noFocus ? false : !related);
  });
  graph.getEdges().forEach((edge) => {
    setDim(edge, noFocus ? false : !keep.has(edge.id));
  });
}

export function clearVisual(graph: Graph) {
  graph.getNodes().forEach((node) => setDim(node, false));
  graph.getEdges().forEach((edge) => setDim(edge, false));
}

/* ------------------------------------------------------------------ *
 *                        按步骤改数据
 * ------------------------------------------------------------------ */

/** 把一条演示步骤写进数据层（= 修改 model，而不是改画面） */
export function applyStep(graph: Graph, step: DemoStep) {
  const set = step.set ?? {};
  Object.entries(set).forEach(([key, value]) => {
    if (key.endsWith('.level')) {
      const id = key.replace(/\.level$/, '');
      const node: any = graph.getCellById(id);
      if (node) {
        const data = { ...node.getData(), level: Number(value) };
        node.setData(data, { silent: true });
        renderCell(node);
      }
      return;
    }
    const cell: any = graph.getCellById(key);
    if (!cell) return;
    const data = { ...cell.getData(), state: value };
    cell.setData(data, { silent: true });
    renderCell(cell);
  });
}

/* ------------------------------------------------------------------ *
 *                          统计信息
 * ------------------------------------------------------------------ */

export function buildStats(graph: Graph) {
  const nodes = graph.getNodes();
  const valves = nodes.filter((x: any) => x.shape === SHAPE.valve || x.shape === SHAPE.cvalve);
  const openValves = valves.filter((x: any) => x.getData()?.state === 'open');
  const tanks = nodes.filter((x: any) => x.shape === SHAPE.tank);
  const pumps = nodes.filter((x: any) => x.shape === SHAPE.pump);
  const running = pumps.filter((x: any) => x.getData()?.state === 'running');

  return {
    devices: nodes.length,
    valves: valves.length,
    openValves: openValves.length,
    pipes: graph.getEdges().length,
    tanks: tanks.length,
    pumps: pumps.length,
    runningPumps: running.length,
    totalVolume: tanks.reduce((sum: number, t: any) => sum + (t.getData()?.level ?? 0), 0),
  };
}
