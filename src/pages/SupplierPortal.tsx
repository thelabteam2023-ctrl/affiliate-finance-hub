import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Shield, AlertTriangle } from "lucide-react";
import { SupplierDashboard } from "@/components/supplier-portal/SupplierDashboard";

interface SupplierSession {
  supplier_workspace_id: string;
  supplier_profile_id: string;
  supplier_nome: string;
  token_id: string;
  expires_at: string;
}

export default function SupplierPortal() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [session, setSession] = useState<SupplierSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Link de acesso inválido. Solicite um novo link ao administrador.");
      setLoading(false);
      return;
    }

    validateToken(token);
  }, [token]);

  async function validateToken(rawToken: string) {
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const resp = await fetch(
        `https://${projectId}.supabase.co/functions/v1/supplier-auth?action=validate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: anonKey,
          },
          body: JSON.stringify({ token: rawToken }),
        }
      );

      const data = await resp.json();

      if (!data.valid) {
        setError(data.error || "Token inválido ou expirado.");
        setLoading(false);
        return;
      }

      setSession({
        supplier_workspace_id: data.supplier_workspace_id,
        supplier_profile_id: data.supplier_profile_id,
        supplier_nome: data.supplier_nome,
        token_id: data.token_id,
        expires_at: data.expires_at,
      });
    } catch (err) {
      console.error("Token validation error:", err);
      setError("Erro ao validar acesso. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Validando acesso...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md px-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">Acesso Negado</h1>
          <p className="text-muted-foreground">{error}</p>
          <p className="text-sm text-muted-foreground/70">
            Entre em contato com o administrador para obter um novo link de acesso.
          </p>
        </div>
      </div>
    );
  }

  if (!session) return null;

  return <SupplierDashboard session={session} />;
}
