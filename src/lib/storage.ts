import { AppOptions, Progression, SavedProgression } from "@/types/music";
import { getDefaultPatternId, isValidPatternId } from "./audio";

/** LocalStorageキー定義 */
const KEYS = {
  autosave: "piacode.progression.autosave",
  userPresets: "piacode.progression.userPresets",
  options: "piacode.options.current",
  lastOpened: "piacode.progression.lastOpened",
} as const;

const STORAGE_PREFIX = "piacode.";
const MIGRATION_FILE_MAGIC = "piacode-storage";
const MIGRATION_FILE_VERSION = 1;
export const DEFAULT_TEMPO = 120;

interface MigrationFileData {
  magic: string;
  version: number;
  exportedAt: string;
  entries: Record<string, string>;
}

/**
 * @brief JSONをLocalStorageに安全に保存する
 * @param key ストレージキー
 * @param value 保存するデータ
 * @returns 成功したらtrue
 */
function safeSet(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    console.error("LocalStorage書き込み失敗:", key);
    return false;
  }
}

/**
 * @brief LocalStorageからJSONを安全に取得する
 * @param key ストレージキー
 * @returns パース済みデータまたはnull
 */
function safeGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    console.error("LocalStorage読み込み失敗:", key);
    return null;
  }
}

// --- 自動保存 ---

export interface AutosaveData {
  progression: Progression;
  matrixKey: number;
  tempo: number;
}

function normalizeMatrixKey(key: unknown): number {
  const num = Number(key);
  if (!Number.isFinite(num)) return 0;
  return ((Math.floor(num) % 12) + 12) % 12;
}

function normalizeTempo(tempo: unknown): number {
  const num = Number(tempo);
  if (!Number.isFinite(num)) return DEFAULT_TEMPO;
  return Math.min(300, Math.max(30, Math.floor(num)));
}

function loadLegacyTempoFromOptions(): number {
  const raw = safeGet<Record<string, unknown>>(KEYS.options);
  return normalizeTempo(raw?.tempo);
}

/**
 * @brief 自動保存データを保存する
 */
export function saveAutosave(progression: Progression, matrixKey: number, tempo: number): boolean {
  const data: AutosaveData = {
    progression,
    matrixKey: normalizeMatrixKey(matrixKey),
    tempo: normalizeTempo(tempo),
  };
  return safeSet(KEYS.autosave, data);
}

/**
 * @brief 自動保存データを読み込む
 */
export function loadAutosave(): AutosaveData | null {
  const raw = safeGet<unknown>(KEYS.autosave);
  if (!raw || typeof raw !== "object") return null;
  const legacyTempo = loadLegacyTempoFromOptions();
  if ("progression" in raw) {
    const withMeta = raw as Partial<AutosaveData>;
    if (!withMeta.progression) return null;
    return {
      progression: withMeta.progression,
      matrixKey: normalizeMatrixKey(withMeta.matrixKey),
      tempo: normalizeTempo(withMeta.tempo ?? legacyTempo),
    };
  }
  // 旧形式（Progressionのみ保存）との互換
  const legacy = raw as Progression;
  if (!Array.isArray(legacy.cells)) return null;
  return {
    progression: legacy,
    matrixKey: 0,
    tempo: legacyTempo,
  };
}

// --- ユーザープリセット ---

/**
 * @brief ユーザープリセット一覧を取得する
 */
export function loadUserPresets(): SavedProgression[] {
  const raw = safeGet<Partial<SavedProgression>[]>(KEYS.userPresets) || [];
  const legacyTempo = loadLegacyTempoFromOptions();
  return raw
    .filter((p): p is Partial<SavedProgression> & Pick<SavedProgression, "id" | "name" | "createdAt" | "updatedAt" | "progression"> => {
      return Boolean(p?.id && p?.name && p?.createdAt && p?.updatedAt && p?.progression);
    })
    .map((p) => ({
      id: p.id,
      name: p.name,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      progression: p.progression,
      matrixKey: normalizeMatrixKey(p.matrixKey),
      tempo: normalizeTempo(p.tempo ?? legacyTempo),
      isSystem: p.isSystem,
    }));
}

/**
 * @brief ユーザープリセットを保存する（追加 or 更新）
 * @param preset 保存するプリセット
 */
export function saveUserPreset(preset: SavedProgression): boolean {
  const presets = loadUserPresets();
  const idx = presets.findIndex((p) => p.id === preset.id);
  if (idx >= 0) {
    presets[idx] = preset;
  } else {
    presets.push(preset);
  }
  return safeSet(KEYS.userPresets, presets);
}

