import { useState } from 'react';
import type { Exercise } from '../types';

interface Props {
  exercises: Exercise[];
  exId: string;
  onSelect: (id: string) => void;
  onAddExercise?: (name: string) => string;
}

export function ExercisePicker({ exercises, exId, onSelect, onAddExercise }: Props) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');

  const save = () => {
    if (!name.trim() || !onAddExercise) return;
    const id = onAddExercise(name);
    onSelect(id);
    setName('');
    setAdding(false);
  };

  return (
    <div className="picker">
      <div className="pickrow">
        <div className="selwrap">
          <select className="exsel" value={exId} onChange={(e) => onSelect(e.target.value)}>
            {exercises.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <span className="selarrow">▾</span>
        </div>
        {onAddExercise && (
          <button className="addbtn" onClick={() => setAdding((a) => !a)} aria-label="Add variation">
            {adding ? '✕' : '+'}
          </button>
        )}
      </div>
      {adding && (
        <div className="addrow">
          <input
            className="txt"
            placeholder="New variation, e.g. Pin Squat"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
            }}
          />
          <button className="btn-sm" onClick={save}>
            Save
          </button>
        </div>
      )}
    </div>
  );
}
