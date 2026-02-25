import { COMMUNITY_CATEGORIES, type CommunityCategory } from '@/lib/communityCategories';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LayoutGrid } from 'lucide-react';

interface CategorySidebarProps {
  selected: CommunityCategory | null;
  onSelect: (cat: CommunityCategory | null) => void;
}

export function CategorySidebar({ selected, onSelect }: CategorySidebarProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <LayoutGrid className="h-4 w-4" />
          Categorias
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <Button
          variant={selected === null ? 'secondary' : 'ghost'}
          size="sm"
          className="w-full justify-start text-sm"
          onClick={() => onSelect(null)}
        >
          Todas
        </Button>
        {COMMUNITY_CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          return (
            <Button
              key={cat.value}
              variant={selected === cat.value ? 'secondary' : 'ghost'}
              size="sm"
              className="w-full justify-start text-sm gap-2"
              onClick={() => onSelect(cat.value)}
            >
              <Icon className={cn('h-4 w-4', cat.color)} />
              {cat.label}
            </Button>
          );
        })}
      </CardContent>
    </Card>
  );
}
