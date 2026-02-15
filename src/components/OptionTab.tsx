"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { useApp } from "@/context/AppContext";
import { t } from "@/lib/i18n";
import { PATTERNS, getPattern } from "@/lib/audio";
import { createChordToken } from "@/lib/music";
import { SYSTEM_PRESETS } from "@/lib/presets";
import {
  buildBarNotationModel,
  buildVexVoiceData,
  generateResolvedBarNotesFromChords,
} from "@/lib/patternRender";
import {
  exportStorageMigrationData,
  importStorageMigrationData,
  loadAutosave,
  loadLastOpened,
  loadOptions,
  loadUserPresets,
} from "@/lib/storage";

function buildMigrationFilename(date: Date = new Date()): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `piascore-${year}-${month}-${day}.dat`;
}

/**
 * @brief Optionタブ - 各種設定画面
 */
export function OptionTab() {
  const { state, dispatch } = useApp();
  const { options, progression } = state;
  const lang = options.language;

  const [showPatternPanel, setShowPatternPanel] = useState(false);
  const [patternHand, setPatternHand] = useState<"L" | "R">("R");

  // テンポ計測用
  const tapTimesRef = useRef<number[]>([]);
  const [tempoInput, setTempoInput] = useState(String(options.tempo));
  const importInputRef = useRef<HTMLInputElement>(null);
  const [migrationStatus, setMigrationStatus] = useState("");

  useEffect(() => {
    setTempoInput(String(options.tempo));
  }, [options.tempo]);

  /**
   * @brief オプション値を更新する
   */
  const updateOption = useCallback(<K extends keyof typeof options>(key: K, value: (typeof options)[K]) => {
    const update = { [key]: value } as Partial<typeof options>;
    // 左右ロックON時は両手同じパターンにする
    if (key === "rightPatternId" && options.leftRightLock) {
      update.leftPatternId = value as string;
    }
    if (key === "leftPatternId" && options.leftRightLock) {
      update.rightPatternId = value as string;
    }
    dispatch({ type: "SET_OPTIONS", options: update });

    // テンポ変更は再生状態にも反映
    if (key === "tempo") {
      dispatch({ type: "SET_PLAYBACK", playback: { tempo: value as number } });
    }
  }, [dispatch, options.leftRightLock]);

  /**
   * @brief テンポをテキスト入力で変更する
   */
  const handleTempoChange = useCallback((value: string) => {
    setTempoInput(value);
    const num = parseInt(value, 10);
    if (!isNaN(num) && num >= 30 && num <= 300) {
      updateOption("tempo", num);
    }
  }, [updateOption]);

  /**
   * @brief テンポ計測（タップ間隔の平均値）
   */
  const handleTapTempo = useCallback(() => {
    const now = performance.now();
    const taps = tapTimesRef.current;

    // 3秒以上空いたらリセット
    if (taps.length > 0 && now - taps[taps.length - 1] > 3000) {
      tapTimesRef.current = [now];
      return;
    }

    taps.push(now);

    if (taps.length >= 2) {
      // 平均間隔を算出
      let totalInterval = 0;
      for (let i = 1; i < taps.length; i++) {
        totalInterval += taps[i] - taps[i - 1];
      }
      const avgInterval = totalInterval / (taps.length - 1);
      const bpm = Math.floor(60000 / avgInterval);
      const clampedBpm = Math.max(30, Math.min(300, bpm));
      updateOption("tempo", clampedBpm);
      setTempoInput(String(clampedBpm));
    }

    // 最大8タップまで保持
    if (taps.length > 8) {
      tapTimesRef.current = taps.slice(-8);
    }
  }, [updateOption]);

  /**
   * @brief localStorageから状態を再同期する
   */
  const syncStateFromStorage = useCallback(() => {
    const importedOptions = loadOptions();
    const importedPresets = loadUserPresets();
    const importedLastOpened = loadLastOpened();

    dispatch({ type: "SET_OPTIONS", options: importedOptions });
    dispatch({
      type: "SET_PLAYBACK",
      playback: {
        tempo: importedOptions.tempo,
        isPlaying: false,
        currentBeat: 0,
      },
    });
    dispatch({ type: "SET_USER_PRESETS", presets: importedPresets });
    dispatch({ type: "SET_LAST_OPENED", info: importedLastOpened });

    if (!importedLastOpened) return;

    if (importedLastOpened.source === "autosave") {
      const autosave = loadAutosave();
      if (autosave) {
        dispatch({ type: "SET_PROGRESSION", progression: autosave.progression });
        dispatch({ type: "SET_KEY", key: autosave.matrixKey });
      }
      return;
    }

    const sourcePresets = importedLastOpened.source === "system" ? SYSTEM_PRESETS : importedPresets;
    const matched = sourcePresets.find((preset) => preset.id === importedLastOpened.id);
    if (!matched) return;

    dispatch({ type: "SET_PROGRESSION", progression: { ...matched.progression, cursor: 0 } });
    dispatch({ type: "SET_KEY", key: matched.matrixKey });
  }, [dispatch]);

  /**
   * @brief 移行ファイルとして現在データを保存する
   */
  const handleExportMigration = useCallback(() => {
    try {
      const { text, count } = exportStorageMigrationData();
      const blob = new Blob([text], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = buildMigrationFilename();
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      setMigrationStatus(t("option.migrationExported", lang, { count: String(count) }));
    } catch {
      setMigrationStatus(t("option.migrationFailed", lang));
    }
  }, [lang]);

  /**
   * @brief インポート用ファイル選択ダイアログを開く
   */
  const handleClickImport = useCallback(() => {
    importInputRef.current?.click();
  }, []);

  /**
   * @brief 移行ファイルを読み込み、データを復元する
   */
  const handleImportMigration = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const count = importStorageMigrationData(text);
      syncStateFromStorage();
      setMigrationStatus(t("option.migrationImported", lang, { count: String(count) }));
    } catch (error) {
      if (error instanceof Error && (error.message === "invalid-json" || error.message === "invalid-format")) {
        setMigrationStatus(t("option.migrationInvalidFile", lang));
      } else {
        setMigrationStatus(t("option.migrationFailed", lang));
      }
    } finally {
      input.value = "";
    }
  }, [lang, syncStateFromStorage]);

  if (showPatternPanel) {
    return (
        <PatternPanel
          hand={patternHand}
          lang={lang}
          beatsPerBar={progression.beatsPerBar}
          onClose={() => setShowPatternPanel(false)}
          currentPatternId={patternHand === "R" ? options.rightPatternId : options.leftPatternId}
          onSelect={(id) => {
          updateOption(patternHand === "R" ? "rightPatternId" : "leftPatternId", id);
          setShowPatternPanel(false);
        }}
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4 paper-bg-scroll">
      {/* 楽譜表示 */}
      <Section title={t("option.notation", lang)}>
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="text-xs block mb-1">{t("option.barsPerRow", lang)}</label>
            <div className="flex flex-wrap gap-1">
              {([2, 4] as const).map((v) => (
                <ToggleButton
                  key={v}
                  active={options.barsPerRow === v}
                  onClick={() => updateOption("barsPerRow", v)}
                  label={String(v)}
                />
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs block mb-1">{t("option.rowCount", lang)}</label>
            <div className="flex flex-wrap gap-1">
              {[1, 2, 3, 4, 5, 6].map((v) => (
                <ToggleButton
                  key={v}
                  active={options.rowCount === v}
                  onClick={() => updateOption("rowCount", v)}
                  label={String(v)}
                />
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs block mb-1">{t("option.pageTurnMode", lang)}</label>
            <div className="flex flex-wrap gap-1">
              {(["follow", "page"] as const).map((v) => (
                <ToggleButton
                  key={v}
                  active={options.pageTurnMode === v}
                  onClick={() => updateOption("pageTurnMode", v)}
                  label={t(v === "follow" ? "option.follow" : "option.page", lang)}
                />
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* 音声トラック */}
      <Section title={t("option.audioTrack", lang)}>
        <div className="flex flex-wrap gap-1">
          {(["none", "both", "left", "right"] as const).map((v) => (
            <ToggleButton
              key={v}
              active={options.audioTrack === v}
              onClick={() => updateOption("audioTrack", v)}
              label={t(
                `option.${
                  v === "none"
                    ? "none"
                    : v === "both"
                      ? "both"
                      : v === "left"
                        ? "leftOnly"
                        : "rightOnly"
                }`,
                lang
              )}
            />
          ))}
        </div>
      </Section>

      {/* メトロノーム音量 */}
      <Section title={t("option.metronomeVolume", lang)}>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={options.metronomeVolume}
          onChange={(e) => updateOption("metronomeVolume", parseFloat(e.target.value))}
          className="w-full"
          aria-label={t("option.metronomeVolume", lang)}
        />
      </Section>

      {/* 演奏パターン */}
      <Section title={t("option.pattern", lang)}>
        <div className="flex items-center gap-4 mb-2">
          <span className="text-xs">{t("option.leftRightLock", lang)}</span>
          <div className="flex gap-1">
            <ToggleButton
              active={options.leftRightLock}
              onClick={() => updateOption("leftRightLock", true)}
              label={t("common.on", lang)}
            />
            <ToggleButton
              active={!options.leftRightLock}
              onClick={() => updateOption("leftRightLock", false)}
              label={t("common.off", lang)}
            />
          </div>
        </div>

        {/* 右手パターン */}
        <div className="mb-2">
          <span className="text-xs">{t("option.rightHand", lang)}</span>
          <button
            onClick={() => { setPatternHand("R"); setShowPatternPanel(true); }}
            className="block w-full mt-1 p-1 box-frame"
            aria-label="右手パターン選択"
          >
            <div className="px-1 text-left text-xs font-bold">
              {lang === "ja" ? getPattern(options.rightPatternId).nameJa : getPattern(options.rightPatternId).name}
            </div>
            <PatternPreview patternId={options.rightPatternId} hand="R" beatsPerBar={progression.beatsPerBar} compact />
          </button>
        </div>

        {/* 左手パターン */}
        <div>
          <span className="text-xs">{t("option.leftHand", lang)}</span>
          <button
            onClick={() => { setPatternHand("L"); setShowPatternPanel(true); }}
            className="block w-full mt-1 p-1 box-frame"
            aria-label="左手パターン選択"
          >
            <div className="px-1 text-left text-xs font-bold">
              {lang === "ja" ? getPattern(options.leftPatternId).nameJa : getPattern(options.leftPatternId).name}
            </div>
            <PatternPreview patternId={options.leftPatternId} hand="L" beatsPerBar={progression.beatsPerBar} compact />
          </button>
        </div>
      </Section>

      {/* テンポ */}
      <Section title={t("option.tempo", lang)}>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={30}
            max={300}
            value={tempoInput}
            onChange={(e) => handleTempoChange(e.target.value)}
            onBlur={() => {
              const num = parseInt(tempoInput, 10);
              if (isNaN(num) || num < 30 || num > 300) {
                setTempoInput(String(options.tempo));
              }
            }}
            className="w-20 px-2 py-1 border border-[var(--border-color)] bg-white text-center"
          />
          <button
            onClick={handleTapTempo}
            className="px-4 py-1 box-frame text-sm font-bold"
            aria-label="テンポ計測"
          >
            {t("option.measure", lang)}
          </button>
        </div>
      </Section>

      {/* 言語 */}
      <Section title={t("option.language", lang)}>
        <div className="flex flex-wrap gap-1">
          {([
            { code: "ja" as const, label: "日本語" },
            { code: "en" as const, label: "English" },
            { code: "zh" as const, label: "中国語" },
          ]).map(({ code, label }) => (
            <ToggleButton
              key={code}
              active={options.language === code}
              onClick={() => updateOption("language", code)}
              label={label}
            />
          ))}
        </div>
      </Section>

      {/* データ移行 */}
      <Section title={t("option.dataMigration", lang)}>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleExportMigration}
            className="px-4 py-2 box-frame text-sm font-bold"
            aria-label={t("option.exportData", lang)}
          >
            {t("option.exportData", lang)}
          </button>
          <button
            onClick={handleClickImport}
            className="px-4 py-2 box-frame text-sm font-bold"
            aria-label={t("option.importData", lang)}
          >
            {t("option.importData", lang)}
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".dat,application/json,text/plain"
            className="hidden"
            onChange={handleImportMigration}
          />
        </div>
        {migrationStatus && (
          <p className="text-xs mt-2" style={{ color: "var(--text-secondary)" }}>
            {migrationStatus}
          </p>
        )}
      </Section>
    </div>
  );
}

/** セクションコンテナ */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-3 box-frame">
      <h3 className="text-sm font-bold mb-2">{title}</h3>
      {children}
    </div>
  );
}

/** トグルボタン */
function ToggleButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-sm font-bold transition-colors ${active ? "box-frame box-frame-fill" : "box-frame"}`}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}

/**
 * @brief 演奏パターンの楽譜プレビュー
 */
function PatternPreview({
  patternId,
  hand,
  beatsPerBar,
  compact = false,
  showBothClefs = false,
}: {
  patternId: string;
  hand: "L" | "R";
  beatsPerBar: 3 | 4;
  compact?: boolean;
  showBothClefs?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    const render = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Vex: any = await import("vexflow");
        const VexModule = Vex.default || Vex;
        const {
          Renderer,
          Stave,
          StaveNote,
          Voice,
          Formatter,
          StaveConnector,
          Beam,
          Dot,
          Tuplet,
        } = VexModule.Flow || VexModule;

        if (disposed || !containerRef.current) return;
        container.innerHTML = "";

        const width = container.clientWidth || 280;
        const logicalWidth = compact ? Math.max(width * 1.7, 340) : Math.max(width * 1.9, 600);
        const height = showBothClefs ? (compact ? 188 : 188) : (compact ? 136 : 170);
        const rowTop = showBothClefs ? (compact ? 14 : 16) : (compact ? 30 : 36);
        const bassOffsetY = compact ? 68 : 74;
        const bars = 2;
        const horizontalPadding = 14;
        const barWidth = Math.floor((logicalWidth - horizontalPadding * 2) / bars);
        const pattern = getPattern(patternId);
        const previewChord = createChordToken("C", "M");

        const renderer = new Renderer(container, Renderer.Backends.SVG);
        renderer.resize(logicalWidth, height);
        const context = renderer.getContext();
        context.setFont("Arial", 10);

        for (let bar = 0; bar < bars; bar++) {
          const x = horizontalPadding + bar * barWidth;
          const y = rowTop;
          const isLastBar = bar === bars - 1;
          const chordsInBar = Array.from({ length: beatsPerBar }, () => ({ ...previewChord }));

          if (showBothClefs) {
            const rightResolved = generateResolvedBarNotesFromChords(
              pattern,
              chordsInBar,
              beatsPerBar,
              "R"
            );
            const leftResolved = generateResolvedBarNotesFromChords(
              pattern,
              chordsInBar,
              beatsPerBar,
              "L"
            );
            const rightModel = buildBarNotationModel(rightResolved, beatsPerBar);
            const leftModel = buildBarNotationModel(leftResolved, beatsPerBar);

            const trebleStave = new Stave(x, y, barWidth);
            if (bar === 0) {
              trebleStave.addClef("treble");
              trebleStave.addTimeSignature(`${beatsPerBar}/4`);
            }
            trebleStave.setContext(context).draw();

            const bassStave = new Stave(x, y + bassOffsetY, barWidth);
            if (bar === 0) {
              bassStave.addClef("bass");
              bassStave.addTimeSignature(`${beatsPerBar}/4`);
            }
            bassStave.setContext(context).draw();

            if (bar === 0) {
              const connector = new StaveConnector(trebleStave, bassStave);
              connector.setType(StaveConnector.type.BRACE);
              connector.setContext(context).draw();
            }

            // 小節線を上下譜表で接続
            const connectorTypes = StaveConnector.type as Record<string, number | undefined>;
            const singleLeft = connectorTypes.SINGLE_LEFT;
            if (singleLeft !== undefined) {
              const leftConnector = new StaveConnector(trebleStave, bassStave);
              leftConnector.setType(singleLeft);
              leftConnector.setContext(context).draw();
            }
            if (isLastBar) {
              const singleRight = connectorTypes.SINGLE_RIGHT;
              if (singleRight !== undefined) {
                const rightConnector = new StaveConnector(trebleStave, bassStave);
                rightConnector.setType(singleRight);
                rightConnector.setContext(context).draw();
              }
            }

            const trebleData = buildVexVoiceData({
              StaveNoteClass: StaveNote,
              BeamClass: Beam,
              DotClass: Dot,
              TupletClass: Tuplet,
              model: rightModel,
              clef: "treble",
              midiShift: 0,
            });
            const bassData = buildVexVoiceData({
              StaveNoteClass: StaveNote,
              BeamClass: Beam,
              DotClass: Dot,
              TupletClass: Tuplet,
              model: leftModel,
              clef: "bass",
              midiShift: 0,
            });

            const trebleVoice = new Voice({ num_beats: beatsPerBar, beat_value: 4 }).setStrict(false);
            trebleVoice.addTickables(trebleData.notes);
            const trebleWidth = Math.max(40, trebleStave.getNoteEndX() - trebleStave.getNoteStartX() - 4);
            new Formatter().joinVoices([trebleVoice]).format([trebleVoice], trebleWidth);
            trebleVoice.draw(context, trebleStave);
            trebleData.beams.forEach((beam: { setContext: (ctx: unknown) => { draw: () => void } }) => beam.setContext(context).draw());
            trebleData.tuplets.forEach((tuplet: { setContext: (ctx: unknown) => { draw: () => void } }) => tuplet.setContext(context).draw());

            const bassVoice = new Voice({ num_beats: beatsPerBar, beat_value: 4 }).setStrict(false);
            bassVoice.addTickables(bassData.notes);
            const bassWidth = Math.max(40, bassStave.getNoteEndX() - bassStave.getNoteStartX() - 4);
            new Formatter().joinVoices([bassVoice]).format([bassVoice], bassWidth);
            bassVoice.draw(context, bassStave);
            bassData.beams.forEach((beam: { setContext: (ctx: unknown) => { draw: () => void } }) => beam.setContext(context).draw());
            bassData.tuplets.forEach((tuplet: { setContext: (ctx: unknown) => { draw: () => void } }) => tuplet.setContext(context).draw());
          } else {
            const clef: "treble" | "bass" = hand === "R" ? "treble" : "bass";
            const stave = new Stave(x, y, barWidth);
            if (bar === 0) {
              stave.addClef(clef);
              stave.addTimeSignature(`${beatsPerBar}/4`);
            }
            stave.setContext(context).draw();
            const resolvedNotes = generateResolvedBarNotesFromChords(
              pattern,
              chordsInBar,
              beatsPerBar,
              hand
            );
            const barModel = buildBarNotationModel(resolvedNotes, beatsPerBar);

            const voiceData = buildVexVoiceData({
              StaveNoteClass: StaveNote,
              BeamClass: Beam,
              DotClass: Dot,
              TupletClass: Tuplet,
              model: barModel,
              clef,
              midiShift: 0,
            });
            const voice = new Voice({ num_beats: beatsPerBar, beat_value: 4 }).setStrict(false);
            voice.addTickables(voiceData.notes);
            const noteWidth = Math.max(40, stave.getNoteEndX() - stave.getNoteStartX() - 4);
            new Formatter().joinVoices([voice]).format([voice], noteWidth);
            voice.draw(context, stave);
            voiceData.beams.forEach((beam: { setContext: (ctx: unknown) => { draw: () => void } }) => beam.setContext(context).draw());
            voiceData.tuplets.forEach((tuplet: { setContext: (ctx: unknown) => { draw: () => void } }) => tuplet.setContext(context).draw());
          }
        }

        const svg = container.querySelector("svg");
        if (svg) {
          const scale = width / logicalWidth;
          svg.setAttribute("viewBox", `0 0 ${logicalWidth} ${height}`);
          svg.setAttribute("preserveAspectRatio", "xMinYMin meet");
          svg.style.width = "100%";
          svg.style.height = `${Math.ceil(height * scale)}px`;
          svg.style.display = "block";
        }
      } catch (e) {
        if (containerRef.current) {
          containerRef.current.innerHTML = "";
        }
      }
    };

    const observer = new ResizeObserver(() => {
      void render();
    });
    observer.observe(container);
    void render();

    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [patternId, hand, beatsPerBar, compact, showBothClefs]);

  return (
    <div
      ref={containerRef}
      className="w-full overflow-x-hidden overflow-y-visible"
      style={{ minHeight: compact ? (showBothClefs ? 116 : 92) : (showBothClefs ? 136 : 114) }}
    />
  );
}

/** パターン選択パネル（全画面表示） */
function PatternPanel({
  hand,
  lang,
  beatsPerBar,
  onClose,
  currentPatternId,
  onSelect,
}: {
  hand: "L" | "R";
  lang: "ja" | "en" | "zh";
  beatsPerBar: 3 | 4;
  onClose: () => void;
  currentPatternId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="h-full flex flex-col paper-bg-scroll">
      <div className="flex justify-end p-4">
        <button
          onClick={onClose}
          className="px-6 py-2 box-frame text-sm font-bold"
          aria-label="閉じる"
        >
          Back
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 space-y-2 pb-4 paper-bg-scroll">
        {PATTERNS.map((pattern) => (
          <button
            key={pattern.id}
            onClick={() => onSelect(pattern.id)}
            className={`block w-full p-1 transition-colors ${
              currentPatternId === pattern.id ? "box-frame box-frame-fill" : "box-frame"
            }`}
            aria-label={`${pattern.nameJa}を選択`}
          >
            <div className="px-1 text-left text-xs font-bold">
              {lang === "ja" ? pattern.nameJa : pattern.name}
            </div>
            <PatternPreview patternId={pattern.id} hand={hand} beatsPerBar={beatsPerBar} compact showBothClefs />
          </button>
        ))}
      </div>
    </div>
  );
}
