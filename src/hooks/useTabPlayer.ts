"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TabData, FlatColumn, flattenTab } from "@/utils/tab";
import { TabPlayer, PlayerState, NoteValue, ClickMode, BeatInfo } from "@/utils/audio/player";
import { getGuitarSynth } from "@/utils/audio/synth";

export interface UseTabPlayerOptions {
  /** Quarter-note tempo to start with. */
  defaultBpm?: number;
  defaultLoop?: boolean;
  /** What each tab note is worth: 4 = quarter, 8 = eighth, 16 = sixteenth. */
  defaultNoteValue?: NoteValue;
  defaultClick?: ClickMode;
}

export interface TabPlayerControls {
  state: PlayerState;
  /** Column currently sounding / selected, or null. */
  position: number | null;
  /** The beat that just started (visual metronome), or null when not playing. */
  beat: BeatInfo | null;
  columns: FlatColumn[];
  bpm: number;
  setBpm: (bpm: number) => void;
  loop: boolean;
  setLoop: (loop: boolean) => void;
  noteValue: NoteValue;
  setNoteValue: (v: NoteValue) => void;
  click: ClickMode;
  setClick: (m: ClickMode) => void;
  countIn: boolean;
  setCountIn: (v: boolean) => void;
  volume: number;
  setVolume: (v: number) => void;
  /** Metronome level relative to the guitar, 0–1. */
  clickVolume: number;
  setClickVolume: (v: number) => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  toggle: () => void;
  /** Move the playhead; when not playing, also sounds that column. */
  seek: (index: number, preview?: boolean) => void;
  /** Sound a column without moving the playhead. */
  preview: (index: number) => void;
  supported: boolean;
}

/**
 * Drives a TabPlayer for a piece of tab. One player per tab view; all of them share
 * the app-wide GuitarSynth (and therefore one AudioContext).
 */
export function useTabPlayer(tab: TabData, options: UseTabPlayerOptions = {}): TabPlayerControls {
  const { defaultBpm = 100, defaultLoop = false, defaultNoteValue = 4, defaultClick = "off" } = options;
  const playerRef = useRef<TabPlayer | null>(null);
  const [state, setState] = useState<PlayerState>("stopped");
  const [position, setPosition] = useState<number | null>(null);
  const [beat, setBeat] = useState<BeatInfo | null>(null);
  const [bpm, setBpmState] = useState(defaultBpm);
  const [loop, setLoopState] = useState(defaultLoop);
  const [noteValue, setNoteValueState] = useState<NoteValue>(defaultNoteValue);
  const [click, setClickState] = useState<ClickMode>(defaultClick);
  const [countIn, setCountInState] = useState(true);
  const [volume, setVolumeState] = useState(0.8);
  const [clickVolume, setClickVolumeState] = useState(0.7);
  const [supported, setSupported] = useState(true);

  const getPlayer = useCallback(() => {
    if (!playerRef.current) {
      playerRef.current = new TabPlayer(
        getGuitarSynth(),
        { onState: setState, onPosition: setPosition, onBeat: setBeat },
        { bpm: defaultBpm, loop: defaultLoop, noteValue: defaultNoteValue, click: defaultClick, countIn: true },
      );
    }
    return playerRef.current;
  }, [defaultBpm, defaultLoop, defaultNoteValue, defaultClick]);

  useEffect(() => {
    setSupported(typeof window === "undefined" ? true : !!(window.AudioContext || (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext));
    setVolumeState(getGuitarSynth().getVolume());
    setClickVolumeState(getGuitarSynth().getClickVolume());
  }, []);

  // Keep the player in sync with the tab being shown.
  useEffect(() => {
    getPlayer().setTab(tab);
  }, [tab, getPlayer]);

  // Stop the music when the view goes away.
  useEffect(() => {
    return () => {
      playerRef.current?.dispose();
      playerRef.current = null;
    };
  }, []);

  const setBpm = useCallback(
    (value: number) => {
      getPlayer().setBpm(value);
      setBpmState(getPlayer().getBpm());
    },
    [getPlayer],
  );

  const setLoop = useCallback(
    (value: boolean) => {
      getPlayer().setLoop(value);
      setLoopState(value);
    },
    [getPlayer],
  );

  const setNoteValue = useCallback(
    (value: NoteValue) => {
      getPlayer().setNoteValue(value);
      setNoteValueState(value);
    },
    [getPlayer],
  );

  const setClick = useCallback(
    (mode: ClickMode) => {
      getPlayer().setClick(mode);
      setClickState(mode);
    },
    [getPlayer],
  );

  const setCountIn = useCallback(
    (value: boolean) => {
      getPlayer().setCountIn(value);
      setCountInState(value);
    },
    [getPlayer],
  );

  const setVolume = useCallback((value: number) => {
    getGuitarSynth().setVolume(value);
    setVolumeState(value);
  }, []);

  const setClickVolume = useCallback((value: number) => {
    getGuitarSynth().setClickVolume(value);
    setClickVolumeState(value);
  }, []);

  const play = useCallback(() => {
    void getPlayer().play();
  }, [getPlayer]);
  const pause = useCallback(() => getPlayer().pause(), [getPlayer]);
  const stop = useCallback(() => getPlayer().stop(), [getPlayer]);
  const toggle = useCallback(() => {
    void getPlayer().toggle();
  }, [getPlayer]);
  const preview = useCallback(
    (index: number) => {
      void getPlayer().preview(index);
    },
    [getPlayer],
  );
  const seek = useCallback(
    (index: number, doPreview = true) => {
      const player = getPlayer();
      player.seek(index);
      if (doPreview && player.getState() !== "playing") void player.preview(index);
    },
    [getPlayer],
  );

  const columns = useMemo(() => flattenTab(tab), [tab]);

  return {
    state, position, beat, columns,
    bpm, setBpm, loop, setLoop, noteValue, setNoteValue, click, setClick, countIn, setCountIn, volume, setVolume, clickVolume, setClickVolume,
    play, pause, stop, toggle, seek, preview, supported,
  };
}
