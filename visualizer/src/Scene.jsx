import React, { useMemo, useState } from 'react';
import { Html, Line } from '@react-three/drei';

function Node({ position, color, size = 0.5, tooltipText, glow = false }) {
  const [hovered, setHovered] = useState(false);

  return (
    <group position={position}>
      <mesh 
        onPointerOver={() => setHovered(true)} 
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[size, 32, 32]} />
        <meshStandardMaterial 
          color={color} 
          emissive={color} 
          emissiveIntensity={glow ? 2 : 0.5} 
          transparent
          opacity={0.9}
        />
      </mesh>
      {hovered && (
        <Html distanceFactor={15} center>
          <div className="bg-black/80 backdrop-blur-md text-white text-xs px-3 py-1.5 rounded-md border border-white/20 whitespace-nowrap shadow-xl pointer-events-none">
            {tooltipText}
          </div>
        </Html>
      )}
    </group>
  );
}

export default function Scene({ galaxyData, soulData }) {
  // Scale PCA points to fit nicely in 3D space
  const SCALER = 30;

  // Map media types to colors
  const getColor = (type) => {
    switch (type?.toLowerCase()) {
      case 'anime': return '#60A5FA'; // blue
      case 'movie': return '#C084FC'; // purple
      case 'tv': return '#F472B6'; // pink
      case 'visual novel': return '#34D399'; // emerald
      case 'book': return '#FBBF24'; // amber
      default: return '#9CA3AF'; // gray
    }
  };

  const lines = useMemo(() => {
    if (!soulData || !soulData.soul_coords) return [];
    
    const sPos = [soulData.soul_coords[0]*SCALER, soulData.soul_coords[1]*SCALER, soulData.soul_coords[2]*SCALER];
    const newLines = [];

    // Connect to loved items
    if (soulData.loved_ids) {
      soulData.loved_ids.forEach(id => {
        const target = galaxyData.find(g => g.id === id);
        if (target) {
          const tPos = [target.coords[0]*SCALER, target.coords[1]*SCALER, target.coords[2]*SCALER];
          newLines.push({ points: [sPos, tPos], color: '#FDE047', dashed: true });
        }
      });
    }

    // Connect to craving
    if (soulData.craving_coords) {
      const cPos = [soulData.craving_coords[0]*SCALER, soulData.craving_coords[1]*SCALER, soulData.craving_coords[2]*SCALER];
      newLines.push({ points: [sPos, cPos], color: '#EF4444', dashed: false, lineWidth: 2 });
    }

    return newLines;
  }, [soulData, galaxyData]);

  return (
    <group>
      {/* Media Nodes */}
      {galaxyData.map(node => (
        <Node 
          key={node.id}
          position={[node.coords[0]*SCALER, node.coords[1]*SCALER, node.coords[2]*SCALER]}
          color={getColor(node.media_type)}
          size={0.4}
          tooltipText={<div className="text-center"><strong>{node.title}</strong><br/><span className="text-[10px] text-zinc-400">{node.media_type}</span></div>}
        />
      ))}

      {/* Soul Node & Area */}
      {soulData && soulData.soul_coords && (
        <group position={[soulData.soul_coords[0]*SCALER, soulData.soul_coords[1]*SCALER, soulData.soul_coords[2]*SCALER]}>
          {/* The Soul Core */}
          <Node 
            position={[0, 0, 0]}
            color="#FDE047" // Yellow
            size={0.8}
            glow={true}
            tooltipText="Permanent Soul Anchor"
          />
          {/* The Soul Area of Influence */}
          <mesh>
            <sphereGeometry args={[8, 32, 32]} />
            <meshStandardMaterial 
              color="#FDE047" 
              transparent 
              opacity={0.08} 
              wireframe={false}
              depthWrite={false}
            />
          </mesh>
          <mesh>
            <sphereGeometry args={[8.1, 16, 16]} />
            <meshBasicMaterial 
              color="#FDE047" 
              wireframe={true}
              transparent 
              opacity={0.15} 
            />
          </mesh>
        </group>
      )}

      {/* Craving Node & Area */}
      {soulData && soulData.craving_coords && (
        <group position={[soulData.craving_coords[0]*SCALER, soulData.craving_coords[1]*SCALER, soulData.craving_coords[2]*SCALER]}>
          <Node 
            position={[0,0,0]}
            color="#EF4444" // Red
            size={0.6}
            glow={true}
            tooltipText="Transient Craving"
          />
          <mesh>
            <sphereGeometry args={[4, 32, 32]} />
            <meshStandardMaterial 
              color="#EF4444" 
              transparent 
              opacity={0.06} 
              wireframe={false}
              depthWrite={false}
            />
          </mesh>
          <mesh>
            <sphereGeometry args={[4.1, 16, 16]} />
            <meshBasicMaterial 
              color="#EF4444" 
              wireframe={true}
              transparent 
              opacity={0.1} 
            />
          </mesh>
        </group>
      )}

      {/* Connection Lines */}
      {lines.map((l, i) => (
        <Line 
          key={i} 
          points={l.points} 
          color={l.color} 
          lineWidth={l.lineWidth || 1} 
          dashed={l.dashed}
          dashSize={0.5}
          gapSize={0.5}
          opacity={0.4}
          transparent
        />
      ))}
    </group>
  );
}
