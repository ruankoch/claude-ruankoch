/* Recharts styling shared across chart views. */

export const TT_STYLE = {
  background: '#15181B',
  border: '1px solid #2A2E33',
  borderRadius: 8,
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: 12,
  color: '#EDEDE8',
} as const;

export const TT_LABEL = { color: '#7E858C', marginBottom: 4 } as const;

export const AXIS_TICK = {
  fill: '#7E858C',
  fontSize: 11,
  fontFamily: "'IBM Plex Mono', monospace",
} as const;
