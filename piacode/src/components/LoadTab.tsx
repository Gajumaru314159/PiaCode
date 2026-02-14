"use client";

import React, { useState, useCallback } from "react";
import { useApp } from "@/context/AppContext";
import { SYSTEM_PRESETS } from "@/lib/presets";
import { chordDisplayName } from "@/lib/music";
import { t } from "@/lib/i18n";
import { SavedProgression } from "@/types/music";
import { ConfirmDialog } from "./ConfirmDialog";

/**
 * @brief Loadタブ - プリセット一覧と選択・削除
 */
export function LoadTab() {
  const { state, loadPreset, removePreset } = useApp();
  const lang = state.options.language;
  const [deleteTarget, setDeleteTarget] = useState<SavedProgression | null>(null);

  const allPresets = [...SYSTEM_PRESETS, ...state.userPresets];

  /**
   * @brief 進行を簡潔に表示する（コード名をハイフン区切りで）
   */
  const progressionSummary = (preset: SavedProgression): string => {
    const { cells, beatsPerBar } = preset.progression;
    const chords: string[] = [];
    for (let i = 0; i < cells.length; i += beatsPerBar) {
      const cell = cells[i];
      if (cell.isRest) continue;
      const name = chordDisplayName(cell);
      if (name && (chords.length === 0 || chords[chords.length - 1] !== name)) {
        chords.push(name);
      }
    }
    return chords.join("-");
  };

  /**
   * @brief 削除ボタン押下時
   */
  const handleDeleteClick = useCallback((e: React.MouseEvent, preset: SavedProgression) => {
    e.stopPropagation();
    setDeleteTarget(preset);
  }, []);

  /**
   * @brief 削除確定
   */
  const confirmDelete = useCallback(() => {
    if (deleteTarget) {
      removePreset(deleteTarget.id);
      setDeleteTarget(null);
    }
  }, [deleteTarget, removePreset]);

  if (allPresets.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-lg" style={{ color: "var(--text-secondary)" }}>
          {t("load.empty", lang)}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="h-full overflow-y-auto py-4">
        {allPresets.map((preset) => (
          <div
            key={preset.id}
            className="relative"
          >
            <button
              onClick={() => loadPreset(preset)}
              className="w-full py-5 text-center hover:bg-gray-100 active:bg-gray-200 transition-colors"
              aria-label={`${preset.name}をロード`}
            >
              <div className="text-lg font-bold">{preset.name}</div>
              <div className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
                {progressionSummary(preset)}
              </div>
            </button>
            {/* ユーザープリセットのみ削除ボタン */}
            {!preset.isSystem && (
              <button
                onClick={(e) => handleDeleteClick(e, preset)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-lg font-bold"
                style={{ color: "var(--text-secondary)" }}
                aria-label={`${preset.name}を削除`}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      {/* 削除確認ダイアログ */}
      {deleteTarget && (
        <ConfirmDialog
          message={t("load.deleteConfirm", lang, { name: deleteTarget.name })}
          okLabel={t("common.ok", lang)}
          cancelLabel={t("common.cancel", lang)}
          onOk={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}
