import React from "react";
import { DirectAnswerContent } from "../../../../shared/contract";

interface DirectAnswerContainerProps {
    content: DirectAnswerContent;
}

export const DirectAnswerContainer: React.FC<DirectAnswerContainerProps> = ({ content }) => {
    return (
        <div className="flex flex-col gap-4 p-4 text-white">
            <div className="text-lg leading-relaxed font-medium text-gray-100">{content.answer}</div>

            {content.additional_context && content.additional_context.length > 0 && (
                <div className="mt-4 flex flex-col gap-2">
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Context</h4>
                    {content.additional_context.map((item, idx) => (
                        <div key={idx} className="flex flex-col bg-white/5 rounded-lg p-3 border border-white/10">
                            <span className="text-sm text-gray-300">{item.text}</span>
                            <span className="text-xs text-blue-400 mt-1 self-end">{item.source}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

