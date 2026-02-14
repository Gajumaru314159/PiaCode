"use client";

import React, { useEffect, useRef } from "react";
import { Progression } from "@/types/music";
import { chordDisplayName, chordToMidiNotes, midiToVexKey } from "@/lib/music";

interface SheetMusicProps {
  progression: Progression;
  currentBar: number;
  startBar: number;
  barsPerRow: 2 | 4;
  rowCount: number;
  tempo: number;
}

/**
 * @brief VexFlowを使った楽譜表示コンポーネント
 */
export function SheetMusic({ progression, currentBar, startBar, barsPerRow, rowCount, tempo }: SheetMusicProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // VexFlowを動的にインポートして描画する
    const renderSheet = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Vex: any = await import("vexflow");
        const VexModule = Vex.default || Vex;
        const { Renderer, Stave, StaveNote, Voice, Formatter, StaveConnector } = VexModule.Flow || VexModule;

        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = "";

        const { beatsPerBar, cells } = progression;
        const totalBars = Math.floor(cells.length / beatsPerBar);
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

          // 音符を描画
          const trebleNotes: InstanceType<typeof StaveNote>[] = [];
          const bassNotes: InstanceType<typeof StaveNote>[] = [];

          for (let beat = 0; beat < beatsPerBar; beat++) {
            const cellIdx = firstBeatIdx + beat;
            const cell = cells[cellIdx];

            if (!cell || cell.isRest || !cell.root) {
              // 休符
              trebleNotes.push(new StaveNote({ keys: ["b/4"], duration: `${beatsPerBar === 3 ? "4" : "4"}r` }));
              bassNotes.push(new StaveNote({ keys: ["d/3"], duration: `${beatsPerBar === 3 ? "4" : "4"}r`, clef: "bass" }));
            } else {
              // コードの構成音
              const midiNotes = chordToMidiNotes(cell, 4);
              const trebleKeys = midiNotes
                .filter((n) => n >= 60)
                .map((n) => midiToVexKey(n));
              const bassKeys = midiNotes
                .filter((n) => n < 60)
                .map((n) => midiToVexKey(n));

              if (trebleKeys.length > 0) {
                trebleNotes.push(new StaveNote({ keys: trebleKeys, duration: "4" }));
              } else {
                trebleNotes.push(new StaveNote({ keys: midiNotes.map((n) => midiToVexKey(n)), duration: "4" }));
              }

              if (bassKeys.length > 0) {
                bassNotes.push(new StaveNote({ keys: bassKeys, duration: "4", clef: "bass" }));
              } else {
                // ルート音を1オクターブ下で鳴らす
                const rootMidi = midiNotes[0] - 12;
                bassNotes.push(new StaveNote({ keys: [midiToVexKey(rootMidi)], duration: "4", clef: "bass" }));
              }
            }
          }

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

    void renderSheet();
  }, [progression, currentBar, startBar, barsPerRow, rowCount, tempo]);

  return <div ref={containerRef} className="w-full overflow-hidden" />;
}
