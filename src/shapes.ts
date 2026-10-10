/**
 * 图元定义（罐 / 泵 / 阀 / 汇管 / 界区 / 管线）
 *
 * 全部使用 SVG path 手绘，尺寸固定，便于：
 *  1) 复用 / 替换为你们图纸里的真实符号（直接把 d 换成 CAD 导出的轮廓即可）
 *  2) 用 attrs 做状态渲染（开 / 关 / 运行 / 停止 / 液位）
 *
 * 注意：本文件只负责「长什么样」，「有什么数据」在 domain.ts 里。
 */
import { Graph } from '@antv/x6';

export const SHAPE = {
  tank: 'tf-tank',
  valve: 'tf-valve',
  cvalve: 'tf-cvalve',
  pump: 'tf-pump',
  tee: 'tf-tee',
  boundary: 'tf-boundary',
  pipe: 'tf-pipe',
} as const;
export const SIZE = {
  tank: { width: 100, height: 180 },
  valve: { width: 46, height: 40 },
  cvalve: { width: 46, height: 48 },
  pump: { width: 76, height: 76 },
  tee: { width: 44, height: 44 },
  boundary: { width: 96, height: 56 },
} as const;

/** 液面计算的内部几何（与下面的 path 常量保持一致） */
export const TANK_INNER = { left: 8, right: 92, top: 20, bottom: 156 };

const TANK_BG =
  'M8 18 H92 V148 Q92 156 82 156 H18 Q8 156 8 148 Z';

const TANK_SHELL =
  // 拱顶（椭圆）
  'M6 18 A44 12 0 1 1 94 18 A44 12 0 1 1 6 18 ' +
  // 罐体侧壁 + 圆角底
  'M6 18 V148 Q6 156 16 156 H84 Q94 156 94 148 V18 ' +
  // 支腿与基础
  'M22 156 V170 M78 156 V170 M10 170 H34 M66 170 H90';

const VALVE_BODY = 'M4 8 L21 20 L4 32 Z M42 8 L25 20 L42 32 Z';
const VALVE_STEM = 'M23 20 V6 M16 6 H30';

const CVALVE_BODY = 'M4 16 L21 28 L4 40 Z M42 16 L25 28 L42 40 Z';
const CVALVE_STEM = 'M23 28 V19 M16 19 H30';
const CVALVE_ACTUATOR = 'M11 14 A12 8 0 0 1 35 14 Z';

const PUMP_BODY = 'M8 38 A30 30 0 1 1 68 38 A30 30 0 1 1 8 38';
const PUMP_IMPELLER = 'M38 20 L53 52 L23 52 Z';

const TEE_BODY = 'M6 22 A16 16 0 1 1 38 22 A16 16 0 1 1 6 22';

/** 通用文字样式 *  注意：X6 的 refX/refY 只在 (0,1) 开区间内当作百分比，传 1 会被当成 1px，
 *  所以这里统一用 '50%' / '100%' 这类字符串写法。
 */
const TAG_TEXT = {
  refX: '50%',
  refY: 0,
  textAnchor: 'middle',
  textVerticalAnchor: 'bottom',
  fontSize: 12.5,
  fontWeight: 700,
  fill: '#0f172a',
  fontFamily: 'Menlo, Consolas, monospace',
};

const SUB_TEXT = {
  refX: '50%',
  refY: '100%',
  textAnchor: 'middle',
  textVerticalAnchor: 'top',
  fontSize: 11,
  fill: '#64748b',
};

const STATE_TEXT = {
  refX: '50%',
  refY: '100%',
  textAnchor: 'middle',
  textVerticalAnchor: 'top',
  fontSize: 11,
  fontWeight: 700,
};

export type PortDir = 'in' | 'out' | 'bi';

export interface PortSpec {
  id: string;
  x: string;
  y: string;
  dir: PortDir;
  label: string;
  medium?: string;
}

/** 端口：黄色小圆点，即「可连线的连接桩」 */
function buildPorts(specs: PortSpec[]) {
  return {
    groups: {
      abs: {
        position: 'absolute',
        attrs: {
          circle: {
            r: 3.5,
            magnet: true,
            stroke: '#f59e0b',
            strokeWidth: 1.5,
            fill: '#ffffff',
          },
        },
      },
    },
    items: specs.map((s) => ({
      id: s.id,
      group: 'abs',
      args: { x: s.x, y: s.y },
      data: { dir: s.dir, label: s.label, medium: s.medium ?? '' },
    })),
  };
}

