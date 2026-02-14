"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { useApp } from "@/context/AppContext";
import { getDiatonicRoots, ALL_PITCH_CLASSES, MATRIX_QUALITIES, chordDisplayName, createChordToken, createRestToken, transposeProgression, chordToMidiNotes } from "@/lib/music";
import { t } from "@/lib/i18n";
import { ChordQuality, PitchClass } from "@/types/music";
import { SavePanel } from "./SavePanel";
import { ConfirmDialog } from "./ConfirmDialog";

const GRID_COLS = 11;
const GRID_UNIT = "10vw";
const GRID_LIGHT_BORDER = "rgba(120, 170, 220, 0.35)";
const GRID_CELL_STYLE: React.CSSProperties = {
  width: `calc(${GRID_UNIT} + 1px)`,
  height: `calc(${GRID_UNIT} + 1px)`,
  minWidth: GRID_UNIT,
  minHeight: GRID_UNIT,
  boxSizing: "border-box",
};
const GRID_ROW_STYLE: React.CSSProperties = {
  position: "relative",
  display: "flex",
  width: `calc(${GRID_UNIT} * ${GRID_COLS})`,
  height: GRID_UNIT,
  marginLeft: `calc(${GRID_UNIT} * -0.5)`,
};
const GRID_OVERLAY_BASE_STYLE: React.CSSProperties = {
  position: "absolute",
  top: 0,
  height: GRID_UNIT,
  minWidth: 0,
  minHeight: 0,
};

type GridOverlay = {
  key: string;
  start: number; // 1-based
  span?: number;
  content: React.ReactNode;
  className: string;
  style?: React.CSSProperties;
  asButton?: boolean;
  ariaLabel?: string;
  onClick?: () => void;
  disabled?: boolean;
};

/**
 * @brief 11セルを明示生成して、その上に要素を重ねる行コンポーネント
 */
function GridRow({ overlays = [] }: { overlays?: GridOverlay[] }) {
  return (
    <div style={GRID_ROW_STYLE}>
      {Array.from({ length: GRID_COLS }, (_, idx) => (
        <div
          key={`cell-${idx}`}
          className="border"
          style={{ ...GRID_CELL_STYLE, borderColor: GRID_LIGHT_BORDER }}
          aria-hidden
        />
      ))}
      {overlays.map((overlay) => {
        const span = overlay.span ?? 1;
        const overlayStyle: React.CSSProperties = {
          ...GRID_OVERLAY_BASE_STYLE,
          left: `calc(${GRID_UNIT} * ${overlay.start - 1})`,
          width: `calc(${GRID_UNIT} * ${span} + 1px)`,
          height: `calc(${GRID_UNIT} + 1px)`,
          ...overlay.style,
        };
        if (overlay.asButton) {
          return (
            <button
              key={overlay.key}
              type="button"
              aria-label={overlay.ariaLabel}
              onClick={overlay.onClick}
              disabled={overlay.disabled}
              className={`absolute min-w-0 min-h-0 ${overlay.className}`}
              style={overlayStyle}
            >
              {overlay.content}
            </button>
          );
        }
        return (
          <div
            key={overlay.key}
            className={`absolute min-w-0 min-h-0 ${overlay.className}`}
            style={overlayStyle}
          >
            {overlay.content}
          </div>
        );
      })}
    </div>
  );
}

/**
 * @brief Editタブ - コード進行の入力・編集画面
 */
