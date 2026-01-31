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

  const paragraphPositions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    for (const n of nodesForRender) {
      map.set(n.paragraphId, { x: n.x, y: n.y });
    }
    return map;
  }, [nodesForRender]);

  const claimPositions = useMemo(() => {
    const items = (claims || []).map((claim) => {
      const paraIds = (claim.sourceStatementIds || [])
        .map((sid) => statementToParagraphId.get(sid))
        .filter((pid): pid is string => !!pid);

      const uniqueParaIds = Array.from(new Set(paraIds));
      if (uniqueParaIds.length === 0) {
        return { claim, x: 0, y: 0, hasPosition: false, sourceParagraphIds: [] as string[] };
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

      return {
        claim,
        x: count > 0 ? sumX / count : 0,
        y: count > 0 ? sumY / count : 0,
        hasPosition: count > 0,
        sourceParagraphIds: uniqueParaIds,
      };
    });

    return items;
  }, [claims, paragraphPositions, statementToParagraphId]);

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
        <div className="flex-1" />
        <div className="text-xs text-text-muted">
          {nodeCount} paragraphs · {positionedClaims} claims positioned
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <svg width={width} height={height} className="bg-black/20 rounded-xl border border-white/10 mx-auto">
          {showEdges &&
            (graph?.edges || []).map((edge, i) => {
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
                  strokeWidth={isHighlighted ? 2 : Math.max(0.5, edge.similarity * 2)}
                  opacity={isHighlighted ? 1 : 0.5}
                />
              );
            })}

          {nodesForRender.map((node) => {
            const isHighlighted = !!hoveredClaim && hoveredClaim.sourceParagraphIds.includes(node.paragraphId);
            const color = MODEL_COLORS[node.modelIndex % MODEL_COLORS.length];
            const size = isHighlighted ? 8 : 5 + (node.mutualDegree || 0) * 0.5;

            return (
              <circle
                key={node.paragraphId}
                cx={scaleX(node.x)}
                cy={scaleY(node.y)}
                r={size}
                fill={color}
                opacity={isHighlighted ? 1 : 0.7}
                stroke={isHighlighted ? "#fff" : "none"}
                strokeWidth={isHighlighted ? 2 : 0}
              >
                <title>{`Paragraph ${node.paragraphId}\nModel ${node.modelIndex + 1}`}</title>
              </circle>
            );
          })}

          {showClaims &&
            claimPositions
              .filter((c) => c.hasPosition)
              .map(({ claim, x, y }) => {
                const cx = scaleX(x);
                const cy = scaleY(y);
                const size = 10;
                const isHovered = hoveredClaimId === claim.id;
                const label = claim.label || claim.id;

                return (
                  <g
                    key={claim.id}
                    onMouseEnter={() => setHoveredClaimId(claim.id)}
                    onMouseLeave={() => setHoveredClaimId(null)}
                    style={{ cursor: "pointer" }}
                  >
                    <polygon
                      points={`${cx},${cy - size} ${cx + size * 0.7},${cy} ${cx},${cy + size} ${cx - size * 0.7},${cy}`}
                      fill={isHovered ? "#fbbf24" : "#f59e0b"}
                      stroke="#000"
                      strokeWidth={1}
                      opacity={isHovered ? 1 : 0.85}
                    />
                    {isHovered && (
                      <text x={cx} y={cy - size - 8} textAnchor="middle" fill="#fff" fontSize={11} fontWeight={500}>
                        {label.length > 40 ? `${label.slice(0, 40)}…` : label}
                      </text>
                    )}
                  </g>
                );
              })}
        </svg>
      </div>

      <div className="flex items-center gap-6 px-4 py-2 border-t border-white/10 text-xs text-text-muted">
        <div className="flex items-center gap-2">
          <span>Models:</span>
          {MODEL_COLORS.slice(0, Math.min(8, Math.max(1, nodesForRender.reduce((m, n) => Math.max(m, n.modelIndex + 1), 0)))).map(
            (color, i) => (
              <div key={i} className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                <span>{i + 1}</span>
              </div>
            )
          )}
        </div>
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
