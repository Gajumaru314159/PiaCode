"use client";

import React, { createContext, useContext, useReducer, useEffect, useRef, useCallback } from "react";
import { AppOptions, Progression, PlaybackState, SavedProgression } from "@/types/music";
import { createEmptyProgression, createRestToken } from "@/lib/music";
import {
  loadOptions, saveOptions, DEFAULT_OPTIONS, DEFAULT_TEMPO,
  saveAutosave, loadAutosave,
  loadLastOpened, saveLastOpened, LastOpenedInfo,
  loadUserPresets, saveUserPreset, deleteUserPreset,
} from "@/lib/storage";
import { SYSTEM_PRESETS } from "@/lib/presets";

/** タブの種類 */
export type TabId = "edit" | "load" | "play" | "option";

/** アプリの状態 */
export interface AppState {
  currentTab: TabId;
  progression: Progression;
  playback: PlaybackState;
  options: AppOptions;
  userPresets: SavedProgression[];
  showSplash: boolean;
  showSavePanel: boolean;
  currentKey: number; // キーインデックス（0-11）
}

/** アクションの型 */
type Action =
  | { type: "SET_TAB"; tab: TabId }
  | { type: "SET_PROGRESSION"; progression: Progression }
  | { type: "SET_CELL"; index: number; cell: Progression["cells"][0] }
  | { type: "SET_CURSOR"; cursor: number }
  | { type: "SET_BEATS_PER_BAR"; beatsPerBar: 3 | 4 }
  | { type: "CLEAR_PROGRESSION" }
  | { type: "EXPAND_CELLS"; minLength: number }
  | { type: "SET_PLAYBACK"; playback: Partial<PlaybackState> }
  | { type: "SET_OPTIONS"; options: Partial<AppOptions> }
  | { type: "SET_USER_PRESETS"; presets: SavedProgression[] }
  | { type: "HIDE_SPLASH" }
  | { type: "SET_SHOW_SAVE_PANEL"; show: boolean }
  | { type: "SET_KEY"; key: number };

/** 初期状態 */
const initialState: AppState = {
  currentTab: "edit",
  progression: createEmptyProgression(),
  playback: {
    isPlaying: false,
    isLoop: true,
    isMetronomeOn: false,
    currentBeat: 0,
    tempo: DEFAULT_TEMPO,
  },
  options: DEFAULT_OPTIONS,
  userPresets: [],
  showSplash: true,
  showSavePanel: false,
  currentKey: 0,
};

/**
 * @brief 状態のリデューサー
 */
function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_TAB": {
      // Editタブから離れるときに自動保存
      if (state.currentTab === "edit" && action.tab !== "edit") {
        saveAutosave(state.progression, state.currentKey, state.playback.tempo);
      }
      const leavingPlay = state.currentTab === "play" && action.tab !== "play";
      return {
        ...state,
        currentTab: action.tab,
        playback: leavingPlay ? { ...state.playback, isPlaying: false } : state.playback,
      };
    }
    case "SET_PROGRESSION":
      return { ...state, progression: action.progression };
    case "SET_CELL": {
      const cells = [...state.progression.cells];
      cells[action.index] = action.cell;
      const progression = { ...state.progression, cells };
      return { ...state, progression };
    }
    case "SET_CURSOR":
      return {
        ...state,
        progression: { ...state.progression, cursor: action.cursor },
      };
    case "SET_BEATS_PER_BAR":
      return {
        ...state,
        progression: { ...state.progression, beatsPerBar: action.beatsPerBar },
      };
    case "CLEAR_PROGRESSION":
      {
        const clearedCells = Array.from({ length: 8 }, () => createRestToken());
        return {
          ...state,
          progression: {
            beatsPerBar: state.progression.beatsPerBar,
            cells: clearedCells,
            cursor: 0,
            length: clearedCells.length,
          },
          playback: {
            ...state.playback,
            currentBeat: 0,
          },
        };
      }
    case "EXPAND_CELLS": {
      if (state.progression.cells.length >= action.minLength) return state;
      // 8セル（1段）単位で拡張
      const needed = Math.ceil(action.minLength / 8) * 8;
      const extra = needed - state.progression.cells.length;
      const expanded = [
        ...state.progression.cells,
        ...Array.from({ length: extra }, () => createRestToken()),
      ];
      return {
        ...state,
        progression: { ...state.progression, cells: expanded, length: expanded.length },
      };
    }
    case "SET_PLAYBACK":
      return {
        ...state,
        playback: { ...state.playback, ...action.playback },
      };
    case "SET_OPTIONS":
      return {
        ...state,
        options: { ...state.options, ...action.options },
      };
    case "SET_USER_PRESETS":
      return { ...state, userPresets: action.presets };
    case "HIDE_SPLASH":
      return { ...state, showSplash: false };
    case "SET_SHOW_SAVE_PANEL":
      return { ...state, showSavePanel: action.show };
    case "SET_KEY":
      return { ...state, currentKey: action.key };
    default:
      return state;
  }
}