export function registerShapes() {
  // ---------------------------------------------------------------- 储罐
  Graph.registerNode(
    SHAPE.tank,
    {
      ...SIZE.tank,
      markup: [
        { tagName: 'path', selector: 'bg' },
        { tagName: 'path', selector: 'liquid' },
        { tagName: 'path', selector: 'liquidLine' },
        { tagName: 'path', selector: 'shell' },
        { tagName: 'text', selector: 'tag' },
        { tagName: 'text', selector: 'sub' },
        { tagName: 'text', selector: 'level' },
      ],
      attrs: {
        bg: { d: TANK_BG, fill: '#ffffff', stroke: 'none' },
        liquid: { d: '', fill: '#7dd3fc', fillOpacity: 0.7, stroke: 'none' },
        liquidLine: {
          d: '',
          stroke: '#0284c7',
          strokeWidth: 1.8,
          strokeDasharray: '5 4',
          strokeLinecap: 'round',
        },
        shell: {
          d: TANK_SHELL,
          fill: 'none',
          stroke: '#334155',
          strokeWidth: 2.2,
          strokeLinejoin: 'round',
          strokeLinecap: 'round',
        },
        tag: { ...TAG_TEXT },
        sub: { ...SUB_TEXT },
        level: {
          refX: '50%',
          refY: '50%',
          textAnchor: 'middle',
          textVerticalAnchor: 'middle',
          fontSize: 13,
          fontWeight: 700,
          fill: '#075985',
        },
      },
      ports: buildPorts([
        { id: 'in', x: '0%', y: '50%', dir: 'in', label: '进料', medium: 'Liquid' },
        { id: 'out', x: '50%', y: '88%', dir: 'out', label: '出料', medium: 'Liquid' },
        { id: 'vent', x: '50%', y: '10%', dir: 'out', label: '气相', medium: 'Vapor' },
      ]),
      resizable: false,
    },
    true,
  );

  // ---------------------------------------------------------------- 切断阀
  Graph.registerNode(
    SHAPE.valve,
    {
      ...SIZE.valve,
      markup: [
        { tagName: 'path', selector: 'body' },
        { tagName: 'path', selector: 'stem' },
        { tagName: 'text', selector: 'tag' },
        { tagName: 'text', selector: 'state' },
      ],
      attrs: {
        body: {
          d: VALVE_BODY,
          stroke: '#b91c1c',
          strokeWidth: 2,
          fill: '#ef4444',
          fillOpacity: 0.3,
          strokeLinejoin: 'round',
        },
        stem: { d: VALVE_STEM, stroke: '#b91c1c', strokeWidth: 2, fill: 'none' },
        tag: { ...TAG_TEXT, fontSize: 11.5, refY: 0 },
        state: { ...STATE_TEXT, fill: '#b91c1c' },
      },
      ports: buildPorts([
        { id: 'in', x: '0%', y: '50%', dir: 'in', label: '入口' },
        { id: 'out', x: '100%', y: '50%', dir: 'out', label: '出口' },
      ]),
      resizable: false,
    },
    true,
  );

  // ---------------------------------------------------------------- 调节阀
  Graph.registerNode(
    SHAPE.cvalve,
    {
      ...SIZE.cvalve,
      markup: [
        { tagName: 'path', selector: 'actuator' },
        { tagName: 'path', selector: 'body' },
        { tagName: 'path', selector: 'stem' },
        { tagName: 'text', selector: 'tag' },
        { tagName: 'text', selector: 'state' },
      ],
      attrs: {
        actuator: {
          d: CVALVE_ACTUATOR,
          stroke: '#b91c1c',
          strokeWidth: 2,
          fill: '#ef4444',
          fillOpacity: 0.18,
        },
        body: {
          d: CVALVE_BODY,
          stroke: '#b91c1c',
          strokeWidth: 2,
          fill: '#ef4444',
          fillOpacity: 0.3,
          strokeLinejoin: 'round',
        },
        stem: { d: CVALVE_STEM, stroke: '#b91c1c', strokeWidth: 2, fill: 'none' },
        tag: { ...TAG_TEXT, fontSize: 11.5, refY: 0 },
        state: { ...STATE_TEXT, fill: '#b91c1c' },
      },
      ports: buildPorts([
        { id: 'in', x: '0%', y: '58%', dir: 'in', label: '入口' },
        { id: 'out', x: '100%', y: '58%', dir: 'out', label: '出口' },
      ]),
      resizable: false,
    },
    true,
  );

  // ---------------------------------------------------------------- 泵
  Graph.registerNode(
    SHAPE.pump,
    {
      ...SIZE.pump,
      markup: [
        { tagName: 'path', selector: 'body' },
        { tagName: 'path', selector: 'impeller' },
        { tagName: 'text', selector: 'tag' },
        { tagName: 'text', selector: 'state' },
      ],
      attrs: {
        body: {
          d: PUMP_BODY,
          fill: '#ffffff',
          stroke: '#94a3b8',
          strokeWidth: 2.4,
        },
        impeller: {
          d: PUMP_IMPELLER,
          fill: '#cbd5e1',
          stroke: '#94a3b8',
          strokeWidth: 1.6,
          strokeLinejoin: 'round',
        },
        tag: { ...TAG_TEXT },
        state: { ...STATE_TEXT, fill: '#64748b' },
      },
      ports: buildPorts([
        { id: 'in', x: '0%', y: '50%', dir: 'in', label: '入口' },
        { id: 'out', x: '100%', y: '50%', dir: 'out', label: '出口' },
      ]),
      resizable: false,
    },
    true,
  );

  // ---------------------------------------------------------------- 汇管 / 分料三通
  Graph.registerNode(
    SHAPE.tee,
    {
      ...SIZE.tee,
      markup: [
        { tagName: 'path', selector: 'body' },
        { tagName: 'text', selector: 'label' },
      ],
      attrs: {
        body: { d: TEE_BODY, fill: '#ffffff', stroke: '#334155', strokeWidth: 2 },
        label: {
          refX: '50%',
          refY: '50%',
          textAnchor: 'middle',
          textVerticalAnchor: 'middle',
          fontSize: 10.5,
          fontWeight: 700,
          fill: '#0f172a',
          fontFamily: 'Menlo, Consolas, monospace',
        },
      },
      ports: buildPorts([
        { id: 'left', x: '0%', y: '50%', dir: 'bi', label: '左' },
        { id: 'right', x: '100%', y: '50%', dir: 'bi', label: '右' },
        { id: 'top', x: '50%', y: '0%', dir: 'bi', label: '上' },
        { id: 'bottom', x: '50%', y: '100%', dir: 'bi', label: '下' },
      ]),
      resizable: false,
    },
    true,
  );

  // ---------------------------------------------------------------- 界区 / 装车
  Graph.registerNode(
    SHAPE.boundary,
    {
      ...SIZE.boundary,
      markup: [
        { tagName: 'rect', selector: 'body' },
        { tagName: 'path', selector: 'mark' },
        { tagName: 'text', selector: 'label' },
        { tagName: 'text', selector: 'sub' },
      ],
      attrs: {
        body: {
          refWidth: 1,
          refHeight: 1,
          rx: 8,
          ry: 8,
          fill: '#f8fafc',
          stroke: '#334155',
          strokeWidth: 2,
          strokeDasharray: '7 5',
        },
        mark: { d: 'M0 0 L96 56', stroke: '#cbd5e1', strokeWidth: 1.4 },
        label: {
          refX: '50%',
          refY: '50%',
          textAnchor: 'middle',
          textVerticalAnchor: 'middle',
          fontSize: 13,
          fontWeight: 700,
          fill: '#0f172a',
        },
        sub: {
          refX: '50%',
          refY: '100%',
          textAnchor: 'middle',
          textVerticalAnchor: 'top',
          fontSize: 11,
          fill: '#64748b',
        },
      },
      ports: buildPorts([{ id: 'in', x: '0%', y: '50%', dir: 'in', label: '入界区' }]),
      resizable: false,
    },
    true,
  );

  // ---------------------------------------------------------------- 管线（边）
  Graph.registerEdge(
    SHAPE.pipe,
    {
      inherit: 'edge',
      zIndex: 0,
      router: {
        name: 'manhattan',
        args: { padding: 18, excludeTerminals: ['source', 'target'] },
      },
      connector: { name: 'jumpover', args: { type: 'gap', size: 7, lineWidth: 2.5 } },
      attrs: {
        line: {
          stroke: '#94a3b8',
          strokeWidth: 2.5,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          targetMarker: null,
        },
      },
    },
    true,
  );
}

