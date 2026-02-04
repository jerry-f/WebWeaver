"use client";

import { SessionProvider } from "next-auth/react";
import DashboardLayout from "@/components/dashboard-layout";
import { SocketProvider } from "@/contexts/socket-context";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SocketProvider autoConnect>
        <DashboardLayout>{children}</DashboardLayout>
      </SocketProvider>
    </SessionProvider>
  );
}
