import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, RefreshCw, LogOut, Scan } from 'lucide-react';
import { useScanDetection } from './hooks/useScanDetection';

const API_URL = 'http://127.0.0.1:8000/api';

interface MobilePickerProps {
  onLogout: () => void;
}

export default function MobilePicker({ onLogout }: MobilePickerProps) {
  const [view, setView] = useState<'LIST' | 'SCAN'>('LIST');
  const [orders, setOrders] = useState<any[]>([]);
  const [activeOrder, setActiveOrder] = useState<any>(null);
  const [activeLine, setActiveLine] = useState<any>(null);
  const [scanBuffer, setScanBuffer] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // --- Audio Feedback ---
  const playSound = (type: 'success' | 'error' | 'beep') => {
    const context = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.connect(gain);
    gain.connect(context.destination);
    
    if (type === 'error') {
        osc.frequency.value = 150;
        osc.type = 'sawtooth';
    } else if (type === 'success') {
        osc.frequency.value = 1200;
        osc.type = 'sine';
    } else {
        osc.frequency.value = 600; 
        osc.type = 'square';
    }
    
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.00001, context.currentTime + 0.15);
  };

  // --- Data Loading ---
  const fetchOrders = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/orders/`, {
        headers: { 'Authorization': `Token ${token}` }
      });
      const data = await res.json();
      // Only show ALLOCATED orders ready for picking
      setOrders(data.filter((o: any) => o.status === 'ALLOCATED'));
    } catch (e) {
      setError("Network Error");
    }
  };

  useEffect(() => { fetchOrders(); }, []);

  // --- Focus Management (Keep Scanner Active) ---
  useEffect(() => {
    if (view === 'SCAN') {
        const interval = setInterval(() => inputRef.current?.focus(), 500);
        return () => clearInterval(interval);
    }
  }, [view]);

  // --- Scanning Logic ---
  const handleScan = async (scannedValue: string) => {
    if (view !== 'SCAN' || !activeLine) return;
    
    const val = scannedValue.trim().toUpperCase();
    const targetLoc = activeLine.target_location; 
    const targetSku = activeLine.item_sku;

    // 1. Check Location Scan
    if (val === targetLoc) {
        setSuccessMsg("LOCATION CONFIRMED");
        playSound('beep');
        return;
    }

    // 2. Check SKU Scan
    if (val === targetSku) {
        await submitPick(activeLine, 1); // Auto-pick 1 on scan
        return;
    }

    // 3. Check SKU|LOT Composite
    if (val.includes('|')) {
        const [sku, lot] = val.split('|');
        if (sku === targetSku) {
            await submitPick(activeLine, 1, lot);
            return;
        }
    }

    setError("WRONG BARCODE");
    playSound('error');
  };

  useScanDetection({ onScan: handleScan });

  // --- Actions ---
  const startOrder = async (order: any) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_URL}/orders/${order.id}/`, {
        headers: { 'Authorization': `Token ${token}` }
    });
    const fullOrder = await res.json();
    
    // Find the first unpicked line
    const linesToPick = fullOrder.lines.filter((l: any) => l.qty_picked < l.qty_allocated);
    
    if (linesToPick.length === 0) {
        setError("Order already picked!");
        setTimeout(() => { setError(''); fetchOrders(); }, 2000);
        return;
    }

    setActiveOrder(fullOrder);
    selectNextTask(fullOrder.lines);
  };

  const selectNextTask = (lines: any[]) => {
    const nextLine = lines.find((l: any) => l.qty_picked < l.qty_allocated);
    if (nextLine) {
        const token = localStorage.getItem('token');
        // Find location for this item
        fetch(`${API_URL}/inventory/?item__sku=${nextLine.item_sku}&status=AVAILABLE`, {
            headers: { 'Authorization': `Token ${token}` }
        })
            .then(r => r.json())
            .then(inv => {
                const loc = inv.find((i:any) => i.quantity > 0)?.location_code || 'UNKNOWN';
                setActiveLine({ ...nextLine, target_location: loc });
                setView('SCAN');
                setError('');
                setSuccessMsg('');
            });
    } else {
        setSuccessMsg("ORDER COMPLETE!");
        playSound('success');
        setTimeout(() => {
            setActiveOrder(null);
            setActiveLine(null);
            setView('LIST');
            fetchOrders();
        }, 2000);
    }
  };

  const submitPick = async (line: any, qty: number, lot?: string) => {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/orders/${activeOrder.id}/pick_item/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Token ${token}`
            },
            body: JSON.stringify({
                sku: line.item_sku,
                location: line.target_location,
                qty: qty,
                lot_number: lot
            })
        });

        if (res.ok) {
            playSound('success');
            setSuccessMsg(`PICKED ${qty} UNIT`);
            
            const updatedLines = activeOrder.lines.map((l:any) => 
                l.id === line.id ? {...l, qty_picked: l.qty_picked + qty} : l
            );
            setActiveOrder({...activeOrder, lines: updatedLines});
            
            setTimeout(() => selectNextTask(updatedLines), 1000);
        } else {
            const err = await res.json();
            setError(err.error || "Pick Failed");
            playSound('error');
        }
    } catch (e) {
        setError("Network Error");
        playSound('error');
    }
  };

  // --- RENDER ---

  // 1. ORDER LIST VIEW
  if (view === 'LIST') return (
    <div className="h-screen bg-gray-50 flex flex-col">
        {/* Header */}
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between shadow-md">
            <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold tracking-tight">Picking Queue</h1>
            </div>
            <button onClick={onLogout}><LogOut size={20} className="text-slate-400"/></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <button onClick={fetchOrders} className="w-full py-3 bg-white border border-slate-300 text-slate-600 rounded-lg font-bold flex items-center justify-center gap-2 mb-2 active:bg-slate-100">
                <RefreshCw size={18}/> Refresh List
            </button>
            {orders.length === 0 && <div className="text-center text-slate-400 mt-10">No allocated orders.</div>}
            {orders.map(order => (
                <div key={order.id} onClick={() => startOrder(order)} className="bg-white border-l-8 border-blue-600 p-4 rounded shadow-sm active:bg-blue-50 transition-colors cursor-pointer">
                    <div className="flex justify-between items-start">
                        <span className="text-2xl font-bold text-slate-800">{order.order_number}</span>
                        <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded">{order.lines.length} LINES</span>
                    </div>
                    <div className="text-slate-500 mt-1 truncate">{order.customer_name}</div>
                </div>
            ))}
        </div>
    </div>
  );

  // 2. SCAN TASK VIEW
  if (view === 'SCAN' && activeLine) return (
    <div className="h-screen bg-white flex flex-col">
        <div className="bg-slate-900 text-white p-4 flex justify-between items-center">
            <button onClick={() => setView('LIST')}><ArrowLeft/></button>
            <div className="font-bold">{activeOrder.order_number}</div>
            <div className="text-xs bg-slate-700 px-2 py-1 rounded">{activeLine.qty_picked} / {activeLine.qty_allocated}</div>
        </div>

        {/* Notifications */}
        {error && <div className="bg-red-600 text-white p-4 text-center font-bold text-xl animate-pulse">{error}</div>}
        {successMsg && <div className="bg-green-500 text-white p-4 text-center font-bold text-xl">{successMsg}</div>}

        <div className="flex-1 flex flex-col p-4 gap-4">
            {/* LOCATION CARD */}
            <div className="bg-yellow-100 border-4 border-yellow-400 rounded-xl p-6 flex flex-col items-center justify-center text-center shadow-sm">
                <div className="text-slate-500 font-bold uppercase text-sm mb-1">GO TO LOCATION</div>
                <div className="text-5xl font-mono font-black text-slate-900">{activeLine.target_location}</div>
            </div>

            {/* ITEM CARD */}
            <div className="bg-blue-50 border-l-4 border-blue-500 p-6 flex-1 flex flex-col justify-center">
                <div className="text-slate-500 font-bold uppercase text-sm mb-2">PICK ITEM</div>
                <div className="text-4xl font-bold text-slate-900 mb-2">{activeLine.item_sku}</div>
                
                <div className="flex items-center justify-between bg-white p-4 rounded-lg border border-slate-200 mt-4">
                    <span className="font-bold text-slate-500">QTY NEEDED</span>
                    <span className="text-4xl font-bold text-blue-600">{activeLine.qty_allocated - activeLine.qty_picked}</span>
                </div>
            </div>

            {/* HIDDEN INPUT FOR SCANNER */}
            <input 
                ref={inputRef}
                value={scanBuffer}
                onChange={e => setScanBuffer(e.target.value)}
                onKeyDown={e => { if(e.key === 'Enter') { handleScan(scanBuffer); setScanBuffer(''); } }}
                className="opacity-0 absolute h-0 w-0" 
                autoFocus
            />

            {/* MANUAL OVERRIDE BUTTONS */}
            <div className="grid grid-cols-2 gap-4 h-16">
                <button onClick={() => handleScan(activeLine.target_location)} className="bg-slate-200 text-slate-700 font-bold rounded flex items-center justify-center active:bg-slate-300">
                    Skip Bin
                </button>
                <button onClick={() => handleScan(activeLine.item_sku)} className="bg-blue-600 text-white font-bold rounded flex items-center justify-center active:bg-blue-700 text-lg flex gap-2">
                    <Scan size={20}/> Manual
                </button>
            </div>
        </div>
    </div>
  );

  return <div className="h-screen flex items-center justify-center">Loading...</div>;
}