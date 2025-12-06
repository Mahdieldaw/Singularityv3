import React from "react";
import { useAtom, useAtomValue } from "jotai";
import { launchpadOpenAtom, showLaunchpadTabAtom } from "../state/atoms";
import { cn } from "../utils/cn";

export const LaunchpadTab: React.FC = () => {
    const [isOpen, setIsOpen] = useAtom(launchpadOpenAtom);
    const showTab = useAtomValue(showLaunchpadTabAtom);

    if (!showTab || isOpen) return null;

    return (
        <div className="fixed left-0 top-1/2 -translate-y-1/2 z-[2900]">
            <button
                onClick={() => setIsOpen(true)}
                className={cn(
                    "group flex items-center justify-center",
                    "w-2 hover:w-3 h-16 bg-brand-500/80 rounded-r-lg shadow-[0_0_12px_var(--brand-glow)]",
                    "transition-all duration-300 ease-out cursor-pointer",
                    "hover:bg-brand-400 hover:shadow-[0_0_20px_var(--brand-glow)]"
                )}
                title="Open Launchpad"
            >
                <div className="w-[1px] h-8 bg-white/50 rounded-full group-hover:scale-y-125 transition-transform" />
            </button>

            {/* Pulse effect for visibility */}
            <div className="absolute inset-0 bg-brand-400/30 rounded-r-lg animate-pulse -z-10 blur-sm" />
        </div>
    );
};

export default LaunchpadTab;
