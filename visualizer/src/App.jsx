import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import Scene from './Scene';
import SoulControlPanel from './SoulControlPanel';

function App() {
  const [galaxyData, setGalaxyData] = useState([]);
  const [soulData, setSoulData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Fetch initial galaxy
  useEffect(() => {
    axios.get('http://localhost:8080/api/visualize/galaxy')
      .then(res => {
        setGalaxyData(res.data);
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to load galaxy:", err);
        setLoading(false);
      });
  }, []);

  const handleSoulUpdate = (soulParams) => {
    axios.post('http://localhost:8080/api/visualize/soul', soulParams)
      .then(res => {
        setSoulData(res.data);
      })
      .catch(err => console.error("Soul update failed:", err));
  };

  return (
    <div className="w-full h-full flex relative overflow-hidden bg-[#050505]">
      {/* 3D Canvas Layer */}
      <div className="absolute inset-0 z-0">
        <Canvas camera={{ position: [0, 0, 50], fov: 60 }}>
          <color attach="background" args={['#050505']} />
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} intensity={1} />
          <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
          <OrbitControls makeDefault enableDamping dampingFactor={0.05} />
          
          <Scene galaxyData={galaxyData} soulData={soulData} />
        </Canvas>
      </div>

      {/* UI Overlay Layer */}
      <div className="absolute top-0 left-0 w-full p-4 md:p-6 z-10 pointer-events-none flex justify-between items-start">
        <div className="flex items-center gap-3 backdrop-blur-md bg-white/5 border border-white/10 rounded-2xl p-3 shadow-2xl pointer-events-auto transition-all hover:bg-white/10">
          <img src="/app_icon.png" alt="Coda Logo" className="w-10 h-10 object-contain rounded-xl drop-shadow-lg" />
          <div>
            <h1 className="text-xl md:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 tracking-tight">Coda</h1>
            <p className="text-xs md:text-sm font-medium text-white/50 tracking-widest uppercase">Soul Visualizer</p>
          </div>
        </div>
        {loading && <p className="text-zinc-400 mt-2 ml-4 backdrop-blur-md bg-black/40 px-3 py-1 rounded-full text-xs pointer-events-auto">Initializing Qdrant coordinates...</p>}
      </div>

      {/* Control Panel Layer */}
      <div className="absolute right-6 top-6 z-20 pointer-events-auto">
        <SoulControlPanel onUpdate={handleSoulUpdate} />
      </div>
    </div>
  );
}

export default App;
