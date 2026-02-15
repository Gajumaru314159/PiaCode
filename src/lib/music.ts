import { ChordToken, ChordQuality, PitchClass, Progression } from "@/types/music";

/**
 * @brief 全ピッチクラスの順序配列（半音順）
 */
export const ALL_PITCH_CLASSES: PitchClass[] = [
  "C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B",
];

/**
 * @brief コード品質の表示ラベル
 */
export const CHORD_QUALITY_LABELS: Record<ChordQuality, string> = {
  M: "M", m: "m", "7": "7", m7: "m7", M7: "M7",
  sus4: "sus4", "5": "5", "m7-5": "m7-5", aug: "aug", dim: "dim",
};

/**
 * @brief マトリックスに表示するコード品質の順序
 */
export const MATRIX_QUALITIES: ChordQuality[] = [
  "M", "m", "7", "m7", "M7", "sus4", "5", "m7-5", "aug", "dim",
];

export type AccidentalPreference = "sharp" | "flat";

const SHARP_SPELLING_MAP: Record<PitchClass, string> = {
  C: "C",
  "C#": "C#",
  D: "D",
  Eb: "D#",
  E: "E",
  F: "F",
  "F#": "F#",
  G: "G",
  Ab: "G#",
  A: "A",
  Bb: "A#",
  B: "B",
};

const FLAT_SPELLING_MAP: Record<PitchClass, string> = {
  C: "C",
  "C#": "Db",
  D: "D",
  Eb: "Eb",
  E: "E",
  F: "F",
  "F#": "Gb",
  G: "G",
  Ab: "Ab",
  A: "A",
  Bb: "Bb",
  B: "B",
};

const KEY_ACCIDENTAL_PREFERENCE: Record<PitchClass, AccidentalPreference> = {
  C: "sharp",
  "C#": "sharp",
  D: "sharp",
  Eb: "flat",
  E: "sharp",
  F: "flat",
  "F#": "sharp",
  G: "sharp",
  Ab: "flat",
  A: "sharp",
  Bb: "flat",
  B: "sharp",
};

/**
 * @brief 調に応じたダイアトニック音名を返す
 * @param key 調のルート
 * @returns 7つのルート候補
 */
export function getDiatonicRoots(key: PitchClass): PitchClass[] {
  // メジャースケールの間隔: 全全半全全全半
  const intervals = [0, 2, 4, 5, 7, 9, 11];
  const keyIndex = ALL_PITCH_CLASSES.indexOf(key);
  return intervals.map((i) => ALL_PITCH_CLASSES[(keyIndex + i) % 12]);
}

/**
 * @brief キーに応じた臨時記号の優先表記（sharp/flat）を返す
 * @param key 調のルート
 * @returns 臨時記号の優先表記
 */
export function getAccidentalPreferenceForKey(key: PitchClass): AccidentalPreference {
  return KEY_ACCIDENTAL_PREFERENCE[key];
}

/**
 * @brief ピッチクラスを sharp/flat 優先で表示名に変換する
 * @param pitch 変換元ピッチクラス
 * @param preference 優先表記
 * @returns 表示用音名
 */
