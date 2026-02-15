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
  degreeIndex: number;
  octaveShift: number;
  semitoneShift?: number;
}

/**
 * @brief パターン定義用ノートトークン
 */
export interface PatternNoteToken {
  durationTick: number;
  // nullの場合は休符として扱う
  chordIndex: number | null;
  // tonesが空配列の場合は休符として扱う
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
  durationTick: number,
  chordIndex: number,
  tones: ToneRef[],
  velocity?: number
): PatternNoteToken => ({ durationTick, chordIndex, tones, velocity });

/**
 * @brief パターン定義ヘルパー（休符トークン）
 */
const R = (durationTick: number): PatternNoteToken => ({ durationTick, chordIndex: null, tones: [] });

/**
 * @brief 音参照ヘルパー
 */
const T = (
  degreeIndex: number,
  octaveShift: number,
  semitoneShift?: number
): ToneRef => ({ degreeIndex, octaveShift, semitoneShift });

/**
 * @brief ToneRefからMIDIノートを解決する
 */
export function resolveToneRef(
  chordsInBar: ChordToken[],
  chordIndex: number,
  tone: ToneRef
): number | null {
  const chord = chordsInBar[chordIndex];
  if (!chord || chord.isRest) return null;

  const notes = chordToMidiNotes(chord, 4);
  if (notes.length === 0) return null;

  const degreeBaseIndex = ((tone.degreeIndex % notes.length) + notes.length) % notes.length;
  const degreeOctave = Math.floor(tone.degreeIndex / notes.length);
  const baseMidi = notes[degreeBaseIndex] + degreeOctave * 12;

  return baseMidi + tone.octaveShift * 12 + (tone.semitoneShift ?? 0);
}

/**
 * @brief パターントークン列（duration累積）を小節ノート列へ解決する
 */
