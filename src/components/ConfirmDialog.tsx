"use client";

import React, { useEffect, useRef } from "react";

interface ConfirmDialogProps {
  message: string;
  okLabel?: string;
  cancelLabel?: string;
  onOk: () => void;
  onCancel: () => void;
}

/**
 * @brief 独自実装の確認ダイアログ
 */
export function ConfirmDialog({ message, okLabel = "はい", cancelLabel, onOk, onCancel }: ConfirmDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Escキーでキャンセル
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onCancel]);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
      onClick={(e) => { if (e.target === overlayRef.current) onCancel(); }}
    >
      <div
        className="mx-6 p-6 border border-[var(--border-color)] shadow-lg max-w-sm w-full"
        style={{ background: "var(--bg-paper)" }}
      >
        <p className="text-sm text-center mb-6 whitespace-pre-wrap">{message}</p>
        <div className="flex justify-center gap-4">
          <button
            onClick={onOk}
            className="w-24 px-6 py-2 border border-[var(--border-color)] bg-white text-sm font-bold"
            aria-label={okLabel}
          >
            {okLabel}
          </button>
          {cancelLabel && (
            <button
              onClick={onCancel}
              className="w-24 px-6 py-2 border border-[var(--border-color)] bg-white text-sm font-bold"
              aria-label={cancelLabel}
            >
              {cancelLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
