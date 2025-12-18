import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Star, MessageSquare, Clock, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface RadarItem {
  bookmaker_catalogo_id: string;
  nome: string;
  logo_url: string | null;
  total_topicos: number;
  total_comentarios: number;
  topicos_recentes: number;
  comentarios_recentes: number;
  ultima_atividade: string | null;
  engagement_score: number;
}

interface CommunityRadarDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: RadarItem[];
  loading?: boolean;
}

export function CommunityRadarDrawer({ open, onOpenChange, items, loading }: CommunityRadarDrawerProps) {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');

  const filteredItems = items.filter(item =>
    item.nome.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleItemClick = (id: string) => {
    onOpenChange(false);
    navigate(`/comunidade/${id}`);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Radar Completo
          </SheetTitle>
          <p className="text-sm text-muted-foreground">
            Todas as casas mais discutidas (últimos 30 dias)
          </p>
        </SheetHeader>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar casa..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Results count */}
        <div className="text-xs text-muted-foreground mb-3">
          {filteredItems.length} {filteredItems.length === 1 ? 'casa encontrada' : 'casas encontradas'}
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredItems.map((item, index) => (
              <div
                key={item.bookmaker_catalogo_id}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors border border-border"
                onClick={() => handleItemClick(item.bookmaker_catalogo_id)}
              >
                {/* Rank */}
                <div className="w-8 text-center">
                  {index < 3 ? (
                    <Badge 
                      variant="outline" 
                      className={`text-xs ${
                        index === 0 ? 'border-yellow-500 text-yellow-500' :
                        index === 1 ? 'border-gray-400 text-gray-400' :
                        'border-amber-600 text-amber-600'
                      }`}
                    >
                      {index + 1}º
                    </Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground">{index + 1}º</span>
                  )}
                </div>

                {/* Logo */}
                <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                  {item.logo_url ? (
                    <img src={item.logo_url} alt={item.nome} className="h-8 w-8 object-contain" />
                  ) : (
                    <span className="text-sm font-bold text-muted-foreground">
                      {item.nome.charAt(0)}
                    </span>
                  )}
                </div>

                {/* Name & Stats */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{item.nome}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Star className="h-3 w-3" />
                      {item.total_topicos} tópicos
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      {item.total_comentarios}
                    </span>
                  </div>
                </div>

                {/* Last activity & Recent badge */}
                <div className="flex flex-col items-end gap-1">
                  {item.topicos_recentes + item.comentarios_recentes > 0 && (
                    <Badge variant="secondary" className="text-[10px]">
                      +{item.topicos_recentes + item.comentarios_recentes}
                    </Badge>
                  )}
                  {item.ultima_atividade && (
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Clock className="h-2.5 w-2.5" />
                      {format(new Date(item.ultima_atividade), "d MMM", { locale: ptBR })}
                    </span>
                  )}
                </div>
              </div>
            ))}

            {filteredItems.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                Nenhuma casa encontrada
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
