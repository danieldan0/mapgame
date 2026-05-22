import React, { useState } from 'react';
import type { DiceFormula, RuleSettings } from '../../../shared/src/types';
import { DEFAULT_RULE_SETTINGS } from '../../../shared/src/types';

interface RuleSettingsFormProps {
  initialSettings: RuleSettings;
  submitLabel: string;
  onSubmit: (settings: RuleSettings) => void;
  onCancel?: () => void;
}

const row: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '130px 1fr',
  alignItems: 'start',
  gap: 8,
};

export function formatDiceTemplate(f: DiceFormula): string {
  const parts: string[] = [];
  if (f.diePowerFactor !== 0) {
    const pStr = f.diePowerFactor === 1 ? '+power' : `+power×${f.diePowerFactor}`;
    parts.push(`${f.count}d(${f.sides}${pStr})`);
  } else {
    parts.push(`${f.count}d${f.sides}`);
  }
  if (f.bonus !== 0) parts.push(f.bonus > 0 ? `+${f.bonus}` : `${f.bonus}`);
  if (f.bonusPowerFactor !== 0) {
    const abs = Math.abs(f.bonusPowerFactor);
    const sign = f.bonusPowerFactor > 0 ? '+' : '-';
    parts.push(abs === 1 ? `${sign}power` : `${sign}power×${abs}`);
  }
  return parts.join('');
}

function DiceFormulaInput({ label, value, onChange }: {
  label: string;
  value: DiceFormula;
  onChange: (f: DiceFormula) => void;
}) {
  const set = <K extends keyof DiceFormula>(key: K, val: DiceFormula[K]) =>
    onChange({ ...value, [key]: val });

  return (
    <label style={row}>
      <span>{label}</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
          <label style={{ display: 'grid', gap: 2 }}>
            <span style={{ fontSize: '11px', color: '#888' }}>Count</span>
            <input type="number" min={1} max={10} step={1} value={value.count}
              onChange={e => set('count', Number(e.target.value))} />
          </label>
          <label style={{ display: 'grid', gap: 2 }}>
            <span style={{ fontSize: '11px', color: '#888' }}>Sides</span>
            <input type="number" min={2} max={100} step={1} value={value.sides}
              onChange={e => set('sides', Number(e.target.value))} />
          </label>
          <label style={{ display: 'grid', gap: 2 }}>
            <span style={{ fontSize: '11px', color: '#888' }}>Bonus</span>
            <input type="number" min={-20} max={100} step={1} value={value.bonus}
              onChange={e => set('bonus', Number(e.target.value))} />
          </label>
          <label style={{ display: 'grid', gap: 2 }}>
            <span style={{ fontSize: '11px', color: '#888' }}>Die pwr ×</span>
            <input type="number" min={0} max={10} step={0.25} value={value.diePowerFactor}
              onChange={e => set('diePowerFactor', Number(e.target.value))} />
          </label>
          <label style={{ display: 'grid', gap: 2 }}>
            <span style={{ fontSize: '11px', color: '#888' }}>Bonus pwr ×</span>
            <input type="number" min={-10} max={10} step={0.25} value={value.bonusPowerFactor}
              onChange={e => set('bonusPowerFactor', Number(e.target.value))} />
          </label>
        </div>
        <span style={{ fontSize: '11px', color: '#888' }}>{formatDiceTemplate(value)}</span>
      </div>
    </label>
  );
}

export const RuleSettingsForm: React.FC<RuleSettingsFormProps> = ({
  initialSettings,
  submitLabel,
  onSubmit,
  onCancel,
}) => {
  const [draft, setDraft] = useState<RuleSettings>(() => ({
    ...DEFAULT_RULE_SETTINGS,
    ...initialSettings,
    expandRoll: { ...DEFAULT_RULE_SETTINGS.expandRoll, ...initialSettings.expandRoll },
    attackRoll: { ...DEFAULT_RULE_SETTINGS.attackRoll, ...initialSettings.attackRoll },
    defendRoll: { ...DEFAULT_RULE_SETTINGS.defendRoll, ...initialSettings.defendRoll },
  }));

  const set = <K extends keyof RuleSettings>(key: K, value: RuleSettings[K]) =>
    setDraft(d => ({ ...d, [key]: value }));

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <fieldset style={{ border: '1px solid #888', borderRadius: 4, padding: '8px 12px' }}>
        <legend style={{ padding: '0 6px', fontWeight: 600 }}>Dice rolls</legend>
        <div style={{ display: 'grid', gap: 10 }}>
          <DiceFormulaInput label="Expand roll" value={draft.expandRoll} onChange={v => set('expandRoll', v)} />
          <DiceFormulaInput label="Attack roll" value={draft.attackRoll} onChange={v => set('attackRoll', v)} />
          <DiceFormulaInput label="Defend roll" value={draft.defendRoll} onChange={v => set('defendRoll', v)} />
        </div>
      </fieldset>

      <fieldset style={{ border: '1px solid #888', borderRadius: 4, padding: '8px 12px' }}>
        <legend style={{ padding: '0 6px', fontWeight: 600 }}>Costs</legend>
        <div style={{ display: 'grid', gap: 8 }}>
          <label style={row}>
            Land claim cost
            <input type="number" min={0} max={20} step={1} value={draft.claimCost}
              onChange={e => set('claimCost', Number(e.target.value))} />
          </label>
          <label style={row}>
            City claim cost
            <input type="number" min={0} max={20} step={1} value={draft.cityCost}
              onChange={e => set('cityCost', Number(e.target.value))} />
          </label>
          <label style={row}>
            Sea travel cost
            <input type="number" min={0} max={20} step={1} value={draft.seaTravelCost}
              onChange={e => set('seaTravelCost', Number(e.target.value))} />
          </label>
        </div>
      </fieldset>

      <fieldset style={{ border: '1px solid #888', borderRadius: 4, padding: '8px 12px' }}>
        <legend style={{ padding: '0 6px', fontWeight: 600 }}>Other</legend>
        <div style={{ display: 'grid', gap: 8 }}>
          <label style={row}>
            Power per city
            <input type="number" min={0} max={20} step={1} value={draft.powerPerCity}
              onChange={e => set('powerPerCity', Number(e.target.value))} />
          </label>
          <label style={row}>
            Max encircle area
            <input type="number" min={1} max={50} step={1} value={draft.maxEncircledArea}
              onChange={e => set('maxEncircledArea', Number(e.target.value))} />
          </label>
        </div>
      </fieldset>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => onSubmit(draft)} style={{ padding: '5px 14px' }}>{submitLabel}</button>
        {onCancel && <button onClick={onCancel} style={{ padding: '5px 14px' }}>Cancel</button>}
      </div>
    </div>
  );
};
