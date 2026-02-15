import { ChordToken, Hand, PlaybackEvent } from "@/types/music";
import { PatternDef, ResolvedPatternNote, TICKS_PER_BEAT } from "./audio";
import { midiToVexKey } from "./music";

/**
 * @brief 譜面用の連符種別
 */
export type TupletKind = "none" | "8t" | "16t";

/**
 * @brief 譜面描画用の分解済みノート
 */
export interface NotationAtom {
  startTick: number;
  durationTick: number;
  midiNotes: number[];
  isRest: boolean;
  duration: string;
  dots: number;
  tuplet: TupletKind;
}

/**
 * @brief 1小節分の譜面モデル
 */
export interface BarNotationModel {
  atoms: NotationAtom[];
  beamGroups: number[][];
  tupletGroups: Array<{ kind: Exclude<TupletKind, "none">; indices: number[] }>;
  totalTicks: number;
}

/**
 * @brief VexFlow描画用データ
 */
export interface VexVoiceData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  notes: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  beams: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tuplets: any[];
}

const REST_CHORD: ChordToken = {
  root: null,
  quality: null,
  tensions: [],
  bass: null,
  isRest: true,
};

const DUR_MAP: Record<number, { duration: string; dots: number; tuplet: TupletKind }> = {
  48: { duration: "w", dots: 0, tuplet: "none" },
  36: { duration: "h", dots: 1, tuplet: "none" },
  24: { duration: "h", dots: 0, tuplet: "none" },
  18: { duration: "q", dots: 1, tuplet: "none" },
  12: { duration: "q", dots: 0, tuplet: "none" },
  9: { duration: "8", dots: 1, tuplet: "none" },
  6: { duration: "8", dots: 0, tuplet: "none" },
  4: { duration: "8", dots: 0, tuplet: "8t" },
  3: { duration: "16", dots: 0, tuplet: "none" },
  2: { duration: "16", dots: 0, tuplet: "16t" },
  1: { duration: "32", dots: 0, tuplet: "none" },
};

const SPLIT_CANDIDATES = Object.keys(DUR_MAP)
  .map(Number)
  .sort((a, b) => b - a);

/**
 * @brief 指定拍が属する小節先頭拍を返す
 */
export function getBarStartBeat(absoluteBeat: number, beatsPerBar: 3 | 4): number {
  return Math.floor(absoluteBeat / beatsPerBar) * beatsPerBar;
}

/**
 * @brief 小節内コード配列を抽出する
 */
export function extractBarChords(
  cells: ChordToken[],
  barStartBeat: number,
  beatsPerBar: 3 | 4
): ChordToken[] {
  const chords: ChordToken[] = [];
  for (let i = 0; i < beatsPerBar; i++) {
    chords.push(cells[barStartBeat + i] ?? REST_CHORD);
  }
  return chords;
}

/**
 * @brief パターン小節ノートを生成する
 */
export function generateResolvedBarNotes(
  pattern: PatternDef,
  cells: ChordToken[],
  barStartBeat: number,
  beatsPerBar: 3 | 4,
  hand: Hand
): ResolvedPatternNote[] {
  return pattern.generateBar({
    chordsInBar: extractBarChords(cells, barStartBeat, beatsPerBar),
    beatsPerBar,
    hand,
  });
}

/**
 * @brief 既に小節コード配列がある場合のパターン小節ノート生成
 */
export function generateResolvedBarNotesFromChords(
  pattern: PatternDef,
  chordsInBar: ChordToken[],
  beatsPerBar: 3 | 4,
  hand: Hand
): ResolvedPatternNote[] {
  return pattern.generateBar({ chordsInBar, beatsPerBar, hand });
}

/**
 * @brief 小節ノートを再生イベントへ変換する
 */
export function resolvedNotesToPlaybackEvents(
  notes: ResolvedPatternNote[],
  barStartBeat: number
): PlaybackEvent[] {
  return notes
    .filter((n) => n.durationTick > 0 && n.midiNotes.length > 0)
    .map((note) => ({
      atBeat: barStartBeat + note.startTick / TICKS_PER_BEAT,
      durationBeat: note.durationTick / TICKS_PER_BEAT,
      midiNotes: note.midiNotes,
      velocity: note.velocity,
    }))
    .sort((a, b) => a.atBeat - b.atBeat);
}

/**
 * @brief 小節ノートを譜面モデルへ変換する
 */
