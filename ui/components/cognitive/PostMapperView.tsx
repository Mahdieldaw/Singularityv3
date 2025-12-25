
import React from 'react';
import { MapperArtifact, ExploreAnalysis } from '../../../shared/contract';

interface PostMapperViewProps {
    artifact: MapperArtifact;
    analysis: ExploreAnalysis;
    onUnderstand: () => void;
    onDecide: () => void;
    isLoading?: boolean;
    className?: string;
}

export const PostMapperView: React.FC<PostMapperViewProps> = ({
    artifact,
    analysis,
    onUnderstand,
    onDecide,
    isLoading = false,
    className = ''
}) => {
    return (
        <div className={`flex flex-col gap-4 p-4 rounded-lg bg-white/5 border border-white/10 ${className}`}>
            {/* Header / Souvenir */}
            <div className="flex flex-col gap-1">
                <h3 className="text-sm font-medium text-white/50 uppercase tracking-wider">
                    Decision Map Ready
                </h3>
                {artifact.souvenir && (
                    <p className="text-lg font-serif italic text-white/90">
                        "{artifact.souvenir}"
                    </p>
                )}
            </div>

            {/* Analysis Chips */}
            <div className="flex flex-wrap gap-2">
                <div className="px-2 py-1 rounded bg-white/5 border border-white/10 text-xs text-white/70">
                    Query: {analysis.queryType}
                </div>
                <div className="px-2 py-1 rounded bg-white/5 border border-white/10 text-xs text-white/70">
                    Container: {analysis.containerType.replace('_', ' ')}
                </div>
                <div className="px-2 py-1 rounded bg-white/5 border border-white/10 text-xs text-white/70">
                    State: {analysis.escapeVelocity ? 'Escape Velocity' : artifact.topology}
                </div>
                <div className="px-2 py-1 rounded bg-white/5 border border-white/10 text-xs text-white/70">
                    Models: {artifact.model_count}
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 mt-2">
                <button
                    onClick={onUnderstand}
                    className="px-4 py-2 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-medium text-white transition-colors"
                >
                    {isLoading ? '...' : 'Understand'}
                </button>
                <button
                    onClick={onDecide}
                    className={`px-4 py-2 rounded-md border text-sm font-medium transition-colors ${analysis.escapeVelocity
                        ? 'bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-500/50 text-emerald-200'
                        : 'bg-white/5 hover:bg-white/10 border-white/10 text-white'
                        }`}
                >
                    {isLoading ? 'Processing...' : 'Decide'}
                </button>
            </div>

            {/* Dimensions/Tensions Preview (Optional) */}
            <div className="text-xs text-white/40">
                Found {artifact.dimensions_found?.length || 0} dimensions & {artifact.tensions?.length || 0} tensions.
            </div>
        </div>
    );
};
