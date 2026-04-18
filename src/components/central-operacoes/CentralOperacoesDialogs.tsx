/**
 * All dialog/modal components rendered at the bottom of CentralOperacoes.
 * Extracted to reduce main page component size.
 */

import { useMemo } from "react";
import { Loader2, AlertTriangle, XCircle } from "lucide-react";
import { getFirstLastName } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { EntregaConciliacaoDialog } from "@/components/entregas/EntregaConciliacaoDialog";
import { ConfirmarSaqueDialog } from "@/components/caixa/ConfirmarSaqueDialog";
import { PagamentoOperadorDialog } from "@/components/operadores/PagamentoOperadorDialog";
import { PagamentoParticipacaoDialog } from "@/components/projetos/PagamentoParticipacaoDialog";
import { RegistrarPerdaRapidaDialog } from "@/components/parceiros/RegistrarPerdaRapidaDialog";
import { PagamentoFornecedorDialog } from "@/components/programa-indicacao/PagamentoFornecedorDialog";
import { PagamentoParceiroDialog } from "@/components/programa-indicacao/PagamentoParceiroDialog";
import { ParceriaDialog, type RenewalSuccessData } from "@/components/parcerias/ParceriaDialog";
import type {
  EntregaPendente,
  PagamentoParceiroPendente,
  PagamentoFornecedorPendente,
  PagamentoOperadorPendente,
  ParceriaAlertaEncerramento,
  SaquePendenteConfirmacao,
  ParticipacaoPendente,
} from "@/hooks/useCentralOperacoesData";
import type { DispensaState, PerdaLimitadaState } from "@/hooks/useCentralOperacoesMutations";

interface CentralOperacoesDialogsProps {
  fetchData: (isRefresh?: boolean) => void;

  // Entrega
  selectedEntrega: EntregaPendente | null;
  conciliacaoOpen: boolean;
  setConciliacaoOpen: (v: boolean) => void;

  // Saque
  selectedSaque: SaquePendenteConfirmacao | null;
  confirmarSaqueOpen: boolean;
  setConfirmarSaqueOpen: (v: boolean) => void;
  setSelectedSaque: (v: SaquePendenteConfirmacao | null) => void;

  // Pagamento Operador
  selectedPagamentoOperador: PagamentoOperadorPendente | null;
  pagamentoOperadorOpen: boolean;
  setPagamentoOperadorOpen: (v: boolean) => void;
  setSelectedPagamentoOperador: (v: PagamentoOperadorPendente | null) => void;

  // Participação
  selectedParticipacao: ParticipacaoPendente | null;
  pagamentoParticipacaoOpen: boolean;
  setPagamentoParticipacaoOpen: (v: boolean) => void;
  setSelectedParticipacao: (v: ParticipacaoPendente | null) => void;

  // Dispensar
  dispensaState: DispensaState;
  setDispensaOpen: (v: boolean) => void;
  setDispensaMotivo: (v: string) => void;
  setDispensaEstornar: (v: boolean) => void;
  onDispensarPagamento: () => void;

  // Perda Limitada
  perdaLimitadaDialog: PerdaLimitadaState | null;
  setPerdaLimitadaDialog: (v: PerdaLimitadaState | null) => void;

  // Pagamento Parceiro
  selectedPagamentoParceiro: PagamentoParceiroPendente | null;
  pagamentoParceiroDialogOpen: boolean;
  setPagamentoParceiroDialogOpen: (v: boolean) => void;
  setSelectedPagamentoParceiro: (v: PagamentoParceiroPendente | null) => void;

  // Pagamento Fornecedor
  selectedPagamentoFornecedor: PagamentoFornecedorPendente | null;
  pagamentoFornecedorOpen: boolean;
  setPagamentoFornecedorOpen: (v: boolean) => void;
  setSelectedPagamentoFornecedor: (v: PagamentoFornecedorPendente | null) => void;

  // Encerrar Parceria
  encerrarDialogOpen: boolean;
  setEncerrarDialogOpen: (v: boolean) => void;
  parceriaToEncerrar: ParceriaAlertaEncerramento | null;
  encerrarLoading: boolean;
  onEncerrarParceria: () => void;

  // Renovar Parceria
  renovarDialogOpen: boolean;
  handleRenovarDialogClose: () => void;
  parceriaToRenovar: ParceriaAlertaEncerramento | null;
  onRenewalSuccess: (data: RenewalSuccessData) => void;
}

