"use client";

import React, { useEffect, useRef } from "react";
import { Progression } from "@/types/music";
import { chordDisplayNameForKey, getAccidentalPreferenceForKey, matrixKeyToPitchClass } from "@/lib/music";
import { getPattern } from "@/lib/audio";
import {
  buildBarNotationModel,
  buildVexVoiceData,
  extractBarChords,
  generateResolvedBarNotes,
} from "@/lib/patternRender";

interface SheetMusicProps {
  progression: Progression;
  matrixKey: number;
  currentBar: number;
  startBar: number;
  barsPerRow: 2 | 4;
  rowCount: number;
  tempo: number;
  leftPatternId: string;
  rightPatternId: string;
  maxBeats: number;
}

const VEX_KEY_SIGNATURE_MAP: Record<string, string> = {
  C: "C",
  "C#": "C#",
  D: "D",
  Eb: "Eb",
  E: "E",
  F: "F",
  "F#": "F#",
  G: "G",
  Ab: "Ab",
  A: "A",
  Bb: "Bb",
  B: "B",
};

const KEY_SIGNATURE_ACCIDENTAL_COUNT: Record<string, number> = {
  C: 0,
  G: 1,
  D: 2,
  A: 3,
  E: 4,
  B: 5,
  "F#": 6,
  "C#": 7,
  F: 1,
  Bb: 2,
  Eb: 3,
  Ab: 4,
  Db: 5,
  Gb: 6,
  Cb: 7,
};

/**
 * @brief 調号の個数に応じて、段先頭小節へ追加する幅を返す
 * @param keySignature VexFlow調号文字列
 * @returns 追加幅（論理ピクセル）
 */
function resolveFirstBarExtraWidth(keySignature: string | null): number {
  if (!keySignature) return 0;
  const accidentalCount = KEY_SIGNATURE_ACCIDENTAL_COUNT[keySignature] || 0;
  return accidentalCount * 12;
}

/**
 * @brief 小節内のコード表示イベント（表示拍とラベル）を抽出する
 * @param cells 全コードセル
 * @param firstBeatIdx 対象小節の先頭拍インデックス
 * @param beatsPerBar 拍子
 */
function collectBarChordLabels(
  chordsInBar: Progression["cells"],
  beatsPerBar: number,
  keyRoot: NonNullable<Progression["cells"][number]["root"]>
): Array<{ beatOffset: number; label: string }> {
  const labels: Array<{ beatOffset: number; label: string }> = [];
  let prevLabel = "";

  for (let beatOffset = 0; beatOffset < beatsPerBar; beatOffset++) {
    const cell = chordsInBar[beatOffset];
    const label = cell && !cell.isRest ? chordDisplayNameForKey(cell, keyRoot) : "";
    if (label && label !== prevLabel) {
      labels.push({ beatOffset, label });
    }
    prevLabel = label;
  }

  return labels;
}

/**
 * @brief 小節先頭コードのrootをVexFlow用の調号名へ変換する
 * @param root 小節先頭のコードroot
 */
function toVexKeySignature(root: Progression["cells"][number]["root"]): string | null {
  if (!root) return null;
  return VEX_KEY_SIGNATURE_MAP[root] || null;
}

/**
 * @brief VexFlowを使った楽譜表示コンポーネント
 */