/**
 * @brief ユーザープリセットを削除する
 * @param id 削除対象のID
 */
export function deleteUserPreset(id: string): boolean {
  const presets = loadUserPresets().filter((p) => p.id !== id);
  return safeSet(KEYS.userPresets, presets);
}

// --- オプション ---

/**
 * @brief デフォルトのオプション値
 */
export const DEFAULT_OPTIONS: AppOptions = {
  barsPerRow: 2,
  rowCount: 3,
  pageTurnMode: "follow",
  audioTrack: "both",
  metronomeVolume: 0.5,
  leftRightLock: true,
  leftPatternId: getDefaultPatternId(),
  rightPatternId: getDefaultPatternId(),
  language: "ja",
};

/**
 * @brief オプションを取得する
 */
export function loadOptions(): AppOptions {
  const raw = safeGet<Partial<AppOptions>>(KEYS.options);
  if (!raw) return { ...DEFAULT_OPTIONS };

  const merged: AppOptions = {
    ...DEFAULT_OPTIONS,
    ...raw,
  };

  if (!["both", "left", "right", "none"].includes(merged.audioTrack)) {
    merged.audioTrack = DEFAULT_OPTIONS.audioTrack;
  }
  if (!["follow", "page"].includes(merged.pageTurnMode)) {
    merged.pageTurnMode = DEFAULT_OPTIONS.pageTurnMode;
  }
  merged.barsPerRow = merged.barsPerRow === 4 ? 4 : 2;
  merged.rowCount = Math.min(6, Math.max(1, Number(merged.rowCount) || DEFAULT_OPTIONS.rowCount));
  merged.metronomeVolume = Math.min(1, Math.max(0, Number(merged.metronomeVolume) || 0));
  if (!isValidPatternId(merged.leftPatternId)) {
    merged.leftPatternId = DEFAULT_OPTIONS.leftPatternId;
  }
  if (!isValidPatternId(merged.rightPatternId)) {
    merged.rightPatternId = DEFAULT_OPTIONS.rightPatternId;
  }

  return merged;
}

/**
 * @brief 移行用のLocalStorageスナップショットを生成する
 * @returns 移行ファイル(JSON文字列)と対象件数
 */
export function exportStorageMigrationData(): { text: string; count: number } {
  const entries: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(STORAGE_PREFIX)) continue;
    const value = localStorage.getItem(key);
    if (value === null) continue;
    entries[key] = value;
  }
  const payload: MigrationFileData = {
    magic: MIGRATION_FILE_MAGIC,
    version: MIGRATION_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    entries,
  };
  return {
    text: JSON.stringify(payload),
    count: Object.keys(entries).length,
  };
}

function isMigrationFileData(value: unknown): value is MigrationFileData {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<MigrationFileData>;
  if (record.magic !== MIGRATION_FILE_MAGIC) return false;
  if (record.version !== MIGRATION_FILE_VERSION) return false;
  if (!record.entries || typeof record.entries !== "object") return false;
  return Object.entries(record.entries).every(([k, v]) => {
    return typeof k === "string" && k.startsWith(STORAGE_PREFIX) && typeof v === "string";
  });
}

/**
 * @brief 移行ファイル(JSON文字列)からLocalStorageを復元する
 * @param text 移行ファイルのテキスト内容
 * @returns 復元したキー件数
 * @throws Error フォーマット不正時
 */
export function importStorageMigrationData(text: string): number {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error("invalid-json");
  }
  if (!isMigrationFileData(parsed)) {
    throw new Error("invalid-format");
  }

  const keysToClear: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(STORAGE_PREFIX)) {
      keysToClear.push(key);
    }
  }
  keysToClear.forEach((key) => {
    localStorage.removeItem(key);
  });

  Object.entries(parsed.entries).forEach(([key, value]) => {
    localStorage.setItem(key, value);
  });

  return Object.keys(parsed.entries).length;
}

/**
 * @brief オプションを保存する
 */
export function saveOptions(options: AppOptions): boolean {
  return safeSet(KEYS.options, options);
}

// --- lastOpened ---

export interface LastOpenedInfo {
  id: string;
  name: string;
  source: "system" | "user" | "autosave";
}

/**
 * @brief 最終オープン情報を取得する
 */
export function loadLastOpened(): LastOpenedInfo | null {
  return safeGet<LastOpenedInfo>(KEYS.lastOpened);
}

/**
 * @brief 最終オープン情報を保存する
 */
export function saveLastOpened(info: LastOpenedInfo): boolean {
  return safeSet(KEYS.lastOpened, info);
}
