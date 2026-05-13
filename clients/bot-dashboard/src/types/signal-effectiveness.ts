export interface SignalEffectivenessEntry {
  /** Edge in percent (already × 100; the UI suffixes with "%"). */
  edge: number;
  withSignal?: { count?: number };
  withoutSignal?: { count?: number };
}

export type SignalEffectivenessMap = Record<string, SignalEffectivenessEntry>;
