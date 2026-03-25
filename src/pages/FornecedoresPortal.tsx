import { useWorkspace } from "@/hooks/useWorkspace";
import { SupplierAdminPanel } from "@/components/supplier-portal/SupplierAdminPanel";
import { useTopBar } from "@/contexts/TopBarContext";
import { useEffect } from "react";

export default function FornecedoresPortalPage() {
  const { workspaceId } = useWorkspace();
  const { setContent } = useTopBar();

  useEffect(() => {
    setContent(
      <span className="font-semibold text-sm">Portal do Fornecedor</span>
    );
    return () => setContent(null);
  }, [setContent]);

  if (!workspaceId) return null;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <SupplierAdminPanel workspaceId={workspaceId} />
    </div>
  );
}
