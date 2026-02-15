"use client";

import React, { useState, useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { t } from "@/lib/i18n";

/**
 * @brief 名前付き保存パネル
 */
export function SavePanel() {
  const { state, dispatch, savePreset } = useApp();
  const lang = state.options.language;
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  /**
   * @brief 入力テキストに部分一致する既存名の候補
   */
  const suggestions = useMemo(() => {
    if (!name.trim()) return [];
    return state.userPresets
      .map((p) => p.name)
      .filter((n) => n.includes(name.trim()));
  }, [name, state.userPresets]);

  /**
   * @brief 保存を実行する
   */
  const handleSave = (saveName: string) => {
    if (!saveName.trim() || saveName.startsWith("system.")) {
      setError(t("save.invalidName", lang));
      return;
    }
    const ok = savePreset(saveName.trim());
    if (ok) {
      dispatch({ type: "SET_SHOW_SAVE_PANEL", show: false });
    } else {
      setError(t("save.invalidName", lang));
    }
  };

  return (
    <div className="flex flex-col h-full p-4 paper-bg-scroll">
      {/* ヘッダー */}
      <div className="flex justify-end mb-4">
        <button
          aria-label={t("save.back", lang)}
          onClick={() => dispatch({ type: "SET_SHOW_SAVE_PANEL", show: false })}
          className="px-6 py-2 border border-[var(--border-color)] bg-white text-sm font-bold"
        >
          {t("save.back", lang)}
        </button>
      </div>

      {/* 名前入力欄 */}
      <div className="mb-4">
        <input
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(""); }}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(name); }}
          placeholder={t("save.namePlaceholder", lang)}
          className="w-full px-4 py-3 border border-[var(--border-color)] bg-white text-center text-lg"
          autoFocus
        />
        {error && (
          <p className="text-sm mt-1 text-center" style={{ color: "#CC4444" }}>{error}</p>
        )}
      </div>

      {/* 候補リスト */}
      <div className="flex-1 overflow-y-auto paper-bg-scroll">
        {/* 入力した名前自体を候補として表示（完全一致する既存名がない場合） */}
        {name.trim() && !suggestions.includes(name.trim()) && (
          <button
            onClick={() => handleSave(name)}
            className="block w-full text-center py-3 text-lg hover:bg-gray-100 active:bg-gray-200 transition-colors font-bold"
          >
            {name.trim()}
          </button>
        )}
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => handleSave(s)}
            className="block w-full text-center py-3 text-lg hover:bg-gray-100 active:bg-gray-200 transition-colors"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
