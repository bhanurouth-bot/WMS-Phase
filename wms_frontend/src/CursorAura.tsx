import React, { useEffect, useRef } from 'react';

const CursorAura: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  // Store waves: x, y, radius, alpha (opacity)
  const wavesRef = useRef<{ x: number; y: number; r: number; a: number; color: string }[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    const onMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('mousemove', onMouseMove);

    let frameCount = 0;
    let animationFrameId: number;

    const animate = () => {
      frameCount++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Create a new wave every few frames for a trail effect
      if (frameCount % 8 === 0) {
        wavesRef.current.push({
          x: mouseRef.current.x,
          y: mouseRef.current.y,
          r: 5, // Start small
          a: 0.8, // Start opaque
          color: `hsl(${frameCount % 360}, 70%, 60%)` // Rainbow effect or pick a static color like 'cyan'
        });
      }

      // Update and Draw waves
      for (let i = wavesRef.current.length - 1; i >= 0; i--) {
        const wave = wavesRef.current[i];
        
        // Expand
        wave.r += 1.5;
        // Fade
        wave.a -= 0.015;

        if (wave.a <= 0) {
          wavesRef.current.splice(i, 1);
          continue;
        }

        ctx.beginPath();
        ctx.arc(wave.x, wave.y, wave.r, 0, Math.PI * 2);
        // Use a nice blue/cyan gradient look or the dynamic color
        ctx.strokeStyle = `rgba(56, 189, 248, ${wave.a})`; // Tailwind Sky-400 color
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.closePath();
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0" />;
};

export default CursorAura;