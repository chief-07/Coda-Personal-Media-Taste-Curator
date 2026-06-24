import React, { useState } from 'react';

export default function SoulControlPanel({ onUpdate }) {
  const [lovedTitles, setLovedTitles] = useState('');
  const [persona, setPersona] = useState('');
  const [craving, setCraving] = useState('');
  const [reflections, setReflections] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onUpdate({
      current_memory: {
        globalIdentity: persona.split('.').map(s => s.trim()).filter(Boolean),
        categoryProfiles: {
          loved: lovedTitles.split(',').map(s => s.trim()).filter(Boolean)
        },
        recentContext: craving,
        media_reflections: reflections.split('\n').map(s => s.trim()).filter(Boolean)
      }
    });
  };

  return (
    <div className="w-80 bg-zinc-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-2xl">
      <h2 className="text-xl font-bold mb-4 text-white">Soul Terminal</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        
        <div>
          <label className="block text-xs font-semibold text-zinc-400 mb-1 uppercase tracking-wider">Loved Media (comma-separated)</label>
          <input 
            type="text" 
            value={lovedTitles}
            onChange={e => setLovedTitles(e.target.value)}
            className="w-full bg-black/50 border border-white/5 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
            placeholder="e.g. Serial Experiments Lain, Akira"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-zinc-400 mb-1 uppercase tracking-wider">Core Persona / Traits</label>
          <textarea 
            value={persona}
            onChange={e => setPersona(e.target.value)}
            className="w-full bg-black/50 border border-white/5 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
            placeholder="e.g. Loves dark psychological horror."
            rows={2}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-zinc-400 mb-1 uppercase tracking-wider">Personal Reflections</label>
          <textarea 
            value={reflections}
            onChange={e => setReflections(e.target.value)}
            className="w-full bg-black/50 border border-white/5 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
            placeholder="e.g. Akira: Hated the pacing."
            rows={2}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-zinc-400 mb-1 uppercase tracking-wider">Transient Craving</label>
          <input 
            type="text" 
            value={craving}
            onChange={e => setCraving(e.target.value)}
            className="w-full bg-black/50 border border-white/5 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500 transition-colors"
            placeholder="e.g. Something dumb and fun"
          />
        </div>

        <button 
          type="submit"
          className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium py-2 px-4 rounded-lg shadow-lg transition-all active:scale-95"
        >
          Compute Coordinates
        </button>
      </form>
    </div>
  );
}
