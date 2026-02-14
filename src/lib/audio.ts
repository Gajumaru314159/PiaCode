import { ChordToken, PlaybackEvent } from "@/types/music";
import { chordToMidiNotes } from "./music";

/**
 * @brief 伴奏パターンの定義
 */
export interface PatternDef {
  id: string;
  name: string;
  nameJa: string;
  /** 1小節分のイベントを生成する関数 */
  generate: (chord: ChordToken, beatsPerBar: number, startBeat: number) => PlaybackEvent[];
}

/**
 * @brief 全音符パターン（コードを全音符で鳴らす）
 */
const wholePattern: PatternDef = {
  id: "whole",
  name: "Whole Note",
  nameJa: "全音符",
  generate(chord, beatsPerBar, startBeat) {
    if (chord.isRest) return [];
    const notes = chordToMidiNotes(chord, 4);
    return [{
      atBeat: startBeat,
      midiNotes: notes,
      velocity: 0.7,
      durationBeat: beatsPerBar,
    }];
  },
};

/**
 * @brief アルペジオパターン（コード構成音を1拍ずつ分散）
 */
const arpeggioPattern: PatternDef = {
  id: "arpeggio",
  name: "Arpeggio",
  nameJa: "アルペジオ",
  generate(chord, beatsPerBar, startBeat) {
    if (chord.isRest) return [];
    const notes = chordToMidiNotes(chord, 4);
    const events: PlaybackEvent[] = [];
    for (let i = 0; i < beatsPerBar; i++) {
      const noteIdx = i % notes.length;
      events.push({
        atBeat: startBeat + i,
        midiNotes: [notes[noteIdx]],
        velocity: 0.7,
        durationBeat: 1,
      });
    }
    return events;
  },
};

/**
 * @brief ブロックコードパターン（毎拍でコードを弾く）
 */
const blockPattern: PatternDef = {
  id: "block",
  name: "Block Chord",
  nameJa: "ブロックコード",
  generate(chord, beatsPerBar, startBeat) {
    if (chord.isRest) return [];
    const notes = chordToMidiNotes(chord, 4);
    const events: PlaybackEvent[] = [];
    for (let i = 0; i < beatsPerBar; i++) {
      events.push({
        atBeat: startBeat + i,
        midiNotes: notes,
        velocity: i === 0 ? 0.8 : 0.6,
        durationBeat: 1,
      });
    }
    return events;
  },
};

/**
 * @brief 利用可能なパターン一覧
 */
export const PATTERNS: PatternDef[] = [wholePattern, arpeggioPattern, blockPattern];

/**
 * @brief パターンIDからパターン定義を取得する
 */
export function getPattern(id: string): PatternDef {
  return PATTERNS.find((p) => p.id === id) || wholePattern;
}

/**
 * @brief MIDIノート番号を周波数に変換する
 * @param midi MIDIノート番号
 */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
