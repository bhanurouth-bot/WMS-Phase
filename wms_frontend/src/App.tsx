import React, { useState, useEffect } from 'react';
import { 
  Box, Package, Activity, Search, RefreshCw, AlertCircle, Scan, 
  History, Printer, CheckSquare, ShoppingCart, Plus, RotateCcw, 
  Layers, Truck, LayoutDashboard, Settings, 
  X, ChevronRight, ArrowLeft, Play, Barcode, CheckCircle2, MapPin, ArrowRightCircle,
  Maximize
} from 'lucide-react';

// --- API CONFIG ---
const API_URL = 'http://127.0.0.1:8000/api';

// --- TYPES ---
interface InventoryItem { id: number; item_sku: string; item_name: string; location_code: string; quantity: number; available_quantity: number; reserved_quantity: number; }
interface ItemMaster { id: number; sku: string; name: string; }
interface OrderLine { id: number; item: number; item_sku: string; qty_ordered: number; qty_allocated: number; qty_picked: number; }
interface Order { 
  id: number; order_number: string; customer_name: string; status: string; created_at: string; 
  customer_address?: string; customer_city?: string; customer_state?: string; customer_zip?: string;
  lines: OrderLine[]; 
}
interface LogItem { id: number; timestamp: string; action: string; sku_snapshot: string; quantity_change: number; location_snapshot: string; }
interface DashboardStats { total_stock: number; total_locations: number; low_stock: number; recent_moves: number; }
interface PurchaseOrder { id: number; po_number: string; supplier_name: string; status: string; created_at: string; lines: {sku: string, qty: number}[]; }
interface RMA { id: number; rma_number: string; order_number: string; customer: string; status: string; lines: any[]; }
interface CycleCountTask { id: number; item_sku: string; location: string; expected_qty: number; counted_qty: number | null; status: 'PENDING' | 'COUNTED'; variance: number | null; }
interface CycleCountSession { id: number; reference: string; status: string; created_at: string; tasks: CycleCountTask[]; }
interface WavePlan { 
  success: boolean; 
  wave_id: string; 
  pick_list: {
    sku: string; 
    total_qty: number; 
    location: string; 
    orders: string[]; 
    order_ids: number[];
  }[]; 
}

// --- HELPER COMPONENTS ---

const MacTrafficLights = ({ onRed, onYellow, onGreen }: { onRed: () => void, onYellow: () => void, onGreen: () => void }) => (
  <div className="flex gap-2 px-4 group">
    <button onClick={onRed} title="Go to Dashboard" className="w-3 h-3 rounded-full bg-[#FF5F56] border border-[#E0443E] shadow-sm hover:opacity-80 active:scale-90 transition-all flex items-center justify-center group-hover:text-[#4d0b09]">
    </button>
    <button onClick={onYellow} title="Go Back" className="w-3 h-3 rounded-full bg-[#FFBD2E] border border-[#DEA123] shadow-sm hover:opacity-80 active:scale-90 transition-all"></button>
    <button onClick={onGreen} title="Toggle Fullscreen" className="w-3 h-3 rounded-full bg-[#27C93F] border border-[#1AAB29] shadow-sm hover:opacity-80 active:scale-90 transition-all"></button>
  </div>
);

const GlassCard = ({ children, className = "", noPad = false }: any) => (
  <div className={`bg-white/40 backdrop-blur-xl border border-white/50 shadow-lg rounded-2xl ${noPad ? '' : 'p-6'} ${className}`}>
    {children}
  </div>
);

const DockItem = ({ icon: Icon, label, active, onClick }: any) => (
  <button 
    onClick={onClick}
    className={`group relative flex flex-col items-center gap-1 transition-all duration-300 ${active ? '-translate-y-2 scale-110' : 'hover:-translate-y-1 hover:scale-105'}`}
  >
    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition-all border border-white/20
      ${active ? 'bg-gradient-to-b from-blue-400 to-blue-600 text-white' : 'bg-white/30 backdrop-blur-md text-slate-700 hover:bg-white/50'}`}>
      <Icon size={24} strokeWidth={2} />
    </div>
    <span className={`absolute -top-10 bg-slate-800 text-white text-[10px] px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none`}>
      {label}
    </span>
    {active && <div className="w-1 h-1 rounded-full bg-slate-400 mt-1"></div>}
  </button>
);

const StatusBadge = ({ status }: { status: string }) => {
  const styles: any = {
    PENDING: 'bg-yellow-500/20 text-yellow-800 border-yellow-500/30',
    ALLOCATED: 'bg-blue-500/20 text-blue-800 border-blue-500/30',
    PICKED: 'bg-purple-500/20 text-purple-800 border-purple-500/30',
    PACKED: 'bg-orange-500/20 text-orange-800 border-orange-500/30',
    SHIPPED: 'bg-green-500/20 text-green-800 border-green-500/30',
    REQUESTED: 'bg-red-500/20 text-red-800 border-red-500/30',
    RECEIVED: 'bg-teal-500/20 text-teal-800 border-teal-500/30',
    DRAFT: 'bg-slate-500/20 text-slate-800 border-slate-500/30',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${styles[status] || 'bg-gray-200 text-gray-700'} uppercase tracking-wide`}>
      {status}
    </span>
  );
};

