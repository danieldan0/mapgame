import { useState } from 'react'
import { Map, type PolygonData } from './components/Map.tsx'

const MOCK_POLYGONS: PolygonData[] = [
  {
    id: 'region-1',
    points: [100, 100, 300, 50, 400, 200, 250, 350, 50, 250],
    terrainColor: 0x228B22,
  },
  {
    id: 'region-2',
    points: [400, 200, 600, 150, 700, 300, 550, 450, 250, 350],
    terrainColor: 0xDEB887,
    ownerColor: 0xFF4500,
  },
  {
    id: 'region-3',
    points: [50, 250, 250, 350, 150, 550, -50, 450],
    terrainColor: 0x4682B4,
  }
]

function App() {
  const [selectedPoly, setSelectedPoly] = useState<string | null>(null)

  const handlePolygonClick = (id: string) => {
    setSelectedPoly(id)
    console.log(`Clicked on polygon region: ${id}`)
  }

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 20, left: 20, zIndex: 10, background: 'rgba(255, 255, 255, 0.9)', padding: '10px 15px', borderRadius: '6px', color: '#333' }}>
        {selectedPoly ? `Selected Region: ${selectedPoly}` : 'Click a map region to select'}
      </div>
      <Map polygons={MOCK_POLYGONS} onPolygonClick={handlePolygonClick} />
    </div>
  )
}

export default App