/* =====================================================================
 *                        渲染：数据 → 画面
 * ===================================================================== */

const LIQUID_LINE = (y: number) => `M${TANK_INNER.left} ${y} H${TANK_INNER.right}`;

const LIQUID_SHAPE = (y: number) => {
  const { left, right, bottom } = TANK_INNER;
  const r = 9;
  return (
    `M${left} ${y} H${right} V${bottom - r} ` +
    `Q${right} ${bottom} ${right - r} ${bottom} ` +
    `H${left + r} Q${left} ${bottom} ${left} ${bottom - r} Z`
  );
};

/** 储罐：刷新液位 */
export function renderTank(node: any) {
  const d = node.getData() ?? {};
  const level = Math.max(0, Math.min(1, Number(d.level ?? 0)));
  const { top, bottom } = TANK_INNER;
  const y = bottom - (bottom - top) * level;

  node.attr('liquid/d', level <= 0.005 ? '' : LIQUID_SHAPE(y));
  node.attr('liquidLine/d', level <= 0.005 ? '' : LIQUID_LINE(y));
  node.attr('tag/text', d.tag ?? '');
  node.attr('sub/text', d.name ?? '');
  node.attr('level/text', `${Math.round(level * 100)}%`);
}

/** 阀门 / 调节阀：开 = 绿，关 = 红 */
export function renderValve(node: any) {
  const d = node.getData() ?? {};
  const open = d.state === 'open';
  const color = open ? '#15803d' : '#b91c1c';
  const fill = open ? '#22c55e' : '#ef4444';

  node.attr('body/stroke', color);
  node.attr('body/fill', fill);
  node.attr('body/fillOpacity', open ? 0.32 : 0.34);
  node.attr('stem/stroke', color);
  if (node.shape === SHAPE.cvalve) node.attr('actuator/stroke', color);
  node.attr('tag/text', d.tag ?? '');
  node.attr('state/text', open ? '开' : '关');
  node.attr('state/fill', color);
}

