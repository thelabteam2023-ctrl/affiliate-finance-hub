import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

import { initWorkspaceRequestScope } from "@/lib/workspaceRequestScope";

// Ensure every backend request carries the active tab workspace context.
initWorkspaceRequestScope();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
