import React from "react";
import { CopyButton } from "../../CopyButton";

interface SouvenirCardProps {
    content: string;
}

export const SouvenirCard: React.FC<SouvenirCardProps> = ({ content }) => {
    if (!content) return null;

    return (
        <div className="group relative bg-surface-base border border-border-subtle rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <CopyButton text={content} />
            </div>
            <div className="flex items-start gap-3">
                <div className="mt-1 flex-shrink-0 w-6 h-6 flex items-center justify-center bg-primary-500/10 text-primary-500 rounded-full text-xs">
                    💎
                </div>
                <div>
                    <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Souvenir</h4>
                    <p className="text-base text-text-primary font-medium leading-relaxed">
                        {content}
                    </p>
                </div>
            </div>
        </div>
    );
};
