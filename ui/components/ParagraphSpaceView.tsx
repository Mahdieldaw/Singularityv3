import { useMemo, useState } from "react";
import type { Claim, PipelineParagraphProjectionResult, PipelineShadowStatement, PipelineSubstrateGraph } from "../../shared/contract";

interface Props {
  graph: PipelineSubstrateGraph | null | undefined;
  paragraphProjection?: PipelineParagraphProjectionResult | null | undefined;
  claims: Claim[] | null | undefined;
  shadowStatements: PipelineShadowStatement[] | null | undefined;
  citationSourceOrder?: Record<string | number, string>;
}

const MODEL_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];

export function ParagraphSpaceView({ graph, paragraphProjection, claims, shadowStatements }: Props) {
  const [showEdges, setShowEdges] = useState(true);
  const [showClaims, setShowClaims] = useState(true);
  const [hoveredClaimId, setHoveredClaimId] = useState<string | null>(null);
  const [colorByDistortion, setColorByDistortion] = useState(false);
  const [isolatedModelIndex, setIsolatedModelIndex] = useState<number | null>(null);

  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  const quantile = (values: number[], q: number) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = (sorted.length - 1) * clamp01(q);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    const t = idx - lo;
    return sorted[lo] * (1 - t) + sorted[hi] * t;
  };
  const distortionColor = (t: number) => `hsl(${Math.round(220 - 220 * clamp01(t))} 85% 55%)`;

  const statementToParagraphId = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of paragraphProjection?.paragraphs || []) {
      for (const sid of p.statementIds || []) {
        if (sid && p.id) map.set(sid, p.id);
      }
    }
    for (const stmt of shadowStatements || []) {
      const pid = stmt.geometricCoordinates?.paragraphId;
      if (stmt?.id && pid) map.set(stmt.id, pid);
    }
    return map;
  }, [paragraphProjection, shadowStatements]);

  type EffectiveNode = { paragraphId: string; modelIndex: number; x: number; y: number; mutualDegree?: number };

  const nodesForRender: EffectiveNode[] = useMemo(() => {
    const nodes = Array.isArray(graph?.nodes) ? graph?.nodes : [];
    if (nodes.length > 0) {
      return nodes.map((n) => ({
        paragraphId: n.paragraphId,
        modelIndex: n.modelIndex,
        x: n.x,
        y: n.y,
        mutualDegree: n.mutualDegree,
      }));
    }

    const paras = paragraphProjection?.paragraphs || [];
    if (paras.length === 0) return [];

    const goldenAngle = 2.399963229728653;
    const n = paras.length;
    return paras.map((p, i) => {
      const r = Math.sqrt((i + 0.5) / Math.max(1, n));
      const theta = i * goldenAngle;
      return {
        paragraphId: p.id,
        modelIndex: p.modelIndex ?? 0,
        x: r * Math.cos(theta),
        y: r * Math.sin(theta),
        mutualDegree: 0,
      };
    });
  }, [graph, paragraphProjection]);

  const modelCount = useMemo(() => {
    return nodesForRender.reduce((m, n) => Math.max(m, (n.modelIndex ?? 0) + 1), 0);
  }, [nodesForRender]);

  const paragraphPositions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    for (const n of nodesForRender) {
      map.set(n.paragraphId, { x: n.x, y: n.y });
    }
    return map;
  }, [nodesForRender]);

  const paragraphModelIndex = useMemo(() => {
    const map = new Map<string, number>();
    for (const n of nodesForRender) {
      map.set(n.paragraphId, n.modelIndex ?? 0);
    }
    return map;
  }, [nodesForRender]);

  const visibleParagraphIds = useMemo(() => {
    if (isolatedModelIndex === null) return null;
    const set = new Set<string>();
    for (const n of nodesForRender) {
      if (n.modelIndex === isolatedModelIndex) set.add(n.paragraphId);
    }
    return set;
  }, [isolatedModelIndex, nodesForRender]);

  const distortionByParagraphId = useMemo(() => {
    const edges = Array.isArray(graph?.edges) ? graph!.edges : [];
    if (edges.length === 0) return new Map<string, { distortion: number; avgPre: number; avgPost: number }>();

    const adjacency = new Map<string, Array<{ neighborId: string; similarity: number }>>();
    const push = (a: string, b: string, similarity: number) => {
      if (!adjacency.has(a)) adjacency.set(a, []);
      adjacency.get(a)!.push({ neighborId: b, similarity });
    };

    for (const e of edges) {
      const s = String(e.source);
      const t = String(e.target);
      const sim = typeof e.similarity === "number" ? e.similarity : Number(e.similarity) || 0;
      push(s, t, sim);
      push(t, s, sim);
    }

    const preById = new Map<string, number>();
    const postById = new Map<string, number>();

    for (const n of nodesForRender) {
      const id = n.paragraphId;
      const neighbors = adjacency.get(id) || [];
      if (neighbors.length === 0) continue;
      const posA = paragraphPositions.get(id);
      if (!posA) continue;

      let preSum = 0;
      let postSum = 0;
      let used = 0;

      for (const nb of neighbors) {
        const posB = paragraphPositions.get(nb.neighborId);
        if (!posB) continue;
        const preD = 1 - nb.similarity;
        const dx = posA.x - posB.x;
        const dy = posA.y - posB.y;
        const postD = Math.sqrt(dx * dx + dy * dy);
        preSum += preD;
        postSum += postD;
        used++;
      }

      if (used === 0) continue;
      preById.set(id, preSum / used);
      postById.set(id, postSum / used);
    }

    const preVals = Array.from(preById.values());
    const postVals = Array.from(postById.values());
    const globalPre = preVals.length > 0 ? preVals.reduce((a, b) => a + b, 0) / preVals.length : 1;
    const globalPost = postVals.length > 0 ? postVals.reduce((a, b) => a + b, 0) / postVals.length : 1;
    const eps = 1e-9;

    const out = new Map<string, { distortion: number; avgPre: number; avgPost: number }>();
    for (const [id, avgPre] of preById) {
      const avgPost = postById.get(id);
      if (typeof avgPost !== "number") continue;
      const d = (avgPost / (globalPost + eps)) / (avgPre / (globalPre + eps));
      out.set(id, { distortion: d, avgPre, avgPost });
    }
    return out;
  }, [graph, nodesForRender, paragraphPositions]);

  const distortionScale = useMemo(() => {
    const vals = Array.from(distortionByParagraphId.values()).map((v) => v.distortion).filter((v) => Number.isFinite(v));
    if (vals.length === 0) return { lo: 1, hi: 1 };
    const lo = quantile(vals, 0.05);
    const hi = Math.max(lo + 1e-9, quantile(vals, 0.95));
    return { lo, hi };
  }, [distortionByParagraphId]);

  const claimPositions = useMemo(() => {
    const items = (claims || []).map((claim) => {
      const paraIds = (claim.sourceStatementIds || [])
        .map((sid) => statementToParagraphId.get(sid))
        .filter((pid): pid is string => !!pid);

      const uniqueParaIds = Array.from(new Set(paraIds));
      if (uniqueParaIds.length === 0) {
        return { claim, x: 0, y: 0, hasPosition: false, sourceParagraphIds: [] as string[], tension: 0 };
      }

      let sumX = 0;
      let sumY = 0;
      let count = 0;
      for (const pid of uniqueParaIds) {
        const pos = paragraphPositions.get(pid);
        if (!pos) continue;
        sumX += pos.x;
        sumY += pos.y;
        count++;
      }

      let maxPairwise = 0;
      const positioned = uniqueParaIds.filter((pid) => paragraphPositions.has(pid));
      for (let i = 0; i < positioned.length; i++) {
        const a = paragraphPositions.get(positioned[i]);
        if (!a) continue;
        for (let j = i + 1; j < positioned.length; j++) {
          const b = paragraphPositions.get(positioned[j]);
          if (!b) continue;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > maxPairwise) maxPairwise = d;
        }
      }

      return {
        claim,
        x: count > 0 ? sumX / count : 0,
        y: count > 0 ? sumY / count : 0,
        hasPosition: count > 0,
        sourceParagraphIds: uniqueParaIds,
        tension: maxPairwise,
      };
    });

    return items;
  }, [claims, paragraphPositions, statementToParagraphId]);

  const claimTensionScale = useMemo(() => {
    const vals = claimPositions.filter((c) => c.hasPosition).map((c) => c.tension).filter((v) => Number.isFinite(v) && v > 0);
    if (vals.length === 0) return { p95: 1 };
    const p95 = Math.max(1e-9, quantile(vals, 0.95));
    return { p95 };
  }, [claimPositions]);

  const hoveredClaim = hoveredClaimId ? claimPositions.find((c) => c.claim.id === hoveredClaimId) : null;

  if (nodesForRender.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-text-muted text-sm">
        <div className="text-center">
          <div className="text-sm font-semibold">No paragraph space data available</div>
          <div className="text-xs mt-1 opacity-60">Run a query with embeddings enabled</div>
        </div>
      </div>
    );
  }

  const width = 900;
  const height = 560;
  const margin = 48;
  const scaleX = (v: number) => margin + ((v + 1) / 2) * (width - 2 * margin);
  const scaleY = (v: number) => margin + ((1 - v) / 2) * (height - 2 * margin);

  const nodeCount = nodesForRender.length;
  const positionedClaims = claimPositions.filter((c) => c.hasPosition).length;

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex items-center gap-4 px-4 py-2 border-b border-white/10">
        <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer select-none">
          <input type="checkbox" checked={showEdges} onChange={(e) => setShowEdges(e.target.checked)} className="rounded" />
          Show edges
        </label>
        <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer select-none">
          <input type="checkbox" checked={showClaims} onChange={(e) => setShowClaims(e.target.checked)} className="rounded" />
          Show claims
        </label>
        <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer select-none">
          <input
            type="checkbox"
            checked={colorByDistortion}
            onChange={(e) => setColorByDistortion(e.target.checked)}
            className="rounded"
          />
          Distortion heatmap
        </label>
        <div className="flex-1" />
        <div className="text-xs text-text-muted">
          {nodeCount} paragraphs · {positionedClaims} claims positioned
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <svg width={width} height={height} className="bg-black/20 rounded-xl border border-white/10 mx-auto">
          {showEdges &&
            (graph?.edges || []).map((edge, i) => {
              if (visibleParagraphIds && (!visibleParagraphIds.has(edge.source) || !visibleParagraphIds.has(edge.target))) return null;
              const s = paragraphPositions.get(edge.source);
              const t = paragraphPositions.get(edge.target);
              if (!s || !t) return null;

              const isHighlighted =
                !!hoveredClaim &&
                hoveredClaim.sourceParagraphIds.includes(edge.source) &&
                hoveredClaim.sourceParagraphIds.includes(edge.target);

              return (
                <line
                  key={`${edge.source}-${edge.target}-${i}`}
                  x1={scaleX(s.x)}
                  y1={scaleY(s.y)}
                  x2={scaleX(t.x)}
                  y2={scaleY(t.y)}
                  stroke={isHighlighted ? "#fbbf24" : "rgba(255,255,255,0.15)"}
                  strokeWidth={isHighlighted ? 2 : Math.max(0.5, (Number(edge.similarity) || 0) * 2)}
                  opacity={isHighlighted ? 1 : 0.5}
                />
              );
            })}

          {nodesForRender.map((node) => {
            const isHighlighted = !!hoveredClaim && hoveredClaim.sourceParagraphIds.includes(node.paragraphId);
            const isVisible = isolatedModelIndex === null || node.modelIndex === isolatedModelIndex;
            const distortion = distortionByParagraphId.get(node.paragraphId);
            const t = distortion ? (distortion.distortion - distortionScale.lo) / (distortionScale.hi - distortionScale.lo) : 0;
            const color = colorByDistortion && distortion ? distortionColor(t) : MODEL_COLORS[node.modelIndex % MODEL_COLORS.length];
            const size = isHighlighted ? 8 : 5 + (node.mutualDegree || 0) * 0.5;

            return (
              <circle
                key={node.paragraphId}
                cx={scaleX(node.x)}
                cy={scaleY(node.y)}
                r={size}
                fill={color}
                opacity={isHighlighted ? 1 : isVisible ? 0.75 : 0.07}
                stroke={isHighlighted ? "#fff" : "none"}
                strokeWidth={isHighlighted ? 2 : 0}
              >
                <title>
                  {`Paragraph ${node.paragraphId}\nModel ${node.modelIndex + 1}${
                    distortion
                      ? `\nDistortion ${(distortion.distortion || 0).toFixed(2)}\nAvg pre ${(distortion.avgPre || 0).toFixed(3)} · Avg post ${(distortion.avgPost || 0).toFixed(3)}`
                      : ""
                  }`}
                </title>
              </circle>
            );
          })}

          {showClaims &&
            claimPositions
              .filter((c) => c.hasPosition)
              .map(({ claim, x, y, sourceParagraphIds, tension }) => {
                const cx = scaleX(x);
                const cy = scaleY(y);
                const size = 10;
                const isHovered = hoveredClaimId === claim.id;
                const label = claim.label || claim.id;
                const inIsolatedModel =
                  isolatedModelIndex === null
                    ? true
                    : sourceParagraphIds.some((pid) => {
                        return paragraphModelIndex.get(pid) === isolatedModelIndex;
                      });
                const tensionT = clamp01(tension / (claimTensionScale.p95 || 1));
                const strokeWidth = 1 + 3 * tensionT;

                return (
                  <g
                    key={claim.id}
                    onMouseEnter={() => setHoveredClaimId(claim.id)}
                    onMouseLeave={() => setHoveredClaimId(null)}
                    style={{ cursor: "pointer" }}
                    opacity={inIsolatedModel ? 1 : 0.18}
                  >
                    <polygon
                      points={`${cx},${cy - size} ${cx + size * 0.7},${cy} ${cx},${cy + size} ${cx - size * 0.7},${cy}`}
                      fill={isHovered ? "#fbbf24" : "#f59e0b"}
                      stroke="#fff"
                      strokeWidth={strokeWidth}
                      opacity={isHovered ? 1 : 0.85}
                    />
                    {isHovered && (
                      <text x={cx} y={cy - size - 8} textAnchor="middle" fill="#fff" fontSize={11} fontWeight={500}>
                        {label.length > 40 ? `${label.slice(0, 40)}…` : label}
                      </text>
                    )}
                    {tensionT > 0.85 && (
                      <animate
                        attributeName="opacity"
                        values={`${inIsolatedModel ? 0.55 : 0.12};${inIsolatedModel ? 1 : 0.22};${inIsolatedModel ? 0.55 : 0.12}`}
                        dur={`${1.8 - 0.7 * (tensionT - 0.85) / 0.15}s`}
                        repeatCount="indefinite"
                      />
                    )}
                  </g>
                );
              })}
        </svg>
      </div>

      <div className="flex items-center gap-6 px-4 py-2 border-t border-white/10 text-xs text-text-muted">
        <div className="flex items-center gap-2">
          <span>Models:</span>
          <button
            type="button"
            className="px-2 py-1 rounded border border-white/10 hover:border-white/25 text-[11px]"
            onClick={() => setIsolatedModelIndex(null)}
            style={{ opacity: isolatedModelIndex === null ? 1 : 0.6 }}
            title="Show all models"
          >
            All
          </button>
          {MODEL_COLORS.slice(0, Math.min(8, Math.max(1, modelCount))).map((color, i) => {
            const active = isolatedModelIndex === i;
            const dimmed = isolatedModelIndex !== null && isolatedModelIndex !== i;
            return (
              <button
                key={i}
                type="button"
                className="flex items-center gap-1 px-2 py-1 rounded border hover:border-white/25"
                style={{ borderColor: active ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.1)", opacity: dimmed ? 0.5 : 1 }}
                onClick={() => setIsolatedModelIndex((prev) => (prev === i ? null : i))}
                title={active ? "Clear model isolate" : `Isolate model ${i + 1}`}
              >
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                <span>{i + 1}</span>
              </button>
            );
          })}
        </div>
        {colorByDistortion && (
          <div className="flex items-center gap-2">
            <span>Distortion:</span>
            <div
              className="w-20 h-2 rounded"
              style={{
                background: `linear-gradient(90deg, ${distortionColor(0)} 0%, ${distortionColor(0.5)} 50%, ${distortionColor(1)} 100%)`,
              }}
              title={`Scaled to p5–p95: ${distortionScale.lo.toFixed(2)}–${distortionScale.hi.toFixed(2)}`}
            />
          </div>
        )}
        <div className="flex items-center gap-2">
          <svg width={14} height={14} viewBox="-7 -7 14 14">
            <polygon points="0,-6 4,0 0,6 -4,0" fill="#f59e0b" stroke="#000" strokeWidth={0.5} />
          </svg>
          <span>Claim (at source centroid)</span>
        </div>
      </div>
    </div>
  );
}
