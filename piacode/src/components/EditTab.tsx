"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { useApp } from "@/context/AppContext";
import { getDiatonicRoots, ALL_PITCH_CLASSES, MATRIX_QUALITIES, chordDisplayName, createChordToken, createRestToken, transposeProgression, chordToMidiNotes } from "@/lib/music";
import { t } from "@/lib/i18n";
import { ChordQuality, PitchClass } from "@/types/music";
import { SavePanel } from "./SavePanel";
import { ConfirmDialog } from "./ConfirmDialog";

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

      {/* マトリックス入力 */}
      <div className="shrink-0 px-1 mt-2">
        {/* ルート行（ヘッダー） */}
        <div className="grid grid-cols-9 gap-px mb-px">
          <button
            aria-label="前のキーへ"
            onClick={() => shiftKey(-1)}
            className="flex items-center justify-center border border-[var(--border-color)] bg-white text-lg font-bold"
          >
            ◀
          </button>
          {diatonicRoots.map((root) => (
            <button
              key={root}
              className="flex items-center justify-center border border-[var(--border-color)] bg-white text-xs font-bold py-1"
              style={{ minHeight: "32px" }}
              disabled
            >
              {root}
            </button>
          ))}
          <button
            aria-label="次のキーへ"
            onClick={() => shiftKey(1)}
            className="flex items-center justify-center border border-[var(--border-color)] bg-white text-lg font-bold"
          >
            ▶
          </button>
        </div>

        {/* 品質×ルートのマトリックス */}
        {MATRIX_QUALITIES.map((quality) => (
          <div key={quality} className="grid grid-cols-9 gap-px mb-px">
            <div className="flex items-center justify-center text-xs font-bold" style={{ color: "var(--text-secondary)" }}>
              {quality}
            </div>
            {diatonicRoots.map((root) => (
              <button
                key={`${root}-${quality}`}
                aria-label={`${root}${quality}`}
                onClick={() => inputChord(root, quality)}
                className="border border-[var(--border-color)] bg-white hover:bg-gray-100 active:bg-gray-200 transition-colors"
                style={{ minHeight: "30px", minWidth: "30px" }}
              />
            ))}
            <div className="flex items-center justify-center text-xs font-bold" style={{ color: "var(--text-secondary)" }}>
              {quality}
            </div>
          </div>
        ))}

        {/* 下段ルート行（休符 + ルート + ピアノアイコン） */}
        <div className="grid grid-cols-9 gap-px mt-px">
          <button
            aria-label="休符入力"
            onClick={inputRest}
            className="flex items-center justify-center border border-[var(--border-color)] bg-white text-lg"
          >
            𝄽
          </button>
          {diatonicRoots.map((root) => (
            <button
              key={`bottom-${root}`}
              className="flex items-center justify-center border border-[var(--border-color)] bg-white text-xs font-bold py-1"
              style={{ minHeight: "32px" }}
              disabled
            >
              {root}
            </button>
          ))}
          <div className="flex items-center justify-center text-lg" style={{ opacity: 0.3 }}>
            🎹
          </div>
        </div>
      </div>

      {/* ボタン行 */}
      <div className="flex items-center justify-between px-2 py-2 shrink-0">
        <button
          aria-label="拍子切替"
          onClick={toggleBeatsPerBar}
          className="px-3 py-1 border border-[var(--border-color)] bg-white text-sm font-bold"
        >
          {progression.beatsPerBar}/4
        </button>
        <button
          aria-label="保存"
          onClick={() => dispatch({ type: "SET_SHOW_SAVE_PANEL", show: true })}
          className="px-3 py-1 border border-[var(--border-color)] bg-white text-sm font-bold"
        >
          {t("edit.save", lang)}
        </button>
        <button
          aria-label="クリア"
          onClick={handleClear}
          className="px-3 py-1 border border-[var(--border-color)] bg-white text-sm font-bold"
        >
          {t("edit.clear", lang)}
        </button>
        <button
          aria-label="シャープ方向に移調"
          onClick={() => handleTranspose(1)}
          className="px-3 py-1 border border-[var(--border-color)] bg-white text-sm font-bold"
        >
          ♯
        </button>
        <button
          aria-label="フラット方向に移調"
          onClick={() => handleTranspose(-1)}
          className="px-3 py-1 border border-[var(--border-color)] bg-white text-sm font-bold"
        >
          ♭
        </button>
      </div>

      {/* コード進行グリッド */}
      <ChordGrid />

      {/* クリア確認ダイアログ */}
      {showClearConfirm && (
        <ConfirmDialog
          message={t("edit.clearConfirm", lang)}
          okLabel={t("common.ok", lang)}
          cancelLabel={t("common.cancel", lang)}
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
          osc.type = "triangle";
          osc.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
          gain.gain.setValueAtTime(0.2, time);
          gain.gain.exponentialRampToValueAtTime(0.001, time + beatDuration * 0.9);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(time);
          osc.stop(time + beatDuration * 0.9);
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
    <div className="flex-1 overflow-y-auto px-1 pb-4">
      {rows.map((rowStart) => (
        <div key={rowStart} className="grid gap-px mb-px" style={{ gridTemplateColumns: `40px repeat(${visibleCellsPerRow}, 1fr)` }}>
          {/* 小節番号（タップで該当段を再生） */}
          <button
            onClick={() => playRow(rowStart)}
            className="flex items-center justify-center text-xs font-bold cursor-pointer hover:bg-gray-100"
            style={{ color: "#CC4444", minHeight: "36px" }}
            aria-label={`小節${Math.floor(rowStart / beatsPerBar) + 1}から再生`}
          >
            {Math.floor(rowStart / beatsPerBar) + 1}
          </button>
          {/* セル */}
          {Array.from({ length: visibleCellsPerRow }, (_, col) => {
            const idx = rowStart + col;
            if (idx >= cells.length) return <div key={col} />;
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

            return (
              <button
                key={col}
                onClick={() => dispatch({ type: "SET_CURSOR", cursor: idx })}
                className="flex items-center justify-center border border-[var(--border-color)] text-xs font-bold transition-colors"
                style={{
                  backgroundColor: isCursor ? "var(--cursor-bg)" : "white",
                  minHeight: "36px",
                }}
                aria-label={`セル ${idx}: ${display || "空"}`}
              >
                {display}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