export function EditTab() {
  const { state, dispatch } = useApp();
  const { progression, options, showSavePanel, currentKey } = state;
  const lang = options.language;
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // キー切替
  const keyRoot = ALL_PITCH_CLASSES[currentKey];
  const diatonicRoots = getDiatonicRoots(keyRoot);

  /**
   * @brief コードセルにコードを入力する
   */
  const inputChord = useCallback((root: PitchClass, quality: ChordQuality) => {
    const cell = createChordToken(root, quality);
    const cursor = progression.cursor;
    dispatch({ type: "SET_CELL", index: cursor, cell });
    // カーソルを1つ進める
    const nextCursor = cursor + 1;
    // 末尾に達したらセルを拡張
    if (nextCursor >= progression.cells.length) {
      dispatch({ type: "EXPAND_CELLS", minLength: nextCursor + 1 });
    }
    dispatch({ type: "SET_CURSOR", cursor: nextCursor });
  }, [progression.cursor, progression.cells.length, dispatch]);

  /**
   * @brief 休符を入力する
   */
  const inputRest = useCallback(() => {
    const cursor = progression.cursor;
    dispatch({ type: "SET_CELL", index: cursor, cell: createRestToken() });
    const nextCursor = cursor + 1;
    if (nextCursor >= progression.cells.length) {
      dispatch({ type: "EXPAND_CELLS", minLength: nextCursor + 1 });
    }
    dispatch({ type: "SET_CURSOR", cursor: nextCursor });
  }, [progression.cursor, progression.cells.length, dispatch]);

  /**
   * @brief キーを前後に切り替える
   */
  const shiftKey = useCallback((delta: number) => {
    const next = (currentKey + delta + 12) % 12;
    dispatch({ type: "SET_KEY", key: next });
  }, [currentKey, dispatch]);

  /**
   * @brief クリアボタン
   */
  const handleClear = useCallback(() => {
    setShowClearConfirm(true);
  }, []);

  /**
   * @brief クリア確定
   */
  const confirmClear = useCallback(() => {
    dispatch({ type: "CLEAR_PROGRESSION" });
    setShowClearConfirm(false);
  }, [dispatch]);

  /**
   * @brief 移調ボタン
   */
  const handleTranspose = useCallback((delta: 1 | -1) => {
    const transposed = transposeProgression(progression, delta);
    dispatch({ type: "SET_PROGRESSION", progression: transposed });
  }, [progression, dispatch]);

  /**
   * @brief 拍子トグル
   */
  const toggleBeatsPerBar = useCallback(() => {
    const next = progression.beatsPerBar === 4 ? 3 : 4;
    dispatch({ type: "SET_BEATS_PER_BAR", beatsPerBar: next as 3 | 4 });
  }, [progression.beatsPerBar, dispatch]);

  if (showSavePanel) {
    return <SavePanel />;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 調号表示（VexFlow） */}
      <KeySignatureDisplay keyRoot={keyRoot} />

      {/* 11列グリッド上のマトリックス入力 */}
      <div className="shrink-0 mt-2 overflow-x-hidden overflow-y-hidden">
        {/* 上段ルート行（◀ + 7ルート + ▶） */}
        <GridRow
          overlays={[
            {
              key: "prev-key",
              start: 2,
              content: "◀",
              asButton: true,
              ariaLabel: "前のキーへ",
              onClick: () => shiftKey(-1),
              className: "flex items-center justify-center text-lg bg-black text-white opacity-80",
            },
            ...diatonicRoots.map((root, idx) => ({
              key: `head-root-${root}`,
              start: 3 + idx,
              content: root,
              className: "flex items-center justify-center text-sm bg-black text-white opacity-80",
            })),
            {
              key: "next-key",
              start: 10,
              content: "▶",
              asButton: true,
              ariaLabel: "次のキーへ",
              onClick: () => shiftKey(1),
              className: "flex items-center justify-center text-lg bg-black text-white opacity-80",
            },
          ]}
        />

        {/* 品質×ルートのマトリックス（中央7x10のみ黒ボーダー） */}
        {MATRIX_QUALITIES.map((quality) => (
          <GridRow
            key={quality}
            overlays={[
              {
                key: `left-quality-${quality}`,
                start: 2,
                content: quality,
                className: "flex items-center justify-center text-xs bg-black text-white opacity-80"
              },
              ...diatonicRoots.map((root, idx) => ({
                key: `matrix-${quality}-${root}`,
                start: 3 + idx,
                content: quality,
                asButton: true,
                ariaLabel: `${root}${quality}`,
                onClick: () => inputChord(root, quality),
                className: "flex items-center justify-center text-xs opacity-50",
              })),
              {
                key: `right-quality-${quality}`,
                start: 10,
                content: quality,
                className: "flex items-center justify-center text-xs bg-black text-white opacity-80"
              },
            ]}
          />
        ))}

        {/* 下段ルート行（休符 + 7ルート + 装飾） */}
        <GridRow
          overlays={[
            {
              key: "rest-input",
              start: 2,
              content: "𝄽",
              asButton: true,
              ariaLabel: "休符入力",
              onClick: inputRest,
              className: "flex items-center justify-center text-lg bg-black text-white opacity-80",
            },
            ...diatonicRoots.map((root, idx) => ({
              key: `bottom-root-${root}`,
              start: 3 + idx,
              content: root,
              className: "flex items-center justify-center text-sm bg-black text-white opacity-80",
            })),
            {
              key: "trash-icon",
              start: 10,
              content: null,
              className: "flex items-center justify-center text-lg bg-black text-white opacity-80",
            },
          ]}
        />

        <GridRow />

        {/* 操作ボタン行（グリッド上に配置） */}
        <GridRow
          overlays={[
            {
              key: "beats-toggle",
              start: 2,
              content: `${progression.beatsPerBar}/4`,
              asButton: true,
              ariaLabel: "拍子切替",
              onClick: toggleBeatsPerBar,
              className: "flex items-center justify-center text-sm font-bold whitespace-nowrap leading-none",
            },
            {
              key: "save",
              start: 4,
              content: t("edit.save", lang),
              asButton: true,
              ariaLabel: "保存",
              onClick: () => dispatch({ type: "SET_SHOW_SAVE_PANEL", show: true }),
              className: "flex items-center justify-center text-xs font-bold whitespace-nowrap leading-none",
            },
            {
              key: "clear",
              start: 6,
              content: t("edit.clear", lang),
              asButton: true,
              ariaLabel: "クリア",
              onClick: handleClear,
              className: "flex items-center justify-center text-xs font-bold whitespace-nowrap leading-none",
            },
            {
              key: "transpose-sharp",
              start: 8,
              content: "♯",
              asButton: true,
              ariaLabel: "シャープ方向に移調",
              onClick: () => handleTranspose(1),
              className: "flex items-center justify-center text-sm font-bold whitespace-nowrap leading-none",
            },
            {
              key: "transpose-flat",
              start: 10,
              content: "♭",
              asButton: true,
              ariaLabel: "フラット方向に移調",
              onClick: () => handleTranspose(-1),
              className: "flex items-center justify-center text-sm font-bold whitespace-nowrap leading-none",
            },
          ]}
        />

      </div>

      {/* コード進行グリッド */}
      <ChordGrid />

      {/* クリア確認ダイアログ */}
      {showClearConfirm && (
        <ConfirmDialog
          message={t("edit.clearConfirm", lang)}
          okLabel={t("common.yes", lang)}
          cancelLabel={t("common.no", lang)}
          onOk={confirmClear}
          onCancel={() => setShowClearConfirm(false)}
        />
      )}
    </div>
  );
}

