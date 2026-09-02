import React from "react";
import { logError } from "@/lib/errorLogger";
import { hardReload, isChunkLoadError } from "@/lib/lazyWithRetry";

interface State {
  hasError: boolean;
  message?: string;
  isChunkError?: boolean;
}

export class GlobalErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { hasError: false };

  static getDerivedStateFromError(err: Error): State {
    return { hasError: true, message: err?.message, isChunkError: isChunkLoadError(err) };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logError(error, {
      action: "react.render",
      componentStack: info.componentStack,
    }, "ReactRenderError");
  }

  reset = () => this.setState({ hasError: false, message: undefined, isChunkError: false });

  render() {
    if (this.state.hasError) {
      if (this.state.isChunkError) {
        return (
          <div className="min-h-screen flex items-center justify-center p-6 bg-background">
            <div className="max-w-md w-full border border-border bg-card rounded-lg p-6 space-y-3">
              <h2 className="text-lg font-semibold">O sistema foi atualizado</h2>
              <p className="text-sm text-muted-foreground">
                Esta aba estava executando uma versão anterior do sistema. Clique em Atualizar para
                carregar a versão mais recente e continuar de onde parou.
              </p>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={hardReload}
                  className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90"
                >
                  Atualizar
                </button>
              </div>
            </div>
          </div>
        );
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-background">
          <div className="max-w-md w-full border border-destructive/40 bg-destructive/5 rounded-lg p-6 space-y-3">
            <h2 className="text-lg font-semibold text-destructive">Algo deu errado</h2>
            <p className="text-sm text-muted-foreground break-words">
              {this.state.message || "Erro inesperado na interface."}
            </p>
            <p className="text-xs text-muted-foreground">
              O erro foi registrado automaticamente. Recarregue a página ou tente novamente.
            </p>
            <div className="flex gap-2 pt-2">
              <button
                onClick={this.reset}
                className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-accent"
              >
                Tentar novamente
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90"
              >
                Recarregar
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
