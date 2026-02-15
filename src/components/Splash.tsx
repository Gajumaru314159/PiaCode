"use client";

import React from "react";
import { withBasePath } from "@/lib/assetPath";

/**
 * @brief スプラッシュ画面（2秒表示後に自動遷移）
 */
export function Splash() {
  return (
    <div className="h-full w-full overflow-hidden" style={{ zIndex: 10 }}>
      <img
        src={withBasePath("/images/splash.webp")}
        alt="PiaCode スプラッシュ"
        className="h-full w-full object-cover object-center"
      />
    </div>
  );
}
