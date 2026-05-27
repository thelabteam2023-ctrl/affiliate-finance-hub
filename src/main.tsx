import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

import { initWorkspaceRequestScope } from "@/lib/workspaceRequestScope";
import { installGlobalErrorHandlers } from "@/lib/errorLogger";

// Ensure every backend request carries the active tab workspace context.
initWorkspaceRequestScope();

// Captura window.onerror + unhandledrejection → grava em error_logs
installGlobalErrorHandlers();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
