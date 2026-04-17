/**
 * Wrapper para SurebetCard que aplica o guard de reabertura automaticamente.
 *
 * Substitui drop-in o SurebetCard nos pontos de uso onde apostas
 * liquidadas precisam permitir edição (todos os contextos exceto
 * janelas externas que abrem por URL).
 *
 * Uso idêntico ao SurebetCard:
 * ```tsx
 * <SurebetCardWithReabertura surebet={data} onEdit={...} ... />
 * ```
 *
 * NOTA: O hook useReabrirSurebetGuard é instanciado UMA VEZ por componente
 * pai. Se você renderiza vários SurebetCards numa lista, prefira usar
 * o hook diretamente no pai (mais eficiente — apenas um Dialog) em vez
 * deste wrapper. Este wrapper é útil para casos pontuais.
 */

import { SurebetCard, type SurebetData } from "@/components/projeto-detalhe/SurebetCard";
import { useReabrirSurebetGuard } from "@/hooks/useReabrirSurebetGuard";
import type { ComponentProps } from "react";

type SurebetCardProps = ComponentProps<typeof SurebetCard>;

export function SurebetCardWithReabertura(props: SurebetCardProps) {
  const { wrapOnEdit, ReaberturaDialog } = useReabrirSurebetGuard();

  return (
    <>
      <SurebetCard
        {...props}
        onEdit={props.onEdit ? wrapOnEdit<SurebetData>(props.onEdit, props.surebet) : undefined}
      />
      {ReaberturaDialog}
    </>
  );
}
