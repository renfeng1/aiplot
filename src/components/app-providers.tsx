"use client";

import { ThemeProvider } from "next-themes";
import { SessionProvider } from "next-auth/react";

import { MaintenanceNotice } from "@/components/maintenance-notice";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { emergencyMaintenance } from "@/lib/maintenance";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <TooltipProvider>
          {children}
          {emergencyMaintenance ? <MaintenanceNotice /> : null}
          <Toaster richColors position="top-center" />
        </TooltipProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
