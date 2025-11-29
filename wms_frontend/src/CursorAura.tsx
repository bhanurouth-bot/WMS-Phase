import React, { useEffect, useState } from 'react';
import { motion, useMotionValue, useSpring } from 'motion/react';

export default function CursorAura() {
    const [isClicking, setIsClicking] = useState(false);
    
    // 1. Track raw mouse position
    const mouseX = useMotionValue(-100);
    const mouseY = useMotionValue(-100);

    // 2. Create smooth spring physics for the aura (The "Better" part)
    // Damping: Controls how fast it settles (friction)
    // Stiffness: Controls how tight it follows
    const springConfig = { damping: 20, stiffness: 150, mass: 0.5 };
    const auraX = useSpring(mouseX, springConfig);
    const auraY = useSpring(mouseY, springConfig);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            // Offset by 16px (half width) to center the aura on the cursor
            mouseX.set(e.clientX - 16); 
            mouseY.set(e.clientY - 16);
        };

        const handleMouseDown = () => setIsClicking(true);
        const handleMouseUp = () => setIsClicking(false);

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [mouseX, mouseY]);

    return (
        <motion.div
            className="fixed top-0 left-0 w-8 h-8 rounded-full pointer-events-none z-[9999]"
            style={{
                x: auraX,
                y: auraY,
                // Glassy look
                border: '1px solid rgba(255, 255, 255, 0.3)',
                background: 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(2px)',
                boxShadow: '0 0 10px rgba(255, 255, 255, 0.1)'
            }}
            // Animate scale on click
            animate={{ 
                scale: isClicking ? 0.8 : 1,
            }}
            transition={{ duration: 0.1 }}
        />
    );
}