export function SheetMusic({
  progression,
  matrixKey,
  currentBar,
  startBar,
  barsPerRow,
  rowCount,
  tempo,
  leftPatternId,
  rightPatternId,
  maxBeats,
}: SheetMusicProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let rafId: number | null = null;

    // VexFlowを動的にインポートして描画する
    const renderSheet = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Vex: any = await import("vexflow");
        const VexModule = Vex.default || Vex;
        const {
          Renderer,
          Stave,
          StaveNote,
          Accidental,
          Voice,
          Formatter,
          StaveConnector,
          Beam,
          Dot,
          Tuplet,
        } = VexModule.Flow || VexModule;

        const container = containerRef.current;
        if (disposed || !container) return;
        container.innerHTML = "";

        const { beatsPerBar, cells } = progression;
        const totalBars = maxBeats > 0
          ? Math.floor(maxBeats / beatsPerBar)
          : Math.floor(cells.length / beatsPerBar);
        const normalizedStartBar = Math.max(0, Math.min(startBar, Math.max(totalBars - 1, 0)));
        const maxDisplayBars = barsPerRow * rowCount;
        const displayBars = Math.min(maxDisplayBars, Math.max(totalBars - normalizedStartBar, 0));

        const containerWidth = container.clientWidth;
        if (containerWidth <= 0 || displayBars <= 0) return;

        const leftPattern = getPattern(leftPatternId);
        const rightPattern = getPattern(rightPatternId);
        const keyRoot = matrixKeyToPitchClass(matrixKey);
        const accidentalPreference = getAccidentalPreferenceForKey(keyRoot);
        const keySignature = toVexKeySignature(keyRoot);
        const firstBarExtraWidth = resolveFirstBarExtraWidth(keySignature);

        const sidePadding = 20;
        const topPadding = 26;
        const rowHeight = 240;
        const grandStaffOffsetY = 100;
        const activeBarHighlightHeight = 210;
        const widthScale = barsPerRow === 4 ? 2.3 : 1.4;
        const logicalWidth = Math.max(containerWidth * widthScale, sidePadding * 2 + barsPerRow * 140);
        const rowInnerWidth = logicalWidth - sidePadding * 2;
        const baseBarWidth = Math.floor(rowInnerWidth / barsPerRow);
        const minRegularBarWidth = 96;
        const maxExtraByMinWidth = Math.max(0, rowInnerWidth - minRegularBarWidth * barsPerRow);
        const appliedFirstBarExtra = Math.min(firstBarExtraWidth, maxExtraByMinWidth);
        const firstBarWidth = baseBarWidth + appliedFirstBarExtra;
        const regularBarWidth = barsPerRow > 1
          ? (rowInnerWidth - firstBarWidth) / (barsPerRow - 1)
          : firstBarWidth;
        const rows = Math.ceil(displayBars / barsPerRow);
        const totalHeight = Math.max(rows * rowHeight + topPadding + 10, rowHeight);

        const renderer = new Renderer(container, Renderer.Backends.SVG);
        renderer.resize(logicalWidth, totalHeight);
        const context = renderer.getContext();
        context.setFont("Arial", 10);

        for (let localBarIdx = 0; localBarIdx < displayBars; localBarIdx++) {
          const absoluteBarIdx = normalizedStartBar + localBarIdx;
          const row = Math.floor(localBarIdx / barsPerRow);
          const col = localBarIdx % barsPerRow;
          const rowStartIdx = row * barsPerRow;
          const barsInRow = Math.min(barsPerRow, displayBars - rowStartIdx);
          const barWidth = col === 0 ? firstBarWidth : regularBarWidth;
          const x = col === 0
            ? sidePadding
            : sidePadding + firstBarWidth + (col - 1) * regularBarWidth;
          const y = topPadding + row * rowHeight;
          const isCurrentBar = absoluteBarIdx === currentBar;
          const firstBeatIdx = absoluteBarIdx * beatsPerBar;
          const chordsInBar = extractBarChords(cells, firstBeatIdx, beatsPerBar);

          // ト音記号の五線
          const trebleStave = new Stave(x, y, barWidth);
          if (col === 0) {
            trebleStave.addClef("treble");
            trebleStave.addTimeSignature(`${beatsPerBar}/4`);
            if (keySignature) {
              trebleStave.addKeySignature(keySignature);
            }
          }
          trebleStave.setContext(context).draw();

          // ヘ音記号の五線
          const bassStave = new Stave(x, y + grandStaffOffsetY, barWidth);
          if (col === 0) {
            bassStave.addClef("bass");
            bassStave.addTimeSignature(`${beatsPerBar}/4`);
            if (keySignature) {
              bassStave.addKeySignature(keySignature);
            }
          }
          bassStave.setContext(context).draw();

          // 大括弧
          if (col === 0) {
            const connector = new StaveConnector(trebleStave, bassStave);
            connector.setType(StaveConnector.type.BRACE);
            connector.setContext(context).draw();
          }

          // 小節線を上下譜表で接続
          const connectorTypes = StaveConnector.type as Record<string, number | undefined>;
          const singleLeft = connectorTypes.SINGLE_LEFT;
          if (singleLeft !== undefined) {
            const leftConnector = new StaveConnector(trebleStave, bassStave);
            leftConnector.setType(singleLeft);
            leftConnector.setContext(context).draw();
          }
          if (col === barsInRow - 1) {
            const singleRight = connectorTypes.SINGLE_RIGHT;
            if (singleRight !== undefined) {
              const rightConnector = new StaveConnector(trebleStave, bassStave);
              rightConnector.setType(singleRight);
              rightConnector.setContext(context).draw();
            }
          }

          // 現在再生中の小節をハイライト
          if (isCurrentBar) {
            context.save();
            context.setFillStyle("rgba(120, 120, 120, 0.5)");
            context.fillRect(x, y, barWidth, activeBarHighlightHeight);
            context.restore();
          }

          // コード名を上部に表示（小節内のコード変化に対応）
          const chordLabels = collectBarChordLabels(chordsInBar, beatsPerBar, keyRoot);
          if (chordLabels.length > 0) {
            context.save();
            context.setFont("Arial", 11, "bold");
            context.setFillStyle("#000");
            const labelStartX = x + 30;
            const labelEndX = x + Math.max(barWidth - 20, 31);
            const labelWidth = labelEndX - labelStartX;

            chordLabels.forEach(({ beatOffset, label }) => {
              const ratio = beatsPerBar > 0 ? beatOffset / beatsPerBar : 0;
              const labelX = labelStartX + labelWidth * ratio;
              context.fillText(label, labelX, y - 8);
            });
            context.restore();
          }

          const rightResolved = generateResolvedBarNotes(
            rightPattern,
            cells,
            firstBeatIdx,
            beatsPerBar,
            "R"
          );
          const leftResolved = generateResolvedBarNotes(
            leftPattern,
            cells,
            firstBeatIdx,
            beatsPerBar,
            "L"
          );

          const rightModel = buildBarNotationModel(rightResolved, beatsPerBar);
          const leftModel = buildBarNotationModel(leftResolved, beatsPerBar);

          const rightVoiceData = buildVexVoiceData({
            StaveNoteClass: StaveNote,
            BeamClass: Beam,
            DotClass: Dot,
            TupletClass: Tuplet,
            model: rightModel,
            clef: "treble",
            midiShift: 0,
            accidentalPreference,
          });

          const leftVoiceData = buildVexVoiceData({
            StaveNoteClass: StaveNote,
            BeamClass: Beam,
            DotClass: Dot,
            TupletClass: Tuplet,
            model: leftModel,
            clef: "bass",
            midiShift: 0,
            accidentalPreference,
          });

          try {
            const trebleVoice = new Voice({ num_beats: beatsPerBar, beat_value: 4 }).setStrict(false);
            trebleVoice.addTickables(rightVoiceData.notes);
            const bassVoice = new Voice({ num_beats: beatsPerBar, beat_value: 4 }).setStrict(false);
            bassVoice.addTickables(leftVoiceData.notes);

            // matrixKey の調号に対して必要な臨時記号を自動付与する
            Accidental.applyAccidentals([trebleVoice, bassVoice], keySignature || "C");

            const sharedNoteStartX = Math.max(trebleStave.getNoteStartX(), bassStave.getNoteStartX());
            trebleStave.setNoteStartX(sharedNoteStartX);
            bassStave.setNoteStartX(sharedNoteStartX);
            const sharedWidth = Math.max(
              40,
              Math.min(trebleStave.getNoteEndX(), bassStave.getNoteEndX()) - sharedNoteStartX - 6
            );

            new Formatter()
              .joinVoices([trebleVoice])
              .joinVoices([bassVoice])
              .format([trebleVoice, bassVoice], sharedWidth);

            trebleVoice.draw(context, trebleStave);
            bassVoice.draw(context, bassStave);

            rightVoiceData.beams.forEach((beam: { setContext: (ctx: unknown) => { draw: () => void } }) => beam.setContext(context).draw());
            rightVoiceData.tuplets.forEach((tuplet: { setContext: (ctx: unknown) => { draw: () => void } }) => tuplet.setContext(context).draw());
            leftVoiceData.beams.forEach((beam: { setContext: (ctx: unknown) => { draw: () => void } }) => beam.setContext(context).draw());
            leftVoiceData.tuplets.forEach((tuplet: { setContext: (ctx: unknown) => { draw: () => void } }) => tuplet.setContext(context).draw());
          } catch (e) {
            console.warn("楽譜描画エラー:", e);
          }
        }

        const svg = container.querySelector("svg");
        if (svg) {
          svg.setAttribute("viewBox", `0 0 ${logicalWidth} ${totalHeight}`);
          svg.setAttribute("preserveAspectRatio", "xMinYMin meet");
          const scale = containerWidth / logicalWidth;
          const scaledHeight = Math.ceil(totalHeight * scale);
          svg.style.width = "100%";
          svg.style.height = `${scaledHeight}px`;
          svg.style.display = "block";
          svg.style.maxWidth = "100%";
        }
      } catch (e) {
        console.error("VexFlow読み込みエラー:", e);
        if (containerRef.current) {
          containerRef.current.innerHTML = '<p style="padding:20px;color:#888;">楽譜を読み込めませんでした</p>';
        }
      }
    };

    const scheduleRender = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        void renderSheet();
      });
    };

    const observer = new ResizeObserver(() => {
      scheduleRender();
    });
    observer.observe(container);
    scheduleRender();

    return () => {
      disposed = true;
      observer.disconnect();
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [progression, matrixKey, currentBar, startBar, barsPerRow, rowCount, tempo, leftPatternId, rightPatternId, maxBeats]);

  return <div ref={containerRef} className="w-full overflow-hidden" />;
}
