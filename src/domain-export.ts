/**
 * 「画布 → 业务数据」的导出逻辑
 *
 * 这是本项目最重要的一层：图形只是表达，真正要沉淀下来的是这些结构化数据。
 */
import type { Graph } from '@antv/x6';
import { SHAPE } from './shapes';
import { buildStats } from './ops';

export interface DomainExport {
  meta: {
    name: string;
    generatedAt: string;
    schema: string;
    unit: string;
  };
  devices: Array<Record<string, unknown>>;
  pipes: Array<Record<string, unknown>>;
  /** 拓扑邻接表：设备 → 相连的管段 */
  adjacency: Record<string, string[]>;
  /** 连通性判定（只经过"通"的设备） */
  connectivity: {
    openValves: string[];
    runningPumps: string[];
    flowingPipes: string[];
  };
  stats: Record<string, unknown>;
}

export function buildDomainExport(
  graph: Graph,
  name = '罐区工艺流程图',
  wetEdgeIds: Set<string> = new Set(),
): DomainExport {
  const devices: Array<Record<string, unknown>> = [];
  const adjacency: Record<string, string[]> = {};
  const openValves: string[] = [];
  const runningPumps: string[] = [];

  graph.getNodes().forEach((node: any) => {
    const d = node.getData() ?? {};
    const pos = node.getPosition();
    devices.push({
      id: node.id,
      kind: d.kind,
      tag: d.tag,
      name: d.name ?? '',
      medium: d.medium ?? '',
      state: d.state ?? null,
      level: d.level ?? null,
      service: d.service ?? '',
      shape: node.shape,
      /** 图形坐标属于"表达层"，与工艺数据分开存放 */
      layout: { x: Math.round(pos.x), y: Math.round(pos.y) },
      ports: (node.getPorts() ?? []).map((p: any) => ({
        id: p.id,
        dir: p.data?.dir ?? 'bi',
        label: p.data?.label ?? '',
        medium: p.data?.medium ?? '',
      })),
    });

    adjacency[node.id] = [];

    if (d.state === 'open' && (node.shape === SHAPE.valve || node.shape === SHAPE.cvalve)) {
      openValves.push(d.tag);
    }
    if (d.state === 'running' && node.shape === SHAPE.pump) runningPumps.push(d.tag);
  });

  const pipes: Array<Record<string, unknown>> = [];
  graph.getEdges().forEach((edge: any) => {
    const d = edge.getData() ?? {};
    const s = edge.getSourceCellId();
    const t = edge.getTargetCellId();
    const sPort = edge.getSourcePortId();
    const tPort = edge.getTargetPortId();
    const sCell: any = s ? graph.getCellById(s) : null;
    const tCell: any = t ? graph.getCellById(t) : null;

    pipes.push({
      id: edge.id,
      tag: d.tag ?? '',
      dn: d.dn ?? '',
      pn: d.pn ?? '',
      medium: d.medium ?? '',
      fluid: d.fluid ?? '',
      from: { device: sCell?.getData()?.tag ?? s, port: sPort },
      to: { device: tCell?.getData()?.tag ?? t, port: tPort },
    });

    if (adjacency[s]) adjacency[s].push(edge.id);
    if (adjacency[t]) adjacency[t].push(edge.id);
  });

  const stats = buildStats(graph);

  return {
    meta: {
      name,
      generatedAt: new Date().toISOString(),
      schema: 'tankfarm-demo/1.0',
      unit: 'level: 0~1，DN: mm，PN: bar(class)',
    },
    devices,
    pipes,
    adjacency,
    connectivity: {
      openValves,
      runningPumps,
      /** 由拓扑自动推导：管内实际有介质流动的管段 */
      flowingPipes: pipes.filter((p) => wetEdgeIds.has(String(p.id))).map((p) => String(p.tag || p.id)),
    },
    stats: stats as unknown as Record<string, unknown>,
  };
}