export function formatPitchClassByPreference(
  pitch: PitchClass,
  preference: AccidentalPreference
): string {
  const raw = preference === "sharp"
    ? SHARP_SPELLING_MAP[pitch]
    : FLAT_SPELLING_MAP[pitch];
  return raw.replace(/#/g, "♯").replace(/b/g, "♭");
}

/**
 * @brief キーに応じた優先表記でピッチクラスを表示名に変換する
 * @param pitch 変換元ピッチクラス
 * @param key 調のルート
 * @returns 表示用音名
 */
export function formatPitchClassForKeyDisplay(pitch: PitchClass, key: PitchClass): string {
  const preference = getAccidentalPreferenceForKey(key);
  return formatPitchClassByPreference(pitch, preference);
}

/**
 * @brief matrixKey（半音インデックス）をピッチクラスへ変換する
 * @param matrixKey キーインデックス
 * @returns 調ルートのピッチクラス
 */
export function matrixKeyToPitchClass(matrixKey: number): PitchClass {
  const normalized = ((Math.trunc(matrixKey) % 12) + 12) % 12;
  return ALL_PITCH_CLASSES[normalized];
}

/**
 * @brief matrixKeyに応じた臨時記号の優先表記（sharp/flat）を返す
 * @param matrixKey キーインデックス
 * @returns 臨時記号の優先表記
 */
export function getAccidentalPreferenceForMatrixKey(matrixKey: number): AccidentalPreference {
  return getAccidentalPreferenceForKey(matrixKeyToPitchClass(matrixKey));
}

/**
 * @brief コードトークンの表示名を返す
 * @param token コードトークン
 * @returns 表示文字列
 */
export function chordDisplayName(token: ChordToken): string {
  if (token.isRest) return "";
  if (!token.root || !token.quality) return "";
  const q = token.quality === "M" ? "" : token.quality;
  const bass = token.bass ? `/${token.bass}` : "";
  return `${token.root}${q}${bass}`;
}

/**
 * @brief コードトークンの表示名を、指定キーに応じた臨時記号で返す
 * @param token コードトークン
 * @param key 調のルート
 * @returns 表示文字列
 */
export function chordDisplayNameForKey(token: ChordToken, key: PitchClass): string {
  if (token.isRest) return "";
  if (!token.root || !token.quality) return "";
  const q = token.quality === "M" ? "" : token.quality;
  const root = formatPitchClassForKeyDisplay(token.root, key);
  const bass = token.bass ? `/${formatPitchClassForKeyDisplay(token.bass, key)}` : "";
  return `${root}${q}${bass}`;
}

/**
 * @brief コードトークンの表示名を、matrixKeyに応じた臨時記号で返す
 * @param token コードトークン
 * @param matrixKey キーインデックス
 * @returns 表示文字列
 */
export function chordDisplayNameForMatrixKey(token: ChordToken, matrixKey: number): string {
  return chordDisplayNameForKey(token, matrixKeyToPitchClass(matrixKey));
}

/**
 * @brief 空のコードトークン（休符）を返す
 */
export function createRestToken(): ChordToken {
  return { root: null, quality: null, tensions: [], bass: null, isRest: true };
}

/**
 * @brief コードトークンを生成する
 * @param root ルート音
 * @param quality コード品質
 */
export function createChordToken(root: PitchClass, quality: ChordQuality): ChordToken {
  return { root, quality, tensions: [], bass: null, isRest: false };
}

/**
 * @brief 空のプログレッションを生成する
 * @param bars 段数（8セル単位）
 */
export function createEmptyProgression(bars: number = 12): Progression {
  const cells: ChordToken[] = Array.from({ length: bars * 8 }, () => createRestToken());
  return { beatsPerBar: 4, cells, cursor: 0, length: cells.length };
}

/**
 * @brief 再生ループ長を算出する
 * @param totalCells 全セル数
 * @param beatsPerBar 拍子
 */
export function resolveLoopLength(totalCells: number, beatsPerBar: 3 | 4): number {
  if (beatsPerBar === 3) {
    // 3拍子は内部4セル（1-2拍+非表示2セル）を1小節として扱う
    return Math.floor(totalCells / 4) * 3;
  }
  return Math.floor(totalCells / beatsPerBar) * beatsPerBar;
}

/**
 * @brief 末尾の全休符小節を切り捨てた再生ループ長を算出する
 * @param cells 全セル
 * @param beatsPerBar 拍子
 */
export function resolveLoopLengthFromCells(cells: ChordToken[], beatsPerBar: 3 | 4): number {
  if (beatsPerBar === 3) {
    const barCount = Math.floor(cells.length / 4);
    if (barCount <= 0) return 0;

    for (let barIdx = barCount - 1; barIdx >= 0; barIdx--) {
      const base = barIdx * 4;
      const beat1 = cells[base];
      const beat2 = cells[base + 1];
      const beat3 = cells[base + 2];
      const isRestOnlyBar =
        (beat1?.isRest ?? true) &&
        (beat2?.isRest ?? true) &&
        (beat3?.isRest ?? true);
      if (!isRestOnlyBar) {
        return (barIdx + 1) * 3;
      }
    }

    return 0;
  }

  const alignedLength = Math.floor(cells.length / beatsPerBar) * beatsPerBar;
  if (alignedLength <= 0) return 0;

  let lastBarStart = alignedLength - beatsPerBar;
  while (lastBarStart >= 0) {
    let isRestOnlyBar = true;
    for (let i = 0; i < beatsPerBar; i++) {
      const cell = cells[lastBarStart + i];
      if (cell && !cell.isRest) {
        isRestOnlyBar = false;
        break;
      }
    }
    if (!isRestOnlyBar) {
      return lastBarStart + beatsPerBar;
    }
    lastBarStart -= beatsPerBar;
  }

  return 0;
}

/**
 * @brief 進行全体を半音単位で移調する
 * @param progression 進行データ
 * @param semitoneDelta 半音の移動量（+1 or -1）
 */
export function transposeProgression(
  progression: Progression,
  semitoneDelta: 1 | -1
): Progression {
  const newCells = progression.cells.map((cell) => {
    if (cell.isRest || !cell.root) return { ...cell };
    const idx = ALL_PITCH_CLASSES.indexOf(cell.root);
    const newIdx = (idx + semitoneDelta + 12) % 12;
    const newRoot = ALL_PITCH_CLASSES[newIdx];
    let newBass = cell.bass;
    if (cell.bass) {
      const bassIdx = ALL_PITCH_CLASSES.indexOf(cell.bass);
      newBass = ALL_PITCH_CLASSES[(bassIdx + semitoneDelta + 12) % 12];
    }
    return { ...cell, root: newRoot, bass: newBass };
  });
  return { ...progression, cells: newCells };
}

/**
 * @brief コードの構成音をMIDIノート番号で返す
 * @param token コードトークン
 * @param octave 基準オクターブ
 */
export function chordToMidiNotes(token: ChordToken, octave: number = 4): number[] {
  if (token.isRest || !token.root || !token.quality) return [];
  const rootIdx = ALL_PITCH_CLASSES.indexOf(token.root);
  const base = 12 * (octave + 1) + rootIdx; // C4 = 60

  // 各品質の構成音（ルートからの半音数）
  const intervals: Record<ChordQuality, number[]> = {
    M: [0, 4, 7],
    m: [0, 3, 7],
    "7": [0, 4, 7, 10],
    m7: [0, 3, 7, 10],
    M7: [0, 4, 7, 11],
    sus4: [0, 5, 7],
    "5": [0, 7],
    "m7-5": [0, 3, 6, 10],
    aug: [0, 4, 8],
    dim: [0, 3, 6],
  };

  return (intervals[token.quality] || [0, 4, 7]).map((i) => base + i);
}

/**
 * @brief MIDIノート番号を音名文字列に変換する（VexFlow形式）
 * @param midi MIDIノート番号
 * @param preference 臨時記号の優先表記
 */
export function midiToVexKey(midi: number, preference: AccidentalPreference = "flat"): string {
  const noteNames = preference === "sharp"
    ? ["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"]
    : ["c", "db", "d", "eb", "e", "f", "gb", "g", "ab", "a", "bb", "b"];
  const octave = Math.floor(midi / 12) - 1;
  const note = noteNames[midi % 12];
  return `${note}/${octave}`;
}