/**
 * @brief VexFlowを使った調号表示コンポーネント
 */
function KeySignatureDisplay({ keyRoot }: { keyRoot: PitchClass }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    const render = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Vex: any = await import("vexflow");
        const VexModule = Vex.default || Vex;
        const { Renderer, Stave } = VexModule.Flow || VexModule;

        if (disposed || !containerRef.current) return;
        container.innerHTML = "";

        const width = 320;
        const height = 92;

        const renderer = new Renderer(container, Renderer.Backends.SVG);
        renderer.resize(width, height);
        const context = renderer.getContext();
        context.setFont("Arial", 10);

        // VexFlowの調号名に変換
        const keyMap: Record<string, string> = {
          "C": "C", "C#": "C#", "D": "D", "Eb": "Eb", "E": "E", "F": "F",
          "F#": "F#", "G": "G", "Ab": "Ab", "A": "A", "Bb": "Bb", "B": "B",
        };
        const vexKey = keyMap[keyRoot] || "C";

        const stave = new Stave(0, -10, width - 10);
        stave.addClef("treble");
        stave.addKeySignature(vexKey);
        stave.setContext(context).draw();

        const svg = container.querySelector("svg");
        if (svg) {
          svg.setAttribute("width", `${width}`);
          svg.setAttribute("height", `${height}`);
          svg.style.transform = "scale(0.5)";
          svg.style.transformOrigin = "top left";
          svg.style.display = "block";
        }
      } catch (e) {
        console.warn("調号描画エラー:", e);
        if (!disposed && containerRef.current) {
          containerRef.current.innerHTML = `<span style="font-size:14px;font-weight:bold;">Key: ${keyRoot}</span>`;
        }
      }
    };

    void render();

    return () => {
      disposed = true;
    };
  }, [keyRoot]);

  return (
    <div className="flex justify-center py-1">
      <div
        ref={containerRef}
        style={{ width: 160, height: 48, overflow: "hidden" }}
      />
    </div>
  );
}

/**
 * @brief コード進行の表示グリッド
 */
