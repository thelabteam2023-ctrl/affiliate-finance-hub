import React, { useState, useEffect, useRef } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Pin } from "lucide-react";

interface InteractiveTooltipProps {
  children: React.ReactNode;
  content: React.ReactNode;
  className?: string;
  containerRef?: React.RefObject<any>;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  cursor?: string;
}

export const InteractiveTooltip = ({ 
  children, 
  content, 
  className, 
  side = "top", 
  align = "end",
  cursor = "cursor-pointer"
}: InteractiveTooltipProps) => {
  const [isPinned, setIsPinned] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // If we are pinned, only close if clicking outside the trigger AND outside any portal/content
      // We check if the click target is within any element that has data-radix-popper-content-wrapper (Radix's wrapper for portals)
      const target = event.target as HTMLElement;
      const isInsideContent = target.closest('[data-radix-popper-content-wrapper]');
      const isInsideTrigger = ref.current?.contains(target);

      if (isPinned && !isInsideTrigger && !isInsideContent) {
        setIsPinned(false);
      }
    };

    if (isPinned) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isPinned]);

  return (
    <TooltipProvider>
      <Tooltip open={isHovered || isPinned}>
        <TooltipTrigger asChild>
          <div 
            ref={ref}
            className={`${cursor} ${className}`}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={(e) => {
              // Prevent events from bubbling up (important for Tabs triggers or nested buttons)
              e.preventDefault();
              e.stopPropagation();
              setIsPinned(!isPinned);
            }}
          >
            {children}
          </div>
        </TooltipTrigger>
        <TooltipContent 
          portal={true}
          className={`p-3 min-w-[260px] max-w-[380px] max-h-[400px] overflow-y-auto bg-popover border-border shadow-2xl z-50 transition-all duration-200 ${isPinned ? 'border-primary/50 ring-1 ring-primary/20' : ''}`}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onClick={(e) => e.stopPropagation()}
          side={side}
          align={align}
        >
          {isPinned && (
            <div className="absolute top-2 right-2 flex items-center gap-1 bg-primary/10 px-1.5 py-0.5 rounded text-[9px] text-primary font-bold uppercase tracking-tighter pointer-events-none">
              <Pin className="h-2.5 w-2.5 fill-current" />
              <span>Fixado</span>
            </div>
          )}
          <div className="pt-1">
            {content}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};