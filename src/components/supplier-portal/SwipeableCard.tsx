import { useState, useRef, useCallback, type TouchEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SwipeAction {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  className?: string;
}

interface Props {
  children: ReactNode;
  leftActions?: SwipeAction[];
  rightActions?: SwipeAction[];
  threshold?: number;
  className?: string;
}

/**
 * Mobile-friendly swipeable card wrapper.
 * Swipe right → reveals left actions. Swipe left → reveals right actions.
 */
export function SwipeableCard({
  children,
  leftActions = [],
  rightActions = [],
  threshold = 70,
  className,
}: Props) {
  const [offset, setOffset] = useState(0);
  const [isOpen, setIsOpen] = useState<"left" | "right" | null>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const currentX = useRef(0);
  const isDragging = useRef(false);
  const isHorizontal = useRef<boolean | null>(null);

  const actionWidth = 72;
  const maxLeftOffset = leftActions.length * actionWidth;
  const maxRightOffset = rightActions.length * actionWidth;

  const handleTouchStart = useCallback((e: TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    currentX.current = e.touches[0].clientX;
    isDragging.current = false;
    isHorizontal.current = null;
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;

    // Determine direction on first significant move
    if (isHorizontal.current === null && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
      isHorizontal.current = Math.abs(dx) > Math.abs(dy);
    }

    if (!isHorizontal.current) return;

    e.preventDefault();
    isDragging.current = true;
    currentX.current = e.touches[0].clientX;

    let baseOffset = isOpen === "right" ? maxLeftOffset : isOpen === "left" ? -maxRightOffset : 0;
    let newOffset = baseOffset + dx;

    // Clamp
    newOffset = Math.max(-maxRightOffset, Math.min(maxLeftOffset, newOffset));

    // Rubber band
    if (newOffset > maxLeftOffset) newOffset = maxLeftOffset + (newOffset - maxLeftOffset) * 0.3;
    if (newOffset < -maxRightOffset) newOffset = -maxRightOffset + (newOffset + maxRightOffset) * 0.3;

    setOffset(newOffset);
  }, [isOpen, maxLeftOffset, maxRightOffset]);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging.current) return;

    if (offset > threshold && leftActions.length > 0) {
      setOffset(maxLeftOffset);
      setIsOpen("right");
    } else if (offset < -threshold && rightActions.length > 0) {
      setOffset(-maxRightOffset);
      setIsOpen("left");
    } else {
      setOffset(0);
      setIsOpen(null);
    }
    isDragging.current = false;
    isHorizontal.current = null;
  }, [offset, threshold, leftActions.length, rightActions.length, maxLeftOffset, maxRightOffset]);

  function close() {
    setOffset(0);
    setIsOpen(null);
  }

  return (
    <div className={cn("relative overflow-hidden rounded-lg", className)}>
      {/* Left actions (revealed on swipe right) */}
      {leftActions.length > 0 && (
        <div className="absolute inset-y-0 left-0 flex">
          {leftActions.map((action, i) => (
            <button
              key={i}
              onClick={() => { action.onClick(); close(); }}
              className={cn(
                "flex flex-col items-center justify-center gap-1 text-[10px] font-medium",
                action.className || "bg-primary text-primary-foreground"
              )}
              style={{ width: actionWidth }}
            >
              {action.icon}
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Right actions (revealed on swipe left) */}
      {rightActions.length > 0 && (
        <div className="absolute inset-y-0 right-0 flex">
          {rightActions.map((action, i) => (
            <button
              key={i}
              onClick={() => { action.onClick(); close(); }}
              className={cn(
                "flex flex-col items-center justify-center gap-1 text-[10px] font-medium",
                action.className || "bg-muted text-muted-foreground"
              )}
              style={{ width: actionWidth }}
            >
              {action.icon}
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Main content */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateX(${offset}px)`,
          transition: isDragging.current ? "none" : "transform 0.25s ease-out",
        }}
        className="relative z-10 bg-card"
      >
        {children}
      </div>
    </div>
  );
}
