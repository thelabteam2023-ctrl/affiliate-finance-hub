import { cn } from '@/lib/utils';

interface OnlineIndicatorProps {
  count: number;
  isConnected?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export function OnlineIndicator({ 
  count, 
  isConnected = true, 
  size = 'sm',
  className 
}: OnlineIndicatorProps) {
  const dotSize = size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5';
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';

  if (!isConnected) {
    return (
      <div className={cn('flex items-center gap-1.5', className)}>
        <span className={cn('rounded-full bg-muted-foreground/50', dotSize)} />
        <span className={cn('text-muted-foreground', textSize)}>
          Conectando...
        </span>
      </div>
    );
  }

  if (count === 0) {
    return (
      <div className={cn('flex items-center gap-1.5', className)}>
        <span className={cn('rounded-full bg-muted-foreground/30', dotSize)} />
        <span className={cn('text-muted-foreground', textSize)}>
          Nenhum usuário online
        </span>
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <span className={cn('rounded-full bg-green-500 animate-pulse', dotSize)} />
      <span className={cn('text-muted-foreground', textSize)}>
        {count} {count === 1 ? 'usuário online' : 'usuários online'}
      </span>
    </div>
  );
}
