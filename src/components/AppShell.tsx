"use client";

import React from "react";
import { useApp, TabId } from "@/context/AppContext";
import { Splash } from "./Splash";
import { EditTab } from "./EditTab";
import { LoadTab } from "./LoadTab";
import { PlayTab } from "./PlayTab";
import { OptionTab } from "./OptionTab";
import { t } from "@/lib/i18n";

/** タブ設定 */
const TABS: { id: TabId; color: string }[] = [
  { id: "edit", color: "var(--tab-edit)" },
  { id: "load", color: "var(--tab-load)" },
  { id: "play", color: "var(--tab-play)" },
  { id: "option", color: "var(--tab-option)" },
];

/**
 * @brief アプリのメインシェル（スプラッシュ、タブバー、タブコンテンツ）
 */
export function AppShell() {
  const { state, dispatch } = useApp();

  if (state.showSplash) {
    return <Splash />;
  }

  const lang = state.options.language;

  return (
    <div className="flex flex-col h-full relative" style={{ zIndex: 1 }}>
      {/* タブバー */}
      <nav className="relative isolate z-20 flex shrink-0 gap-px px-1 h-7 overflow-visible" role="tablist" aria-label="メインナビゲーション">
        {TABS.map((tab) => {
          const isActive = state.currentTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-label={t(`tab.${tab.id}`, lang)}
              onClick={() => dispatch({ type: "SET_TAB", tab: tab.id })}
              className="relative flex-1 h-10 min-h-0 pt-2 pb-1 text-center font-bold text-sm transition-all"
              style={{
                backgroundColor: tab.color,
                opacity: isActive ? 1 : 0.82,
                minHeight: 0,
                fontSize: "1rem",
                fontWeight: 700,
                transform: isActive ? "translateY(-1px)" : "translateY(-6px)",
                borderBottom: "1px solid rgba(0, 0, 0, 0.2)",
                borderRight: "1px solid rgba(0, 0, 0, 0.1)",
                zIndex: isActive ? 1 : 2,
              }}
            >
              {t(`tab.${tab.id}`, lang)}
            </button>
          );
        })}
      </nav>

      {/* タブコンテンツ */}
      <main className="relative z-0 flex-1 overflow-hidden pt-1">
        {state.currentTab === "edit" && <EditTab />}
        {state.currentTab === "load" && <LoadTab />}
        {state.currentTab === "play" && <PlayTab />}
        {state.currentTab === "option" && <OptionTab />}
      </main>
    </div>
  );
}
