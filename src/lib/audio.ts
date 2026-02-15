import { ChordToken, Hand } from "@/types/music";
import { chordToMidiNotes } from "./music";

/**
 * @brief 1拍あたりの内部tick数（4分音符=12tick）
 */
export const TICKS_PER_BEAT = 12;

/**
 * @brief パターンのデフォルトベロシティ
 */
const DEFAULT_VELOCITY = 0.7;

/**
 * @brief パターン内の音参照
 */
export interface ToneRef {
  chordIndex: number;
  degreeIndex: number;
  octaveShift: number;
  semitoneShift?: number;
}

/**
 * @brief パターン定義用ノートトークン
 */
export interface PatternNoteToken {
  startTick: number;
  durationTick: number;
  tones: ToneRef[];
  velocity?: number;
}

/**
 * @brief 小節パターン生成の入力
 */
export interface PatternBarInput {
  chordsInBar: ChordToken[];
  beatsPerBar: 3 | 4;
  hand: Hand;
}

/**
 * @brief 小節パターン生成の解決済みノート
 */
export interface ResolvedPatternNote {
  startTick: number;
  durationTick: number;
  midiNotes: number[];
  velocity: number;
}

/**
 * @brief 演奏パターン定義
 */
export interface PatternDef {
  id: string;
  name: string;
  nameJa: string;
  notesByHand: Record<Hand, PatternNoteToken[]>;
  generateBar: (input: PatternBarInput) => ResolvedPatternNote[];
}

/**
 * @brief MIDIノート番号を周波数に変換する
 * @param midi MIDIノート番号
 */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * @brief パターン定義ヘルパー（1音トークン）
 */
const N = (
  startTick: number,
  durationTick: number,
  tones: ToneRef[],
  velocity?: number
): PatternNoteToken => ({ startTick, durationTick, tones, velocity });

/**
 * @brief コード参照ヘルパー
 */
const T = (
  chordIndex: number,
  degreeIndex: number,
  octaveShift: number,
  semitoneShift?: number
): ToneRef => ({ chordIndex, degreeIndex, octaveShift, semitoneShift });

/**
 * @brief ToneRefからMIDIノートを解決する
 */
export function resolveToneRef(chordsInBar: ChordToken[], tone: ToneRef): number | null {
  const chord = chordsInBar[tone.chordIndex];
  if (!chord || chord.isRest) return null;

  const notes = chordToMidiNotes(chord, 4);
  if (notes.length === 0) return null;

  const degreeBaseIndex = ((tone.degreeIndex % notes.length) + notes.length) % notes.length;
  const degreeOctave = Math.floor(tone.degreeIndex / notes.length);
  const baseMidi = notes[degreeBaseIndex] + degreeOctave * 12;

  return baseMidi + tone.octaveShift * 12 + (tone.semitoneShift ?? 0);
}

/**
 * @brief パターントークン列を小節ノート列へ解決する
 */
export function resolveBarPattern(input: PatternBarInput, tokens: PatternNoteToken[]): ResolvedPatternNote[] {
  const barTicks = input.beatsPerBar * TICKS_PER_BEAT;

  return tokens
    .map((token) => {
      const clampedStart = Math.max(0, Math.floor(token.startTick));
      const rawEnd = clampedStart + Math.max(0, Math.floor(token.durationTick));
      const clampedEnd = Math.min(barTicks, rawEnd);
      const durationTick = clampedEnd - clampedStart;
      if (durationTick <= 0 || clampedStart >= barTicks) return null;

      const midiSet = new Set<number>();
      for (const tone of token.tones) {
        const midi = resolveToneRef(input.chordsInBar, tone);
        if (midi !== null) {
          midiSet.add(midi);
        }
      }

      return {
        startTick: clampedStart,
        durationTick,
        midiNotes: Array.from(midiSet.values()).sort((a, b) => a - b),
        velocity: token.velocity ?? DEFAULT_VELOCITY,
      } as ResolvedPatternNote;
    })
    .filter((note): note is ResolvedPatternNote => note !== null)
    .sort((a, b) => a.startTick - b.startTick || b.durationTick - a.durationTick);
}

/**
 * @brief PatternDef生成ヘルパー
 */
function definePattern(
  base: Omit<PatternDef, "generateBar">
): PatternDef {
  return {
    ...base,
    generateBar(input) {
      const tokens = base.notesByHand[input.hand] || [];
      return resolveBarPattern(input, tokens);
    },
  };
}