export function CentralOperacoesDialogs(props: CentralOperacoesDialogsProps) {
  const {
    fetchData,
    selectedEntrega, conciliacaoOpen, setConciliacaoOpen,
    selectedSaque, confirmarSaqueOpen, setConfirmarSaqueOpen, setSelectedSaque,
    selectedPagamentoOperador, pagamentoOperadorOpen, setPagamentoOperadorOpen, setSelectedPagamentoOperador,
    selectedParticipacao, pagamentoParticipacaoOpen, setPagamentoParticipacaoOpen, setSelectedParticipacao,
    dispensaState, setDispensaOpen, setDispensaMotivo, setDispensaEstornar, onDispensarPagamento,
    perdaLimitadaDialog, setPerdaLimitadaDialog,
    selectedPagamentoParceiro, pagamentoParceiroDialogOpen, setPagamentoParceiroDialogOpen, setSelectedPagamentoParceiro,
    selectedPagamentoFornecedor, pagamentoFornecedorOpen, setPagamentoFornecedorOpen, setSelectedPagamentoFornecedor,
    encerrarDialogOpen, setEncerrarDialogOpen, parceriaToEncerrar, encerrarLoading, onEncerrarParceria,
    renovarDialogOpen, handleRenovarDialogClose, parceriaToRenovar, onRenewalSuccess,
  } = props;

  // Estabiliza a referência do objeto parceria para evitar que o useEffect
  // do ParceriaDialog re-execute em todo render e resete o formData
  // (bug que sobrescrevia o valor digitado pelo usuário na renovação).
  const parceriaForDialog = useMemo(() => {
    if (!parceriaToRenovar) return null;
    return {
      id: parceriaToRenovar.id,
      parceiro_id: parceriaToRenovar.parceiro_id,
      parceiro_nome: parceriaToRenovar.parceiroNome,
      data_inicio: parceriaToRenovar.dataInicio,
      data_fim_prevista: parceriaToRenovar.dataFim,
      duracao_dias: parceriaToRenovar.duracaoDias,
      valor_parceiro: parceriaToRenovar.valor_parceiro,
      valor_indicador: parceriaToRenovar.valor_indicador,
      valor_fornecedor: parceriaToRenovar.valor_fornecedor,
      origem_tipo: parceriaToRenovar.origem_tipo,
      fornecedor_id: parceriaToRenovar.fornecedor_id,
      indicacao_id: parceriaToRenovar.indicacao_id,
      elegivel_renovacao: parceriaToRenovar.elegivel_renovacao,
      observacoes: parceriaToRenovar.observacoes,
      status: parceriaToRenovar.status,
    };
  }, [parceriaToRenovar]);

  return (
    <>
      {selectedEntrega && (
        <EntregaConciliacaoDialog
          open={conciliacaoOpen}
          onOpenChange={setConciliacaoOpen}
          entrega={{
            id: selectedEntrega.id,
            numero_entrega: selectedEntrega.numero_entrega,
            resultado_nominal: selectedEntrega.resultado_nominal,
            saldo_inicial: selectedEntrega.saldo_inicial,
            meta_valor: selectedEntrega.meta_valor,
            meta_percentual: selectedEntrega.meta_percentual,
            tipo_gatilho: selectedEntrega.tipo_gatilho,
            data_inicio: selectedEntrega.data_inicio,
            data_fim_prevista: selectedEntrega.data_fim_prevista,
            operador_projeto_id: selectedEntrega.operador_projeto_id,
          }}
          operadorNome={selectedEntrega.operador_nome}
          operadorId={selectedEntrega.operador_id}
          projetoId={selectedEntrega.projeto_id}
          modeloPagamento={selectedEntrega.modelo_pagamento}
          valorFixo={selectedEntrega.valor_fixo || 0}
          percentual={selectedEntrega.percentual || 0}
          onSuccess={() => fetchData(true)}
        />
      )}

      <ConfirmarSaqueDialog
        open={confirmarSaqueOpen}
        onClose={() => { setConfirmarSaqueOpen(false); setSelectedSaque(null); }}
        onSuccess={() => fetchData(true)}
        saque={selectedSaque}
      />

      <PagamentoOperadorDialog
        open={pagamentoOperadorOpen}
        onOpenChange={(open) => { setPagamentoOperadorOpen(open); if (!open) setSelectedPagamentoOperador(null); }}
        pagamento={selectedPagamentoOperador ? {
          id: selectedPagamentoOperador.id,
          operador_id: selectedPagamentoOperador.operador_id,
          projeto_id: selectedPagamentoOperador.projeto_id || null,
          tipo_pagamento: selectedPagamentoOperador.tipo_pagamento,
          valor: selectedPagamentoOperador.valor,
          moeda: "BRL",
          data_pagamento: selectedPagamentoOperador.data_pagamento,
          data_competencia: null,
          descricao: null,
          status: "PENDENTE",
        } : undefined}
        onSuccess={() => fetchData(true)}
      />

      <PagamentoParticipacaoDialog
        open={pagamentoParticipacaoOpen}
        onOpenChange={(open) => { setPagamentoParticipacaoOpen(open); if (!open) setSelectedParticipacao(null); }}
        participacao={selectedParticipacao ? {
          id: selectedParticipacao.id,
          projeto_id: selectedParticipacao.projeto_id,
          ciclo_id: selectedParticipacao.ciclo_id,
          investidor_id: selectedParticipacao.investidor_id,
          percentual_aplicado: selectedParticipacao.percentual_aplicado,
          base_calculo: selectedParticipacao.base_calculo,
          lucro_base: selectedParticipacao.lucro_base,
          valor_participacao: selectedParticipacao.valor_participacao,
          data_apuracao: selectedParticipacao.data_apuracao,
          status: "A_PAGAR",
        } : undefined}
        onSuccess={() => fetchData(true)}
      />

      {/* Dialog de Dispensar Pagamento */}
      <AlertDialog open={dispensaState.open} onOpenChange={setDispensaOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dispensar pagamento</AlertDialogTitle>
            <AlertDialogDescription>
              O pagamento a <strong>{getFirstLastName(dispensaState.parceiroNome)}</strong> será dispensado. Esta parceria não será contabilizada como indicação bem-sucedida.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {dispensaState.comissaoJaPaga && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold text-amber-500">Comissão já paga ao indicador</p>
                  <p className="text-muted-foreground mt-1">
                    A comissão de <strong>R$ {dispensaState.valorComissao.toFixed(2)}</strong>
                    {dispensaState.indicadorNome ? ` para ${getFirstLastName(dispensaState.indicadorNome)}` : ""} já foi creditada.
                    Ao dispensar sem estorno, esse valor ficará registrado como sobrepagamento.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 ml-7">
                <Checkbox
                  id="estornar-comissao-central"
                  checked={dispensaState.estornar}
                  onCheckedChange={(checked) => setDispensaEstornar(checked === true)}
                />
                <label htmlFor="estornar-comissao-central" className="text-sm font-medium cursor-pointer">
                  Estornar comissão (devolver R$ {dispensaState.valorComissao.toFixed(2)} ao caixa)
                </label>
              </div>
            </div>
          )}

          <div className="py-2">
            <label className="text-sm font-medium mb-1.5 block">Motivo *</label>
            <Textarea
              placeholder="Ex: Parceiro desistiu, parceria não concretizada..."
              value={dispensaState.motivo}
              onChange={(e) => setDispensaMotivo(e.target.value)}
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDispensarPagamento}
              disabled={!dispensaState.motivo.trim() || dispensaState.loading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {dispensaState.loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {dispensaState.comissaoJaPaga && dispensaState.estornar ? "Dispensar + Estornar" : "Dispensar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog Registrar Perda */}
      {perdaLimitadaDialog && (
        <RegistrarPerdaRapidaDialog
          open={perdaLimitadaDialog.open}
          onOpenChange={(open) => { if (!open) setPerdaLimitadaDialog(null); }}
          bookmakerId={perdaLimitadaDialog.bookmakerId}
          bookmakerNome={perdaLimitadaDialog.bookmakerNome}
          moeda={perdaLimitadaDialog.moeda}
          saldoAtual={perdaLimitadaDialog.saldoAtual}
          onSuccess={() => fetchData()}
        />
      )}

      {/* Dialog Pagamento Parceiro */}
      <PagamentoParceiroDialog
        open={pagamentoParceiroDialogOpen}
        onOpenChange={(open) => {
          setPagamentoParceiroDialogOpen(open);
          if (!open) setSelectedPagamentoParceiro(null);
        }}
        parceria={selectedPagamentoParceiro ? {
          id: selectedPagamentoParceiro.parceriaId,
          parceiroNome: selectedPagamentoParceiro.parceiroNome,
          valorParceiro: selectedPagamentoParceiro.valorParceiro,
        } : null}
        onSuccess={() => fetchData()}
      />

      {/* Dialog Pagamento Fornecedor */}
      <PagamentoFornecedorDialog
        open={pagamentoFornecedorOpen}
        onOpenChange={(open) => {
          setPagamentoFornecedorOpen(open);
          if (!open) setSelectedPagamentoFornecedor(null);
        }}
        parceria={selectedPagamentoFornecedor ? {
          parceriaId: selectedPagamentoFornecedor.parceriaId,
          fornecedorNome: selectedPagamentoFornecedor.fornecedorNome,
          fornecedorId: selectedPagamentoFornecedor.fornecedorId,
          parceiroNome: selectedPagamentoFornecedor.parceiroNome,
          valorFornecedor: selectedPagamentoFornecedor.valorRestante,
        } : null}
        onSuccess={() => fetchData()}
      />

      {/* Dialog Encerrar Parceria */}
      <AlertDialog open={encerrarDialogOpen} onOpenChange={setEncerrarDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar Parceria</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja encerrar a parceria com "{parceriaToEncerrar?.parceiroNome}"?
              O status será alterado para ENCERRADA e a data de fim real será definida como hoje.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={encerrarLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onEncerrarParceria} disabled={encerrarLoading} className="bg-destructive text-destructive-foreground">
              {encerrarLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Encerrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog Renovar Parceria */}
      <ParceriaDialog
        open={renovarDialogOpen}
        onOpenChange={handleRenovarDialogClose}
        parceria={parceriaForDialog}
        isViewMode={false}
        isRenewalMode={true}
        onRenewalSuccess={onRenewalSuccess}
      />
    </>
  );
}
