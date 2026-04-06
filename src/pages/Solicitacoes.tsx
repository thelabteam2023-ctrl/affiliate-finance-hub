import { SolicitacoesModule } from "@/components/solicitacoes/SolicitacoesModule";
import { useTopBar } from "@/contexts/TopBarContext";
import { useEffect } from "react";

export default function Solicitacoes() {
  const { setTitle } = useTopBar();

  useEffect(() => {
    setTitle("Solicitações");
  }, [setTitle]);

  return (
    <div className="space-y-6">
      <SolicitacoesModule />
    </div>
  );
}