export function buildBarNotationModel(
  notes: ResolvedPatternNote[],
  beatsPerBar: 3 | 4
): BarNotationModel {
  const totalTicks = beatsPerBar * TICKS_PER_BEAT;
  const normalized = normalizeNotes(notes, totalTicks);
  const timeline = buildTimeline(normalized, totalTicks);

  const atoms: NotationAtom[] = [];
  for (const segment of timeline) {
    const chunks = splitTicks(segment.durationTick);
    let cursor = segment.startTick;
    for (const chunk of chunks) {
      const spec = DUR_MAP[chunk] || DUR_MAP[1];
      atoms.push({
        startTick: cursor,
        durationTick: chunk,
        midiNotes: segment.midiNotes,
        isRest: segment.midiNotes.length === 0,
        duration: spec.duration,
        dots: spec.dots,
        tuplet: spec.tuplet,
      });
      cursor += chunk;
    }
  }

  return {
    atoms,
    beamGroups: collectBeamGroups(atoms, totalTicks),
    tupletGroups: collectTupletGroups(atoms, totalTicks),
    totalTicks,
  };
}

/**
 * @brief 譜面モデルからVexFlow描画データを生成する
 */
export function buildVexVoiceData(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  StaveNoteClass: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  BeamClass: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  DotClass: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TupletClass: any;
  model: BarNotationModel;
  clef: "treble" | "bass";
  midiShift: number;
}): VexVoiceData {
  const {
    StaveNoteClass,
    BeamClass,
    DotClass,
    TupletClass,
    model,
    clef,
    midiShift,
  } = params;

  const restKey = clef === "bass" ? "d/3" : "b/4";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const notes: any[] = model.atoms.map((atom) => {
    const keys = atom.isRest
      ? [restKey]
      : atom.midiNotes.map((midi) => midiToVexKey(midi + midiShift));
    const duration = atom.isRest ? `${atom.duration}r` : atom.duration;
    const note = new StaveNoteClass({ keys, duration, dots: atom.dots, clef });
    for (let i = 0; i < atom.dots; i++) {
      DotClass.buildAndAttach([note], { all: true });
    }
    return note;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const beams: any[] = [];
  for (const group of model.beamGroups) {
    if (group.length < 2) continue;
    beams.push(new BeamClass(group.map((idx) => notes[idx])));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tuplets: any[] = [];
  for (const group of model.tupletGroups) {
    if (group.indices.length !== 3) continue;
    tuplets.push(new TupletClass(group.indices.map((idx) => notes[idx]), {
      num_notes: 3,
      notes_occupied: 2,
    }));
  }

  return { notes, beams, tuplets };
}

interface TimelineSegment {
  startTick: number;
  durationTick: number;
  midiNotes: number[];
}

function normalizeNotes(notes: ResolvedPatternNote[], totalTicks: number): ResolvedPatternNote[] {
  return notes
    .map((note) => {
      const startTick = Math.max(0, Math.floor(note.startTick));
      const durationTick = Math.max(0, Math.floor(note.durationTick));
      const endTick = Math.min(totalTicks, startTick + durationTick);
      return {
        startTick,
        durationTick: Math.max(0, endTick - startTick),
        midiNotes: note.midiNotes,
        velocity: note.velocity,
      };
    })
    .filter((note) => note.durationTick > 0 && note.startTick < totalTicks)
    .sort((a, b) => a.startTick - b.startTick || b.durationTick - a.durationTick);
}

function buildTimeline(notes: ResolvedPatternNote[], totalTicks: number): TimelineSegment[] {
  const segments: TimelineSegment[] = [];
  const startMap = new Map<number, ResolvedPatternNote[]>();
  for (const note of notes) {
    if (!startMap.has(note.startTick)) {
      startMap.set(note.startTick, []);
    }
    startMap.get(note.startTick)!.push(note);
  }

  const starts = Array.from(startMap.keys()).sort((a, b) => a - b);
  let startIdx = 0;
  let cursor = 0;

  while (cursor < totalTicks) {
    while (startIdx < starts.length && starts[startIdx] < cursor) {
      startIdx++;
    }

    const isEventStart = startIdx < starts.length && starts[startIdx] === cursor;
    if (!isEventStart) {
      const nextStart = startIdx < starts.length ? starts[startIdx] : totalTicks;
      if (nextStart > cursor) {
        segments.push({ startTick: cursor, durationTick: nextStart - cursor, midiNotes: [] });
      }
      cursor = nextStart;
      continue;
    }

    const events = startMap.get(cursor) || [];
    const nextStart = startIdx + 1 < starts.length ? starts[startIdx + 1] : totalTicks;
    const maxEnd = events.reduce((max, ev) => Math.max(max, ev.startTick + ev.durationTick), cursor);
    const endTick = Math.max(cursor + 1, Math.min(totalTicks, maxEnd, nextStart));

    const midiSet = new Set<number>();
    for (const event of events) {
      for (const midi of event.midiNotes) {
        midiSet.add(midi);
      }
    }

    segments.push({
      startTick: cursor,
      durationTick: endTick - cursor,
      midiNotes: Array.from(midiSet.values()).sort((a, b) => a - b),
    });

    cursor = endTick;
  }

  return segments;
}

function splitTicks(ticks: number): number[] {
  if (ticks <= 0) return [];

  const memo = new Map<number, number[] | null>();

  const solve = (remain: number): number[] | null => {
    if (remain === 0) return [];
    if (memo.has(remain)) return memo.get(remain)!;

    for (const unit of SPLIT_CANDIDATES) {
      if (unit > remain) continue;
      const tail = solve(remain - unit);
      if (tail) {
        const result = [unit, ...tail];
        memo.set(remain, result);
        return result;
      }
    }

    memo.set(remain, null);
    return null;
  };

  const result = solve(ticks);
  if (!result) {
    return [ticks];
  }
  return result;
}

function collectTupletGroups(
  atoms: NotationAtom[],
  totalTicks: number
): Array<{ kind: Exclude<TupletKind, "none">; indices: number[] }> {
  const groups: Array<{ kind: Exclude<TupletKind, "none">; indices: number[] }> = [];

  const configs: Array<{ kind: Exclude<TupletKind, "none">; unit: number; window: number }> = [
    { kind: "8t", unit: 4, window: 12 },
    { kind: "16t", unit: 2, window: 6 },
  ];

  for (const config of configs) {
    for (let windowStart = 0; windowStart < totalTicks; windowStart += config.window) {
      const candidates = atoms
        .map((atom, idx) => ({ atom, idx }))
        .filter(({ atom }) => {
          if (atom.isRest) return false;
          if (atom.tuplet !== config.kind) return false;
          if (atom.durationTick !== config.unit) return false;
          if (atom.startTick < windowStart) return false;
          return atom.startTick < windowStart + config.window;
        })
        .sort((a, b) => a.atom.startTick - b.atom.startTick);

      if (candidates.length < 3) continue;

      for (let i = 0; i <= candidates.length - 3; i++) {
        const a = candidates[i];
        const b = candidates[i + 1];
        const c = candidates[i + 2];
        if (
          b.atom.startTick === a.atom.startTick + config.unit &&
          c.atom.startTick === b.atom.startTick + config.unit
        ) {
          groups.push({ kind: config.kind, indices: [a.idx, b.idx, c.idx] });
          i += 2;
        }
      }
    }
  }

  return groups;
}

function collectBeamGroups(atoms: NotationAtom[], totalTicks: number): number[][] {
  const groups: number[][] = [];

  for (let beatStart = 0; beatStart < totalTicks; beatStart += TICKS_PER_BEAT) {
    const beatItems = atoms
      .map((atom, idx) => ({ atom, idx }))
      .filter(({ atom }) => {
        if (atom.isRest) return false;
        if (atom.startTick < beatStart) return false;
        if (atom.startTick >= beatStart + TICKS_PER_BEAT) return false;
        return atom.durationTick <= 6;
      })
      .sort((a, b) => a.atom.startTick - b.atom.startTick);

    if (beatItems.length < 2) continue;

    const block: number[] = [beatItems[0].idx];
    for (let i = 1; i < beatItems.length; i++) {
      const prev = beatItems[i - 1].atom;
      const cur = beatItems[i].atom;
      const contiguous = cur.startTick <= prev.startTick + prev.durationTick;
      if (contiguous) {
        block.push(beatItems[i].idx);
      } else {
        if (block.length >= 2) groups.push([...block]);
        block.length = 0;
        block.push(beatItems[i].idx);
      }
    }
    if (block.length >= 2) groups.push([...block]);
  }

  return groups;
}
