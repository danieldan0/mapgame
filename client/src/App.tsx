import { useState, useEffect } from 'react'
import { Map } from './components/Map.tsx'
import { io } from 'socket.io-client'
import type { PolygonData } from '../../shared/src/types.ts'

const socket = io('http://localhost:3000');

function App() {
  const [selectedPoly, setSelectedPoly] = useState<string | null>(null)
  const [polygons, setPolygons] = useState<PolygonData[]>([])

  useEffect(() => {
    socket.on('mapUpdate', (newMap: PolygonData[]) => {
      setPolygons(newMap);
    });

    return () => {
      socket.off('mapUpdate');
    };
  }, []);

  const handlePolygonClick = (id: string) => {
    setSelectedPoly(id)
    console.log(`Clicked on polygon region: ${id}`)
  }

  const handleRegenerate = () => {
    socket.emit('regenerateMap');
  }

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 20, left: 20, zIndex: 10, background: 'rgba(255, 255, 255, 0.9)', padding: '10px 15px', borderRadius: '6px', color: '#333' }}>
        {selectedPoly ? `Selected Region: ${selectedPoly}` : 'Click a map region to select'}
        <br />
        <button onClick={handleRegenerate} style={{ marginTop: '10px', padding: '5px 10px', cursor: 'pointer' }}>
          Regenerate Map
        </button>
      </div>
      <Map polygons={polygons} onPolygonClick={handlePolygonClick} />
    </div>
  )
}

export default App
