import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { MapPin, Box } from 'lucide-react';

interface WarehouseMapProps {
  locations: any[];
  inventory: any[];
  activeZone: string;
  onBinClick: (loc: any) => void;
  targetLocation?: string; // For highlighting a specific bin (e.g. during picking)
  showOnlyTargetZone?: boolean;
}

const WarehouseMap: React.FC<WarehouseMapProps> = ({ 
  locations = [], 
  inventory = [], 
  activeZone = 'All', 
  onBinClick,
  targetLocation 
}) => {
  
  // 1. Calculate Grid Dimensions
  const { maxX, maxY } = useMemo(() => {
    if (locations.length === 0) return { maxX: 10, maxY: 10 };
    return {
      maxX: Math.max(...locations.map(l => l.x)) + 2,
      maxY: Math.max(...locations.map(l => l.y)) + 2
    };
  }, [locations]);

  // 2. Filter Locations based on Zone
  const filteredLocations = useMemo(() => {
    if (activeZone === 'All') return locations;
    return locations.filter(l => l.zone === activeZone);
  }, [locations, activeZone]);

  // 3. Helper to get bin color based on type/status
  const getBinColor = (loc: any) => {
    // If we are looking for a target (Pick/Putaway), highlight it
    if (targetLocation && loc.location_code === targetLocation) {
      return 'bg-yellow-400 animate-pulse border-yellow-600 shadow-[0_0_20px_rgba(250,204,21,0.6)] z-10 scale-125';
    }
    
    const itemCount = inventory.filter(i => i.location_code === loc.location_code).length;
    
    if (loc.location_type === 'DOCK') return 'bg-slate-300 dark:bg-slate-700 border-slate-400';
    if (itemCount > 0) return 'bg-blue-500 border-blue-600 shadow-lg shadow-blue-500/20'; // Occupied
    return 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 opacity-60'; // Empty
  };

  if (locations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400">
        <MapPin size={48} className="mb-4 opacity-20"/>
        <p>No locations found. Import layout or create bins.</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-auto p-10 bg-slate-100/50 dark:bg-black/20 macos-scrollbar">
      <div 
        className="relative mx-auto transition-all duration-500"
        style={{
          width: `${maxX * 60}px`,
          height: `${maxY * 60}px`,
        }}
      >
        {/* Render Locations */}
        {filteredLocations.map(loc => {
          const isTarget = targetLocation === loc.location_code;
          const hasItems = inventory.some(i => i.location_code === loc.location_code);

          return (
            <motion.div
              key={loc.id}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              whileHover={{ scale: 1.2, zIndex: 50 }}
              onClick={() => onBinClick(loc)}
              className={`absolute w-12 h-12 rounded-lg border-2 cursor-pointer flex items-center justify-center transition-colors ${getBinColor(loc)}`}
              style={{
                left: `${loc.x * 60}px`,
                top: `${loc.y * 60}px`,
              }}
              title={`${loc.location_code} (${loc.location_type})`}
            >
              {isTarget ? (
                <MapPin className="text-yellow-900 animate-bounce" size={24} />
              ) : (
                <span className={`text-[10px] font-bold font-mono ${hasItems ? 'text-white' : 'text-slate-400 dark:text-slate-500'}`}>
                  {loc.location_code.split('-').pop()}
                </span>
              )}
              
              {/* Tooltip-like popup on hover handled by title for now, or add custom UI here */}
            </motion.div>
          );
        })}

        {/* Grid Lines (Optional visual aid) */}
        <svg className="absolute inset-0 pointer-events-none opacity-5" width="100%" height="100%">
          <defs>
            <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="M 60 0 L 0 0 0 60" fill="none" stroke="currentColor" strokeWidth="1"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>
    </div>
  );
};

export default WarehouseMap;