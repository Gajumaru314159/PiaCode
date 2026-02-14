/**
 * @brief 音名（ピッチクラス）
 */
export type PitchClass =
  | "C" | "C#" | "D" | "Eb" | "E" | "F"
  | "F#" | "G" | "Ab" | "A" | "Bb" | "B";

/**
 * @brief コード品質
 */
export type ChordQuality =
  | "M" | "m" | "dim" | "aug" | "sus4"
  | "7" | "M7" | "m7" | "5" | "m7-5";

/**
 * @brief 左右の手
 */
export type Hand = "L" | "R";

/**
 * @brief コードトークン（1拍分のデータ）
 */
export interface ChordToken {
  root: PitchClass | null;
  quality: ChordQuality | null;
  tensions: number[];
  bass: PitchClass | null;
  isRest: boolean;
}

/**
 * @brief コード進行データ
 */
export interface Progression {
  beatsPerBar: 3 | 4;
  cells: ChordToken[];
  cursor: number;
  length: number;
}

/**
 * @brief 名前付き保存データ
 */
export interface SavedProgression {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  progression: Progression;
  isSystem?: boolean;
}

/**
 * @brief 再生状態
 */
export interface PlaybackState {
  isPlaying: boolean;
  isLoop: boolean;
  isMetronomeOn: boolean;
  currentBeat: number;
  tempo: number;
}

/**
 * @brief オプション設定
 */
export interface AppOptions {
  barsPerRow: 2 | 4;
  rowCount: number;
  audioTrack: "both" | "left" | "right" | "none";
  metronomeVolume: number;
  leftRightLock: boolean;
  leftPatternId: string;
  rightPatternId: string;
  tempo: number;
  language: "ja" | "en" | "zh";
}

/**
 * @brief 再生イベント
 */
export interface PlaybackEvent {
  atBeat: number;
  midiNotes: number[];
  velocity: number;
  durationBeat: number;
}

/**
 * @brief 譜面レンダリング用の1音データ
 */
export interface NoteRender {
  keys: string[];
  duration: string;
}
