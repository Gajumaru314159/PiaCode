import type { Metadata, Viewport } from "next";
import type { CSSProperties, ReactNode } from "react";
import { withBasePath } from "@/lib/assetPath";
import "./globals.css";

export const metadata: Metadata = {
  title: "PiaCode",
  description: "ピアノコード進行学習アプリ",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const bodyStyle = {
    "--bg-paper-image": `url("${withBasePath("/images/backgrounds/paper.webp")}")`,
    "--box-frame-image": `url("${withBasePath("/images/backgrounds/box.webp")}")`,
    "--box-frame-fill-image": `url("${withBasePath("/images/backgrounds/box-fill.webp")}")`,
  } as CSSProperties;

  return (
    <html lang="ja">
      <body style={bodyStyle}>{children}</body>
    </html>
  );
}
