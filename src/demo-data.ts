/**
 * 领域数据模型 + 罐区示例数据 + 操作规程（演示脚本）
 *
 * 关键设计：图形数据（X6 的 node/edge）与业务数据（data 字段）分离。
 *  - data.kind  决定图元类型
 *  - data.tag   位号（图纸位号 / 台账主键）
 *  - 其余字段由你们自己的规范扩展（介质、口径、压力等级、连锁、安全等级……）
 */
import { SHAPE } from './shapes';

export type DeviceKind = 'tank' | 'pump' | 'valve' | 'cvalve' | 'tee' | 'boundary';

/** 设备 / 管线上的业务数据 */
export interface DeviceData {
  kind: DeviceKind | 'pipe';
  tag: string;
  name?: string;
  /** 阀门：open / closed；泵：running / stopped */
  state?: 'open' | 'closed' | 'running' | 'stopped';
  /** 储罐液位 0~1 */
  level?: number;
  /** 介质 */
  medium?: string;
  /** 工艺用途说明（培训时显示） */
  service?: string;
  /** 公称直径 / 压力等级（管线用） */
  dn?: string;
  pn?: string;
}

export const SHAPE_BY_KIND: Record<DeviceKind, string> = {
  tank: SHAPE.tank,
  pump: SHAPE.pump,
  valve: SHAPE.valve,
  cvalve: SHAPE.cvalve,
  tee: SHAPE.tee,
  boundary: SHAPE.boundary,
};

const n = (
  id: string,
  kind: DeviceKind,
  x: number,
  y: number,
  data: Omit<DeviceData, 'kind'> & { kind?: never },
) => ({
  id,
  shape: SHAPE_BY_KIND[kind],
  x,
  y,
  data: { kind, ...data },
  zIndex: 10,
});

const p = (
  id: string,
  tag: string,
  from: [string, string],
  to: [string, string],
  dn: string,
  fluid = '原料油',
) => ({
  id,
  shape: SHAPE.pipe,
  source: { cell: from[0], port: from[1] },
  target: { cell: to[0], port: to[1] },
  data: { kind: 'pipe', tag, dn, pn: 'PN16', medium: '液相', fluid } as DeviceData,
});

/* ------------------------------------------------------------------ *
 *  罐区示例：4 台储罐 + 1 台倒罐泵 + 8 台阀门 + 汇管 / 分料器 + 界区
 *  初始状态 = 「正常生产工况」：T-101 → T-103 通道打开，泵运行中
 * ------------------------------------------------------------------ */
