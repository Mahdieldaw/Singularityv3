import React, { useState, useRef, useEffect } from "react";
import clsx from "clsx";
import "./antagonist.css";

interface DimensionDropdownProps {
    variable: string;
    options: string[];
    selectedValue: string | null;
    onSelect: (value: string) => void;
}

export const DimensionDropdown: React.FC<DimensionDropdownProps> = ({
    variable,
    options,
    selectedValue,
    onSelect,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLSpanElement>(null);

    // Close on outside click
    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };

        // Use capture phase to catch clicks before they're stopped
        document.addEventListener("click", handleClickOutside, true);
        return () => document.removeEventListener("click", handleClickOutside, true);
    }, [isOpen]);

    const displayValue = selectedValue || options[0] || "Select...";

    const filteredOptions = options.filter(opt => opt !== displayValue);

    const handleTriggerClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsOpen(!isOpen);
    };

    const handleOptionClick = (e: React.MouseEvent, option: string) => {
        e.stopPropagation();
        onSelect(option);
        setIsOpen(false);
    };

    return (
        <span className="dimension-dropdown" ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
            <button
                type="button"
                onClick={handleTriggerClick}
                className="dimension-dropdown-trigger"
                title={variable}
            >
                <span className="dropdown-value">{displayValue}</span>
                <span className="dropdown-chevron">{isOpen ? '▴' : '▾'}</span>
            </button>

            {isOpen && (
                <div
                    className="dimension-dropdown-menu"
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        position: 'absolute',
                        top: 'calc(100% + 4px)',
                        left: 0,
                        minWidth: '150px',
                        maxWidth: '350px',
                        background: '#1a1a1a',
                        border: '1px solid rgba(99, 102, 241, 0.5)',
                        borderRadius: '8px',
                        padding: '6px',
                        zIndex: 9999,
                        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.6)',
                    }}
                >
                    {filteredOptions.map((option, idx) => (
                        <button
                            key={idx}
                            type="button"
                            onClick={(e) => handleOptionClick(e, option)}
                            className={clsx(
                                "dimension-dropdown-option",
                                selectedValue === option && "selected"
                            )}
                            style={{
                                display: 'block',
                                width: '100%',
                                padding: '8px 12px',
                                fontSize: '13px',
                                color: 'rgba(255, 255, 255, 0.9)',
                                background: selectedValue === option ? 'rgba(99, 102, 241, 0.25)' : 'transparent',
                                border: 'none',
                                borderRadius: '6px',
                                textAlign: 'left',
                                cursor: 'pointer',
                                whiteSpace: 'normal',
                                wordWrap: 'break-word',
                            }}
                        >
                            {option}
                        </button>
                    ))}
                </div>
            )}
        </span>
    );
};
