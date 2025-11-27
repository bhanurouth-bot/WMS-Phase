import React, { useState, useRef } from 'react';
import Barcode from 'react-barcode';
import { Printer, Copy, RefreshCw } from 'lucide-react';

export default function BarcodeGenerator() {
  const [type, setType] = useState<'GS1' | 'SKU' | 'LOC' | 'LPN'>('GS1');
  
  // Form State
  const [sku, setSku] = useState('TEST-ITEM');
  const [lot, setLot] = useState('');
  const [expiry, setExpiry] = useState(''); // YYMMDD
  const [loc, setLoc] = useState('A-01-01');
  const [custom, setCustom] = useState('');

  // Computed Barcode Value
  const getValue = () => {
    switch (type) {
      case 'GS1':
        // Construct GS1-128 string: (01)SKU(17)EXP(10)LOT
        let str = `(01)${sku}`;
        if (expiry) str += `(17)${expiry.replace(/-/g, '').substring(2)}`; // YYYY-MM-DD -> YYMMDD
        if (lot) str += `(10)${lot}`;
        return str;
      case 'SKU': return sku;
      case 'LOC': return loc;
      case 'LPN': return custom || `LPN-${Math.floor(Math.random()*100000)}`;
      default: return '';
    }
  };

  const handlePrint = () => {
    const content = document.getElementById('printable-barcode');
    const pri = window.open('', '', 'height=500, width=500');
    if (pri && content) {
        pri.document.write('<html><head><title>Print Barcode</title>');
        pri.document.write('</head><body style="display:flex;justify-content:center;align-items:center;height:100vh;">');
        pri.document.write(content.innerHTML);
        pri.document.write('</body></html>');
        pri.document.close();
        pri.focus();
        pri.print();
    }
  };

  return (
    <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 p-6">
      <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/50 p-8 flex gap-8">
        
        {/* Controls */}
        <div className="w-1/3 space-y-6 border-r border-gray-200 pr-8">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Printer className="text-blue-600"/> Label Maker
          </h2>
          
          {/* Type Selector */}
          <div className="grid grid-cols-2 gap-2">
            {['GS1', 'SKU', 'LOC', 'LPN'].map(t => (
              <button 
                key={t}
                onClick={() => setType(t as any)}
                className={`py-2 rounded-lg text-sm font-bold transition-all ${type === t ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Dynamic Inputs */}
          <div className="space-y-3">
            {(type === 'GS1' || type === 'SKU') && (
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">SKU / GTIN</label>
                <input value={sku} onChange={e=>setSku(e.target.value)} className="w-full p-2 rounded border border-slate-300 font-mono uppercase"/>
              </div>
            )}
            
            {type === 'GS1' && (
              <>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Expiry (YYMMDD)</label>
                  <input type="date" onChange={e=>setExpiry(e.target.value)} className="w-full p-2 rounded border border-slate-300"/>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Batch / Lot</label>
                  <input value={lot} onChange={e=>setLot(e.target.value)} className="w-full p-2 rounded border border-slate-300 font-mono uppercase"/>
                </div>
              </>
            )}

            {type === 'LOC' && (
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Location Code</label>
                <input value={loc} onChange={e=>setLoc(e.target.value)} className="w-full p-2 rounded border border-slate-300 font-mono uppercase"/>
              </div>
            )}

            {type === 'LPN' && (
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Custom Text / Serial</label>
                <div className="flex gap-2">
                    <input value={custom} onChange={e=>setCustom(e.target.value)} placeholder="Auto-generated..." className="w-full p-2 rounded border border-slate-300 font-mono uppercase"/>
                    <button onClick={()=>setCustom(`LPN-${Math.floor(Math.random()*100000)}`)} className="p-2 bg-slate-100 rounded hover:bg-slate-200"><RefreshCw size={18}/></button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Preview */}
        <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 rounded-xl border-2 border-dashed border-slate-300 p-8 relative">
            <div className="absolute top-4 left-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Live Preview</div>
            
            <div id="printable-barcode" className="bg-white p-4 shadow-xl">
                <Barcode value={getValue()} format={type === 'GS1' ? "CODE128" : "CODE128"} width={2} height={80} fontSize={14} />
            </div>

            <div className="mt-8 flex gap-4">
                <button onClick={() => { navigator.clipboard.writeText(getValue()); alert("Copied raw string!"); }} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-600 font-bold hover:bg-slate-50">
                    <Copy size={16}/> Copy String
                </button>
                <button onClick={handlePrint} className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg font-bold shadow-lg hover:bg-blue-700 transform hover:scale-105 transition-all">
                    <Printer size={18}/> Print Label
                </button>
            </div>
            
            {type === 'GS1' && (
                <div className="mt-6 text-center">
                    <div className="text-xs text-slate-400">Generated GS1 String</div>
                    <code className="bg-slate-800 text-yellow-400 px-2 py-1 rounded text-xs mt-1 block">{getValue()}</code>
                </div>
            )}
        </div>

      </div>
    </div>
  );
}