export function buildInitialGraph() {
  return {
    nodes: [
      // ---- 左侧：原料罐 ----
      n('T-101', 'tank', 60, 60, {
        tag: 'T-101',
        name: '原料油储罐 A',
        level: 0.72,
        medium: '原料油',
        service: '常压拱顶罐，V=1000 m³',
      }),
      n('T-102', 'tank', 60, 400, {
        tag: 'T-102',
        name: '原料油储罐 B',
        level: 0.38,
        medium: '原料油',
        service: '常压拱顶罐，V=1000 m³',
      }),

      // ---- 罐出口切断阀 ----
      n('V-101', 'valve', 280, 130, {
        tag: 'V-101',
        name: 'T-101 出口切断阀',
        state: 'closed',
        medium: '原料油',
      }),
      n('V-102', 'valve', 280, 450, {
        tag: 'V-102',
        name: 'T-102 出口切断阀',
        state: 'closed',
        medium: '原料油',
      }),

      // ---- 泵入口汇管 ----
      n('J-01', 'tee', 424, 308, { tag: 'J-01', name: '泵入口汇管' }),

      // ---- 泵入口 / 出口阀 + 泵 ----
      n('V-103', 'valve', 540, 308, {
        tag: 'V-103',
        name: '倒罐泵入口切断阀',
        state: 'closed',
        medium: '原料油',
      }),
      n('P-101', 'pump', 656, 290, {
        tag: 'P-101',
        name: '倒罐泵',
        state: 'stopped',
        medium: '原料油',
        service: '离心泵 Q=50 m³/h，H=32 m',
      }),
      n('V-104', 'valve', 806, 308, {
        tag: 'V-104',
        name: '倒罐泵出口切断阀',
        state: 'closed',
        medium: '原料油',
      }),

      // ---- 出口分料器 ----
      n('J-02', 'tee', 916, 308, { tag: 'J-02', name: '出口分料器' }),

      // ---- 上支路：至 T-103 ----
      n('V-105', 'valve', 1006, 148, {
        tag: 'V-105',
        name: '至 T-103 进料阀',
        state: 'closed',
        medium: '原料油',
      }),
      n('T-103', 'tank', 1140, 60, {
        tag: 'T-103',
        name: '中间缓冲罐',
        level: 0.15,
        medium: '原料油',
        service: '接收倒罐来料，供下游装置',
      }),

      // ---- 下支路：至 T-104 ----
      n('V-106', 'valve', 1006, 448, {
        tag: 'V-106',
        name: '至 T-104 进料阀',
        state: 'closed',
        medium: '原料油',
      }),
      n('T-104', 'tank', 1140, 360, {
        tag: 'T-104',
        name: '成品 / 外送罐',
        level: 0.55,
        medium: '原料油',
        service: '供外送装车，上限液位 85%',
      }),

      // ---- 外送支路 ----
      n('V-107', 'valve', 1130, 600, {
        tag: 'V-107',
        name: 'T-104 出口阀',
        state: 'closed',
        medium: '原料油',
      }),
      n('V-108', 'cvalve', 1264, 596, {
        tag: 'V-108',
        name: '界区外送调节阀',
        state: 'closed',
        medium: '原料油',
        service: '随装车流量调节开度',
      }),
      n('BL', 'boundary', 1400, 592, {
        tag: '界区',
        name: '装车鹤管 / 外送',
        service: '与外部装置分界点',
      }),
    ],
    edges: [
      p('L-101', 'L-101', ['T-101', 'out'], ['V-101', 'in'], 'DN80'),
      p('L-102', 'L-102', ['V-101', 'out'], ['J-01', 'top'], 'DN80'),
      p('L-103', 'L-103', ['T-102', 'out'], ['V-102', 'in'], 'DN80'),
      p('L-104', 'L-104', ['V-102', 'out'], ['J-01', 'bottom'], 'DN80'),
      p('L-105', 'L-105', ['J-01', 'right'], ['V-103', 'in'], 'DN100'),
      p('L-106', 'L-106', ['V-103', 'out'], ['P-101', 'in'], 'DN100'),
      p('L-107', 'L-107', ['P-101', 'out'], ['V-104', 'in'], 'DN100'),
      p('L-108', 'L-108', ['V-104', 'out'], ['J-02', 'left'], 'DN100'),
      p('L-109', 'L-109', ['J-02', 'top'], ['V-105', 'in'], 'DN80'),
      p('L-110', 'L-110', ['V-105', 'out'], ['T-103', 'in'], 'DN80'),
      p('L-111', 'L-111', ['J-02', 'bottom'], ['V-106', 'in'], 'DN80'),
      p('L-112', 'L-112', ['V-106', 'out'], ['T-104', 'in'], 'DN80'),
      p('L-113', 'L-113', ['T-104', 'out'], ['V-107', 'in'], 'DN80'),
      p('L-114', 'L-114', ['V-107', 'out'], ['V-108', 'in'], 'DN80'),
      p('L-115', 'L-115', ['V-108', 'out'], ['BL', 'in'], 'DN80'),
    ],
  };
}

/* ------------------------------------------------------------------ *
 *                       操作规程（演示脚本）
 * ------------------------------------------------------------------ */