function ChordGrid() {
  const { state, dispatch } = useApp();
  const { progression } = state;
  const { cells, cursor, beatsPerBar } = progression;
  const playingRowRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const playTimerRef = useRef<number | null>(null);

  // コンポーネントアンマウント時にクリーンアップ
  useEffect(() => {
    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    };
  }, []);

  /**
   * @brief 小節番号タップで該当段を1回再生する
   */
  const playRow = useCallback((rowStart: number) => {
    // 既に再生中なら停止
    if (playTimerRef.current) {
      clearInterval(playTimerRef.current);
      playTimerRef.current = null;
      playingRowRef.current = null;
      return;
    }

    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === "suspended") ctx.resume();

    const visibleCells = beatsPerBar === 3 ? 6 : 8;
    const tempo = state.options.tempo;
    const beatDuration = 60 / tempo;
    let beatIdx = 0;
    playingRowRef.current = rowStart;

    const scheduleNext = () => {
      if (beatIdx >= visibleCells) {
        if (playTimerRef.current) clearInterval(playTimerRef.current);
        playTimerRef.current = null;
        playingRowRef.current = null;
        return;
      }
      const cellIdx = rowStart + beatIdx;
      const cell = cells[cellIdx];
      if (cell && !cell.isRest && cell.root) {
        const notes = chordToMidiNotes(cell, 4);
        const time = ctx.currentTime;
        for (const midi of notes) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const duration = beatDuration;
          const attack = Math.min(0.02, duration * 0.2);
          const release = Math.min(0.08, duration * 0.25);
          const releaseStart = Math.max(time + attack, time + duration - release);
          osc.type = "triangle";
          osc.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
          gain.gain.setValueAtTime(0.0001, time);
          gain.gain.linearRampToValueAtTime(0.2, time + attack);
          gain.gain.setValueAtTime(0.2, releaseStart);
          gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(time);
          osc.stop(time + duration + 0.01);
        }
      }
      beatIdx++;
    };

    scheduleNext();
    playTimerRef.current = window.setInterval(scheduleNext, beatDuration * 1000);
  }, [cells, beatsPerBar, state.options.tempo]);

  // 8セル1段
  const cellsPerRow = 8;
  const visibleCellsPerRow = beatsPerBar === 3 ? 6 : 8;
  const rows: number[] = [];
  for (let i = 0; i < cells.length; i += cellsPerRow) {
    rows.push(i);
  }

  /**
   * @brief 同段で直前拍と同一コードかどうか判定（Simile表示用）
   */
  const isSamileDisplay = (rowStart: number, colInRow: number): boolean => {
    if (colInRow === 0) return false;
    const idx = rowStart + colInRow;
    const prevIdx = rowStart + colInRow - 1;
    if (idx >= cells.length || prevIdx < 0) return false;
    const cell = cells[idx];
    const prev = cells[prevIdx];
    if (cell.isRest || prev.isRest) return false;
    return cell.root === prev.root && cell.quality === prev.quality;
  };

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden pb-4">
      <div>
        {rows.map((rowStart) => (
          <GridRow
            key={rowStart}
            overlays={[
              {
                key: `bar-${rowStart}`,
                start: 2,
                content: Math.floor(rowStart / beatsPerBar) + 1,
                asButton: true,
                ariaLabel: `小節${Math.floor(rowStart / beatsPerBar) + 1}から再生`,
                onClick: () => playRow(rowStart),
                className: "flex items-center justify-center border border-black text-sm font-bold hover:opacity-70",
                style: { color: "#CC4444" },
              },
              ...Array.from({ length: visibleCellsPerRow }, (_, col) => {
                const idx = rowStart + col;
                const start = 3 + col;
                if (idx >= cells.length) {
                  return {
                    key: `empty-${rowStart}-${col}`,
                    start,
                    content: null,
                    className: "border border-black",
                  };
                }
                const cell = cells[idx];
                const isCursor = idx === cursor;
                const showSimile = isSamileDisplay(rowStart, col);
                let display = "";
                if (cell.isRest) {
                  display = "";
                } else if (showSimile) {
                  display = "𝄍";
                } else {
                  display = chordDisplayName(cell);
                }
                return {
                  key: `chord-${rowStart}-${col}`,
                  start,
                  content: display,
                  asButton: true,
                  ariaLabel: `セル ${idx}: ${display || "空"}`,
                  onClick: () => dispatch({ type: "SET_CURSOR", cursor: idx }),
                  className: "flex items-center justify-center border border-black text-[0.66rem] font-bold leading-none tracking-tight whitespace-nowrap px-0.5 transition-colors",
                  style: { backgroundColor: isCursor ? "var(--cursor-bg)" : "transparent" },
                };
              }),
            ]}
          />
        ))}
        {/* 自動調整したい */}
        <GridRow />
        <GridRow />
        <GridRow />
        <GridRow />
        <GridRow />
        <GridRow />
      </div>
    </div>
  );
}
