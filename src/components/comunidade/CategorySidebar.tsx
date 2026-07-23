import { COMMUNITY_CATEGORIES, getSubcategoriesFor, type CommunityCategory } from '@/lib/communityCategories';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LayoutGrid, ChevronRight } from 'lucide-react';

interface CategorySidebarProps {
  selected: CommunityCategory | null;
  selectedSub?: string | null;
  onSelect: (cat: CommunityCategory | null, sub?: string | null) => void;
}

export function CategorySidebar({ selected, selectedSub = null, onSelect }: CategorySidebarProps) {
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
          onClick={() => onSelect(null, null)}
        >
          Todas
        </Button>
        {COMMUNITY_CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const isActive = selected === cat.value;
          const subs = getSubcategoriesFor(cat.value);
          return (
            <div key={cat.value}>
              <Button
                variant={isActive && !selectedSub ? 'secondary' : 'ghost'}
                size="sm"
                className="w-full justify-start text-sm gap-2"
                onClick={() => onSelect(cat.value, null)}
              >
                <Icon className={cn('h-4 w-4', cat.color)} />
                <span className="flex-1 text-left">{cat.label}</span>
                {subs.length > 0 && (
                  <ChevronRight className={cn('h-3 w-3 transition-transform', isActive && 'rotate-90')} />
                )}
              </Button>
              {isActive && subs.length > 0 && (
                <div className="ml-5 mt-0.5 space-y-0.5 border-l border-border pl-2">
                  {subs.map((sub) => (
                    <Button
                      key={sub.slug}
                      variant={selectedSub === sub.slug ? 'secondary' : 'ghost'}
                      size="sm"
                      className="w-full justify-start text-xs h-7 font-normal"
                      onClick={() => onSelect(cat.value, sub.slug)}
                    >
                      {sub.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