/** 泵：运行 = 绿，停止 = 灰 */
export function renderPump(node: any) {
  const d = node.getData() ?? {};
  const running = d.state === 'running';

  node.attr('body/stroke', running ? '#15803d' : '#94a3b8');
  node.attr('body/strokeWidth', running ? 2.8 : 2.4);
  node.attr('impeller/fill', running ? '#22c55e' : '#cbd5e1');
  node.attr('impeller/stroke', running ? '#15803d' : '#94a3b8');
  node.attr('tag/text', d.tag ?? '');
  node.attr('state/text', running ? '运行' : '停止');
  node.attr('state/fill', running ? '#15803d' : '#64748b');
}

/** 简单图元（汇管 / 界区） */
export function renderSimple(node: any) {
  const d = node.getData() ?? {};
  if (node.shape === SHAPE.tee) node.attr('label/text', d.tag ?? '');
  if (node.shape === SHAPE.boundary) {
    node.attr('label/text', d.tag ?? '');
    node.attr('sub/text', d.name ?? '');
  }
}

/** 管线：刷新管线号标签 + 基础样式 */
export function renderPipe(edge: any) {
  const d = edge.getData() ?? {};
  const tag = d.tag ? `${d.tag}${d.dn ? ` ${d.dn}` : ''}` : '';
  const labels = tag
    ? [
        {
          // 管线号抬高一点，避免与阀门位号打架
          position: { distance: 0.5, offset: { x: 0, y: -14 } },
          attrs: {
            text: {
              text: tag,
              fill: '#0369a1',
              fontSize: 10.5,
              fontWeight: 600,
              fontFamily: 'Menlo, Consolas, monospace',
            },
            rect: { fill: '#ffffff', fillOpacity: 0.9, stroke: '#bae6fd', rx: 4, ry: 4 },
          },
        },
      ]
    : [];
  edge.setLabels(labels as any);
}

