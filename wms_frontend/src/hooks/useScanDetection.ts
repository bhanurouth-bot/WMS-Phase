// src/hooks/useScanDetection.ts
import { useEffect, useState } from 'react';

interface ScanOptions {
  onScan: (code: string) => void;
  minLength?: number;
}

export const useScanDetection = ({ onScan, minLength = 3 }: ScanOptions) => {
  const [buffer, setBuffer] = useState<string>("");
  const [lastKeyTime, setLastKeyTime] = useState<number>(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const char = e.key;
      const currentTime = Date.now();
      const timeDiff = currentTime - lastKeyTime;

      // Scanners type VERY fast (< 50ms per char usually). 
      // If it's slow, it's likely manual typing.
      if (timeDiff > 100) { 
        setBuffer(""); // Reset buffer if typing is slow
      }

      setLastKeyTime(currentTime);

      if (char === 'Enter') {
        if (buffer.length >= minLength) {
          e.preventDefault();
          e.stopPropagation();
          onScan(buffer);
          setBuffer("");
        }
      } else if (char.length === 1) {
        // Only append printable characters
        setBuffer((prev) => prev + char);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [buffer, lastKeyTime, onScan, minLength]);
};