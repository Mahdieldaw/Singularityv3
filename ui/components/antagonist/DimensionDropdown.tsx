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
    const menuRef = useRef<HTMLDivElement>(null);

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        if (isOpen) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isOpen]);

    const displayValue = selectedValue || options[0] || "Select...";

    return (
        <div className="dimension-dropdown" ref={menuRef}>
            <span className="dimension-label">{variable}</span>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="dimension-dropdown-trigger"
            >
                <span>{displayValue}</span>
                <svg className={clsx("chevron-icon", isOpen && "open")} viewBox="0 0 12 12" fill="currentColor">
                    <path d="M2 4L6 8L10 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>

            {isOpen && (
                <div className="dimension-dropdown-menu">
                    {options.map((option, idx) => (
                        <button
                            key={idx}
                            onClick={() => {
                                onSelect(option);
                                setIsOpen(false);
                            }}
                            className={clsx(
                                "dimension-dropdown-option",
                                selectedValue === option && "selected"
                            )}
                        >
                            {option}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};
