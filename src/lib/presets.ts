import { SavedProgression, ChordToken, Progression } from "@/types/music";
import { createChordToken, createRestToken } from "./music";
import { t } from "./i18n";

/**
 * @brief コード文字列からChordTokenを生成する
 * @param str "C", "Am", "FM7", "Dm7" 等の文字列
 */
function parseChord(str: string): ChordToken {
  // ルート音を取得（1文字 or 2文字目が#/b）
  let rootStr = str[0];
  let rest = str.slice(1);
  if (rest.startsWith("#") || rest.startsWith("b")) {
    rootStr += rest[0] === "b" ? "b" : "#";
    rest = rest.slice(1);
  }

  // ルート音の正規化
  const rootMap: Record<string, string> = {
    Db: "C#", Eb: "Eb", Gb: "F#", Ab: "Ab", Bb: "Bb",
    "C": "C", "D": "D", "E": "E", "F": "F", "G": "G", "A": "A", "B": "B",
    "C#": "C#", "F#": "F#",
  };
  const root = rootMap[rootStr];
  if (!root) return createRestToken();

  // 品質の解析
  type Q = ChordToken["quality"];
  let quality: Q = "M";
  if (rest === "m") quality = "m";
  else if (rest === "m7") quality = "m7";
  else if (rest === "m7-5") quality = "m7-5";
  else if (rest === "M7") quality = "M7";
  else if (rest === "7") quality = "7";
  else if (rest === "dim") quality = "dim";
  else if (rest === "aug") quality = "aug";
  else if (rest === "sus4") quality = "sus4";
  else if (rest === "5") quality = "5";
  else if (rest === "") quality = "M";

  return createChordToken(root as ChordToken["root"] & string, quality);
}

/**
 * @brief コード進行文字列からProgressionを生成する
 * @param chords ハイフン区切りのコード文字列 "C-Am-F-G"
 * @param beatsPerBar 拍子
 */
function buildProgression(chords: string, beatsPerBar: 3 | 4 = 4): Progression {
  const tokens = chords.split("-").map(parseChord);
  // 4拍子は2拍ごと、3拍子は1小節ごとにコードを展開
  const beatsPerChord = beatsPerBar === 4 ? 2 : beatsPerBar;
  const cells: ChordToken[] = [];
  for (const token of tokens) {
    for (let i = 0; i < beatsPerChord; i++) {
      cells.push({ ...token });
    }
  }
  // 8セル単位にパディング
  while (cells.length % 8 !== 0) {
    cells.push(createRestToken());
  }
  return { beatsPerBar, cells, cursor: 0, length: cells.length };
}

/**
 * @brief システムプリセット一覧
 */
export const SYSTEM_PRESETS: SavedProgression[] = [
  {
    id: "system.canon",
    name: "カノン進行",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    progression: buildProgression("C-G-Am-Em-F-C-F-G"),
    matrixKey: 0,
    tempo: 120,
    isSystem: true,
  },
  {
    id: "system.oudou",
    name: "王道進行",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    progression: buildProgression("F-G-Em-Am"),
    matrixKey: 0,
    tempo: 120,
    isSystem: true,
  },
  {
    id: "system.marusa",
    name: "丸サ進行",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    progression: buildProgression("FM7-G7-Em7-Am7"),
    matrixKey: 0,
    tempo: 120,
    isSystem: true,
  },
  {
    id: "system.junkan",
    name: "循環コード",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    progression: buildProgression("C-Am-Dm-G"),
    matrixKey: 0,
    tempo: 120,
    isSystem: true,
  },
  {
    id: "system.komuro",
    name: "小室進行",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    progression: buildProgression("Am-F-G-C"),
    matrixKey: 0,
    tempo: 120,
    isSystem: true,
  },
  {
    id: "system.6251",
    name: "6-2-5-1進行",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    progression: buildProgression("Am-Dm7-G-C-Am-Dm7-G-C"),
    matrixKey: 0,
    tempo: 120,
    isSystem: true,
  },
];

const SYSTEM_PRESET_NAME_KEYS: Record<string, string> = {
  "system.canon": "preset.system.canon",
  "system.oudou": "preset.system.oudou",
  "system.marusa": "preset.system.marusa",
  "system.junkan": "preset.system.junkan",
  "system.komuro": "preset.system.komuro",
  "system.6251": "preset.system.6251",
};

/**
 * @brief プリセットの表示名を言語に応じて取得する
 * @param preset 対象プリセット
 * @param lang 言語コード
 */
export function getPresetDisplayName(preset: SavedProgression, lang: string): string {
  if (!preset.isSystem) return preset.name;
  const key = SYSTEM_PRESET_NAME_KEYS[preset.id];
  return key ? t(key, lang) : preset.name;
}