/** コンテキスト */
const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<Action>;
  loadPreset: (preset: SavedProgression) => void;
  savePreset: (name: string) => boolean;
  removePreset: (id: string) => void;
} | null>(null);

/**
 * @brief アプリ全体の状態を提供するプロバイダー
 */
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 初回ロード
  useEffect(() => {
    const opts = loadOptions();
    dispatch({ type: "SET_OPTIONS", options: opts });

    const presets = loadUserPresets();
    dispatch({ type: "SET_USER_PRESETS", presets });

    const last = loadLastOpened();

    if (last) {
      // 前回のデータをロード
      let found: SavedProgression | undefined;
      if (last.source === "system") {
        found = SYSTEM_PRESETS.find((p) => p.id === last.id);
      } else if (last.source === "user") {
        found = presets.find((p) => p.id === last.id);
      } else {
        const auto = loadAutosave();
        if (auto) {
          dispatch({ type: "SET_PROGRESSION", progression: auto.progression });
          dispatch({ type: "SET_KEY", key: auto.matrixKey });
          dispatch({ type: "SET_PLAYBACK", playback: { tempo: auto.tempo, currentBeat: 0 } });
        }
      }
      if (found) {
        dispatch({ type: "SET_PROGRESSION", progression: { ...found.progression } });
        dispatch({ type: "SET_KEY", key: found.matrixKey });
        dispatch({ type: "SET_PLAYBACK", playback: { tempo: found.tempo, currentBeat: 0 } });
      }
    }

    // 2秒後にスプラッシュを非表示
    const splashTimer = setTimeout(() => {
      dispatch({ type: "HIDE_SPLASH" });
      if (last) {
        dispatch({ type: "SET_TAB", tab: "play" });
      } else {
        dispatch({ type: "SET_TAB", tab: "load" });
      }
    }, 2000);

    return () => clearTimeout(splashTimer);
  }, []);

  // 自動保存（5秒ごと）
  useEffect(() => {
    autosaveTimerRef.current = setInterval(() => {
      saveAutosave(state.progression, state.currentKey, state.playback.tempo);
    }, 5000);
    return () => {
      if (autosaveTimerRef.current) clearInterval(autosaveTimerRef.current);
    };
  }, [state.progression, state.currentKey, state.playback.tempo]);

  // オプション変更時に即時保存
  useEffect(() => {
    saveOptions(state.options);
  }, [state.options]);

  /**
   * @brief プリセットをロードする
   */
  const loadPreset = useCallback((preset: SavedProgression) => {
    dispatch({ type: "SET_PROGRESSION", progression: { ...preset.progression, cursor: 0 } });
    dispatch({ type: "SET_KEY", key: preset.matrixKey });
    dispatch({ type: "SET_PLAYBACK", playback: { currentBeat: 0, tempo: preset.tempo } });
    const info: LastOpenedInfo = {
      id: preset.id,
      name: preset.name,
      source: preset.isSystem ? "system" : "user",
    };
    saveLastOpened(info);
    dispatch({ type: "SET_TAB", tab: "play" });
  }, []);

  /**
   * @brief 名前付きプリセットを保存する
   */
  const savePreset = useCallback((name: string): boolean => {
    if (!name.trim() || name.startsWith("system.")) return false;

    const existing = state.userPresets.find((p) => p.name === name);
    const now = new Date().toISOString();
    const preset: SavedProgression = {
      id: existing?.id || `user.${Date.now()}`,
      name,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      progression: { ...state.progression },
      matrixKey: state.currentKey,
      tempo: state.playback.tempo,
    };
    saveUserPreset(preset);
    const presets = loadUserPresets();
    dispatch({ type: "SET_USER_PRESETS", presets });

    const info: LastOpenedInfo = { id: preset.id, name: preset.name, source: "user" };
    saveLastOpened(info);
    return true;
  }, [state.progression, state.currentKey, state.playback.tempo, state.userPresets]);

  /**
   * @brief プリセットを削除する
   */
  const removePreset = useCallback((id: string) => {
    deleteUserPreset(id);
    const presets = loadUserPresets();
    dispatch({ type: "SET_USER_PRESETS", presets });
  }, []);

  return (
    <AppContext.Provider value={{ state, dispatch, loadPreset, savePreset, removePreset }}>
      {children}
    </AppContext.Provider>
  );
}

/**
 * @brief AppContextを使用するフック
 */
export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
