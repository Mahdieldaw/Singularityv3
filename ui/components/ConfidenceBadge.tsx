import React from "react";

interface ConfidenceBadgeProps {
    score: number; // 0.0 to 1.0
    className?: string;
}

export const ConfidenceBadge: React.FC<ConfidenceBadgeProps> = ({ score, className = "" }) => {
    // Determine color based on score
    let bgClass = "bg-red-500/20 text-red-300 border-red-500/30";
    let label = "Low Confidence";

    if (score >= 0.8) {
        bgClass = "bg-green-500/20 text-green-300 border-green-500/30";
        label = "High Confidence";
    } else if (score >= 0.5) {
        bgClass = "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";
        label = "Medium Confidence";
    }

    const percentage = Math.round(score * 100);

    return (
        <div
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${bgClass} ${className}`}
            title={`Confidence Score: ${score.toFixed(2)}`}
        >
            <span className="mr-1.5 opacity-70">{label}</span>
            <span className="font-bold">{percentage}%</span>
        </div>
    );
};