// --- MODALS ---

const LabelModal = ({ zpl, onClose }: { zpl: string, onClose: () => void }) => {
  const imageUrl = `http://api.labelary.com/v1/printers/8dpmm/labels/4x6/0/${encodeURIComponent(zpl)}`;
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-white/20">
        <div className="bg-slate-900 text-white p-4 flex justify-between items-center">
          <div className="flex items-center gap-2"><Printer size={16} className="text-green-400" /><span className="font-bold text-sm">Print Preview</span></div>
          <button onClick={onClose} className="hover:bg-white/20 p-1 rounded transition-colors"><X size={16}/></button>
        </div>
        <div className="p-8 bg-slate-100 flex flex-col items-center">
          <div className="bg-white p-2 shadow-xl border border-slate-200 rotate-0 hover:scale-105 transition-transform duration-300">
             <img src={imageUrl} alt="Shipping Label" className="w-64 h-auto object-contain min-h-[300px] bg-gray-50" />
          </div>
          <div className="mt-8 w-full grid grid-cols-2 gap-3">
             <button onClick={onClose} className="py-2 rounded-xl font-bold text-slate-500 hover:bg-slate-200 text-sm transition-colors">Cancel</button>
             <button onClick={() => { alert("Sent to Printer"); onClose(); }} className="py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-blue-500/20">Print Now</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const CreateOrderModal = ({ onClose, onSubmit, items }: any) => {
  const [formData, setFormData] = useState({
    customer_name: '', customer_email: '', customer_address: '', customer_city: '', customer_state: '', customer_zip: '',
    sku: '', qty: 1
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.sku) return alert("Please select an SKU");
    onSubmit({
      ...formData,
      order_number: `ORD-${Math.floor(Math.random() * 10000)}`,
      qty: formData.qty,
      sku: formData.sku
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in zoom-in duration-200">
      <div className="bg-white/90 backdrop-blur-xl rounded-2xl w-full max-w-2xl p-8 shadow-2xl border border-white/40">
        <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800"><Plus className="text-blue-600"/> Create Sales Order</h2>
            <button onClick={onClose}><X size={20} className="text-slate-400 hover:text-slate-600"/></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
             <div className="space-y-3">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b pb-1">Customer Info</h3>
                <input required value={formData.customer_name} onChange={e=>setFormData({...formData, customer_name: e.target.value})} className="w-full bg-slate-50 border border-slate-200 p-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/20" placeholder="Full Name" />
                <input required value={formData.customer_address} onChange={e=>setFormData({...formData, customer_address: e.target.value})} className="w-full bg-slate-50 border border-slate-200 p-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/20" placeholder="Address" />
                <div className="flex gap-2">
                    <input required value={formData.customer_city} onChange={e=>setFormData({...formData, customer_city: e.target.value})} className="w-full bg-slate-50 border border-slate-200 p-2 rounded-lg text-sm outline-none" placeholder="City" />
                    <input required value={formData.customer_zip} onChange={e=>setFormData({...formData, customer_zip: e.target.value})} className="w-24 bg-slate-50 border border-slate-200 p-2 rounded-lg text-sm outline-none" placeholder="Zip" />
                </div>
             </div>
             <div className="space-y-3">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b pb-1">Order Details</h3>
                <select required value={formData.sku} onChange={e=>setFormData({...formData, sku: e.target.value})} className="w-full bg-slate-50 border border-slate-200 p-2 rounded-lg text-sm outline-none">
                    <option value="">-- Select Item --</option>
                    {items.map((i: any) => <option key={i.id} value={i.sku}>{i.sku} - {i.name}</option>)}
                </select>
                <input type="number" min="1" required value={formData.qty} onChange={e=>setFormData({...formData, qty: parseInt(e.target.value)})} className="w-full bg-slate-50 border border-slate-200 p-2 rounded-lg text-sm outline-none" />
             </div>
          </div>
          <button type="submit" className="w-full py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg transition-transform active:scale-95 text-sm">Create Order</button>
        </form>
      </div>
    </div>
  );
};

const CreateRMAModal = ({ onClose, onSubmit, orders }: any) => {
    const [selectedOrderId, setSelectedOrderId] = useState('');
    const [reason, setReason] = useState('');
    
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const order = orders.find((o:any) => o.id.toString() === selectedOrderId);
        if(!order) return;
        onSubmit({
            order: order.id,
            rma_number: `RMA-${Math.floor(Math.random() * 10000)}`,
            reason: reason,
            lines: order.lines.map((l:any) => ({ item: l.item, qty_to_return: l.qty_ordered }))
        });
    };

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in zoom-in">
            <div className="bg-white/90 backdrop-blur-xl rounded-2xl w-full max-w-md p-6 shadow-2xl border border-white/40">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-bold flex items-center gap-2 text-slate-800"><RotateCcw size={18} className="text-red-500"/> Process Return</h2>
                    <button onClick={onClose}><X size={18} className="text-slate-400"/></button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Select Order</label>
                        <select required value={selectedOrderId} onChange={e=>setSelectedOrderId(e.target.value)} className="w-full bg-slate-50 border border-slate-200 p-2 rounded-lg text-sm outline-none">
                            <option value="">-- Shipped Orders --</option>
                            {orders.filter((o:any) => o.status === 'SHIPPED').map((o:any) => (
                                <option key={o.id} value={o.id}>{o.order_number} - {o.customer_name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Reason</label>
                        <textarea required value={reason} onChange={e=>setReason(e.target.value)} className="w-full bg-slate-50 border border-slate-200 p-2 rounded-lg text-sm outline-none h-24 resize-none" placeholder="Reason for return..." />
                    </div>
                    <button type="submit" className="w-full py-2 bg-red-500 hover:bg-red-600 text-white font-bold rounded-lg shadow-md text-sm transition-transform active:scale-95">Create RMA</button>
                </form>
            </div>
        </div>
    )
}

// --- SCANNERS ---

const UniversalScanner = ({ mode, data, onComplete, onBack, onUpdate }: any) => {
    const [step, setStep] = useState<'LOC' | 'SKU' | 'QTY'>('LOC');
    const [input, setInput] = useState('');
    const [activeItem, setActiveItem] = useState<any>(null);
    
    const pendingTasks = mode === 'CYCLE' ? data.tasks.filter((t:any) => t.status === 'PENDING') : [];
    const pendingPicks = mode === 'WAVE' ? data.pick_list.filter((p:any) => p.status !== 'PICKED') : [];

    const progress = mode === 'CYCLE' 
        ? ((data.tasks.length - pendingTasks.length) / data.tasks.length) * 100
        : ((data.pick_list.length - pendingPicks.length) / data.pick_list.length) * 100;

    const handleInput = (e: React.FormEvent) => {
        e.preventDefault();
        if(!activeItem) return;

        const targetLoc = mode === 'CYCLE' ? activeItem.location : activeItem.location;
        const targetSku = mode === 'CYCLE' ? activeItem.item_sku : activeItem.sku;
        const targetQty = mode === 'CYCLE' ? null : activeItem.total_qty;

        if (step === 'LOC') {
            if (input.toUpperCase() === targetLoc) {
                setStep('SKU');
                setInput('');
            } else {
                alert(`WRONG LOCATION. Go to ${targetLoc}`);
                setInput('');
            }
        } else if (step === 'SKU') {
             if (input.toUpperCase() === targetSku) {
                 setStep('QTY');
                 setInput('');
             } else {
                 alert(`WRONG ITEM. Scan ${targetSku}`);
                 setInput('');
             }
        } else if (step === 'QTY') {
            const val = parseInt(input);
            if (mode === 'WAVE' && val !== targetQty) {
                if(!confirm(`Expected ${targetQty}, but you entered ${val}. Proceed?`)) return;
            }
            onUpdate(activeItem, val);
            setActiveItem(null);
            setStep('LOC');
            setInput('');
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-900 text-white rounded-xl overflow-hidden relative font-sans">
             <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-blue-900/20 to-slate-900 z-0"/>
             
             <div className="relative z-10 flex justify-between items-center p-4 border-b border-white/10 bg-white/5 backdrop-blur-md">
                <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full transition-colors"><ArrowLeft size={20}/></button>
                <div className="text-center">
                    <div className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">{mode === 'CYCLE' ? 'Cycle Count' : 'Wave Pick'}</div>
                    <div className="font-mono font-bold">{mode === 'CYCLE' ? data.reference : data.wave_id}</div>
                </div>
                <div className="text-xs font-bold bg-blue-600 px-2 py-1 rounded-md">{Math.round(progress || 0)}%</div>
            </div>

            {!activeItem ? (
                <div className="relative z-10 flex-1 overflow-y-auto p-4 space-y-3">
                    {(mode === 'CYCLE' ? pendingTasks : pendingPicks).length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-emerald-400 animate-in zoom-in">
                            <CheckCircle2 size={64} className="mb-4 drop-shadow-[0_0_15px_rgba(52,211,153,0.5)]"/>
                            <h2 className="text-2xl font-bold">ALL DONE</h2>
                            <button onClick={onComplete} className="mt-6 bg-emerald-600 text-white px-6 py-2 rounded-full font-bold shadow-lg shadow-emerald-900/50 hover:bg-emerald-500 transition-all">Finish Job</button>
                        </div>
                    )}
                    {(mode === 'CYCLE' ? pendingTasks : pendingPicks).map((t:any) => (
                        <button key={t.id || t.sku} onClick={() => { setActiveItem(t); setStep('LOC'); }} 
                            className="w-full bg-white/5 hover:bg-white/10 border border-white/5 p-4 rounded-xl flex justify-between items-center group transition-all duration-200 active:scale-[0.98]">
                            <div className="text-left">
                                <div className="flex items-center gap-2 text-blue-300 font-mono text-lg font-bold">
                                    <MapPin size={14}/> {t.location}
                                </div>
                                <div className="text-sm text-slate-300 font-medium mt-1">{mode === 'CYCLE' ? t.item_sku : t.sku}</div>
                                {mode === 'WAVE' && <div className="text-[10px] text-slate-500 mt-1">Orders: {t.orders.join(', ')}</div>}
                            </div>
                            <div className="flex flex-col items-end">
                                {mode === 'WAVE' && <div className="text-2xl font-bold text-white">x{t.total_qty}</div>}
                                <ChevronRight className="text-slate-600 group-hover:text-white transition-colors"/>
                            </div>
                        </button>
                    ))}
                </div>
            ) : (
                <div className="relative z-10 flex-1 flex flex-col p-6 animate-in slide-in-from-right duration-300">
                    <div className="bg-gradient-to-br from-blue-600/20 to-purple-600/20 border border-white/10 p-6 rounded-2xl mb-6 text-center relative overflow-hidden">
                        <div className="absolute inset-0 bg-blue-500/10 blur-3xl"></div>
                        <div className="relative z-10">
                            <div className="text-[10px] font-bold text-blue-300 uppercase tracking-widest mb-2">
                                {step === 'LOC' ? 'Go to Location' : step === 'SKU' ? 'Verify Item' : 'Enter Quantity'}
                            </div>
                            <div className="text-5xl font-bold font-mono text-white tracking-tight mb-2 drop-shadow-md">
                                {step === 'LOC' ? activeItem.location : step === 'QTY' ? (mode==='WAVE'?activeItem.total_qty:'?') : (mode==='CYCLE'?activeItem.item_sku:activeItem.sku)}
                            </div>
                             <div className="text-sm text-slate-400">
                                {step === 'LOC' ? 'Scan Bin Label' : step === 'SKU' ? 'Scan Product Barcode' : 'Confirm Count'}
                             </div>
                        </div>
                    </div>

                    <form onSubmit={handleInput} className="flex-1 flex flex-col justify-end pb-8">
                        <div className="relative mb-4">
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
                                {step === 'QTY' ? <div className="font-bold text-xs">QTY</div> : <Barcode/>}
                            </div>
                            <input 
                                autoFocus
                                value={input} 
                                onChange={e => setInput(e.target.value)} 
                                type={step === 'QTY' ? 'number' : 'text'}
                                className="w-full bg-black/50 border border-white/20 rounded-2xl py-6 pl-12 pr-6 text-2xl font-mono text-white placeholder-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all shadow-inner"
                                placeholder={step === 'LOC' ? 'Scan Bin...' : step === 'SKU' ? 'Scan SKU...' : '0'} 
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <button type="button" onClick={() => {setActiveItem(null); setInput('');}} className="py-4 rounded-xl font-bold text-slate-400 hover:bg-white/5 transition-colors">Cancel</button>
                            <button type="submit" className="py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold shadow-lg shadow-blue-900/40 transition-transform active:scale-95">
                                {step === 'QTY' ? 'CONFIRM' : 'NEXT'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};

// --- MAIN APP ---

export default function App() {
  const [activeTab, setActiveTab] = useState('Overview');
  const [tabHistory, setTabHistory] = useState<string[]>([]);
  const [scannerMode, setScannerMode] = useState<'IDLE' | 'CYCLE' | 'WAVE'>('IDLE');
  
  // Data
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [items, setItems] = useState<ItemMaster[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [rmas, setRmas] = useState<RMA[]>([]);
  const [history, setHistory] = useState<LogItem[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [counts, setCounts] = useState<CycleCountSession[]>([]);
  
  // Features
  const [selectedOrders, setSelectedOrders] = useState<number[]>([]);
  const [activeWave, setActiveWave] = useState<WavePlan | null>(null);
  const [activeCount, setActiveCount] = useState<CycleCountSession | null>(null);
  
  // Modals
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showRMAModal, setShowRMAModal] = useState(false);
  const [showLabel, setShowLabel] = useState(false);
  const [currentZpl, setCurrentZpl] = useState('');

  const fetchAll = async () => {
    try {
      const [inv, ord, rm, hist, stat, cnt, po, itm] = await Promise.all([
        fetch(`${API_URL}/inventory/`).then(r=>r.json()),
        fetch(`${API_URL}/orders/`).then(r=>r.json()),
        fetch(`${API_URL}/rmas/`).then(r=>r.json()),
        fetch(`${API_URL}/history/`).then(r=>r.json()),
        fetch(`${API_URL}/dashboard/stats/`).then(r=>r.json()),
        fetch(`${API_URL}/cycle-counts/`).then(r=>r.json()),
        fetch(`${API_URL}/purchase-orders/`).then(r=>r.json()),
        fetch(`${API_URL}/items/`).then(r=>r.json()),
      ]);
      setInventory(inv);
      setOrders(ord);
      setRmas(rm);
      setHistory(hist);
      setStats(stat);
      setCounts(cnt);
      setPos(po);
      setItems(itm);
    } catch(e) { console.error(e); }
  };

  useEffect(() => { fetchAll(); }, []);

  // --- NAVIGATION ---
  const navigate = (tab: string) => {
      if (activeTab !== tab) {
          setTabHistory(prev => [...prev, activeTab]);
          setActiveTab(tab);
      }
  };

  const handleBack = () => {
      if (tabHistory.length > 0) {
          const prev = tabHistory[tabHistory.length - 1];
          setTabHistory(h => h.slice(0, -1));
          setActiveTab(prev);
      }
  };

  const toggleFullscreen = () => {
      if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen();
      } else {
          if (document.exitFullscreen) document.exitFullscreen();
      }
  };

  // --- ACTIONS ---

  const handleCreateOrder = async (data: any) => {
      const item = items.find(i => i.sku === data.sku);
      if(!item) return alert("Invalid SKU");
      const payload = {
          order_number: data.order_number,
          customer_name: data.customer_name,
          customer_email: data.customer_email,
          customer_address: data.customer_address,
          customer_city: data.customer_city,
          customer_state: data.customer_state,
          customer_zip: data.customer_zip,
          lines: [{ item: item.id, qty_ordered: data.qty }]
      };
      const res = await fetch(`${API_URL}/orders/`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
      if(res.ok) { setShowOrderModal(false); fetchAll(); }
  };

  const handleGenerateWave = async () => {
      const res = await fetch(`${API_URL}/orders/wave_plan/`, { 
          method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ order_ids: selectedOrders }) 
      });
      const data = await res.json();
      if(res.ok) {
          data.pick_list = data.pick_list.map((p:any) => ({...p, status: 'PENDING'}));
          setActiveWave(data);
      } else { alert(data.error); }
  };

  const handleWavePickSubmit = async (item: any, qty: number) => {
      let remainingQty = qty;
      for (const orderId of item.order_ids) {
          const order = orders.find(o => o.id === orderId);
          if (!order) continue;
          const line = order.lines.find(l => l.item_sku === item.sku);
          if (!line) continue;
          const needed = line.qty_allocated - line.qty_picked;
          if (needed <= 0) continue;
          const toPick = Math.min(remainingQty, needed);
          
          if (toPick > 0) {
              await fetch(`${API_URL}/orders/${orderId}/pick_item/`, {
                  method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ sku: item.sku, location: item.location, qty: toPick })
              });
              remainingQty -= toPick;
          }
          if (remainingQty <= 0) break;
      }
      
      if (activeWave) {
          const updatedList = activeWave.pick_list.map(p => 
              p.sku === item.sku && p.location === item.location ? { ...p, status: 'PICKED' } : p
          );
          setActiveWave({ ...activeWave, pick_list: updatedList });
      }
  };

  const handleCycleCountSubmit = async (taskId: number, qty: number) => {
      const res = await fetch(`${API_URL}/cycle-counts/${activeCount?.id}/submit_task/`, {
          method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ task_id: taskId, qty })
      });
      if(res.ok) {
          const updatedCounts = await fetch(`${API_URL}/cycle-counts/`).then(r=>r.json());
          setCounts(updatedCounts);
          const current = updatedCounts.find((c:any) => c.id === activeCount?.id);
          setActiveCount(current);
      }
  };

  const handleOrderAction = async (id: number, action: string) => {
      if(!confirm(`Confirm ${action}?`)) return;
      await fetch(`${API_URL}/orders/${id}/${action}/`, { method: 'POST' });
      fetchAll();
  };

  const handleGenerateLabel = async (id: number) => {
      const res = await fetch(`${API_URL}/orders/${id}/shipping_label/`);
      if(res.ok) { const zpl = await res.text(); setCurrentZpl(zpl); setShowLabel(true); }
  };

  const handleCreateRMA = async (payload: any) => {
      const res = await fetch(`${API_URL}/rmas/`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
      if(res.ok) { setShowRMAModal(false); fetchAll(); }
  };

  const handleReceiveRMA = async (id: number) => {
      if(!confirm("Receive items to default dock?")) return;
      await fetch(`${API_URL}/rmas/${id}/process_receipt/`, { method: 'POST' });
      fetchAll();
  };

  // --- RENDER ---

  if (scannerMode !== 'IDLE') {
      return (
          <div className="h-screen w-screen bg-black flex items-center justify-center">
              <div className="w-full max-w-md h-[90vh]">
                  {scannerMode === 'WAVE' && activeWave && (
                      <UniversalScanner mode="WAVE" data={activeWave} onUpdate={handleWavePickSubmit} onBack={() => setScannerMode('IDLE')}
                        onComplete={() => { alert("Wave Complete!"); setScannerMode('IDLE'); setActiveWave(null); setSelectedOrders([]); fetchAll(); }} />
                  )}
                  {scannerMode === 'CYCLE' && activeCount && (
                      <UniversalScanner mode="CYCLE" data={activeCount} onUpdate={(item:any, qty:number) => handleCycleCountSubmit(item.id, qty)} onBack={() => setScannerMode('IDLE')}
                        onComplete={() => { alert("Count Complete!"); setScannerMode('IDLE'); setActiveCount(null); fetchAll(); }} />
                  )}
              </div>
          </div>
      );
  }

  return (
    <div className="h-screen w-screen bg-[url('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop')] bg-cover bg-center overflow-hidden flex flex-col items-center justify-center p-6 text-slate-800 font-sans selection:bg-blue-200">
      {showLabel && <LabelModal zpl={currentZpl} onClose={()=>setShowLabel(false)} />}
      {showOrderModal && <CreateOrderModal items={items} onClose={()=>setShowOrderModal(false)} onSubmit={handleCreateOrder} />}
      {showRMAModal && <CreateRMAModal orders={orders} onClose={()=>setShowRMAModal(false)} onSubmit={handleCreateRMA} />}

      <div className="w-full max-w-[1400px] h-[85vh] bg-white/60 backdrop-blur-2xl rounded-[2rem] shadow-2xl border border-white/40 flex flex-col relative overflow-hidden animate-in fade-in zoom-in duration-500">
        
        {/* Toolbar */}
        <div className="h-12 flex items-center justify-between px-6 bg-white/10 border-b border-black/5 shrink-0">
            <div className="flex items-center gap-4 w-40">
                <MacTrafficLights 
                    onRed={() => setActiveTab('Overview')} 
                    onYellow={handleBack} 
                    onGreen={toggleFullscreen} 
                />
            </div>
            <div className="font-semibold text-sm text-slate-600/80 flex items-center gap-2"><Layers size={14} className="text-blue-600"/> NexWMS <span className="text-slate-400">v2.0</span></div>
            <div className="w-40 flex justify-end"><button onClick={fetchAll} className="p-1.5 hover:bg-black/5 rounded-md transition-colors text-slate-500"><RefreshCw size={14}/></button></div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 scroll-smooth">
            
            {activeTab === 'Overview' && (
                <div className="space-y-8 max-w-5xl mx-auto">
                    <div className="grid grid-cols-4 gap-6">
                        {[{l:"Total Items",v:stats?.total_stock,i:Package,c:"blue"},{l:"Bin Locations",v:stats?.total_locations,i:LayoutDashboard,c:"purple"},{l:"Restock Needed",v:stats?.low_stock,i:AlertCircle,c:"red"},{l:"Moves Today",v:stats?.recent_moves,i:Activity,c:"emerald"}].map((k,i)=>(
                            <GlassCard key={i} className="flex items-center gap-4 hover:scale-[1.02] transition-transform cursor-default">
                                <div className={`w-12 h-12 rounded-full bg-${k.c}-100 flex items-center justify-center text-${k.c}-600`}><k.i/></div>
                                <div><div className="text-3xl font-bold">{k.v}</div><div className="text-xs font-bold text-slate-400 uppercase">{k.l}</div></div>
                            </GlassCard>
                        ))}
                    </div>
                    <div className="grid grid-cols-3 gap-6">
                        <GlassCard className="col-span-2 min-h-[300px]" noPad>
                            <div className="p-4 border-b border-black/5 font-bold text-slate-600 text-sm flex justify-between items-center">
                                <span>Recent Activity</span>
                                <button onClick={() => navigate('History')} className="text-xs bg-slate-200 hover:bg-slate-300 px-2 py-1 rounded text-slate-600 transition-colors flex items-center gap-1">Full History <ArrowRightCircle size={12}/></button>
                            </div>
                            <div className="divide-y divide-black/5">
                                {history.slice(0, 5).map(h => (
                                    <div key={h.id} className="p-3 px-4 flex justify-between items-center text-sm hover:bg-white/40 transition-colors">
                                        <div className="flex items-center gap-3"><span className={`w-2 h-2 rounded-full ${h.action==='PICK'?'bg-purple-500':'bg-blue-500'}`}/><span className="font-medium text-slate-700">{h.action}</span><span className="text-slate-400">·</span><span className="font-mono text-slate-600">{h.sku_snapshot}</span></div>
                                        <div className="flex gap-4 text-slate-500 font-mono text-xs"><span>{h.location_snapshot}</span><span className={h.quantity_change < 0 ? 'text-red-500' : 'text-green-600'}>{h.quantity_change > 0 ? '+' : ''}{h.quantity_change}</span></div>
                                    </div>
                                ))}
                            </div>
                        </GlassCard>
                         <div className="space-y-4">
                            <button onClick={()=>navigate('Waves')} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4 rounded-2xl shadow-xl shadow-blue-500/30 hover:scale-[1.02] active:scale-95 transition-all text-left group">
                                <Layers className="mb-2 group-hover:rotate-12 transition-transform"/><div className="font-bold text-lg">Wave Planning</div><div className="text-xs text-blue-100 opacity-80">Optimize picking for allocated orders</div>
                            </button>
                             <button onClick={()=>navigate('Inventory')} className="w-full bg-white/50 border border-white/40 p-4 rounded-2xl hover:bg-white/80 transition-all text-left"><Search className="mb-2 text-slate-500"/><div className="font-bold text-slate-700">Lookup Item</div></button>
                         </div>
                    </div>
                </div>
            )}

            {activeTab === 'Orders' && (
                <div className="max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-bold text-slate-800">Sales Orders</h2>
                        <button onClick={() => setShowOrderModal(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg hover:bg-blue-700 transition-all flex items-center gap-2">
                            <Plus size={16}/> New Order
                        </button>
                    </div>
                    <GlassCard noPad className="overflow-hidden">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50/80 text-[11px] uppercase text-slate-500 font-bold border-b border-black/5"><tr><th className="p-4">Order #</th><th className="p-4">Customer</th><th className="p-4">Status</th><th className="p-4 text-right">Items</th><th className="p-4 text-right">Actions</th></tr></thead>
                            <tbody className="divide-y divide-black/5">
                                {orders.map(o => (
                                    <tr key={o.id} className="hover:bg-blue-50/20 transition-colors">
                                        <td className="p-4 font-bold text-slate-700">{o.order_number}</td>
                                        <td className="p-4">{o.customer_name}</td>
                                        <td className="p-4"><StatusBadge status={o.status}/></td>
                                        <td className="p-4 text-right font-mono text-slate-500">{o.lines.length}</td>
                                        <td className="p-4 text-right space-x-2">
                                            {o.status === 'PENDING' && <button onClick={()=>handleOrderAction(o.id, 'allocate')} className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700">Allocate</button>}
                                            {o.status === 'PICKED' && <button onClick={()=>handleOrderAction(o.id, 'pack')} className="text-xs bg-orange-500 text-white px-3 py-1 rounded hover:bg-orange-600">Pack</button>}
                                            {o.status === 'PACKED' && <button onClick={()=>handleOrderAction(o.id, 'ship')} className="text-xs bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700">Ship</button>}
                                            {o.status === 'SHIPPED' && <button onClick={()=>handleGenerateLabel(o.id)} className="text-xs bg-slate-800 text-white px-3 py-1 rounded hover:bg-black">Label</button>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </GlassCard>
                </div>
            )}

            {activeTab === 'Returns' && (
                <div className="max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-bold text-slate-800">Returns (RMA)</h2>
                        <button onClick={() => setShowRMAModal(true)} className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg hover:bg-red-600 transition-all flex items-center gap-2">
                            <RotateCcw size={16}/> New Return
                        </button>
                    </div>
                    <GlassCard noPad className="overflow-hidden">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50/80 text-[11px] uppercase text-slate-500 font-bold border-b border-black/5"><tr><th className="p-4">RMA #</th><th className="p-4">Original Order</th><th className="p-4">Customer</th><th className="p-4">Status</th><th className="p-4 text-right">Actions</th></tr></thead>
                            <tbody className="divide-y divide-black/5">
                                {rmas.map(r => (
                                    <tr key={r.id} className="hover:bg-red-50/20 transition-colors">
                                        <td className="p-4 font-bold text-slate-700">{r.rma_number}</td>
                                        <td className="p-4 font-mono text-xs">{r.order_number}</td>
                                        <td className="p-4">{r.customer}</td>
                                        <td className="p-4"><StatusBadge status={r.status}/></td>
                                        <td className="p-4 text-right">
                                            {r.status === 'REQUESTED' && <button onClick={()=>handleReceiveRMA(r.id)} className="text-xs bg-slate-800 text-white px-3 py-1 rounded hover:bg-black">Receive</button>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </GlassCard>
                </div>
            )}

            {activeTab === 'History' && (
                <div className="max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4">
                    <h2 className="text-2xl font-bold text-slate-800 mb-6">Transaction History</h2>
                    <GlassCard noPad className="overflow-hidden">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50/80 text-[11px] uppercase text-slate-500 font-bold border-b border-black/5"><tr><th className="p-4">Time</th><th className="p-4">Action</th><th className="p-4">SKU</th><th className="p-4">Location</th><th className="p-4 text-right">Change</th></tr></thead>
                            <tbody className="divide-y divide-black/5">
                                {history.map(h => (
                                    <tr key={h.id} className="hover:bg-blue-50/20 transition-colors">
                                        <td className="p-4 font-mono text-xs text-slate-500">{new Date(h.timestamp).toLocaleString()}</td>
                                        <td className="p-4"><span className="font-bold text-[10px] uppercase tracking-wider bg-slate-100 px-2 py-1 rounded text-slate-600">{h.action}</span></td>
                                        <td className="p-4 font-medium">{h.sku_snapshot}</td>
                                        <td className="p-4 font-mono text-xs">{h.location_snapshot}</td>
                                        <td className={`p-4 text-right font-bold ${h.quantity_change > 0 ? 'text-green-600' : h.quantity_change < 0 ? 'text-red-500' : 'text-slate-400'}`}>{h.quantity_change > 0 ? '+' : ''}{h.quantity_change}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </GlassCard>
                </div>
            )}

            {activeTab === 'Waves' && (
                <div className="max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4">
                    {!activeWave ? (
                        <>
                            <div className="flex justify-between items-center mb-6">
                                <div><h2 className="text-2xl font-bold text-slate-800">Wave Planning</h2><p className="text-slate-500 text-sm">Select orders to batch pick.</p></div>
                                <button disabled={selectedOrders.length===0} onClick={handleGenerateWave} className="bg-blue-600 disabled:opacity-50 text-white px-6 py-2 rounded-xl font-bold shadow-lg transition-transform active:scale-95">Generate Wave</button>
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                {orders.filter(o=>o.status==='ALLOCATED').map(o => (
                                    <div key={o.id} onClick={()=>setSelectedOrders(prev => prev.includes(o.id)?prev.filter(i=>i!==o.id):[...prev, o.id])} 
                                        className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${selectedOrders.includes(o.id)?'bg-blue-50 border-blue-500 shadow-md':'bg-white/40 border-transparent hover:bg-white/60'}`}>
                                        <div className="flex justify-between mb-2"><span className="font-bold text-slate-700">{o.order_number}</span>{selectedOrders.includes(o.id)&&<CheckCircle2 size={16} className="text-blue-500"/>}</div>
                                        <div className="text-xs text-slate-500">{o.lines.length} Lines · {o.customer_name}</div>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <div className="max-w-3xl mx-auto">
                             <div className="flex justify-between items-center mb-6">
                                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Layers className="text-purple-600"/> {activeWave.wave_id}</h2>
                                <button onClick={()=>setActiveWave(null)} className="text-slate-400 hover:text-slate-600"><X/></button>
                            </div>
                            <GlassCard className="p-0 overflow-hidden mb-6">
                                <div className="bg-slate-50/50 p-4 border-b border-black/5 flex justify-between items-center">
                                    <span className="text-xs font-bold uppercase text-slate-500">Pick Path</span>
                                    <span className="text-xs font-mono bg-slate-200 px-2 py-0.5 rounded text-slate-600">{activeWave.pick_list.length} SKUs</span>
                                </div>
                                <div className="divide-y divide-black/5">
                                    {activeWave.pick_list.map((item, i) => (
                                        <div key={i} className="p-4 flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center font-bold text-slate-500 text-xs">{i+1}</div>
                                                <div>
                                                    <div className="font-bold text-slate-700">{item.sku}</div>
                                                    <div className="text-xs text-slate-500">Loc: <span className="bg-yellow-100 text-yellow-800 px-1 rounded font-mono">{item.location}</span></div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-xl font-bold text-slate-800">x{item.total_qty}</div>
                                                <div className="text-[10px] text-slate-400">Status: {item.status || 'PENDING'}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="p-4 bg-slate-50 border-t border-slate-200">
                                    <button onClick={()=>setScannerMode('WAVE')} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl shadow-lg transition-transform active:scale-95 flex justify-center items-center gap-2">
                                        <Scan size={18}/> Start Scanning
                                    </button>
                                </div>
                            </GlassCard>
                        </div>
                    )}
                </div>
            )}
            
            {activeTab === 'Inventory' && (
                <div className="max-w-6xl mx-auto">
                    <h2 className="text-2xl font-bold text-slate-800 mb-6">Inventory</h2>
                    <GlassCard noPad className="overflow-hidden">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50/80 text-[11px] uppercase text-slate-500 font-bold border-b border-black/5"><tr><th className="p-4">SKU</th><th className="p-4">Location</th><th className="p-4 text-right">Qty</th></tr></thead>
                            <tbody>
                                {inventory.map(i => <tr key={i.id} className="hover:bg-blue-50/20 border-b border-black/5 last:border-0"><td className="p-4 font-medium">{i.item_sku}</td><td className="p-4 font-mono text-xs">{i.location_code}</td><td className="p-4 text-right font-bold text-slate-600">{i.quantity}</td></tr>)}
                            </tbody>
                        </table>
                    </GlassCard>
                </div>
            )}

            {activeTab === 'Scanner' && (
                <div className="max-w-4xl mx-auto grid grid-cols-2 gap-6">
                    <button disabled className="bg-white/40 border border-white/40 p-8 rounded-2xl flex flex-col items-center gap-4 text-slate-400 cursor-not-allowed">
                        <Scan size={48}/>
                        <div className="font-bold">Wave Picking</div>
                        <div className="text-xs">Go to "Waves" tab to start a job</div>
                    </button>
                    <div className="space-y-4">
                        <h3 className="font-bold text-slate-600 px-1">Cycle Counts</h3>
                        {counts.map(c => (
                            <button key={c.id} onClick={()=>{setActiveCount(c); setScannerMode('CYCLE');}} className="w-full bg-white/60 hover:bg-white p-4 rounded-xl flex justify-between items-center shadow-sm hover:shadow-md transition-all">
                                <div><div className="font-bold text-slate-700 font-mono">{c.reference}</div><StatusBadge status={c.status}/></div>
                                <ChevronRight className="text-slate-400"/>
                            </button>
                        ))}
                    </div>
                </div>
            )}

        </div>

        {/* MacOS Dock */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/40 backdrop-blur-2xl border border-white/50 rounded-2xl px-4 py-3 shadow-2xl flex items-end gap-2 z-50">
             <DockItem icon={LayoutDashboard} label="Overview" active={activeTab==='Overview'} onClick={()=>navigate('Overview')} />
             <DockItem icon={Box} label="Inventory" active={activeTab==='Inventory'} onClick={()=>navigate('Inventory')} />
             <DockItem icon={Layers} label="Waves" active={activeTab==='Waves'} onClick={()=>navigate('Waves')} />
             <DockItem icon={ShoppingCart} label="Orders" active={activeTab==='Orders'} onClick={()=>navigate('Orders')} />
             <DockItem icon={RotateCcw} label="Returns" active={activeTab==='Returns'} onClick={()=>navigate('Returns')} />
             <div className="w-px h-10 bg-black/10 mx-2"></div>
             <DockItem icon={Scan} label="Scanner" active={activeTab==='Scanner'} onClick={()=>navigate('Scanner')} />
        </div>

      </div>
    </div>
  );
}