export function resolveBarPattern(input: PatternBarInput, tokens: PatternNoteToken[]): ResolvedPatternNote[] {
  const barTicks = input.beatsPerBar * TICKS_PER_BEAT;
  let cursorTick = 0;

  return tokens
    .map((token) => {
      const clampedStart = Math.max(0, Math.floor(cursorTick));
      const tokenDurationTick = Math.max(0, Math.floor(token.durationTick));
      const rawEnd = clampedStart + tokenDurationTick;
      cursorTick += tokenDurationTick;
      const clampedEnd = Math.min(barTicks, rawEnd);
      const durationTick = clampedEnd - clampedStart;
      if (durationTick <= 0 || clampedStart >= barTicks) return null;

      const midiSet = new Set<number>();
      if (token.chordIndex !== null) {
        for (const tone of token.tones) {
          const midi = resolveToneRef(input.chordsInBar, token.chordIndex, tone);
          if (midi !== null) {
            midiSet.add(midi);
          }
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
    // *   *   *   *   
    // *       *        
    R: [
      N(12, 0, [T(0, 0), T(1, 0), T(2, 0)]),
      N(12, 1, [T(0, 0), T(1, 0), T(2, 0)]),
      N(12, 2, [T(0, 0), T(1, 0), T(2, 0)]),
      N(12, 3, [T(0, 0), T(1, 0), T(2, 0)]),
    ],
    L: [
      N(24, 0, [T(0, -1), T(0, -2)]),
      N(24, 2, [T(0, -1), T(0, -2)]),
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
    // *   *   *   *   
    // * * * * * * * *  
    R: [
      N(12, 0, [T(1, 0), T(2, 0), T(0, 1)]),
      N(12, 1, [T(1, 0), T(2, 0), T(0, 1)]),
      N(12, 2, [T(1, 0), T(2, 0), T(0, 1)]),
      N(12, 3, [T(1, 0), T(2, 0), T(0, 1)]),
    ],
    L: [
      N(6, 0, [T(0, -2)]),
      N(6, 0, [T(0, -1)]),
      N(6, 1, [T(0, -2)]),
      N(6, 1, [T(0, -1)]),
      N(6, 2, [T(0, -2)]),
      N(6, 2, [T(0, -1)]),
      N(6, 3, [T(0, -2)]),
      N(6, 3, [T(0, -1)]),
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
    // *       *       
    // * * * * * * * *  
    R: [
      N(24, 0, [T(0, 0), T(1, 0), T(2, 0)]),
      N(24, 2, [T(0, 0), T(1, 0), T(2, 0)]),
    ],
    L: [
      N(6, 0, [T(0, -2)]),
      N(6, 0, [T(1, -2)]),
      N(6, 1, [T(2, -2)]),
      N(6, 1, [T(0, -1)]),
      N(6, 2, [T(0, -2)]),
      N(6, 2, [T(1, -2)]),
      N(6, 3, [T(2, -2)]),
      N(6, 3, [T(0, -1)]),
    ],
  },
});

/**
 * @brief 休符入りオフビート（右手裏打ち + 左手ロングトーン）
 */
const restOffbeatCompPattern = definePattern({
  id: "manual.restOffbeatComp",
  name: "Rest Offbeat Comp",
  nameJa: "休符入りオフビート",
  notesByHand: {
    // - * - * - * - *
    // *   -   *   -
    R: [
      R(6),
      N(6, 0, [T(1, 0), T(2, 0), T(0, 1)]),
      R(6),
      N(6, 1, [T(1, 0), T(2, 0), T(0, 1)]),
      R(6),
      N(6, 2, [T(1, 0), T(2, 0), T(0, 1)]),
      R(6),
      N(6, 3, [T(1, 0), T(2, 0), T(0, 1)]),
    ],
    L: [
      N(18, 0, [T(0, -2), T(0, -1)]),
      R(6),
      N(18, 2, [T(0, -2), T(0, -1)]),
      R(6),
    ],
  },
});

/**
 * @brief 休符入りコール&レスポンス（右手断続 + 左手単音）
 */
const restCallResponsePattern = definePattern({
  id: "manual.restCallResponse",
  name: "Rest Call Response",
  nameJa: "休符入りコールレスポンス",
  notesByHand: {
    // *   -   * - * -
    // * - * - * - * -
    R: [
      N(12, 0, [T(0, 0), T(1, 0), T(2, 0)]),
      R(12),
      N(6, 2, [T(0, 0), T(1, 0), T(2, 0)]),
      R(6),
      N(6, 3, [T(0, 0), T(1, 0), T(2, 0)]),
      R(6),
    ],
    L: [
      N(6, 0, [T(0, -2)]),
      R(6),
      N(6, 1, [T(0, -2)]),
      R(6),
      N(6, 2, [T(0, -2)]),
      R(6),
      N(6, 3, [T(0, -2)]),
      R(6),
    ],
  },
});

/**
 * @brief 画像1（右手4分和音 + 左手 付点4分/8分）
 */
const imageChordDotsBassPattern = definePattern({
  id: "manual.imageChordDotsBass",
  name: "Chord Dots Bass",
  nameJa: "4分和音+付点ベース",
  notesByHand: {
    // *   *   *   *   
    // *     * *     *  
    R: [
      N(12, 0, [T(0, 0), T(1, 0), T(2, 0)]),
      N(12, 1, [T(0, 0), T(1, 0), T(2, 0)]),
      N(12, 2, [T(0, 0), T(1, 0), T(2, 0)]),
      N(12, 3, [T(0, 0), T(1, 0), T(2, 0)]),
    ],
    L: [
      N(18, 0, [T(0, -2),T(0, -1)]),
      N(6, 1, [T(0, -2),T(0, -1)]),
      N(18, 2, [T(0, -2),T(0, -1)]),
      N(6, 3, [T(0, -2),T(0, -1)]),
    ],
  },
});

/**
 * @brief 画像3（右手フレーズ + 左手4分交互）
 */
const imagePhraseAltBassPattern = definePattern({
  id: "manual.imagePhraseAltBass",
  name: "Phrase Alt Bass",
  nameJa: "フレーズ+交互ベース",
  notesByHand: {
    R: [
      N(6, 0, [T(0, 1), T(2, 0)]),
      N(6, 0, [T(1, 0)]),
      N(6, 1, [T(2, 0)]),
      N(6, 1, [T(0, 1), T(2, 0)]),
      N(6, 2, [T(1, 1), T(0, 1)]),
      N(6, 2, [T(2, 0)]),
      N(6, 3, [T(0, 1)]),
      N(6, 3, [T(1, 1), T(0, 1)]),
    ],
    L: [
      N(12, 0, [T(0, -1), T(1, -1), T(2, -1)]),
      N(12, 1, [T(0, -1), T(1, -1), T(2, -1)]),
      N(12, 2, [T(0, -1), T(1, -1), T(2, -1)]),
      N(12, 3, [T(0, -1), T(1, -1), T(2, -1)]),
    ],
  },
});

/**
 * @brief 画像4（右手16分アクセント + 左手シンコペーション）
 */
const imageAccentSyncPattern = definePattern({
  id: "manual.imageAccentSync",
  name: "Accent Sync",
  nameJa: "アクセントシンク",
  notesByHand: {
    R: [
      N(12, 0, [T(0, 0), T(1, 0), T(2, 0)]),
      N(9, 1, [T(0, 0), T(2, 0)]),
      N(3, 1, [T(1, 0), T(2, 0)]),
      N(12, 2, [T(0, 0), T(1, 0), T(2, 0)]),
      N(9, 3, [T(0, 0), T(2, 0)]),
      N(3, 3, [T(1, 0), T(2, 0)]),
    ],
    L: [
      N(18, 0, [T(0, -2),T(0, -1)]),
      N(6, 1, [T(0, -2),T(0, -1)]),
      N(6, 2, [T(0, -2),T(0, -1)]),
      N(12, 2, [T(0, -2),T(0, -1)]),
      N(6, 3, [T(0, -2),T(0, -1)]),
    ],
  },
});

/**
 * @brief ラグタイム
 */
const ragtimePattern = definePattern({
  id: "manual.ragtime",
  name: "Ragtime",
  nameJa: "ラグタイム",
  notesByHand: {
    R: [
      N(9, 0, [T(0, 1), T(2, 0)]),
      N(3, 0, [T(1, 0)]),
      N(9, 1, [T(2, 0)]),
      N(3, 1, [T(0, 1), T(2, 0)]),
      R(9),
      N(3, 2, [T(2, 0)]),
      N(9, 3, [T(0, 1), T(2, 0)]),
      N(3, 3, [T(2, 0)]),
    ],
    L: [
      N(12, 0, [T(0, -2)]),
      N(12, 1, [T(0, -1), T(1, -1), T(2, -1)]),
      N(12, 2, [T(0, -2)]),
      N(12, 3, [T(0, -1), T(1, -1), T(2, -1)]),
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
  restOffbeatCompPattern,
  restCallResponsePattern,
  imageChordDotsBassPattern,
  imagePhraseAltBassPattern,
  imageAccentSyncPattern,
  ragtimePattern,
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
