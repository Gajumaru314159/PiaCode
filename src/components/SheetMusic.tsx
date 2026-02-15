"use client";

import React, { useEffect, useRef } from "react";
import { Progression } from "@/types/music";
import { chordDisplayName } from "@/lib/music";
import { getPattern } from "@/lib/audio";
import {
  buildBarNotationModel,
  buildVexVoiceData,
  generateResolvedBarNotes,
} from "@/lib/patternRender";

interface SheetMusicProps {
  progression: Progression;
  currentBar: number;
  startBar: number;
  barsPerRow: 2 | 4;
  rowCount: number;
  tempo: number;
  leftPatternId: string;
  rightPatternId: string;
  maxBeats: number;
}

/**
 * @brief VexFlowを使った楽譜表示コンポーネント
 */
export function SheetMusic({
  progression,
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

        const sidePadding = 20;
        const topPadding = 26;
        const rowHeight = 240;
        const grandStaffOffsetY = 100;
        const activeBarHighlightHeight = 210;
        const widthScale = barsPerRow === 4 ? 2.3 : 1.4;
        const logicalWidth = Math.max(containerWidth * widthScale, sidePadding * 2 + barsPerRow * 140);
        const barWidth = Math.floor((logicalWidth - sidePadding * 2) / barsPerRow);
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
          const x = sidePadding + col * barWidth;
          const y = topPadding + row * rowHeight;
          const isCurrentBar = absoluteBarIdx === currentBar;

          // ト音記号の五線
          const trebleStave = new Stave(x, y, barWidth);
          if (col === 0) {
            trebleStave.addClef("treble");
            trebleStave.addTimeSignature(`${beatsPerBar}/4`);
          }
          trebleStave.setContext(context).draw();

          // ヘ音記号の五線
          const bassStave = new Stave(x, y + grandStaffOffsetY, barWidth);
          if (col === 0) {
            bassStave.addClef("bass");
            bassStave.addTimeSignature(`${beatsPerBar}/4`);
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

          // コード名を上部に表示
          const firstBeatIdx = absoluteBarIdx * beatsPerBar;
          const firstCell = cells[firstBeatIdx];
          if (firstCell && !firstCell.isRest) {
            context.save();
            context.setFont("Arial", 11, "bold");
            context.setFillStyle("#000");
            const chordName = chordDisplayName(firstCell);
            if (chordName) {
              context.fillText(chordName, x + 30, y - 8);
            }
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
          });

          const leftVoiceData = buildVexVoiceData({
            StaveNoteClass: StaveNote,
            BeamClass: Beam,
            DotClass: Dot,
            TupletClass: Tuplet,
            model: leftModel,
            clef: "bass",
            midiShift: 0,
          });

          try {
            const trebleVoice = new Voice({ num_beats: beatsPerBar, beat_value: 4 }).setStrict(true);
            trebleVoice.addTickables(rightVoiceData.notes);
            const bassVoice = new Voice({ num_beats: beatsPerBar, beat_value: 4 }).setStrict(true);
            bassVoice.addTickables(leftVoiceData.notes);

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
  }, [progression, currentBar, startBar, barsPerRow, rowCount, tempo, leftPatternId, rightPatternId, maxBeats]);

  return <div ref={containerRef} className="w-full overflow-hidden" />;
}
