import { plateBreakdown } from '../derive';
import type { Units } from '../types';

interface Props {
  total: number;
  units: Units;
  collars: boolean;
}

export function PlateStrip({ total, units, collars }: Props) {
  const bd = plateBreakdown(total, units, collars);
  if (!bd) return null;
  return (
    <div className="platestrip">
      <span className="plates-label">{collars ? 'per side · collars on' : 'per side'}</span>
      <div className="plates">
        {bd.plates.length === 0 && (
          <span className="plates-empty">{collars ? 'bar + collars' : 'empty bar'}</span>
        )}
        {bd.plates.map((p, i) => (
          <span
            key={i}
            className="platechip"
            style={{ background: p.c, color: p.tc, height: p.h }}
          >
            {p.w}
          </span>
        ))}
        {bd.remainder > 0 && <span className="plates-rem">+{bd.remainder}</span>}
      </div>
    </div>
  );
}
