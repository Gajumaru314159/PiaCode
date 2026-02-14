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
  return Math.floor(totalCells / beatsPerBar) * beatsPerBar;
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
 */
export function midiToVexKey(midi: number): string {
  const noteNames = ["c", "c#", "d", "eb", "e", "f", "f#", "g", "ab", "a", "bb", "b"];
  const octave = Math.floor(midi / 12) - 1;
  const note = noteNames[midi % 12];
  return `${note}/${octave}`;
}