/** 统一的「按数据重绘」入口 */
export function renderCell(cell: any) {
  if (!cell) return;
  if (cell.isEdge && cell.isEdge()) {
    renderPipe(cell);
    return;
  }
  switch (cell.shape) {
    case SHAPE.tank:
      renderTank(cell);
      break;
    case SHAPE.valve:
    case SHAPE.cvalve:
      renderValve(cell);
      break;
    case SHAPE.pump:
      renderPump(cell);
      break;
    default:
      renderSimple(cell);
  }
}

export function renderAll(graph: any) {
  graph.getNodes().forEach(renderCell);
  graph.getEdges().forEach(renderCell);
}

/** 设置整体透明度（用于演示时淡化非关注部分） */
export function setDim(cell: any, dim: boolean) {
  const attrs = cell.getAttr?.() ?? {};
  const v = dim ? 0.22 : 1;
  Object.keys(attrs).forEach((selector) => {
    cell.attr(`${selector}/opacity`, v);
  });
  if (cell.isEdge && cell.isEdge()) {
    cell.attr('line/opacity', v);
  }
}

/* =====================================================================
 *  图元面板缩略图（与画布图元共用同一套 path，保证"所见即所得"）
 * ===================================================================== */
const svgWrap = (viewBox: string, inner: string) =>
  `<svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">${inner}</svg>`;

export const PREVIEWS: Record<string, string> = {
  [SHAPE.tank]: svgWrap(
    '0 0 100 180',
    `<path d="${TANK_BG}" fill="#ffffff"/>` +
      `<path d="M8 96 H92 V148 Q92 156 82 156 H18 Q8 156 8 148 Z" fill="#7dd3fc" fill-opacity="0.75"/>` +
      `<path d="M8 96 H92" stroke="#0284c7" stroke-width="2" stroke-dasharray="6 5"/>` +
      `<path d="${TANK_SHELL}" fill="none" stroke="#334155" stroke-width="2.6" stroke-linejoin="round"/>`,
  ),
  [SHAPE.pump]: svgWrap(
    '0 0 76 76',
    `<path d="${PUMP_BODY}" fill="#ffffff" stroke="#15803d" stroke-width="3"/>` +
      `<path d="${PUMP_IMPELLER}" fill="#22c55e" stroke="#15803d" stroke-width="2" stroke-linejoin="round"/>`,
  ),
  [SHAPE.valve]: svgWrap(
    '-4 -6 54 52',
    `<path d="${VALVE_BODY}" fill="#ef4444" fill-opacity="0.32" stroke="#b91c1c" stroke-width="2.4" stroke-linejoin="round"/>` +
      `<path d="${VALVE_STEM}" fill="none" stroke="#b91c1c" stroke-width="2.4"/>`,
  ),
  [SHAPE.cvalve]: svgWrap(
    '-4 -4 54 58',
    `<path d="${CVALVE_ACTUATOR}" fill="#ef4444" fill-opacity="0.2" stroke="#b91c1c" stroke-width="2.2"/>` +
      `<path d="${CVALVE_BODY}" fill="#ef4444" fill-opacity="0.32" stroke="#b91c1c" stroke-width="2.4" stroke-linejoin="round"/>` +
      `<path d="${CVALVE_STEM}" fill="none" stroke="#b91c1c" stroke-width="2.2"/>`,
  ),
  [SHAPE.tee]: svgWrap(
    '-2 -2 48 48',
    `<path d="${TEE_BODY}" fill="#ffffff" stroke="#334155" stroke-width="2.6"/>`,
  ),
  [SHAPE.boundary]: svgWrap(
    '-4 -4 104 64',
    `<rect x="0" y="0" width="96" height="56" rx="8" fill="#f8fafc" stroke="#334155" stroke-width="2.4" stroke-dasharray="8 6"/>` +
      `<path d="M0 0 L96 56" stroke="#cbd5e1" stroke-width="1.6"/>`,
  ),
};