/**
 * @brief 4分打ち（右手2分、左手4分）
 */
const quarterPulsePattern = definePattern({
  id: "manual.quarterPulse",
  name: "Quarter Pulse",
  nameJa: "4分パルス",
  notesByHand: {
    L: [
      N(0, 12, [T(0, 0, -1), T(0, 1, -1), T(0, 2, -1)], 0.78),
      N(12, 12, [T(1, 0, -1), T(1, 1, -1), T(1, 2, -1)], 0.70),
      N(24, 12, [T(2, 0, -1), T(2, 1, -1), T(2, 2, -1)], 0.70),
      N(36, 12, [T(3, 0, -1), T(3, 1, -1), T(3, 2, -1)], 0.70),
    ],
    R: [
      N(0, 24, [T(0, 0, 0), T(0, 1, 0), T(0, 2, 0)], 0.80),
      N(24, 24, [T(2, 0, 0), T(2, 1, 0), T(2, 2, 0)], 0.74),
    ],
  },
});

/**
 * @brief 画像1系（右手4分コード、左手8分パルス）
 */
const eighthBassPulsePattern = definePattern({
  id: "manual.eighthBassPulse",
  name: "Eighth Bass Pulse",
  nameJa: "8分ベースパルス",
  notesByHand: {
    L: [
      N(0, 6, [T(0, 0, -2)], 0.78),
      N(6, 6, [T(0, 2, -2)], 0.62),
      N(12, 6, [T(1, 0, -2)], 0.72),
      N(18, 6, [T(1, 2, -2)], 0.62),
      N(24, 6, [T(2, 0, -2)], 0.72),
      N(30, 6, [T(2, 2, -2)], 0.62),
      N(36, 6, [T(3, 0, -2)], 0.72),
      N(42, 6, [T(3, 2, -2)], 0.62),
    ],
    R: [
      N(0, 12, [T(0, 0, 0), T(0, 1, 0), T(0, 2, 0)], 0.80),
      N(12, 12, [T(1, 0, 0), T(1, 1, 0), T(1, 2, 0)], 0.66),
      N(24, 12, [T(2, 0, 0), T(2, 1, 0), T(2, 2, 0)], 0.66),
      N(36, 12, [T(3, 0, 0), T(3, 1, 0), T(3, 2, 0)], 0.66),
    ],
  },
});

/**
 * @brief 画像2系（右手2分コード、左手上行8分）
 */
const halfChordRisePattern = definePattern({
  id: "manual.halfChordRise",
  name: "Half Chord Rise",
  nameJa: "ハーフコード上行",
  notesByHand: {
    L: [
      N(0, 6, [T(0, 0, -2)], 0.72),
      N(6, 6, [T(0, 1, -2)], 0.66),
      N(12, 6, [T(0, 2, -1)], 0.66),
      N(18, 6, [T(0, 0, -1)], 0.70),
      N(24, 6, [T(2, 0, -2)], 0.72),
      N(30, 6, [T(2, 1, -2)], 0.66),
      N(36, 6, [T(2, 2, -1)], 0.66),
      N(42, 6, [T(2, 0, -1)], 0.70),
    ],
    R: [
      N(0, 24, [T(0, 0, 0), T(0, 1, 0), T(0, 2, 0)], 0.82),
      N(24, 24, [T(2, 0, 0), T(2, 1, 0), T(2, 2, 0)], 0.74),
    ],
  },
});

/**
 * @brief 16分中心パターン
 */
