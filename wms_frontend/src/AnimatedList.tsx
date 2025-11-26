import React, { useRef, useEffect, useState } from 'react';

interface AnimatedListProps<T> {
  items: T[];
  onItemSelect: (item: T, index: number) => void;
  showGradients?: boolean;
  enableArrowNavigation?: boolean;
  displayScrollbar?: boolean;
  className?: string;
  // Optional custom renderer. If not provided, tries to render item as string.
  renderItem?: (item: T, isSelected: boolean, index: number) => React.ReactNode;
}

export default function AnimatedList<T>({
  items,
  onItemSelect,
  showGradients = true,
  enableArrowNavigation = true,
  displayScrollbar = true,
  className = "",
  renderItem
}: AnimatedListProps<T>) {
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Reset selection when items change
  useEffect(() => {
    setSelectedIndex(-1);
  }, [items]);

  // Keyboard Navigation
  useEffect(() => {
    if (!enableArrowNavigation) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (items.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => {
          const next = prev < items.length - 1 ? prev + 1 : prev;
          scrollToItem(next);
          return next;
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => {
          const next = prev > 0 ? prev - 1 : 0;
          scrollToItem(next);
          return next;
        });
      } else if (e.key === 'Enter' && selectedIndex !== -1) {
        e.preventDefault();
        onItemSelect(items[selectedIndex], selectedIndex);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [items, selectedIndex, enableArrowNavigation, onItemSelect]);

  const scrollToItem = (index: number) => {
    const el = itemRefs.current[index];
    if (el && listRef.current) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  return (
    <div className={`relative flex-1 h-full overflow-hidden ${className}`}>
      {/* Top Gradient Mask */}
      {showGradients && (
        <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-slate-900 to-transparent z-10 pointer-events-none" />
      )}

      {/* Scrollable List */}
      <div 
        ref={listRef}
        className={`h-full overflow-y-auto p-2 space-y-2 ${displayScrollbar ? 'macos-scrollbar' : 'no-scrollbar'}`}
      >
        {items.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 opacity-50">
                <p className="text-sm">List is empty</p>
            </div>
        )}
        
        {items.map((item, index) => {
          const isSelected = index === selectedIndex;
          return (
            <div
              key={index}
              ref={el => itemRefs.current[index] = el}
              onClick={() => {
                setSelectedIndex(index);
                onItemSelect(item, index);
              }}
              className={`transition-all duration-200 ease-out transform cursor-pointer
                ${isSelected ? 'scale-[1.02] z-10' : 'hover:scale-[1.01]'}
              `}
            >
              {renderItem ? (
                renderItem(item, isSelected, index)
              ) : (
                // Default Fallback Rendering
                <div className={`p-4 rounded-xl border shadow-sm transition-colors
                  ${isSelected 
                    ? 'bg-blue-600 border-blue-500 text-white shadow-blue-500/20' 
                    : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'}
                `}>
                  {String(item)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom Gradient Mask */}
      {showGradients && (
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-slate-900 to-transparent z-10 pointer-events-none" />
      )}
    </div>
  );
}