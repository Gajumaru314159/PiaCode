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
      <nav className="flex shrink-0 gap-px px-1 h-12 overflow-visible" role="tablist" aria-label="メインナビゲーション">
        {TABS.map((tab) => {
          const isActive = state.currentTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-label={t(`tab.${tab.id}`, lang)}
              onClick={() => dispatch({ type: "SET_TAB", tab: tab.id })}
              className="relative flex-1 h-14 pt-6 pb-2 text-center font-bold text-base transition-all"
              style={{
                backgroundColor: tab.color,
                opacity: isActive ? 1 : 0.82,
                fontSize: isActive ? "1.1rem" : "0.95rem",
                transform: isActive ? "translateY(-2px)" : "translateY(-10px)",
                boxShadow: isActive
                  ? "0 4px 0 rgba(0, 0, 0, 0.28), 0 5px 1px rgba(0, 0, 0, 0.12)"
                  : "0 2px 0 rgba(0, 0, 0, 0.14)",
                zIndex: isActive ? 4 : 2,
                borderTopLeftRadius: "2px",
                borderTopRightRadius: "2px",
              }}
            >
              {t(`tab.${tab.id}`, lang)}
            </button>
          );
        })}
      </nav>

      {/* タブコンテンツ */}
      <main className="flex-1 overflow-hidden relative pt-1">
        {state.currentTab === "edit" && <EditTab />}
        {state.currentTab === "load" && <LoadTab />}
        {state.currentTab === "play" && <PlayTab />}
        {state.currentTab === "option" && <OptionTab />}
      </main>
    </div>
  );
}
