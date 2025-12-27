/**
 * SummaryBar.tsx
 * 
 * Universal data-driven summary bar for dimension-first explore view
 */

import React from 'react';
import { SummaryBarData } from '../../../shared/contract';

interface SummaryBarProps {
    data: SummaryBarData;
}

export const SummaryBar: React.FC<SummaryBarProps> = ({ data }) => {
    const { lead, coverage, signals, meta } = data;

    // Determine lead type styling
    const leadStyle = lead.type === 'consensus'
        ? 'text-emerald-400'
        : lead.type === 'contested'
            ? 'text-red-400'
            : 'text-amber-400';

    return (
        <div className="w-full bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4 mb-6">
            {/* Lead Statement */}
            <div className="mb-3">
                <p className={`text-lg font-medium ${leadStyle}`}>
                    {lead.text}
                    {lead.support && (
                        <span className="text-white/40 text-sm ml-2">
                            ({lead.support} models)
                        </span>
                    )}
                </p>
            </div>

            {/* Coverage Badges */}
            <div className="flex flex-wrap gap-3 mb-3">
                {coverage.gaps > 0 && (
                    <Badge
                        icon="🔶"
                        label="Gaps"
                        count={coverage.gaps}
                        variant="amber"
                        pulse={coverage.gaps > coverage.settled}
                    />
                )}
                {coverage.contested > 0 && (
                    <Badge
                        icon="⚔️"
                        label="Contested"
                        count={coverage.contested}
                        variant="red"
                    />
                )}
                {coverage.settled > 0 && (
                    <Badge
                        icon="✅"
                        label="Settled"
                        count={coverage.settled}
                        variant="green"
                    />
                )}
            </div>

            {/* Signal Badges */}
            <div className="flex flex-wrap gap-2 text-xs">
                {signals.challengers > 0 && (
                    <SignalBadge icon="⚡" label={`${signals.challengers} challenger${signals.challengers > 1 ? 's' : ''}`} />
                )}
                {signals.conditions > 0 && (
                    <SignalBadge icon="📍" label={`${signals.conditions} condition${signals.conditions > 1 ? 's' : ''}`} />
                )}
                {signals.tensions > 0 && (
                    <SignalBadge icon="⚠️" label={`${signals.tensions} tension${signals.tensions > 1 ? 's' : ''}`} />
                )}
                {signals.ghost && (
                    <SignalBadge icon="👻" label="Ghost" tooltip={signals.ghost} />
                )}

                <div className="ml-auto flex items-center gap-3 text-white/30">
                    <MetaBadge icon={getQueryIcon(meta.queryType)} label={meta.queryType} />
                    <MetaBadge
                        icon={meta.escapeVelocity ? "🚀" : "📊"}
                        label={meta.escapeVelocity ? "Escape Velocity" : meta.topology.replace('_', ' ')}
                        pulse={meta.escapeVelocity}
                    />
                    <span className="hidden sm:inline">|</span>
                    <span className="text-[10px] uppercase font-medium">
                        {meta.modelCount} models • {coverage.total} dimensions
                    </span>
                    <span className="text-[10px] uppercase font-medium">
                        {meta.strength}% strength
                    </span>
                </div>
            </div>
        </div>
    );
};

// Helper for query icons
const getQueryIcon = (type: string): string => {
    const icons: Record<string, string> = {
        informational: 'ℹ️',
        procedural: '📝',
        advisory: '⚖️',
        comparative: '🔄',
        creative: '🎨',
        predictive: '🔮',
        interpretive: '🔍',
        general: '💬'
    };
    return icons[type] || '💬';
};

// Meta Badge component
interface MetaBadgeProps {
    icon: string;
    label: string;
    pulse?: boolean;
}

const MetaBadge: React.FC<MetaBadgeProps> = ({ icon, label, pulse }) => (
    <span className={`inline-flex items-center gap-1 uppercase tracking-tighter text-[10px] font-bold ${pulse ? 'text-emerald-400 animate-pulse' : ''}`}>
        <span>{icon}</span>
        <span>{label}</span>
    </span>
);

// Badge component
interface BadgeProps {
    icon: string;
    label: string;
    count: number;
    variant: 'amber' | 'red' | 'green';
    pulse?: boolean;
}

const Badge: React.FC<BadgeProps> = ({ icon, label, count, variant, pulse }) => {
    const colors = {
        amber: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
        red: 'bg-red-500/10 text-red-400 border-red-500/30',
        green: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    };

    return (
        <span className={`
            inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm
            border ${colors[variant]}
            ${pulse ? 'animate-pulse' : ''}
        `}>
            <span>{icon}</span>
            <span>{label}</span>
            <span className="font-medium">{count}</span>
        </span>
    );
};

// Signal Badge component
interface SignalBadgeProps {
    icon: string;
    label: string;
    tooltip?: string;
}

const SignalBadge: React.FC<SignalBadgeProps> = ({ icon, label, tooltip }) => (
    <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/5 text-white/50"
        title={tooltip}
    >
        <span>{icon}</span>
        <span>{label}</span>
    </span>
);