export interface DemoStep {
  /** 步骤说明（支持 HTML 片段） */
  text: string;
  /** 位号 → 状态；'T-101.level' → 液位数值 */
  set?: Record<string, string | number>;
  /** 需要高亮/聚焦的位号 */
  focus?: string[];
  /** 本步骤应存在的流动路径（用于高亮管路） */
  flow?: { from: string; to: string } | null;
  /** 是否为风险 / 异常提示 */
  warn?: boolean;
}

export interface DemoOperation {
  id: string;
  name: string;
  from: string;
  to: string;
  steps: DemoStep[];
}

export const OPERATIONS: DemoOperation[] = [
  {
    id: 'op1',
    name: '倒罐操作①：T-101 → T-103（原料罐倒料至缓冲罐）',
    from: 'T-101',
    to: 'T-103',
    steps: [
      {
        text: '<strong>步骤 1/7 · 作业前确认</strong>　读取 T-103 液位（当前 <b>15%</b>，上限 80%），确认有接收空间；核对倒罐申请单与罐号。',
        focus: ['T-103', 'T-101'],
        set: {},
      },
      {
        text: '<strong>步骤 2/7 · 打开 T-101 出口切断阀 V-101</strong>　同时确认 T-102 支路阀 V-102 处于关闭状态，避免两罐串通。',
        set: { 'V-101': 'open', 'V-102': 'closed' },
        focus: ['T-101', 'V-101', 'V-102'],
      },
      {
        text: '<strong>步骤 3/7 · 打开泵入口阀 V-103</strong>　建立泵入口流程。',
        set: { 'V-103': 'open' },
        focus: ['V-103'],
      },
      {
        text: '<strong>步骤 4/7 · 打开至 T-103 进料阀 V-105</strong>　打通目的罐进料通道（<b>同时确认 V-106 处于关闭状态</b>，避免串料）。',
        set: { 'V-105': 'open', 'V-106': 'closed' },
        focus: ['V-105', 'V-106'],
      },
      {
        text: '<strong>步骤 5/7 · 打开泵出口阀 V-104 后启动倒罐泵 P-101</strong>　出口阀未开启动泵将导致憋压，严禁如此操作。',
        set: { 'V-104': 'open', 'P-101': 'running' },
        focus: ['V-104', 'P-101'],
        flow: { from: 'T-101', to: 'T-103' },
      },
      {
        text: '<strong>步骤 6/7 · 监控液位与泵运行</strong>　T-101 液位下降至 <b>10%</b> 时准备停泵（观察管路流动方向与流动动画一致）。',
        set: { 'T-101.level': 0.1, 'P-101': 'running' },
        focus: ['T-101', 'P-101'],
        flow: { from: 'T-101', to: 'T-103' },
      },
      {
        text: '<strong>步骤 7/7 · 停泵、关阀、作业结束</strong>　停 P-101 → 关 V-104、V-105、V-103、V-101，现场恢复。<br/>— 数据上看：<b>阀门状态全部回位，管路流动消失</b>，这就是"操作留痕"的基础。',
        set: {
          'P-101': 'stopped',
          'V-104': 'closed',
          'V-105': 'closed',
          'V-103': 'closed',
          'V-101': 'closed',
        },
        focus: ['T-101'],
      },
    ],
  },
  {
    id: 'op2',
    name: '倒罐操作②：T-102 → T-104（原料罐倒至外送罐）',
    from: 'T-102',
    to: 'T-104',
    steps: [
      {
        text: '<strong>步骤 1/6 · 作业前确认</strong>　T-104 当前液位 55%，上限 85%，剩余接收空间有限，倒罐量按 30 m³ 控制。',
        focus: ['T-104', 'T-102'],
      },
      {
        text: '<strong>步骤 2/6 · 打开 T-102 出口阀 V-102</strong>，同时确认 T-101 支路 V-101 关闭。',
        set: { 'V-102': 'open', 'V-101': 'closed' },
        focus: ['V-102', 'V-101'],
      },
      {
        text: '<strong>步骤 3/6 · 打开至 T-104 进料阀 V-106</strong>，确认 V-105 关闭。',
        set: { 'V-106': 'open', 'V-105': 'closed' },
        focus: ['V-106', 'V-105'],
      },
      {
        text: '<strong>步骤 4/6 · 打开 V-103 / V-104 并启动 P-101</strong>。',
        set: { 'V-103': 'open', 'V-104': 'open', 'P-101': 'running' },
        focus: ['V-103', 'V-104', 'P-101'],
        flow: { from: 'T-102', to: 'T-104' },
      },
      {
        text: '<strong>步骤 5/6 · 监控 T-102 与 T-104 液位</strong>　T-102 降至 12%、T-104 升至 82% 时停泵。',
        set: { 'T-102.level': 0.12, 'T-104.level': 0.82 },
        focus: ['T-102', 'T-104'],
        flow: { from: 'T-102', to: 'T-104' },
      },
      {
        text: '<strong>步骤 6/6 · 停泵关阀</strong>　P-101 停 → 依次关闭 V-104、V-106、V-103、V-102。',
        set: {
          'P-101': 'stopped',
          'V-104': 'closed',
          'V-106': 'closed',
          'V-103': 'closed',
          'V-102': 'closed',
        },
        focus: ['T-102', 'T-104'],
      },
    ],
  },
  {
    id: 'op3',
    name: '成品外送：T-104 → 界区装车',
    from: 'T-104',
    to: 'BL',
    steps: [
      {
        text: '<strong>步骤 1/4 · 确认装车条件</strong>　装车申请已批、界区具备接收条件、T-104 液位 55% 满足外送要求。',
        focus: ['T-104', 'BL'],
      },
      {
        text: '<strong>步骤 2/4 · 打开 T-104 出口阀 V-107</strong>。',
        set: { 'V-107': 'open' },
        focus: ['V-107'],
      },
      {
        text: '<strong>步骤 3/4 · 缓慢开启界区调节阀 V-108</strong>　开度由小至大，观察管线流动；成品经位差自流（或外送泵）送至界区装车鹤管。',
        set: { 'V-108': 'open' },
        focus: ['V-108', 'BL'],
        flow: { from: 'T-104', to: 'BL' },
      },
      {
        text: '<strong>步骤 4/4 · 装车完成关阀</strong>　先关 V-108 再关 V-107，防止管线残压。',
        set: { 'V-108': 'closed', 'V-107': 'closed' },
        focus: ['T-104'],
      },
    ],
  },
  {
    id: 'op4',
    name: '⚠ 错误示范：倒罐过程中误开 V-106（串料）',
    from: 'T-101',
    to: 'T-104',
    steps: [
      {
        text: '<strong>步骤 1/3 · 已按操作规程①启动倒罐</strong>　T-101 → T-103 通道打开，P-101 运行中。',
        set: {
          'V-101': 'open',
          'V-103': 'open',
          'V-104': 'open',
          'V-105': 'open',
          'V-106': 'closed',
          'P-101': 'running',
        },
        focus: ['T-101', 'T-103'],
        flow: { from: 'T-101', to: 'T-103' },
      },
      {
        text: '<strong>⚠ 步骤 2/3 · 误将 V-106 打开</strong>　管路同时向 T-103 与 T-104 进料，两台罐分料不均；<b>若 T-104 已接近上限，将造成憋压甚至冒罐</b>。',
        set: { 'V-106': 'open' },
        focus: ['V-106', 'T-103', 'T-104'],
        flow: { from: 'T-101', to: 'T-104' },
        warn: true,
      },
      {
        text: '<strong>步骤 3/3 · 正确处置</strong>　立即关闭 V-106，恢复正常流程，记录异常。<br/>— 这层「操作规则校验」就是后续可以交给系统自动判定的部分。',
        set: { 'V-106': 'closed' },
        focus: ['V-106'],
        flow: { from: 'T-101', to: 'T-103' },
      },
    ],
  },
];
