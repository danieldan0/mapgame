import React, { useState } from 'react';
import type { MapSettings } from '../../../shared/src/types';
import { DEFAULT_MAP_SETTINGS } from '../../../shared/src/types';

interface MapSettingsFormProps {
  initialSettings: MapSettings;
  submitLabel: string;
  onSubmit: (settings: MapSettings) => void;
  onCancel?: () => void;
}

const row: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '160px 1fr',
  alignItems: 'center',
  gap: 8,
};

function randomSeed() {
  return Math.floor(Math.random() * 1_000_000);
}

export const MapSettingsForm: React.FC<MapSettingsFormProps> = ({
  initialSettings,
  submitLabel,
  onSubmit,
  onCancel,
}) => {
  const [draft, setDraft] = useState<MapSettings>(() => ({
    ...DEFAULT_MAP_SETTINGS,
    ...initialSettings,
    seed: initialSettings.seed ?? randomSeed(),
  }));

  const set = <K extends keyof MapSettings>(key: K, value: MapSettings[K]) =>
    setDraft(d => ({ ...d, [key]: value }));

  const handleSubmit = () => {
    onSubmit(draft);
  };

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <fieldset style={{ border: '1px solid #888', borderRadius: 4, padding: '8px 12px' }}>
        <legend style={{ padding: '0 6px', fontWeight: 600 }}>Map size</legend>
        <div style={{ display: 'grid', gap: 8 }}>
          <label style={row}>
            Width
            <input type="number" min={500} max={5000} step={100} value={draft.width}
              onChange={e => set('width', Number(e.target.value))} />
          </label>
          <label style={row}>
            Height
            <input type="number" min={500} max={5000} step={100} value={draft.height}
              onChange={e => set('height', Number(e.target.value))} />
          </label>
          <div style={row}>
            Seed
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="number" min={0} max={999999} step={1}
                value={draft.seed ?? 0}
                onChange={e => set('seed', Number(e.target.value))} />
              <button type="button" onClick={() => set('seed', randomSeed())} style={{ padding: '2px 8px' }}>
                Randomize
              </button>
            </span>
          </div>
        </div>
      </fieldset>

      <fieldset style={{ border: '1px solid #888', borderRadius: 4, padding: '8px 12px' }}>
        <legend style={{ padding: '0 6px', fontWeight: 600 }}>Terrain</legend>
        <div style={{ display: 'grid', gap: 8 }}>
          <label style={row}>
            Sea level
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="range" min={0.1} max={0.9} step={0.01} value={draft.seaLevel}
                onChange={e => set('seaLevel', Number(e.target.value))} />
              {Math.round(draft.seaLevel * 100)}%
            </span>
          </label>
          <label style={row}>
            Continent scale
            <input type="number" min={100} max={3000} step={50} value={draft.noiseWavelength}
              onChange={e => set('noiseWavelength', Number(e.target.value))} />
          </label>
          <label style={row}>
            Detail levels
            <input type="number" min={1} max={10} step={1} value={draft.noiseOctaves}
              onChange={e => set('noiseOctaves', Number(e.target.value))} />
          </label>
          <label style={row}>
            Roughness
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="range" min={0.1} max={0.9} step={0.05} value={draft.noisePersistence}
                onChange={e => set('noisePersistence', Number(e.target.value))} />
              {draft.noisePersistence.toFixed(2)}
            </span>
          </label>
          <label style={row}>
            Detail scale
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="range" min={1.5} max={3.5} step={0.1} value={draft.noiseLacunarity}
                onChange={e => set('noiseLacunarity', Number(e.target.value))} />
              {draft.noiseLacunarity.toFixed(1)}×
            </span>
          </label>
        </div>
      </fieldset>

      <fieldset style={{ border: '1px solid #888', borderRadius: 4, padding: '8px 12px' }}>
        <legend style={{ padding: '0 6px', fontWeight: 600 }}>Tiles &amp; cities</legend>
        <div style={{ display: 'grid', gap: 8 }}>
          <label style={row}>
            Land tile size
            <input type="number" min={15} max={150} step={1} value={draft.landTileSize}
              onChange={e => set('landTileSize', Number(e.target.value))} />
          </label>
          <label style={row}>
            Sea tile size
            <input type="number" min={15} max={300} step={1} value={draft.seaTileSize}
              onChange={e => set('seaTileSize', Number(e.target.value))} />
          </label>
          <label style={row}>
            Max cities
            <input type="number" min={0} max={50} step={1} value={draft.maxCities}
              onChange={e => set('maxCities', Number(e.target.value))} />
          </label>
          <label style={row}>
            City spacing
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="range" min={0.02} max={0.4} step={0.01} value={draft.cityMinDistRatio}
                onChange={e => set('cityMinDistRatio', Number(e.target.value))} />
              {Math.round(draft.cityMinDistRatio * 100)}%
            </span>
          </label>
        </div>
      </fieldset>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleSubmit} style={{ padding: '5px 14px' }}>{submitLabel}</button>
        {onCancel && <button onClick={onCancel} style={{ padding: '5px 14px' }}>Cancel</button>}
      </div>
    </div>
  );
};
