import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/PageHeader';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCommunityAccess } from '@/hooks/useCommunityAccess';
import { Search, Star, MessageSquare, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CommunityRadar } from '@/components/comunidade/CommunityRadar';
import { CommunityChatPreview } from '@/components/comunidade/CommunityChatPreview';
import { CommunityChatDrawer } from '@/components/comunidade/CommunityChatDrawer';

interface BookmakerStats {
  bookmaker_catalogo_id: string;
  nome: string;
  logo_url: string | null;
  regulamentacao_status: string;
  visibility: string;
  total_avaliacoes: number;
  nota_media_geral: number | null;
  total_topicos: number;
  ultimo_topico_data: string | null;
}

export default function Comunidade() {
  const navigate = useNavigate();
  const { hasFullAccess, loading: accessLoading, plan, isOwner } = useCommunityAccess();
  const [bookmakers, setBookmakers] = useState<BookmakerStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false);

  // Listen for event to open chat drawer
  useEffect(() => {
    const handleOpenChat = () => setChatDrawerOpen(true);
    window.addEventListener('open-community-chat', handleOpenChat);
    return () => window.removeEventListener('open-community-chat', handleOpenChat);
  }, []);

  useEffect(() => {
    fetchBookmakers();
  }, []);

  const fetchBookmakers = async () => {
    try {
      const { data, error } = await supabase
        .from('v_community_bookmaker_stats')
        .select('*')
        .order('nome');

      if (error) throw error;
      setBookmakers(data || []);
    } catch (error) {
      console.error('Error fetching bookmakers:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredBookmakers = bookmakers.filter(bm =>
    bm.nome.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderStars = (rating: number | null) => {
    if (!rating) return <span className="text-muted-foreground text-sm">Sem avaliações</span>;
    
    const fullStars = Math.floor(rating);
    const hasHalf = rating % 1 >= 0.5;
    
    return (
      <div className="flex items-center gap-1">
        {[...Array(5)].map((_, i) => (
          <Star
            key={i}
            className={`h-4 w-4 ${
              i < fullStars
                ? 'fill-yellow-400 text-yellow-400'
                : i === fullStars && hasHalf
                ? 'fill-yellow-400/50 text-yellow-400'
                : 'text-muted-foreground/30'
            }`}
          />
        ))}
        <span className="text-sm font-medium ml-1">{rating.toFixed(1)}</span>
      </div>
    );
  };

  // Upgrade prompt for Free/Starter users (OWNER ignora restrição de plano)
  if (!accessLoading && !hasFullAccess) {
    return (
      <div className="container mx-auto p-6 max-w-6xl">
        <PageHeader 
          title="Comunidade" 
          description="Inteligência coletiva para decisões operacionais"
          pagePath="/comunidade"
          pageIcon="Users"
        />
        
        <Card className="mt-8 border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Lock className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Módulo Exclusivo PRO+</h2>
            <p className="text-muted-foreground max-w-md mb-6">
              Acesse avaliações, discussões e insights colaborativos sobre casas de apostas. 
              Tome decisões mais seguras baseadas em experiências reais da comunidade.
            </p>
            <div className="flex flex-col gap-3 text-left mb-6">
              <div className="flex items-center gap-2 text-sm">
                <Star className="h-4 w-4 text-yellow-500" />
                <span>Avaliações multidimensionais de casas</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <MessageSquare className="h-4 w-4 text-blue-500" />
                <span>Tópicos e discussões por bookmaker</span>
              </div>
            </div>
            <Button onClick={() => navigate('/workspace')} size="lg">
              Fazer Upgrade para PRO
            </Button>
            <p className="text-xs text-muted-foreground mt-3">
              Seu plano atual: {plan?.toUpperCase() || 'FREE'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <PageHeader 
        title="Comunidade" 
        description="Avaliações e discussões sobre casas de apostas"
        pagePath="/comunidade"
        pageIcon="Users"
      />

      {/* Legal Disclaimer */}
      <div className="bg-muted/50 border border-border rounded-lg p-3 mb-6 text-xs text-muted-foreground mt-6">
        <strong>Aviso:</strong> As informações compartilhadas refletem experiências individuais dos usuários e não representam uma posição oficial da plataforma.
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-8 space-y-6">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar casa de apostas..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Stats Summary */}
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">{bookmakers.length}</p>
                <p className="text-sm text-muted-foreground">Casas Globais</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">
                  {bookmakers.reduce((sum, bm) => sum + bm.total_avaliacoes, 0)}
                </p>
                <p className="text-sm text-muted-foreground">Avaliações</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">
                  {bookmakers.reduce((sum, bm) => sum + bm.total_topicos, 0)}
                </p>
                <p className="text-sm text-muted-foreground">Tópicos</p>
              </CardContent>
            </Card>
          </div>

          {/* Bookmakers Grid */}
          {loading || accessLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {[...Array(9)].map((_, i) => (
                <Skeleton key={i} className="h-36" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredBookmakers.map((bm) => (
                <Card 
                  key={bm.bookmaker_catalogo_id}
                  className="cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => navigate(`/comunidade/${bm.bookmaker_catalogo_id}`)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start gap-2.5">
                      {/* Logo */}
                      <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                        {bm.logo_url ? (
                          <img src={bm.logo_url} alt={bm.nome} className="h-8 w-8 object-contain" />
                        ) : (
                          <span className="text-base font-bold text-muted-foreground">
                            {bm.nome.charAt(0)}
                          </span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold truncate">{bm.nome}</h3>
                          <Badge 
                            variant="outline" 
                            className={`text-[10px] shrink-0 ${
                              bm.regulamentacao_status === 'REGULAMENTADA'
                                ? 'border-green-500/30 text-green-500'
                                : 'border-amber-500/30 text-amber-500'
                            }`}
                          >
                            {bm.regulamentacao_status === 'REGULAMENTADA' ? 'Reg.' : 'Não Reg.'}
                          </Badge>
                        </div>
                        
                        {/* Rating */}
                        {renderStars(bm.nota_media_geral)}
                      </div>
                    </div>

                    {/* Stats Row */}
                    <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-border">
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Star className="h-3.5 w-3.5" />
                        <span>{bm.total_avaliacoes}</span>
                      </div>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <MessageSquare className="h-3.5 w-3.5" />
                        <span>{bm.total_topicos}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {filteredBookmakers.length === 0 && !loading && (
            <div className="text-center py-12 text-muted-foreground">
              Nenhuma casa encontrada com "{searchTerm}"
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-4 space-y-6">
          {/* Radar */}
          <CommunityRadar />
          
          {/* Chat Preview */}
          <CommunityChatPreview />
        </div>
      </div>

      {/* Chat Drawer (internal fallback) */}
      <CommunityChatDrawer 
        open={chatDrawerOpen} 
        onOpenChange={setChatDrawerOpen} 
      />
    </div>
  );
}
