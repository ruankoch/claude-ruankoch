import { useState } from 'react';
import type { StoredProgram } from '../program';

interface Props {
  programs: StoredProgram[];
  activeId: string;
  onSelect: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onAddCopy: () => void;
}

export function ProgramPicker({ programs, activeId, onSelect, onRename, onDelete, onAddCopy }: Props) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [armedDel, setArmedDel] = useState<string | null>(null);

  const active = programs.find((p) => p.id === activeId) || programs[0];
  const activeName = active?.name || 'Programme';

  const startRename = (p: StoredProgram) => {
    setEditingId(p.id);
    setDraft(p.name);
  };
  const commitRename = () => {
    if (editingId) onRename(editingId, draft);
    setEditingId(null);
  };
  const armDelete = (id: string) => {
    if (armedDel !== id) {
      setArmedDel(id);
      setTimeout(() => setArmedDel((cur) => (cur === id ? null : cur)), 3000);
      return;
    }
    setArmedDel(null);
    onDelete(id);
  };

  return (
    <div className="progpicker">
      <button className="exsel progpick-btn" onClick={() => setOpen((o) => !o)}>
        <span className="progpick-label">Programme</span>
        <span className="progpick-active">{activeName}</span>
        <span className="selarrow">▾</span>
      </button>

      {open && (
        <div className="progpick-menu">
          {programs.map((p) => (
            <div key={p.id} className="progpick-row">
              {editingId === p.id ? (
                <input
                  className="txt"
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  onBlur={commitRename}
                />
              ) : (
                <button
                  className={'progpick-name' + (p.id === activeId ? ' on' : '')}
                  onClick={() => {
                    onSelect(p.id);
                    setOpen(false);
                  }}
                >
                  {p.id === activeId ? '✓ ' : ''}
                  {p.name}
                </button>
              )}
              {editingId !== p.id && (
                <>
                  <button className="progpick-ico" onClick={() => startRename(p)} aria-label="Rename">
                    ✎
                  </button>
                  {programs.length > 1 && (
                    <button
                      className={'progpick-ico' + (armedDel === p.id ? ' armed' : '')}
                      onClick={() => armDelete(p.id)}
                      aria-label="Delete programme"
                    >
                      {armedDel === p.id ? 'sure?' : '✕'}
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
          <button
            className="progpick-add"
            onClick={() => {
              onAddCopy();
              setOpen(false);
            }}
          >
            ＋ New programme (copy of current)
          </button>
          <div className="foot" style={{ padding: '6px 4px 2px' }}>
            Tap a name to switch · ✎ to rename · copies share the day structure but track
            independently.
          </div>
        </div>
      )}
    </div>
  );
}
