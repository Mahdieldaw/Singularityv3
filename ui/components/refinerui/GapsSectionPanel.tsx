/**
 * @deprecated This component is deprecated. 
 * Gap signals are now handled by SignalCard with type='gap' or type='blindspot'.
 * This file is kept for reference but should not be used.
 */

import React from "react";
import type { Signal } from "../../../shared/parsing-utils";

interface GapsSectionPanelProps {
    /** @deprecated Use signals with type='gap' or 'blindspot' instead */
    gaps?: Array<{ title?: string; explanation?: string; category?: 'foundational' | 'tactical' }>;
    /** Use gap signals from new structure */
    gapSignals?: Signal[];
    className?: string;
}

/**
 * @deprecated Use SignalCard for displaying gap/blindspot signals.
 */
export const GapsSectionPanel: React.FC<GapsSectionPanelProps> = ({
    gaps,
    gapSignals,
    className = ""
}) => {
    // Deprecated - return null
    console.warn('GapsSectionPanel is deprecated. Use SignalCard for gap signals.');
    return null;
};
