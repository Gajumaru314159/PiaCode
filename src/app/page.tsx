"use client";

import { AppProvider } from "@/context/AppContext";
import { AppShell } from "@/components/AppShell";

export default function Home() {
  return (
    <div className="mx-auto h-dvh w-full max-w-[400px]">
      <AppProvider>
        <AppShell />
      </AppProvider>
    </div>
  );
}
