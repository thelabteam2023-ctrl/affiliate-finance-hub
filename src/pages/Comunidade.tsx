import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCommunityAccess } from '@/hooks/useCommunityAccess';
import { PageHeader } from '@/components/PageHeader';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Lock, Star, MessageSquare, Search, Plus, TrendingUp, Clock } from 'lucide-react';
import { CategorySidebar } from '@/components/comunidade/CategorySidebar';
import { TopicFeed } from '@/components/comunidade/TopicFeed';
import { CommunityRadar } from '@/components/comunidade/CommunityRadar';
import { CommunityChatPreview } from '@/components/comunidade/CommunityChatPreview';
import { CommunityChatDrawer } from '@/components/comunidade/CommunityChatDrawer';
import { CreateTopicDialog } from '@/components/comunidade/CreateTopicDialog';
import { type CommunityCategory } from '@/lib/communityCategories';

export default function Comunidade() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { hasFullAccess, loading: accessLoading, plan } = useCommunityAccess();

  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'trending'>('recent');
  const [selectedCategory, setSelectedCategory] = useState<CommunityCategory | null>(null);
  const [bookmakerFilter, setBookmakerFilter] = useState<string | null>(null);
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [feedRefreshKey, setFeedRefreshKey] = useState(0);

  // Handle URL params (e.g. ?casa=xxx from radar click)
  useEffect(() => {
    const casa = searchParams.get('casa');
    if (casa) {
      setBookmakerFilter(casa);
    }
  }, [searchParams]);

  // Listen for chat drawer event
  useEffect(() => {
    const handleOpenChat = () => setChatDrawerOpen(true);
    window.addEventListener('open-community-chat', handleOpenChat);
    return () => window.removeEventListener('open-community-chat', handleOpenChat);
  }, []);

  const clearBookmakerFilter = () => {
    setBookmakerFilter(null);
    searchParams.delete('casa');
    setSearchParams(searchParams);
  };

  // Upgrade prompt for Free/Starter users
  if (!accessLoading && !hasFullAccess) {
    return (
      <div className="container mx-auto p-6 max-w-6xl">
        <PageHeader 
          title="Comunidade" 
          description="Hub de discussões para operadores"
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
              Acesse discussões, avaliações e insights colaborativos da comunidade.
            </p>
            <div className="flex flex-col gap-3 text-left mb-6">
              <div className="flex items-center gap-2 text-sm">
                <Star className="h-4 w-4 text-yellow-500" />
                <span>Avaliações multidimensionais de casas</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <MessageSquare className="h-4 w-4 text-blue-500" />
                <span>Tópicos e discussões por categoria</span>
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
        description="Hub de discussões e inteligência coletiva"
        pagePath="/comunidade"
        pageIcon="Users"
      />

      {/* Legal Disclaimer */}
      <div className="bg-muted/50 border border-border rounded-lg p-3 mb-6 text-xs text-muted-foreground mt-6">
        <strong>Aviso:</strong> As informações compartilhadas refletem experiências individuais dos usuários e não representam uma posição oficial da plataforma.
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Sidebar - Categories */}
        <div className="lg:col-span-3 space-y-6 order-2 lg:order-1">
          <CategorySidebar selected={selectedCategory} onSelect={setSelectedCategory} />
          <CommunityRadar />
        </div>

        {/* Main Feed */}
        <div className="lg:col-span-6 space-y-4 order-1 lg:order-2">
          {/* Search + Actions */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar tópicos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Novo
            </Button>
          </div>

          {/* Sort tabs */}
          <div className="flex items-center gap-1 border-b border-border pb-1">
            <Button
              variant={sortBy === 'recent' ? 'secondary' : 'ghost'}
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => setSortBy('recent')}
            >
              <Clock className="h-3.5 w-3.5" />
              Recentes
            </Button>
            <Button
              variant={sortBy === 'trending' ? 'secondary' : 'ghost'}
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => setSortBy('trending')}
            >
              <TrendingUp className="h-3.5 w-3.5" />
              Em alta
            </Button>

            {bookmakerFilter && (
              <Button variant="outline" size="sm" className="ml-auto text-xs" onClick={clearBookmakerFilter}>
                Limpar filtro de casa ✕
              </Button>
            )}
          </div>

          {/* Topic Feed */}
          <TopicFeed
            categoryFilter={selectedCategory}
            bookmakerFilter={bookmakerFilter}
            searchTerm={searchTerm}
            sortBy={sortBy}
            refreshKey={feedRefreshKey}
          />
        </div>

        {/* Right Sidebar - Chat */}
        <div className="lg:col-span-3 space-y-6 order-3">
          <CommunityChatPreview />
        </div>
      </div>

      {/* Create Topic Dialog */}
      <CreateTopicDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        defaultCategory={selectedCategory || undefined}
        onSuccess={() => {
          setCreateDialogOpen(false);
          setFeedRefreshKey((k) => k + 1);
        }}
      />

      {/* Chat Drawer */}
      <CommunityChatDrawer open={chatDrawerOpen} onOpenChange={setChatDrawerOpen} />
    </div>
  );
}
