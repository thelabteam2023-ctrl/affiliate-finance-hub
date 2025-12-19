import { useState, useEffect } from "react";
import { useAccessGroups, AccessGroup, GroupBookmaker } from "@/hooks/useAccessGroups";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Search, FolderOpen, Trash2, Plus, Loader2, Lock, Globe, Users } from "lucide-react";

interface BookmakerCatalogo {
  id: string;
  nome: string;
  logo_url: string | null;
  visibility: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: AccessGroup;
}

export default function AccessGroupBookmakersDialog({ open, onOpenChange, group }: Props) {
  const {
    fetchGroupBookmakers,
    addBookmakersToGroup,
    removeBookmakersFromGroup,
  } = useAccessGroups();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [groupBookmakers, setGroupBookmakers] = useState<GroupBookmaker[]>([]);
  const [allBookmakers, setAllBookmakers] = useState<BookmakerCatalogo[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedAddIds, setSelectedAddIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [convertPrivate, setConvertPrivate] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("current");

  const loadData = async () => {
    try {
      setLoading(true);
      const [groupData, allData] = await Promise.all([
        fetchGroupBookmakers(group.id),
        supabase.from("bookmakers_catalogo").select("id, nome, logo_url, visibility").order("nome"),
      ]);
      setGroupBookmakers(groupData);
      setAllBookmakers(allData.data || []);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar dados",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadData();
      setSelectedIds(new Set());
      setSelectedAddIds(new Set());
      setActiveTab("current");
    }
  }, [open, group.id]);

  const handleToggle = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleToggleAdd = (id: string) => {
    const newSet = new Set(selectedAddIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedAddIds(newSet);
  };

  const handleRemoveSelected = async () => {
    if (selectedIds.size === 0) return;

    try {
      setSaving(true);
      await removeBookmakersFromGroup(group.id, Array.from(selectedIds));
      toast({ title: `${selectedIds.size} bookmaker(s) removida(s)` });
      await loadData();
      setSelectedIds(new Set());
    } catch (error: any) {
      toast({
        title: "Erro ao remover",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAddSelected = async () => {
    if (selectedAddIds.size === 0) return;

    try {
      setSaving(true);
      await addBookmakersToGroup(group.id, Array.from(selectedAddIds), convertPrivate);
      toast({ title: `${selectedAddIds.size} bookmaker(s) adicionada(s)` });
      await loadData();
      setSelectedAddIds(new Set());
      setActiveTab("current");
    } catch (error: any) {
      toast({
        title: "Erro ao adicionar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const getVisibilityIcon = (visibility: string | null) => {
    switch (visibility) {
      case "WORKSPACE_PRIVATE":
        return <Lock className="h-3 w-3" />;
      case "GLOBAL_RESTRICTED":
        return <Users className="h-3 w-3" />;
      default:
        return <Globe className="h-3 w-3" />;
    }
  };

  const getVisibilityLabel = (visibility: string | null) => {
    switch (visibility) {
      case "WORKSPACE_PRIVATE":
        return "Privada";
      case "GLOBAL_RESTRICTED":
        return "Restrita";
      default:
        return "Global";
    }
  };

  // Bookmakers not in group
  const groupBookmakerIds = new Set(groupBookmakers.map((gb) => gb.bookmaker_catalogo_id));
  const availableBookmakers = allBookmakers.filter((bk) => !groupBookmakerIds.has(bk.id));

  const filteredGroupBookmakers = groupBookmakers.filter((gb) => {
    const name = gb.bookmaker?.nome?.toLowerCase() || "";
    return name.includes(searchTerm.toLowerCase());
  });

  const filteredAvailableBookmakers = availableBookmakers.filter((bk) => {
    return bk.nome.toLowerCase().includes(searchTerm.toLowerCase());
  });

  // Check if any selected bookmaker is private
  const hasPrivateSelected = Array.from(selectedAddIds).some((id) => {
    const bk = allBookmakers.find((b) => b.id === id);
    return bk?.visibility === "WORKSPACE_PRIVATE";
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bookmakers do Grupo: {group.name}</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="current">No Grupo ({groupBookmakers.length})</TabsTrigger>
            <TabsTrigger value="add">Adicionar</TabsTrigger>
          </TabsList>

          <TabsContent value="current" className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Buscar bookmaker..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              {selectedIds.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleRemoveSelected}
                  disabled={saving}
                >
                  <Trash2 className="mr-1 h-4 w-4" />
                  Remover ({selectedIds.size})
                </Button>
              )}
            </div>

            {loading ? (
              <div className="py-8 text-center text-muted-foreground">
                Carregando...
              </div>
            ) : groupBookmakers.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <FolderOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhuma bookmaker neste grupo.</p>
                <p className="text-sm">Use a aba "Adicionar" para incluir bookmakers.</p>
              </div>
            ) : (
              <ScrollArea className="h-[350px] border rounded-md">
                <div className="divide-y">
                  {filteredGroupBookmakers.map((gb) => (
                    <div
                      key={gb.id}
                      className="flex items-center gap-3 p-3 hover:bg-accent/50"
                    >
                      <Checkbox
                        checked={selectedIds.has(gb.bookmaker_catalogo_id)}
                        onCheckedChange={() => handleToggle(gb.bookmaker_catalogo_id)}
                      />
                      <div className="h-8 w-8 flex-shrink-0">
                        {gb.bookmaker?.logo_url ? (
                          <img
                            src={gb.bookmaker.logo_url}
                            alt={gb.bookmaker.nome}
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center text-xs font-bold">
                            {gb.bookmaker?.nome?.substring(0, 2).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">{gb.bookmaker?.nome || "—"}</div>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {getVisibilityIcon(gb.bookmaker?.visibility)}
                        <span className="ml-1">{getVisibilityLabel(gb.bookmaker?.visibility)}</span>
                      </Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent value="add" className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Buscar bookmaker..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {hasPrivateSelected && (
              <div className="flex items-center justify-between p-3 bg-amber-500/10 border border-amber-500/20 rounded-md">
                <div>
                  <div className="text-sm font-medium">Converter privadas para restritas?</div>
                  <div className="text-xs text-muted-foreground">
                    Bookmakers privadas serão alteradas para "Restrita" ao serem adicionadas ao grupo.
                  </div>
                </div>
                <Switch
                  checked={convertPrivate}
                  onCheckedChange={setConvertPrivate}
                />
              </div>
            )}

            {loading ? (
              <div className="py-8 text-center text-muted-foreground">
                Carregando...
              </div>
            ) : availableBookmakers.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <p>Todas as bookmakers já estão no grupo.</p>
              </div>
            ) : (
              <>
                <ScrollArea className="h-[300px] border rounded-md">
                  <div className="divide-y">
                    {filteredAvailableBookmakers.map((bk) => (
                      <div
                        key={bk.id}
                        className="flex items-center gap-3 p-3 hover:bg-accent/50"
                      >
                        <Checkbox
                          checked={selectedAddIds.has(bk.id)}
                          onCheckedChange={() => handleToggleAdd(bk.id)}
                        />
                        <div className="h-8 w-8 flex-shrink-0">
                          {bk.logo_url ? (
                            <img
                              src={bk.logo_url}
                              alt={bk.nome}
                              className="h-full w-full object-contain"
                            />
                          ) : (
                            <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center text-xs font-bold">
                              {bk.nome.substring(0, 2).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="font-medium">{bk.nome}</div>
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          {getVisibilityIcon(bk.visibility)}
                          <span className="ml-1">{getVisibilityLabel(bk.visibility)}</span>
                        </Badge>
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                {selectedAddIds.size > 0 && (
                  <Button
                    onClick={handleAddSelected}
                    disabled={saving}
                    className="w-full"
                  >
                    {saving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="mr-2 h-4 w-4" />
                    )}
                    Adicionar {selectedAddIds.size} ao Grupo
                  </Button>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
