import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Star, Zap, Shield, Clock, HeartHandshake, Building2 } from 'lucide-react';

interface CommunityEvaluationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookmakerId: string;
  bookmakerName: string;
  existingEvaluation?: any;
  onSuccess: () => void;
}

const CRITERIA = [
  { key: 'velocidade_pagamento', label: 'Velocidade de Pagamento', icon: Zap, description: 'Rapidez nos saques' },
  { key: 'facilidade_verificacao', label: 'Facilidade de Verificação', icon: Shield, description: 'Processo de KYC' },
  { key: 'estabilidade_conta', label: 'Estabilidade da Conta', icon: Clock, description: 'Longevidade da conta' },
  { key: 'qualidade_suporte', label: 'Qualidade do Suporte', icon: HeartHandshake, description: 'Atendimento ao cliente' },
  { key: 'confiabilidade_geral', label: 'Confiabilidade Geral', icon: Building2, description: 'Confiança geral na casa' },
];


export function CommunityEvaluationDialog({
  open,
  onOpenChange,
  bookmakerId,
  bookmakerName,
  existingEvaluation,
  onSuccess,
}: CommunityEvaluationDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  
  const [ratings, setRatings] = useState<Record<string, number>>(() => {
    if (existingEvaluation) {
      return {
        velocidade_pagamento: existingEvaluation.velocidade_pagamento || 0,
        facilidade_verificacao: existingEvaluation.facilidade_verificacao || 0,
        estabilidade_conta: existingEvaluation.estabilidade_conta || 0,
        qualidade_suporte: existingEvaluation.qualidade_suporte || 0,
        confiabilidade_geral: existingEvaluation.confiabilidade_geral || 0,
      };
    }
    return {
      velocidade_pagamento: 0,
      facilidade_verificacao: 0,
      estabilidade_conta: 0,
      qualidade_suporte: 0,
      confiabilidade_geral: 0,
    };
  });
  
  const [comentario, setComentario] = useState(existingEvaluation?.comentario || '');
  const [isAnonymous, setIsAnonymous] = useState(existingEvaluation?.is_anonymous || false);

  const handleRatingClick = (criterion: string, rating: number) => {
    setRatings(prev => ({ ...prev, [criterion]: rating }));
  };

  const renderStarRating = (criterion: string, value: number) => {
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => handleRatingClick(criterion, star)}
            className="p-0.5 hover:scale-110 transition-transform"
          >
            <Star
              className={`h-6 w-6 ${
                star <= value
                  ? 'fill-yellow-400 text-yellow-400'
                  : 'text-muted-foreground/30 hover:text-yellow-400/50'
              }`}
            />
          </button>
        ))}
      </div>
    );
  };

  const handleSubmit = async () => {
    if (!user?.id) {
      toast({
        title: 'Erro',
        description: 'Você precisa estar logado para avaliar.',
        variant: 'destructive',
      });
      return;
    }

    // Validate all ratings are filled
    const allRated = Object.values(ratings).every(r => r > 0);
    if (!allRated) {
      toast({
        title: 'Avaliação incompleta',
        description: 'Por favor, avalie todos os critérios.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const evaluationData = {
        user_id: user.id,
        bookmaker_catalogo_id: bookmakerId,
        velocidade_pagamento: ratings.velocidade_pagamento,
        facilidade_verificacao: ratings.facilidade_verificacao,
        estabilidade_conta: ratings.estabilidade_conta,
        qualidade_suporte: ratings.qualidade_suporte,
        confiabilidade_geral: ratings.confiabilidade_geral,
        comentario: comentario || null,
        is_anonymous: isAnonymous,
      };

      if (existingEvaluation?.id) {
        const { error } = await supabase
          .from('community_evaluations')
          .update(evaluationData)
          .eq('id', existingEvaluation.id);

        if (error) throw error;
        toast({ title: 'Avaliação atualizada com sucesso!' });
      } else {
        const { error } = await supabase
          .from('community_evaluations')
          .insert(evaluationData);

        if (error) throw error;
        toast({ title: 'Avaliação enviada com sucesso!' });
      }

      onSuccess();
    } catch (error: any) {
      console.error('Error saving evaluation:', error);
      toast({
        title: 'Erro ao salvar avaliação',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {existingEvaluation ? 'Editar Avaliação' : 'Avaliar'} - {bookmakerName}
          </DialogTitle>
          <DialogDescription>
            Compartilhe sua experiência com esta casa de apostas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Rating Criteria */}
          <div className="space-y-4">
            {CRITERIA.map((criterion) => {
              const Icon = criterion.icon;
              return (
                <div key={criterion.key} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <Label className="text-sm font-medium">{criterion.label}</Label>
                    </div>
                    {renderStarRating(criterion.key, ratings[criterion.key])}
                  </div>
                  <p className="text-xs text-muted-foreground pl-6">{criterion.description}</p>
                </div>
              );
            })}
          </div>


          {/* Comment */}
          <div className="space-y-2">
            <Label htmlFor="comentario">Comentário (opcional)</Label>
            <Textarea
              id="comentario"
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              placeholder="Compartilhe detalhes da sua experiência..."
              rows={3}
            />
          </div>

          {/* Anonymous Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="anonymous">Avaliação Anônima</Label>
              <p className="text-xs text-muted-foreground">
                Seu nome não será exibido publicamente
              </p>
            </div>
            <Switch
              id="anonymous"
              checked={isAnonymous}
              onCheckedChange={setIsAnonymous}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Salvando...' : existingEvaluation ? 'Atualizar' : 'Enviar Avaliação'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