const sixteenthDrivePattern = definePattern({
  id: "manual.sixteenthDrive",
  name: "Sixteenth Drive",
  nameJa: "16分ドライブ",
  notesByHand: {
    L: [
      N(0, 12, [T(0, 0, -2)], 0.75),
      N(12, 12, [T(1, 0, -2)], 0.70),
      N(24, 12, [T(2, 0, -2)], 0.70),
      N(36, 12, [T(3, 0, -2)], 0.70),
    ],
    R: [
      N(0, 3, [T(0, 0, 0)], 0.70),
      N(3, 3, [T(0, 1, 0)], 0.64),
      N(6, 3, [T(0, 2, 0)], 0.64),
      N(9, 3, [T(0, 1, 0)], 0.64),
      N(12, 3, [T(1, 0, 0)], 0.70),
      N(15, 3, [T(1, 1, 0)], 0.64),
      N(18, 3, [T(1, 2, 0)], 0.64),
      N(21, 3, [T(1, 1, 0)], 0.64),
      N(24, 3, [T(2, 0, 0)], 0.70),
      N(27, 3, [T(2, 1, 0)], 0.64),
      N(30, 3, [T(2, 2, 0)], 0.64),
      N(33, 3, [T(2, 1, 0)], 0.64),
      N(36, 3, [T(3, 0, 0)], 0.70),
      N(39, 3, [T(3, 1, 0)], 0.64),
      N(42, 3, [T(3, 2, 0)], 0.64),
      N(45, 3, [T(3, 1, 0)], 0.64),
    ],
  },
});

/**
 * @brief 3連符パターン（8分3連+16分3連）
 */
const tripletFlowPattern = definePattern({
  id: "manual.tripletFlow",
  name: "Triplet Flow",
  nameJa: "3連フロー",
  notesByHand: {
    L: [
      N(0, 4, [T(0, 0, -2)], 0.74),
      N(4, 4, [T(0, 1, -2)], 0.66),
      N(8, 4, [T(0, 2, -2)], 0.66),
      N(12, 4, [T(1, 0, -2)], 0.72),
      N(16, 4, [T(1, 1, -2)], 0.66),
      N(20, 4, [T(1, 2, -2)], 0.66),
      N(24, 4, [T(2, 0, -2)], 0.72),
      N(28, 4, [T(2, 1, -2)], 0.66),
      N(32, 4, [T(2, 2, -2)], 0.66),
      N(36, 4, [T(3, 0, -2)], 0.72),
      N(40, 4, [T(3, 1, -2)], 0.66),
      N(44, 4, [T(3, 2, -2)], 0.66),
    ],
    R: [
      N(0, 2, [T(0, 0, 0)], 0.70),
      N(2, 2, [T(0, 1, 0)], 0.62),
      N(4, 2, [T(0, 2, 0)], 0.62),
      N(6, 2, [T(0, 1, 0)], 0.62),
      N(8, 2, [T(0, 2, 0)], 0.62),
      N(10, 2, [T(0, 1, 0)], 0.62),
      N(12, 2, [T(1, 0, 0)], 0.70),
      N(14, 2, [T(1, 1, 0)], 0.62),
      N(16, 2, [T(1, 2, 0)], 0.62),
      N(18, 2, [T(1, 1, 0)], 0.62),
      N(20, 2, [T(1, 2, 0)], 0.62),
      N(22, 2, [T(1, 1, 0)], 0.62),
      N(24, 2, [T(2, 0, 0)], 0.70),
      N(26, 2, [T(2, 1, 0)], 0.62),
      N(28, 2, [T(2, 2, 0)], 0.62),
      N(30, 2, [T(2, 1, 0)], 0.62),
      N(32, 2, [T(2, 2, 0)], 0.62),
      N(34, 2, [T(2, 1, 0)], 0.62),
      N(36, 2, [T(3, 0, 0)], 0.70),
      N(38, 2, [T(3, 1, 0)], 0.62),
      N(40, 2, [T(3, 2, 0)], 0.62),
      N(42, 2, [T(3, 1, 0)], 0.62),
      N(44, 2, [T(3, 2, 0)], 0.62),
      N(46, 2, [T(3, 1, 0)], 0.62),
    ],
  },
});

/**
 * @brief 利用可能なパターン一覧
 */
export const PATTERNS: PatternDef[] = [
  quarterPulsePattern,
  eighthBassPulsePattern,
  halfChordRisePattern,
  sixteenthDrivePattern,
  tripletFlowPattern,
];

const DEFAULT_PATTERN = quarterPulsePattern;

/**
 * @brief パターンIDからパターン定義を取得する
 */
export function getPattern(id: string): PatternDef {
  return PATTERNS.find((p) => p.id === id) || DEFAULT_PATTERN;
}

/**
 * @brief 既定パターンIDを取得する
 */
export function getDefaultPatternId(): string {
  return DEFAULT_PATTERN.id;
}

/**
 * @brief パターンIDの有効性を判定する
 */
export function isValidPatternId(id: string): boolean {
  return PATTERNS.some((p) => p.id === id);
}
