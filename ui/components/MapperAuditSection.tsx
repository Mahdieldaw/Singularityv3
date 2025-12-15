import React from "react";

interface MapperAuditSectionProps {
    audit: {
        complete: boolean;
        unlistedOptions: Array<{
            title: string;
            description: string;
            sourceProvider: string;
        }>;
    };
    className?: string;
}

export const MapperAuditSection: React.FC<MapperAuditSectionProps> = ({
    audit,
    className = ""
}) => {
    if (audit.complete) {
        return (
            <div className={`flex items-center gap-2 text-xs text-green-400/70 ${className}`}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Mapper captured all distinct approaches</span>
            </div>
        );
    }

    if (!audit.unlistedOptions || audit.unlistedOptions.length === 0) {
        return null;
    }

    return (
        <div className={`bg-purple-500/10 border border-purple-500/20 rounded-xl p-5 ${className}`}>
            <div className="flex items-center gap-2 mb-4">
                <span className="w-2 h-2 rounded-full bg-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.5)]" />
                <h4 className="text-xs font-bold text-purple-200 uppercase tracking-wider">
                    Unlisted Options Found
                </h4>
            </div>

            <div className="space-y-3">
                {audit.unlistedOptions.map((option, idx) => (
                    <div key={idx} className="border-l-2 border-purple-500/30 pl-3">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h5 className="text-sm font-semibold text-purple-100">
                                {option.title}
                            </h5>
                            <span className="text-[10px] text-purple-400/60 uppercase tracking-wide">
                                via {option.sourceProvider}
                            </span>
                        </div>
                        <p className="text-xs text-purple-200/70 mt-1 leading-relaxed">
                            {option.description}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );
};
