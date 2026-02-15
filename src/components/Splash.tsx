"use client";

import React from "react";

/**
 * @brief スプラッシュ画面（2秒表示後に自動遷移）
 */
export function Splash() {
  return (
    <div
      className="flex flex-col items-center justify-center h-full paper-bg-scroll"
      style={{ zIndex: 10 }}
    >
      <h1
        className="text-5xl font-bold tracking-wide"
        style={{ fontFamily: "'Courier New', monospace" }}
      >
        PiaCode
      </h1>
      <p className="mt-3 text-sm" style={{ color: "var(--text-secondary)" }}>
        made by Gajumaru
      </p>
    </div>
  );
}
