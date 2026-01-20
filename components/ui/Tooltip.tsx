import React, { ReactNode } from 'react';

interface TooltipProps {
  children: ReactNode;
  content: string;
  className?: string;
  side?: 'top' | 'bottom';
}

export const Tooltip: React.FC<TooltipProps> = ({ 
  children, 
  content, 
  className = '',
  side = 'top' 
}) => {
  return (
    <div className={`group relative flex flex-col items-center ${className}`}>
      {children}
      <div className={`
        pointer-events-none absolute 
        ${side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'} 
        opacity-0 transition-all duration-200 transform scale-95 group-hover:scale-100 group-hover:opacity-100 z-50
      `}>
        <div className="bg-zinc-900 text-zinc-200 text-xs py-1.5 px-2.5 rounded-md border border-zinc-700 shadow-xl whitespace-nowrap font-medium">
          {content}
        </div>
        {/* Little arrow pointing down/up */}
        <div className={`
          absolute left-1/2 -translate-x-1/2 w-2 h-2 bg-zinc-900 border-zinc-700 transform rotate-45
          ${side === 'top' ? '-bottom-1 border-r border-b' : '-top-1 border-l border-t'}
        `}></div>
      </div>
    </div>
  );
};