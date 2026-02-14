"use client";

import React, { useCallback, useRef, useEffect } from "react";
import { useApp } from "@/context/AppContext";
import { resolveLoopLengthFromCells, createRestToken } from "@/lib/music";
import { t } from "@/lib/i18n";
import { getPattern, midiToFreq } from "@/lib/audio";
import { SheetMusic } from "./SheetMusic";

/**
 * @brief Playタブ - 楽譜表示と再生コントロール
 */
export function PlayTab() {
  const { state, dispatch } = useApp();
  const { progression, playback, options } = state;
  const lang = options.language;

  const loopLength = resolveLoopLengthFromCells(progression.cells, progression.beatsPerBar);

  // 再生エンジンの参照
  const audioCtxRef = useRef<AudioContext | null>(null);
  const schedulerRef = useRef<number | null>(null);
  const nextBeatTimeRef = useRef(0);
  const currentBeatRef = useRef(0);
  const runtimeRef = useRef({
    tempo: playback.tempo,
    isLoop: playback.isLoop,
    isMetronomeOn: playback.isMetronomeOn,
    metronomeVolume: options.metronomeVolume,
    audioTrack: options.audioTrack,
    leftPatternId: options.leftPatternId,
    rightPatternId: options.rightPatternId,
  });

  useEffect(() => {
    runtimeRef.current = {
      tempo: playback.tempo,
      isLoop: playback.isLoop,
      isMetronomeOn: playback.isMetronomeOn,
      metronomeVolume: options.metronomeVolume,
      audioTrack: options.audioTrack,
      leftPatternId: options.leftPatternId,
      rightPatternId: options.rightPatternId,
    };
  }, [
    playback.tempo,
    playback.isLoop,
    playback.isMetronomeOn,
    options.metronomeVolume,
    options.audioTrack,
    options.leftPatternId,
    options.rightPatternId,
  ]);

  /**
   * @brief 1音を鳴らす
   */
  const playNote = useCallback((ctx: AudioContext, freq: number, time: number, duration: number, velocity: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const peak = Math.max(0.0001, velocity * 0.3);
    const attack = Math.min(0.02, duration * 0.2);
    const release = Math.min(0.08, duration * 0.25);
    const releaseStart = Math.max(time + attack, time + duration - release);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(peak, time + attack);
    gain.gain.setValueAtTime(peak, releaseStart);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + duration + 0.01);
  }, []);

  /**
   * @brief メトロノームのクリック音を鳴らす
   */
  const playClick = useCallback((ctx: AudioContext, time: number, isFirst: boolean, volume: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = isFirst ? 1000 : 800;
    gain.gain.setValueAtTime(volume * 0.2, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.05);
  }, []);

  /**
   * @brief 指定ハンドのパターンイベントを現在拍にスケジュールする
   */
  const schedulePatternAtBeat = useCallback((
    ctx: AudioContext,
    beat: number,
    time: number,
    beatDuration: number,
    hand: "L" | "R",
    patternId: string
  ) => {
    const beatCell = progression.cells[beat] ?? createRestToken();
    if (beatCell.isRest || !beatCell.root) return;
    const pattern = getPattern(patternId);
    // 1拍=1コードセルとしてイベント生成することで、小節内コード変更に追従する
    const events = pattern.generate(beatCell, 1, beat);
    const octaveShift = hand === "L" ? -12 : 0;

    for (const event of events) {
      if (event.atBeat !== beat) continue;
      for (const midi of event.midiNotes) {
        playNote(
          ctx,
          midiToFreq(midi + octaveShift),
          time,
          Math.max(0.08, event.durationBeat * beatDuration),
          event.velocity
        );
      }
    }
  }, [progression, playNote]);

  /**
   * @brief 再生を停止する
   */
  const stopPlayback = useCallback(() => {
    if (schedulerRef.current !== null) {
      clearInterval(schedulerRef.current);
      schedulerRef.current = null;
    }
    dispatch({ type: "SET_PLAYBACK", playback: { isPlaying: false } });
  }, [dispatch]);

  /**
   * @brief スケジューラー（先読み方式で音をスケジュール）
   */
  const scheduler = useCallback(() => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    const runtime = runtimeRef.current;
    const lookahead = 0.1; // 100ms先まで
    const beatDuration = 60 / runtime.tempo;

    while (nextBeatTimeRef.current < ctx.currentTime + lookahead) {
      const beat = currentBeatRef.current;
      const time = nextBeatTimeRef.current;
      const beatInBar = beat % progression.beatsPerBar;

      // メトロノーム
      if (runtime.isMetronomeOn) {
        playClick(ctx, time, beatInBar === 0, runtime.metronomeVolume);
      }

      // 左右トラック・パターン
      if (runtime.audioTrack === "both" || runtime.audioTrack === "left") {
        schedulePatternAtBeat(ctx, beat, time, beatDuration, "L", runtime.leftPatternId);
      }
      if (runtime.audioTrack === "both" || runtime.audioTrack === "right") {
        schedulePatternAtBeat(ctx, beat, time, beatDuration, "R", runtime.rightPatternId);
      }

      // ビート更新をUIに反映
      dispatch({ type: "SET_PLAYBACK", playback: { currentBeat: beat } });

      // 次のビートへ
      currentBeatRef.current = beat + 1;
      if (loopLength > 0 && currentBeatRef.current >= loopLength) {
        if (runtime.isLoop) {
          currentBeatRef.current = 0;
        } else {
          // ループOFFで末尾到達: 停止
          setTimeout(() => stopPlayback(), 0);
          return;
        }
      }
      nextBeatTimeRef.current += beatDuration;
    }
  }, [progression, loopLength, dispatch, playClick, schedulePatternAtBeat, stopPlayback]);

  /**
   * @brief 再生を開始する
   */
  const startPlayback = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === "suspended") ctx.resume();

    currentBeatRef.current = playback.currentBeat;
    nextBeatTimeRef.current = ctx.currentTime;
    dispatch({ type: "SET_PLAYBACK", playback: { isPlaying: true } });

    // スケジューラーを25ms間隔で実行
    const id = window.setInterval(scheduler, 25);
    schedulerRef.current = id;
  }, [playback.currentBeat, dispatch, scheduler]);

  /**
   * @brief 再生/停止トグル
   */
  const togglePlay = useCallback(() => {
    if (playback.isPlaying) {
      stopPlayback();
    } else {
      if (loopLength === 0) return;
      startPlayback();
    }
  }, [playback.isPlaying, loopLength, startPlayback, stopPlayback]);

  // タブ離脱時に停止
  useEffect(() => {
    return () => {
      if (schedulerRef.current !== null) {
        clearInterval(schedulerRef.current);
      }
      dispatch({ type: "SET_PLAYBACK", playback: { isPlaying: false } });
    };
  }, [dispatch]);

  // 末尾休符切り捨て後にシーク位置が範囲外なら補正
  useEffect(() => {
    if (loopLength <= 0) return;
    if (playback.currentBeat >= loopLength) {
      dispatch({ type: "SET_PLAYBACK", playback: { currentBeat: loopLength - 1 } });
    }
  }, [loopLength, playback.currentBeat, dispatch]);

  /**
   * @brief シークバー変更
   */
  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const beat = parseInt(e.target.value, 10);
    if (playback.isPlaying) {
      stopPlayback();
    }
    dispatch({ type: "SET_PLAYBACK", playback: { currentBeat: beat } });
  }, [playback.isPlaying, stopPlayback, dispatch]);

  if (loopLength === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-lg" style={{ color: "var(--text-secondary)" }}>
          {t("play.empty", lang)}
        </p>
      </div>
    );
  }

  const currentBar = Math.floor(playback.currentBeat / progression.beatsPerBar);
  const startBar = Math.floor(currentBar / options.barsPerRow) * options.barsPerRow;

  return (
    <div className="flex flex-col h-full overflow-x-hidden">
      {/* シークバー */}
      <div className="px-4 pt-3 pb-1 shrink-0">
        <input
          type="range"
          min={0}
          max={loopLength - 1}
          value={playback.currentBeat}
          onChange={handleSeek}
          className="w-full"
          aria-label="シーク"
        />
      </div>

      {/* 楽譜エリア */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-2">
        <SheetMusic
          progression={progression}
          currentBar={currentBar}
          startBar={startBar}
          barsPerRow={options.barsPerRow}
          rowCount={options.rowCount}
          tempo={playback.tempo}
          leftPatternId={options.leftPatternId}
          rightPatternId={options.rightPatternId}
          maxBeats={loopLength}
        />
      </div>

      {/* 再生コントロール */}
      <div className="flex items-center justify-center gap-8 py-4 shrink-0">
        {/* 再生/停止 */}
        <button
          aria-label={playback.isPlaying ? "停止" : "再生"}
          onClick={togglePlay}
          className="w-14 h-14 rounded-full border-2 border-[var(--border-color)] bg-white flex items-center justify-center"
        >
          <PlayIcon isPlaying={playback.isPlaying} />
        </button>

        {/* ループ */}
        <button
          aria-label={playback.isLoop ? "ループOFF" : "ループON"}
          onClick={() => dispatch({ type: "SET_PLAYBACK", playback: { isLoop: !playback.isLoop } })}
          className="w-14 h-14 rounded-full border-2 border-[var(--border-color)] bg-white flex items-center justify-center"
          style={{ opacity: playback.isLoop ? 1 : 0.4 }}
        >
          <LoopIcon />
        </button>

        {/* メトロノーム */}
        <button
          aria-label={playback.isMetronomeOn ? "メトロノームOFF" : "メトロノームON"}
          onClick={() => dispatch({ type: "SET_PLAYBACK", playback: { isMetronomeOn: !playback.isMetronomeOn } })}
          className="w-14 h-14 rounded-full border-2 border-[var(--border-color)] bg-white flex items-center justify-center"
          style={{ opacity: playback.isMetronomeOn ? 1 : 0.4 }}
        >
          <MetronomeIcon />
        </button>
      </div>
    </div>
  );
}

/** 再生/停止アイコン（SVG） */
function PlayIcon({ isPlaying }: { isPlaying: boolean }) {
  if (isPlaying) {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="black">
        <rect x="6" y="4" width="4" height="16" />
        <rect x="14" y="4" width="4" height="16" />
      </svg>
    );
  }
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="black">
      <polygon points="6,4 20,12 6,20" />
    </svg>
  );
}

/** ループアイコン（SVG） */
function LoopIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2">
      <path d="M17 1l4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="M7 23l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

/** メトロノームアイコン（SVG） */
function MetronomeIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2">
      <polygon points="8,22 16,22 14,6 10,6" fill="none" />
      <line x1="12" y1="6" x2="16" y2="2" />
      <line x1="10" y1="14" x2="14" y2="14" />
    </svg>
  );
}
