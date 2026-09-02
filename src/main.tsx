import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

import { initWorkspaceRequestScope } from "@/lib/workspaceRequestScope";
import { installGlobalErrorHandlers } from "@/lib/errorLogger";
import { installBackendResponseMonitor } from "@/lib/backendResponseMonitor";
import { installChunkErrorRecovery } from "@/lib/lazyWithRetry";

// Ensure every backend request carries the active tab workspace context.
initWorkspaceRequestScope();

// Recupera automaticamente imports dinâmicos que falharam por deploy novo.
installChunkErrorRecovery();

// Observa respostas de erro do backend (endpoint, status, corpo) no console.
installBackendResponseMonitor();

// Captura window.onerror + unhandledrejection → grava em error_logs
installGlobalErrorHandlers();


createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
