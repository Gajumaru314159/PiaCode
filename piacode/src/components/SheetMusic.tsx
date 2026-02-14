"use client";

import React, { useEffect, useRef } from "react";
import { Progression } from "@/types/music";
import { chordDisplayName, midiToVexKey } from "@/lib/music";
import { getPattern, PatternDef } from "@/lib/audio";

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
        const { Renderer, Stave, StaveNote, Voice, Formatter, StaveConnector } = VexModule.Flow || VexModule;

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

        const sidePadding = 20;
        const topPadding = 26;
        const rowHeight = 210;
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
          const bassStave = new Stave(x, y + 70, barWidth);
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

          // 現在再生中の小節をハイライト
          if (isCurrentBar) {
            context.save();
            context.setFillStyle("rgba(120, 120, 120, 0.5)");
            context.fillRect(x, y, barWidth, 140);
            context.restore();
          }

          // コード名とテンポを上部に表示
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

          if (absoluteBarIdx === 0) {
            context.save();
            context.setFont("Arial", 9);
            context.fillText(`♩=${tempo}`, x + 5, y - 8);
            context.restore();
          }

          // 音符を描画（オプションの左右パターンに追従）
          const leftPattern = getPattern(leftPatternId);
          const rightPattern = getPattern(rightPatternId);
          const leftEvents = collectBeatwisePatternEvents(cells, firstBeatIdx, beatsPerBar, leftPattern);
          const rightEvents = collectBeatwisePatternEvents(cells, firstBeatIdx, beatsPerBar, rightPattern);

          const trebleNotes = buildPatternNotes(StaveNote, rightEvents, firstBeatIdx, beatsPerBar, "treble", 0);
          const bassNotes = buildPatternNotes(StaveNote, leftEvents, firstBeatIdx, beatsPerBar, "bass", -12);

          try {
            const trebleVoice = new Voice({ num_beats: beatsPerBar, beat_value: 4 }).setStrict(false);
            trebleVoice.addTickables(trebleNotes);
            const trebleWidth = Math.max(40, trebleStave.getNoteEndX() - trebleStave.getNoteStartX() - 6);
            new Formatter().joinVoices([trebleVoice]).format([trebleVoice], trebleWidth);
            trebleVoice.draw(context, trebleStave);

            const bassVoice = new Voice({ num_beats: beatsPerBar, beat_value: 4 }).setStrict(false);
            bassVoice.addTickables(bassNotes);
            const bassWidth = Math.max(40, bassStave.getNoteEndX() - bassStave.getNoteStartX() - 6);
            new Formatter().joinVoices([bassVoice]).format([bassVoice], bassWidth);
            bassVoice.draw(context, bassStave);
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

/**
 * @brief パターンイベントを楽譜用の拍単位ノートへ変換する
 */
function buildPatternNotes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  StaveNoteClass: any,
  events: Array<{ atBeat: number; midiNotes: number[] }>,
  barStartBeat: number,
  beatsPerBar: number,
  clef: "treble" | "bass",
  midiShift: number
) {
  const restKey = clef === "bass" ? "d/3" : "b/4";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const notes: any[] = [];
  const eventMap = new Map<number, number[]>();
  for (const event of events) {
    eventMap.set(event.atBeat, event.midiNotes);
  }

  for (let beat = 0; beat < beatsPerBar; beat++) {
    const beatEvents = eventMap.get(barStartBeat + beat);
    if (!beatEvents || beatEvents.length === 0) {
      notes.push(new StaveNoteClass({ keys: [restKey], duration: "4r", clef }));
      continue;
    }
    const keys = beatEvents.map((midi) => midiToVexKey(midi + midiShift));
    notes.push(new StaveNoteClass({ keys, duration: "4", clef }));
  }

  return notes;
}

/**
 * @brief 小節内の各拍セルに対してパターンイベントを生成する
 */
function collectBeatwisePatternEvents(
  cells: Progression["cells"],
  barStartBeat: number,
  beatsPerBar: number,
  pattern: PatternDef
) {
  const events: Array<{ atBeat: number; midiNotes: number[] }> = [];
  for (let beat = 0; beat < beatsPerBar; beat++) {
    const absoluteBeat = barStartBeat + beat;
    const cell = cells[absoluteBeat];
    if (!cell || cell.isRest || !cell.root) continue;
    // 1拍単位で生成して、小節内コード変更をそのまま反映する
    const beatEvents = pattern.generate(cell, 1, absoluteBeat);
    for (const event of beatEvents) {
      events.push({ atBeat: event.atBeat, midiNotes: event.midiNotes });
    }
  }
  return events;
}
