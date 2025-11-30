import React, { useState, useEffect } from 'react';
import { 
  Box, Package, Activity, Search, RefreshCw, AlertCircle, Scan, 
  History, Printer, ShoppingCart, Plus, RotateCcw, 
  Layers, LayoutDashboard, 
  X, ChevronRight, ArrowLeft, Barcode, CheckCircle2, MapPin, ArrowRightCircle,
  ArrowDownCircle, PackageCheck, ArrowRightLeft, ClipboardList, Settings2, Play,
  Map as MapIcon, CalendarClock, QrCode, LogOut, User,
  Moon, Sun, BarChart3, FileText, Users, Shield, Edit, Upload, Bell,
  Truck,
  Tag,
  Save
} from 'lucide-react';
interface Supplier { id: number; name: string; contact_email: string; }
import CursorAura from './CursorAura';
import { motion, AnimatePresence } from 'motion/react';
import { useScanDetection } from './hooks/useScanDetection';
import Login from './Login';
import MobilePicker from './MobilePicker';
import { parseGS1 } from './utils/gs1'; 
import BarcodeGenerator from './BarcodeGenerator';
import { printZPL } from './utils/printer';
import WarehouseMap from './WarehouseMap';

// --- API CONFIG ---
const API_URL = 'http://127.0.0.1:8000/api';

// --- TYPES ---
interface InventoryItem { id: number; item_sku: string; item_name: string; location_code: string; quantity: number; available_quantity: number; reserved_quantity: number; lot_number?: string; expiry_date?: string; status: 'AVAILABLE' | 'DAMAGED' | 'QUARANTINE'; }
interface ItemMaster { id: number; sku: string; name: string; }
interface LocationMaster { id: number; location_code: string; location_type: string; zone: string; x: number; y: number; }
interface OrderLine { id: number; item: number; item_sku: string; qty_ordered: number; qty_allocated: number; qty_picked: number; }
interface Order { id: number; order_number: string; customer_name: string; status: string; created_at: string; customer_address?: string; customer_city?: string; customer_state?: string; customer_zip?: string; lines: OrderLine[]; priority: number; is_on_hold: boolean; }interface LogItem { id: number; timestamp: string; action: string; sku_snapshot: string; quantity_change: number; location_snapshot: string; }
interface DashboardStats { total_stock: number; total_locations: number; low_stock: number; recent_moves: number; heatmap?: {location_snapshot: string, activity: number}[]; }
interface PurchaseOrder { id: number; po_number: string; supplier_name: string; status: string; created_at: string; lines: {sku: string, qty: number, received: number}[]; }
interface RMA { id: number; rma_number: string; order_number: string; customer: string; status: string; lines: any[]; }
interface CycleCountTask { id: number; item_sku: string; location: string; expected_qty: number; counted_qty: number | null; status: 'PENDING' | 'COUNTED'; variance: number | null; }
interface CycleCountSession { id: number; reference: string; status: string; created_at: string; tasks: CycleCountTask[]; }
interface WavePlan { success: boolean; wave_id: string; pick_list: {sku: string, total_qty: number, location: string, orders: string[], order_ids: number[], status?: string}[]; }
interface ReplenishTask { id: number; item_sku: string; source_location: string; dest_location: string; qty_to_move: number; status: 'PENDING'|'COMPLETED'; }
interface BinConfig { id: number; location_code: string; item_sku: string; min_qty: number; max_qty: number; is_pick_face: boolean; }
interface UserPerformance { leaderboard: {user__username: string, total_actions: number}[]; hourly_picks: any[]; }
interface UserData { id: number; username: string; email: string; first_name: string; last_name: string; is_staff: boolean; is_active: boolean; group_names: string[]; groups: number[]; }
interface GroupData { id: number; name: string; }

// --- HELPER COMPONENTS ---

const MacTrafficLights = ({ onRed, onYellow, onGreen }: { onRed: () => void, onYellow: () => void, onGreen: () => void }) => (
  <div className="flex gap-2 px-4 group">
    <button onClick={onRed} title="Logout" className="w-3 h-3 rounded-full bg-[#FF5F56] border border-[#E0443E] shadow-sm hover:opacity-80 active:scale-90 transition-all flex items-center justify-center group-hover:text-[#4d0b09]"></button>
    <button onClick={onYellow} title="Go Back" className="w-3 h-3 rounded-full bg-[#FFBD2E] border border-[#DEA123] shadow-sm hover:opacity-80 active:scale-90 transition-all"></button>
    <button onClick={onGreen} title="Toggle Fullscreen" className="w-3 h-3 rounded-full bg-[#27C93F] border border-[#1AAB29] shadow-sm hover:opacity-80 active:scale-90 transition-all"></button>
  </div>
);

const GlassCard = ({ children, className = "", noPad = false }: any) => (
  <div className={`bg-white/40 dark:bg-slate-800/40 backdrop-blur-xl border border-white/50 dark:border-white/10 shadow-lg rounded-2xl ${noPad ? '' : 'p-6'} ${className}`}>
    {children}
  </div>
);

const DockItem = ({ icon: Icon, label, active, onClick }: any) => (
  <button 
    onClick={onClick}
    className={`group relative flex flex-col items-center gap-1 transition-all duration-300 ${active ? '-translate-y-2 scale-110' : 'hover:-translate-y-1 hover:scale-105'}`}
  >
    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition-all border border-white/20 dark:border-white/10
      ${active ? 'bg-gradient-to-b from-blue-400 to-blue-600 text-white' : 'bg-white/30 dark:bg-slate-800/50 backdrop-blur-md text-slate-700 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-700/50'}`}>
      <Icon size={24} strokeWidth={2} />
    </div>
    <span className={`absolute -top-10 bg-slate-800 dark:bg-white text-white dark:text-slate-900 text-[10px] px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none`}>
      {label}
    </span>
    {active && <div className="w-1 h-1 rounded-full bg-slate-400 dark:bg-slate-500 mt-1"></div>}
  </button>
);

const StatusBadge = ({ status }: { status: string }) => {
  const styles: any = {
    PENDING: 'bg-yellow-500/20 text-yellow-800 dark:text-yellow-300 border-yellow-500/30',
    ALLOCATED: 'bg-blue-500/20 text-blue-800 dark:text-blue-300 border-blue-500/30',
    PICKED: 'bg-purple-500/20 text-purple-800 dark:text-purple-300 border-purple-500/30',
    PACKED: 'bg-orange-500/20 text-orange-800 dark:text-orange-300 border-orange-500/30',
    SHIPPED: 'bg-green-500/20 text-green-800 dark:text-green-300 border-green-500/30',
    REQUESTED: 'bg-red-500/20 text-red-800 dark:text-red-300 border-red-500/30',
    RECEIVED: 'bg-teal-500/20 text-teal-800 dark:text-teal-300 border-teal-500/30',
    DRAFT: 'bg-slate-500/20 text-slate-800 dark:text-slate-300 border-slate-500/30',
    ORDERED: 'bg-blue-500/20 text-blue-800 dark:text-blue-300 border-blue-500/30',
    COMPLETED: 'bg-green-500/20 text-green-800 dark:text-green-300 border-green-500/30',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${styles[status] || 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'} uppercase tracking-wide`}>
      {status}
    </span>
  );
};

// --- MODALS ---

const ManageUserModal = ({ user, groups, onClose, onSubmit }: any) => {
    const [formData, setFormData] = useState({
        username: user?.username || '',
        email: user?.email || '',
        first_name: user?.first_name || '',
        last_name: user?.last_name || '',
        password: '',
        is_staff: user?.is_staff || false,
        is_active: user?.is_active ?? true,
        groups: user?.groups || []
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(formData);
    };

    const toggleGroup = (groupId: number) => {
        setFormData(prev => ({
            ...prev,
            groups: prev.groups.includes(groupId) 
                ? prev.groups.filter((id: number) => id !== groupId)
                : [...prev.groups, groupId]
        }));
    };

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in zoom-in">
            <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl rounded-2xl w-full max-w-lg p-8 shadow-2xl border border-white/40 dark:border-white/10">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800 dark:text-white">
                        <User className="text-blue-600"/> {user ? 'Edit User' : 'Create User'}
                    </h2>
                    <button onClick={onClose}><X size={20} className="text-slate-400 hover:text-slate-600 dark:hover:text-white"/></button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Username</label>
                            <input required value={formData.username} onChange={e=>setFormData({...formData, username: e.target.value})} className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm mt-1" />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Password {user && '(Reset)'}</label>
                            <input type="password" value={formData.password} onChange={e=>setFormData({...formData, password: e.target.value})} className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm mt-1" placeholder={user ? "Leave empty to keep" : "Required"} required={!user} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">First Name</label>
                            <input value={formData.first_name} onChange={e=>setFormData({...formData, first_name: e.target.value})} className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm mt-1" />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Last Name</label>
                            <input value={formData.last_name} onChange={e=>setFormData({...formData, last_name: e.target.value})} className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm mt-1" />
                        </div>
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Email</label>
                        <input type="email" value={formData.email} onChange={e=>setFormData({...formData, email: e.target.value})} className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm mt-1" />
                    </div>
                    
                    <div>
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-2 block">Roles & Permissions</label>
                        <div className="space-y-2 mb-4">
                            <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800">
                                <input type="checkbox" checked={formData.is_staff} onChange={e=>setFormData({...formData, is_staff: e.target.checked})} className="w-4 h-4 rounded text-blue-600"/>
                                <span className="text-sm font-bold text-slate-700 dark:text-white flex items-center gap-2"><Shield size={14}/> Admin / Staff Access</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800">
                                <input type="checkbox" checked={formData.is_active} onChange={e=>setFormData({...formData, is_active: e.target.checked})} className="w-4 h-4 rounded text-blue-600"/>
                                <span className="text-sm text-slate-700 dark:text-white">Active Account</span>
                            </label>
                        </div>
                        
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-2 block">Groups</label>
                        <div className="flex flex-wrap gap-2">
                            {groups.map((g: any) => (
                                <button
                                    key={g.id}
                                    type="button"
                                    onClick={() => toggleGroup(g.id)}
                                    className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                                        formData.groups.includes(g.id)
                                            ? 'bg-blue-600 text-white border-blue-600'
                                            : 'bg-transparent text-slate-500 border-slate-300 dark:border-slate-600'
                                    }`}
                                >
                                    {g.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    <button type="submit" className="w-full py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg transition-transform active:scale-95 text-sm mt-2">
                        {user ? 'Save Changes' : 'Create User'}
                    </button>
                </form>
            </div>
        </div>
    );
};

const LabelModal = ({ zpl, onClose }: { zpl: string, onClose: () => void }) => {
  const imageUrl = `http://api.labelary.com/v1/printers/8dpmm/labels/4x6/0/${encodeURIComponent(zpl)}`;
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-white/20 dark:border-white/10">
        <div className="bg-slate-900 dark:bg-black text-white p-4 flex justify-between items-center">
          <div className="flex items-center gap-2"><Printer size={16} className="text-green-400" /><span className="font-bold text-sm">Print Preview</span></div>
          <button onClick={onClose} className="hover:bg-white/20 p-1 rounded transition-colors"><X size={16}/></button>
        </div>
        <div className="p-8 bg-slate-100 dark:bg-slate-950 flex flex-col items-center">
          <div className="bg-white p-2 shadow-xl border border-slate-200 rotate-0 hover:scale-105 transition-transform duration-300">
             <img src={imageUrl} alt="Shipping Label" className="w-64 h-auto object-contain min-h-[300px] bg-gray-50" />
          </div>
          <div className="mt-8 w-full grid grid-cols-2 gap-3">
             <button onClick={onClose} className="py-2 rounded-xl font-bold text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800 text-sm transition-colors">Cancel</button>
             <button onClick={() => { printZPL(zpl, ""); onClose(); }} className="py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-blue-500/20">Print (QZ)</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const QuickReceiveModal = ({ onClose, onSubmit, locations, items }: any) => {
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const data = {
            sku: (form.elements.namedItem('sku') as HTMLSelectElement).value,
            location: (form.elements.namedItem('location') as HTMLSelectElement).value,
            quantity: parseInt((form.elements.namedItem('quantity') as HTMLInputElement).value),
            lot_number: (form.elements.namedItem('lot') as HTMLInputElement).value,
            expiry_date: (form.elements.namedItem('expiry') as HTMLInputElement).value || null,
            status: (form.elements.namedItem('status') as HTMLSelectElement).value,
            serials: (form.elements.namedItem('serials') as HTMLInputElement).value 
        };
        onSubmit(data);
    };

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in zoom-in duration-200">
            <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl rounded-2xl w-full max-w-md p-8 shadow-2xl border border-white/40 dark:border-white/10">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800 dark:text-white"><ArrowDownCircle className="text-emerald-600"/> Quick Receive</h2>
                    <button onClick={onClose}><X size={20} className="text-slate-400 hover:text-slate-600 dark:hover:text-white"/></button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Product (SKU)</label>
                        <select name="sku" className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm mt-1" required>
                            {items.map((i:any) => <option key={i.id} value={i.sku}>{i.sku} - {i.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Putaway Location</label>
                        <select name="location" className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm mt-1 font-mono" required>
                            {locations.map((l:any) => <option key={l.id} value={l.location_code}>{l.location_code} ({l.location_type})</option>)}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Quantity</label>
                            <input name="quantity" type="number" min="1" defaultValue="1" className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm mt-1" required />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Lot # (Optional)</label>
                            <input name="lot" placeholder="L-123" className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm mt-1" />
                        </div>
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Expiry (Optional)</label>
                        <input name="expiry" type="date" className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm mt-1" />
                    </div>
                    
                    <div>
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Status (QC)</label>
                        <select name="status" className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm mt-1 font-bold text-slate-700 dark:text-white">
                            <option value="AVAILABLE">Available (Good Stock)</option>
                            <option value="DAMAGED">Damaged (Do Not Sell)</option>
                            <option value="QUARANTINE">Quarantine (Hold)</option>
                        </select>
                    </div>

                    <div>
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Serial Numbers</label>
                        <textarea 
                            name="serials" 
                            placeholder="Comma separated (e.g. SN1, SN2, SN3)" 
                            className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm mt-1 h-20 resize-none"
                        />
                        <p className="text-[10px] text-slate-400 mt-1">Required if item is Serialized.</p>
                    </div>

                    <button type="submit" className="w-full py-2.5 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 shadow-lg transition-transform active:scale-95 text-sm mt-2">Receive Stock</button>
                </form>
            </div>
        </div>
    );
};

const CreateOrderModal = ({ onClose, onSubmit, items }: any) => {
  const [formData, setFormData] = useState({
    customer_name: '', customer_email: '', customer_address: '', 
    customer_city: '', customer_state: '', customer_zip: '', customer_country: 'USA',
    sku: '', qty: 1
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in zoom-in duration-200">
      <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl rounded-2xl w-full max-w-2xl p-8 shadow-2xl border border-white/40 dark:border-white/10">
        <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800 dark:text-white"><Plus className="text-blue-600"/> Create Sales Order</h2>
            <button onClick={onClose}><X size={20} className="text-slate-400 hover:text-slate-600 dark:hover:text-white"/></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
             <div className="space-y-3">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b dark:border-white/10 pb-1">Customer Info</h3>
                <input required value={formData.customer_name} onChange={e=>setFormData({...formData, customer_name: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/20 dark:text-white" placeholder="Full Name" />
                <input required value={formData.customer_email} onChange={e=>setFormData({...formData, customer_email: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/20 dark:text-white" placeholder="Email (Optional)" />
                <input required value={formData.customer_address} onChange={e=>setFormData({...formData, customer_address: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/20 dark:text-white" placeholder="Address" />
                
                <div className="grid grid-cols-2 gap-2">
                    <input required value={formData.customer_city} onChange={e=>setFormData({...formData, customer_city: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm outline-none dark:text-white" placeholder="City" />
                    <input required value={formData.customer_state} onChange={e=>setFormData({...formData, customer_state: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm outline-none dark:text-white" placeholder="State" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <input required value={formData.customer_zip} onChange={e=>setFormData({...formData, customer_zip: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm outline-none dark:text-white" placeholder="Zip Code" />
                    <input required value={formData.customer_country} onChange={e=>setFormData({...formData, customer_country: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm outline-none dark:text-white" placeholder="Country" />
                </div>
             </div>
             <div className="space-y-3">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b dark:border-white/10 pb-1">Order Details</h3>
                <select required value={formData.sku} onChange={e=>setFormData({...formData, sku: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm outline-none dark:text-white">
                    <option value="">-- Select Item --</option>
                    {items.map((i: any) => <option key={i.id} value={i.sku}>{i.sku} - {i.name}</option>)}
                </select>
                <input type="number" min="1" required value={formData.qty} onChange={e=>setFormData({...formData, qty: parseInt(e.target.value)})} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm outline-none dark:text-white" />
                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg text-xs text-blue-700 dark:text-blue-300">
                    <p>Note: Orders start in <strong>PENDING</strong> state. You must Allocate inventory to generate Pick tasks.</p>
                </div>
             </div>
          </div>
          <button type="submit" className="w-full py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg transition-transform active:scale-95 text-sm">Create Order</button>
        </form>
      </div>
    </div>
  );
};

const CreateLocationModal = ({ onClose, onSubmit }: any) => {
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const data = {
            location_code: (form.elements.namedItem('code') as HTMLInputElement).value.toUpperCase(),
            location_type: (form.elements.namedItem('type') as HTMLSelectElement).value,
            zone: (form.elements.namedItem('zone') as HTMLInputElement).value,
            x: parseInt((form.elements.namedItem('x') as HTMLInputElement).value) || 0,
            y: parseInt((form.elements.namedItem('y') as HTMLInputElement).value) || 0
        };
        onSubmit(data);
    };
  
    return (
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in zoom-in duration-200">
        <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl rounded-2xl w-full max-w-md p-8 shadow-2xl border border-white/40 dark:border-white/10">
          <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800 dark:text-white"><MapIcon className="text-indigo-600"/> Add Location</h2>
              <button onClick={onClose}><X size={20} className="text-slate-400 hover:text-slate-600 dark:hover:text-white"/></button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Code</label>
                <input name="code" placeholder="A-01-01" className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm font-mono uppercase focus:ring-2 ring-indigo-500/20 outline-none" required autoFocus/>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Type</label>
                    <select name="type" className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm outline-none" required>
                        <option value="RESERVE">Reserve</option>
                        <option value="PICK">Pick Face</option>
                        <option value="DOCK">Dock</option>
                    </select>
                </div>
                <div>
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Zone</label>
                    <input name="zone" placeholder="Zone A" className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm outline-none" required />
                </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Grid X</label>
                    <input name="x" type="number" placeholder="0" className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm outline-none" />
                </div>
                <div>
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Grid Y</label>
                    <input name="y" type="number" placeholder="0" className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm outline-none" />
                </div>
            </div>
            <button type="submit" className="w-full py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg transition-transform active:scale-95 text-sm">Create Bin</button>
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
            <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl rounded-2xl w-full max-w-md p-6 shadow-2xl border border-white/40 dark:border-white/10">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-bold flex items-center gap-2 text-slate-800 dark:text-white"><RotateCcw size={18} className="text-red-500"/> Process Return</h2>
                    <button onClick={onClose}><X size={18} className="text-slate-400 hover:text-slate-600 dark:hover:text-white"/></button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Select Order</label>
                        <select required value={selectedOrderId} onChange={e=>setSelectedOrderId(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm outline-none dark:text-white">
                            <option value="">-- Shipped Orders --</option>
                            {orders.filter((o:any) => o.status === 'SHIPPED').map((o:any) => (
                                <option key={o.id} value={o.id}>{o.order_number} - {o.customer_name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Reason</label>
                        <textarea required value={reason} onChange={e=>setReason(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm outline-none h-24 resize-none dark:text-white" placeholder="Reason for return..." />
                    </div>
                    <button type="submit" className="w-full py-2 bg-red-500 hover:bg-red-600 text-white font-bold rounded-lg shadow-md text-sm transition-transform active:scale-95">Create RMA</button>
                </form>
            </div>
        </div>
    )
}

// --- UNIVERSAL SCANNER (VISUAL + FEFO + LOTS + GS1) ---

const UniversalScanner = ({ mode, data, locations, inventory, onComplete, onBack, onUpdate, onException, token }: any) => {
    const initialStep = mode === 'RECEIVE' ? 'SKU' : mode === 'MOVE' ? 'LOC' : 'LOC';
    const [step, setStep] = useState<'LOC' | 'SKU' | 'QTY' | 'DEST' | 'LOT' | 'EXPIRY' | 'LOT_SELECT' | 'LOT_VERIFY'>(initialStep);
    
    const [manualInput, setManualInput] = useState('');
    const [activeItem, setActiveItem] = useState<any>(null);
    
    const [availableLots, setAvailableLots] = useState<InventoryItem[]>([]);
    const [selectedLot, setSelectedLot] = useState<string>('');

    const [moveSource, setMoveSource] = useState<string>('');
    const [moveSku, setMoveSku] = useState<string>('');

    const playSound = (type: 'success' | 'error') => {
        const freq = type === 'success' ? 1000 : 300;
        const context = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = context.createOscillator();
        const gain = context.createGain();
        osc.connect(gain);
        gain.connect(context.destination);
        osc.frequency.value = freq;
        osc.type = type === 'success' ? 'sine' : 'sawtooth';
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.00001, context.currentTime + 0.3);
    };

    const fetchLotsForActiveItem = async () => {
        if (!activeItem) return;
        const targetSku = activeItem.sku || activeItem.item_sku;
        const targetLoc = activeItem.location || activeItem.source_location;

        // 1. Safety Check: Ensure token exists before making request
        if (!token) {
            console.error("UniversalScanner: Token is missing!");
            alert("Authentication error. Please re-login.");
            return;
        }

        try {
            const res = await fetch(`${API_URL}/inventory/?item__sku=${targetSku}&location_code=${targetLoc}`, {
                headers: { 
                    'Authorization': `Token ${token}`, 
                    'Content-Type': 'application/json'
                }
            });

            // 2. Handle Session Expiry (401 Unauthorized)
            if (res.status === 401) {
                alert("Session Expired. Please re-login.");
                return;
            }

            const data = await res.json();
            
            // FIX: Handle Django Pagination (data.results)
            const invData: InventoryItem[] = Array.isArray(data) ? data : (data.results || []);

            const sorted = invData.sort((a, b) => {
                if (!a.expiry_date) return 1;
                if (!b.expiry_date) return -1;
                return new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime();
            });
            
            setAvailableLots(sorted);
            setStep('LOT_SELECT');
        } catch (e) {
            console.error(e);
            alert("Error fetching lots");
        }
    };

    const getPendingList = () => {
        if (mode === 'CYCLE') return data.tasks.filter((t:any) => t.status === 'PENDING');
        if (mode === 'WAVE') return data.pick_list.filter((p:any) => p.status !== 'PICKED');
        if (mode === 'RECEIVE') return data.lines.filter((l:any) => (l.received||0) < l.qty);
        if (mode === 'REPLENISH') return data.filter((t:any) => t.status === 'PENDING');
        return [];
    };

    const pendingItems = getPendingList();
    const totalItems = mode === 'REPLENISH' ? data.length : (data.tasks || data.pick_list || data.lines || []).length;
    const progress = totalItems > 0 ? ((totalItems - pendingItems.length) / totalItems) * 100 : 0;

    const processScan = (scannedData: string) => {
        let val = scannedData.trim(); 
        const valUpper = val.toUpperCase();

        // --- 1. GS1-128 PARSING ---
        const gs1 = parseGS1(val);
        let detectedSku = '';

        if (gs1 && gs1.sku) {
            detectedSku = gs1.sku.toUpperCase();
            val = detectedSku; 
            playSound('success'); 
        } else {
            detectedSku = valUpper;
        }

        // --- 2. VALIDATE LOCATION SCAN (Case Insensitive) ---
        if ((step === 'LOC' || step === 'DEST') && locations && !gs1) {
            const isValidLoc = locations.some((l:any) => l.location_code.toUpperCase() === valUpper);
            if (!isValidLoc && mode !== 'MOVE') { 
                 playSound('error');
                 alert(`INVALID LOCATION: ${val}. Scan a bin from the Layout.`);
                 return;
            }
        }

        // --- MOVE MODE ---
        if (mode === 'MOVE') {
            if (step === 'LOC') { setMoveSource(val); setStep('SKU'); playSound('success'); }
            else if (step === 'SKU') { setMoveSku(val); setStep('QTY'); playSound('success'); }
            else if (step === 'DEST') {
                onUpdate({ sku: moveSku, source_location: moveSource, dest_location: val, quantity: activeItem?.qty || 1 });
                setMoveSource(''); setMoveSku(''); setActiveItem(null); setStep('LOC');
                playSound('success');
            }
            return;
        }

        // --- AUTO-SELECT TASK (If not active) ---
        if (!activeItem) {
            const pending = getPendingList();
            
            const matchSku = pending.find((t:any) => {
                const tSku = (t.sku || t.item_sku || '').toUpperCase();
                return tSku === detectedSku; 
            });

            if (matchSku) {
                setActiveItem(matchSku);
                
                if (gs1) {
                    if (gs1.lot) matchSku._lot = gs1.lot;
                    if (gs1.expiry) matchSku._expiry = gs1.expiry;
                    alert(`GS1 Detected:\nLot: ${gs1.lot || 'N/A'}\nExp: ${gs1.expiry || 'N/A'}`);
                }

                if (mode === 'RECEIVE') setStep('LOC'); 
                else setStep('LOC'); 
                
                playSound('success');
                return;
            }

            const matchLoc = pending.find((t:any) => {
                const tLoc = (t.location || t.source_location || '').toUpperCase();
                return tLoc === valUpper;
            });

            if (matchLoc) {
                setActiveItem(matchLoc);
                setStep('SKU');
                playSound('success');
                return;
            }

            playSound('error');
            alert("Item or Location not found in this list.");
            return;
        }

        const rawLoc = mode === 'REPLENISH' ? activeItem.source_location : activeItem.location;
        const targetLoc = (rawLoc || '').toUpperCase();
        const targetSku = (activeItem.sku || activeItem.item_sku || '').toUpperCase();
        
        const rawDest = activeItem.dest_location || '';
        const targetDest = rawDest.toUpperCase();

        if (step === 'LOC') {
            if (valUpper === targetLoc || (mode === 'RECEIVE')) {
                if (mode === 'RECEIVE') {
                    activeItem._tempLoc = valUpper; 
                    setStep('QTY'); 
                } else {
                    fetchLotsForActiveItem(); 
                }
                playSound('success');
            } else {
                playSound('error');
                alert(`WRONG BIN! Scanned: ${valUpper}, Expected: ${targetLoc}`);
            }
        } 
        else if (step === 'SKU') {
            if (detectedSku === targetSku) {
                if (gs1) {
                    if (gs1.lot) activeItem._lot = gs1.lot;
                    if (gs1.expiry) activeItem._expiry = gs1.expiry;
                }

                if (mode === 'RECEIVE') setStep('LOC');
                else setStep('QTY'); 
                playSound('success');
            } else {
                 playSound('error');
                 alert(`WRONG SKU! Expected: ${targetSku}`);
            }
        }
        else if (step === 'LOT_VERIFY') {
            const targetLot = (selectedLot || '').toUpperCase();
            if (valUpper === targetLot) {
                setStep(mode === 'REPLENISH' ? 'DEST' : 'QTY');
                playSound('success');
            } else {
                playSound('error');
                alert(`WRONG LOT! Scanned: ${valUpper}, Expected: ${targetLot}`);
            }
        }
        else if (step === 'DEST') {
             if (valUpper === targetDest) {
                 onUpdate(activeItem); 
                 resetCycle();
                 playSound('success');
             } else {
                 playSound('error');
                 alert(`WRONG DEST! Expected: ${targetDest}`);
             }
        } 
        else if (step === 'LOT') {
            activeItem._lot = val;
            setStep('EXPIRY');
            playSound('success');
        } else if (step === 'EXPIRY') {
            onUpdate(activeItem, activeItem._qty, activeItem._tempLoc, activeItem._lot, val);
            resetCycle();
            playSound('success');
        }
    };

    useScanDetection({ onScan: processScan });

    const handleSubmitManual = (e: React.FormEvent) => {
        e.preventDefault();
        if (step === 'QTY') {
            const qty = parseInt(manualInput);
            activeItem._qty = qty;
            
            if (mode === 'RECEIVE') {
                onUpdate(
                    activeItem, 
                    qty, 
                    activeItem._tempLoc, 
                    activeItem._lot || selectedLot, 
                    activeItem._expiry
                );
            } else {
                onUpdate(activeItem, qty, null, activeItem._lot || selectedLot); 
            }

            resetCycle();
            playSound('success');
        } else {
            processScan(manualInput);
        }
        setManualInput('');
    };

    const resetCycle = () => {
        setActiveItem(null);
        setSelectedLot('');
        setAvailableLots([]);
        setStep(mode === 'RECEIVE' ? 'SKU' : 'LOC');
        setManualInput('');
    };

    const handleShortPick = () => {
        if (!activeItem || mode !== 'WAVE') return;
        if(confirm(`Report SHORT PICK for ${activeItem.sku}?`)) {
            if (onException) onException(activeItem, 'SHORT_PICK');
            resetCycle();
        }
    };

    const handleMapClick = (loc: any) => {
        if (activeItem && step === 'LOC') {
            const target = mode === 'REPLENISH' ? activeItem.source_location : activeItem.location;
            if (loc.location_code.toUpperCase() === target?.toUpperCase()) {
                processScan(loc.location_code);
            }
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-900 text-white rounded-xl overflow-hidden relative font-sans">
             <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-blue-900/20 to-slate-900 z-0"/>
             
             <div className="relative z-10 flex justify-between items-center p-4 border-b border-white/10 bg-white/5 backdrop-blur-md">
                <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full transition-colors"><ArrowLeft size={20}/></button>
                <div className="text-center">
                    <div className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">{mode} MODE</div>
                    <div className="font-mono font-bold">{activeItem ? (step) : 'SCAN LIST'}</div>
                </div>
                <div className="text-xs font-bold bg-blue-600 px-2 py-1 rounded-md">{Math.round(progress || 0)}%</div>
            </div>

            {!activeItem ? (
                <div className="relative z-10 flex-1 overflow-y-auto p-4 space-y-3">
                    {pendingItems.length === 0 && (
                        <div className="h-64 flex flex-col items-center justify-center text-emerald-400 animate-in zoom-in">
                            <CheckCircle2 size={64} className="mb-4"/>
                            <h2 className="text-2xl font-bold">JOB DONE</h2>
                            <button onClick={onComplete} className="mt-6 bg-emerald-600 text-white px-6 py-2 rounded-full font-bold">Finish</button>
                        </div>
                    )}
                    {pendingItems.map((t:any) => (
                        <button key={t.id || t.sku + t.location} onClick={() => { setActiveItem(t); setStep(mode === 'RECEIVE' ? 'SKU' : 'LOC'); }} 
                            className="w-full bg-white/5 hover:bg-white/10 border border-white/5 p-4 rounded-xl flex justify-between items-center text-left group active:bg-blue-600/20">
                            <div>
                                <div className="font-mono text-xl font-bold text-yellow-400">
                                    {mode==='REPLENISH' ? t.source_location : (mode==='RECEIVE' ? 'DOCK' : t.location)}
                                </div>
                                <div className="text-sm text-slate-300 font-medium mt-1 flex items-center gap-2">
                                    <Box size={12}/> {mode === 'CYCLE' || mode === 'REPLENISH' ? t.item_sku : t.sku}
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-2xl font-bold">{mode === 'WAVE' ? t.total_qty : (t.qty || t.qty_to_move)}</div>
                                <div className="text-[10px] uppercase text-slate-500">Units</div>
                            </div>
                        </button>
                    ))}
                </div>
            ) : (
                <div className="relative z-10 flex-1 flex flex-col animate-in slide-in-from-right duration-300 h-full">
                    
                    <div className="flex-1 relative overflow-hidden">
                        {step === 'LOC' && mode !== 'RECEIVE' ? (
                            <div className="absolute inset-0 flex flex-col">
                                <div className="bg-yellow-500/20 p-2 text-center text-yellow-300 font-bold text-sm animate-pulse">
                                    GO TO BIN: {activeItem.location || activeItem.source_location}
                                </div>
                                <WarehouseMap 
                                    locations={locations} 
                                    inventory={inventory} 
                                    activeZone="All" 
                                    targetLocation={activeItem.location || activeItem.source_location}
                                    showOnlyTargetZone={true}
                                    onBinClick={handleMapClick}
                                />
                                <div className="absolute bottom-4 left-0 right-0 text-center text-xs text-slate-400 bg-black/50 p-1">
                                    Click highlighted bin to confirm arrival
                                </div>
                            </div>
                        ) : step === 'LOT_SELECT' ? (
                            <div className="p-6 h-full overflow-y-auto">
                                <h3 className="text-center text-xl font-bold mb-4">Select Lot (FEFO)</h3>
                                {availableLots.length === 0 && <div className="text-center text-slate-400">No lots found in this bin.</div>}
                                <div className="space-y-3">
                                    {availableLots.map((lot, idx) => (
                                        <button 
                                            key={lot.id}
                                            onClick={() => { setSelectedLot(lot.lot_number || 'N/A'); setStep('LOT_VERIFY'); }}
                                            className={`w-full p-4 rounded-xl border-2 flex justify-between items-center ${idx === 0 ? 'border-green-500 bg-green-500/10' : 'border-white/10 bg-white/5'}`}
                                        >
                                            <div>
                                                <div className="font-mono font-bold text-lg">{lot.lot_number || 'NO LOT'}</div>
                                                <div className="text-xs text-slate-400 flex items-center gap-2">
                                                    <CalendarClock size={12}/> Exp: {lot.expiry_date || 'N/A'}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-xl font-bold">{lot.quantity}</div>
                                                {idx === 0 && <div className="text-[10px] bg-green-500 text-black px-2 rounded font-bold">FEFO</div>}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col justify-center items-center text-center space-y-6 h-full p-6">
                                <div className="bg-white/10 backdrop-blur-md border border-white/20 p-8 rounded-3xl w-full max-w-sm shadow-2xl relative overflow-hidden">
                                    <div className={`absolute inset-0 opacity-20 ${step === 'SKU' ? 'bg-blue-500' : 'bg-green-500'}`}></div>
                                    <div className="relative z-10">
                                        <div className="text-xs font-bold uppercase tracking-widest opacity-70 mb-2">
                                            {step === 'LOT_VERIFY' ? 'Verify Lot' : 'Enter Quantity'}
                                        </div>
                                        <div className="text-4xl font-mono font-bold tracking-tighter mb-4 truncate">
                                            {step === 'LOT_VERIFY' ? selectedLot : (mode === 'WAVE' ? activeItem.total_qty : '?')}
                                        </div>
                                        <div className="text-sm bg-black/30 rounded-full px-3 py-1 inline-block">
                                            {activeItem.item_name || "Verification"}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <form onSubmit={handleSubmitManual} className="p-4 bg-black/20 backdrop-blur-lg border-t border-white/10">
                        <div className="relative">
                            <Scan className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"/>
                            <input 
                                autoFocus
                                value={manualInput}
                                onChange={e => setManualInput(e.target.value)}
                                type={step === 'QTY' ? 'number' : 'text'}
                                className="w-full bg-black/50 border border-white/20 rounded-2xl py-4 pl-12 pr-4 text-xl font-mono text-white placeholder-slate-600 outline-none focus:border-blue-500"
                                placeholder={step === 'QTY' ? "Enter Qty..." : step === 'LOC' ? "Scan Bin..." : step === 'LOT_VERIFY' ? "Scan Lot..." : "Scan..."}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4 mt-4">
                            <button type="button" onClick={resetCycle} className="py-4 rounded-xl font-bold text-slate-400 bg-white/5 hover:bg-white/10">Cancel</button>
                            <button type="submit" className="py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold shadow-lg">
                                {step === 'QTY' ? 'Confirm' : 'Enter'}
                            </button>
                        </div>
                        {mode === 'WAVE' && step === 'LOC' && (
                            <button type="button" onClick={handleShortPick} className="mt-3 w-full text-red-400 text-xs font-bold py-2 hover:text-red-300">
                                Cannot find item? (Short Pick)
                            </button>
                        )}
                    </form>
                </div>
            )}
        </div>
    );
};

// --- PACKING STATION ---

const PackingStationUI = ({ order, onBack, onComplete, onPrint }: { order: Order, onBack:()=>void, onComplete:()=>void, onPrint:(zpl: string)=>void }) => {
    const [packedItems, setPackedItems] = useState<Record<string, number>>({});
    const [boxSize, setBoxSize] = useState<string>('');
    const [input, setInput] = useState('');
    const [isSealed, setIsSealed] = useState(false);

    const [scanStep, setScanStep] = useState<'SKU' | 'LOT'>('SKU');
    const [activeSku, setActiveSku] = useState<string>('');

    const totalItems = order.lines.reduce((acc, l) => acc + l.qty_picked, 0);
    const currentPacked = Object.values(packedItems).reduce((a,b)=>a+b, 0);
    
    const playSound = (type: 'success' | 'error' | 'beep') => {
        const context = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = context.createOscillator();
        const gain = context.createGain();
        osc.connect(gain);
        gain.connect(context.destination);
        
        if (type === 'error') {
            osc.frequency.value = 300;
            osc.type = 'sawtooth';
        } else if (type === 'success') {
            osc.frequency.value = 1000;
            osc.type = 'sine';
        } else {
            osc.frequency.value = 600; 
            osc.type = 'square';
        }
        
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.00001, context.currentTime + 0.2);
    };

    const handleScan = (e: React.FormEvent) => {
        e.preventDefault();
        const rawVal = input.trim(); 
        const valUpper = rawVal.toUpperCase();

        if (!rawVal) return;

        if (rawVal.includes('|')) {
            const [skuPart] = rawVal.split('|'); // [FIXED] Removed unused lotPart
            const normSku = skuPart.trim().toUpperCase();

            const line = order.lines.find(l => (l.item_sku || '').toUpperCase() === normSku);
            if (!line) {
                playSound('error');
                alert(`Composite Error: Item '${normSku}' is NOT in this order.`);
                setInput('');
                return;
            }

            const currentCount = packedItems[normSku] || 0;
            if (currentCount >= line.qty_picked) {
                playSound('error');
                alert(`Item '${normSku}' is already fully packed!`);
                setInput('');
                return;
            }

            setPackedItems(prev => ({...prev, [normSku]: (prev[normSku] || 0) + 1}));
            
            setScanStep('SKU');
            setActiveSku('');
            playSound('success');
            setInput('');
            return;
        }

        if (scanStep === 'SKU') {
            const line = order.lines.find(l => (l.item_sku || '').toUpperCase() === valUpper);
            
            if (line) {
                const key = line.item_sku.toUpperCase();
                const currentCount = packedItems[key] || 0;
                
                if (currentCount < line.qty_picked) {
                    setActiveSku(key); 
                    setScanStep('LOT'); 
                    playSound('beep');
                    setInput('');
                } else { 
                    playSound('error');
                    alert(`Item '${valUpper}' is already fully packed!`); 
                    setInput(''); 
                }
            } else { 
                playSound('error');
                alert(`Wrong Item! Scanned '${valUpper}' is NOT in this order.`); 
                setInput(''); 
            }
        } else {
            if (valUpper === activeSku) {
                playSound('error');
                alert("You scanned the SKU again. Please scan the Lot Number (e.g., P-01).");
                setInput('');
                return;
            }

            setPackedItems(prev => ({...prev, [activeSku]: (prev[activeSku] || 0) + 1}));
            
            setScanStep('SKU');
            setActiveSku('');
            playSound('success');
            setInput('');
        }
    };

    const handleSeal = async () => {
        if (!boxSize) return alert("Select a box size first!");
        
        if (currentPacked !== totalItems) {
            return alert(`Incomplete: Packed ${currentPacked}/${totalItems} items.`);
        }

        setIsSealed(true);
        try {
            const resPack = await fetch(`${API_URL}/orders/${order.id}/pack/`, { 
                method: 'POST',
                headers: {'Content-Type': 'application/json', 'Authorization': `Token ${localStorage.getItem('token')}`}
            });
            
            if(!resPack.ok) {
                const err = await resPack.json();
                setIsSealed(false);
                return alert("Error packing order: " + (err.error || "Unknown Error"));
            }

            const resShip = await fetch(`${API_URL}/orders/${order.id}/ship/`, { 
                method: 'POST',
                headers: {'Content-Type': 'application/json', 'Authorization': `Token ${localStorage.getItem('token')}`}
            });
            
            if(!resShip.ok) {
                const err = await resShip.json();
                setIsSealed(false);
                return alert("Error shipping order: " + (err.error || "Unknown Error"));
            }

            const resLabel = await fetch(`${API_URL}/orders/${order.id}/shipping_label/`, {
                headers: {'Authorization': `Token ${localStorage.getItem('token')}`}
            });
            
            if (resLabel.ok) {
                const zpl = await resLabel.text();
                
                // --- TRY DIRECT PRINT ---
                try {
                    await printZPL(zpl, ""); 
                    alert("Label sent to printer!");
                } catch (e) {
                    console.warn("Direct print failed, falling back to screen", e);
                    setCurrentZpl(zpl);
                    setShowLabel(true); // Fallback to on-screen modal
                }
                
                onComplete();
            }
        } catch (e) {
            console.error(e);
            setIsSealed(false);
            alert("Network error. Check backend console.");
        }
    };

    return (
        <div className="h-full flex flex-col animate-in fade-in slide-in-from-bottom-4">
            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="bg-white/50 dark:bg-slate-800/50 p-2 rounded-xl hover:bg-white dark:hover:bg-slate-700 transition-colors"><ArrowLeft className="dark:text-white" size={20}/></button>
                    <div>
                        <div className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
                            Packing Station <span className="text-sm font-mono bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded text-slate-600 dark:text-slate-300">{order.order_number}</span>
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{order.customer_name} · {order.customer_city}</div>
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">{currentPacked} <span className="text-lg text-slate-400">/ {totalItems}</span></div>
                    <div className="text-xs font-bold uppercase text-slate-400">Items Scanned</div>
                </div>
            </div>

            <div className="flex-1 flex gap-6 overflow-hidden">
                <div className="w-1/3 flex flex-col gap-4 overflow-y-auto pr-2">
                    {order.lines.map(line => {
                        const key = (line.item_sku || '').toUpperCase();
                        const packed = packedItems[key] || 0;
                        const isComplete = packed >= line.qty_picked;
                        
                        return (
                            <div key={line.id} className={`p-4 rounded-xl border-2 transition-all ${isComplete ? 'bg-green-50 border-green-200 opacity-60 dark:bg-green-900/20 dark:border-green-800' : 'bg-white dark:bg-slate-800 border-white dark:border-slate-700 shadow-sm'}`}>
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className="font-bold text-slate-700 dark:text-slate-200">{line.item_sku}</div>
                                        <div className="text-xs text-slate-500 dark:text-slate-400">Qty Picked: {line.qty_picked}</div>
                                    </div>
                                    {isComplete ? <CheckCircle2 className="text-green-500"/> : <div className="text-xl font-bold text-slate-300 dark:text-slate-600">{packed}/{line.qty_picked}</div>}
                                </div>
                                <div className="mt-2 h-1.5 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                    <div className={`h-full transition-all duration-300 ${isComplete?'bg-green-500':'bg-blue-500'}`} style={{width: `${(packed/line.qty_picked)*100}%`}}></div>
                                </div>
                            </div>
                        )
                    })}
                </div>

                <div className={`flex-1 rounded-3xl border-2 flex flex-col items-center justify-center relative p-8 transition-colors duration-500
                    ${scanStep === 'LOT' ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800' : 'bg-slate-100/50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'}`}>
                    
                    <div className={`w-64 h-64 border-4 border-dashed rounded-2xl flex items-center justify-center mb-8 transition-all 
                        ${currentPacked===totalItems ? 'border-green-400 bg-green-50 dark:bg-green-900/20' : scanStep==='LOT' ? 'border-purple-300 bg-purple-100 dark:bg-purple-900/20' : 'border-slate-300 dark:border-slate-600'}`}>
                        <PackageCheck size={64} className={currentPacked===totalItems ? 'text-green-500' : scanStep==='LOT' ? 'text-purple-500' : 'text-slate-300 dark:text-slate-600'}/>
                    </div>
                    
                    <form onSubmit={handleScan} className="w-full max-w-md relative z-10">
                        <div className={`text-center mb-4 font-bold uppercase tracking-widest transition-colors ${scanStep === 'LOT' ? 'text-purple-600 dark:text-purple-400 scale-110' : 'text-slate-400'}`}>
                            {scanStep === 'SKU' ? 'Step 1: Scan Item SKU' : `Step 2: Scan Lot for ${activeSku}`}
                        </div>
                        
                        <div className="relative">
                            <input 
                                autoFocus 
                                value={input} 
                                onChange={e=>setInput(e.target.value)} 
                                placeholder={scanStep === 'SKU' ? "Scan SKU (or SKU|LOT)..." : "Scan Lot Number..."}
                                className={`w-full p-4 pl-12 rounded-xl shadow-lg border-2 outline-none text-lg font-mono transition-all bg-white dark:bg-slate-800 dark:text-white
                                    ${scanStep === 'LOT' ? 'border-purple-500 focus:ring-4 ring-purple-500/20' : 'border-transparent focus:border-blue-500'}`}
                            />
                            <Barcode className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors ${scanStep === 'LOT' ? 'text-purple-500' : 'text-slate-400'}`}/>
                        </div>
                        <div className="text-[10px] text-center mt-2 text-slate-400 animate-in fade-in">
                            💡 Power Tip: Scan <strong>SKU|LOT</strong> to verify and pack instantly.
                        </div>
                    </form>

                    <div className="mt-8 grid grid-cols-3 gap-4 w-full max-w-lg">
                        {['Small Box', 'Medium Box', 'Large Box'].map(size => (
                            <button key={size} onClick={()=>setBoxSize(size)} className={`p-3 rounded-xl border-2 font-bold text-sm transition-all ${boxSize===size ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'border-white dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:border-blue-200 dark:hover:border-slate-500'}`}>{size}</button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="mt-6 flex justify-between items-center">
                <a 
                    href={`${API_URL}/orders/${order.id}/packing_slip/`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 dark:text-blue-400 font-bold hover:underline flex items-center gap-2"
                >
                    <ClipboardList size={18}/> Download Packing Slip
                </a>

                <button 
                    disabled={currentPacked !== totalItems || !boxSize || isSealed} 
                    onClick={handleSeal} 
                    className="bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-4 rounded-2xl font-bold text-lg shadow-xl shadow-blue-500/30 hover:scale-[1.02] transition-all flex items-center gap-3"
                >
                    {isSealed ? 'Sealing...' : <><Printer/> Seal & Print Label</>}
                </button>
            </div>
        </div>
    );
}

// --- TOAST COMPONENT ---
const ToastContainer = ({ toasts, removeToast }: any) => (
  <div className="fixed bottom-24 right-6 z-[100] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
          {toasts.map((t: any) => (
              <motion.div 
                  key={t.id} 
                  initial={{ opacity: 0, y: 20, scale: 0.9 }} 
                  animate={{ opacity: 1, y: 0, scale: 1 }} 
                  exit={{ opacity: 0, scale: 0.9 }}
                  className={`p-4 rounded-xl shadow-2xl border backdrop-blur-xl flex items-center gap-3 min-w-[300px] cursor-pointer pointer-events-auto ${
                      t.type === 'error' ? 'bg-red-500/90 text-white border-red-400' : 
                      t.type === 'success' ? 'bg-emerald-500/90 text-white border-emerald-400' : 
                      'bg-slate-800/90 text-white border-slate-700'}`}
                  onClick={() => removeToast(t.id)}
              >
                  {t.type === 'error' ? <AlertCircle size={20}/> : t.type === 'success' ? <CheckCircle2 size={20}/> : <Bell size={20}/>}
                  <div className="text-sm font-bold">{t.message}</div>
              </motion.div>
          ))}
      </AnimatePresence>
  </div>
);

// --- MAIN APP ---

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [currentUser, setCurrentUser] = useState<any>(null); // [NEW] Track logged in user info
  const [isMobileMode, setIsMobileMode] = useState(window.location.pathname === '/mobile');
  const [activeTab, setActiveTab] = useState('Overview');
  const [tabHistory, setTabHistory] = useState<string[]>([]);
  const [scannerMode, setScannerMode] = useState<'IDLE' | 'CYCLE' | 'WAVE' | 'RECEIVE' | 'MOVE' | 'REPLENISH'>('IDLE');
  const [toasts, setToasts] = useState<any[]>([]);

  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
      const id = Date.now();
      setToasts(prev => [...prev, { id, message, type }]);
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };
  
  // New Profile Menu State
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  // Dark Mode State
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' || 
        (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });

  // Dark Mode Effect
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  // Data
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [items, setItems] = useState<ItemMaster[]>([]);
  const [locations, setLocations] = useState<LocationMaster[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [rmas, setRmas] = useState<RMA[]>([]);
  const [history, setHistory] = useState<LogItem[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [counts, setCounts] = useState<CycleCountSession[]>([]);
  const [replenishTasks, setReplenishTasks] = useState<ReplenishTask[]>([]);
  const [binConfigs, setBinConfigs] = useState<BinConfig[]>([]);
  const [userStats, setUserStats] = useState<UserPerformance | null>(null);
  const [users, setUsers] = useState<UserData[]>([]); // [NEW]
  const [groups, setGroups] = useState<GroupData[]>([]); // [NEW]
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [labelTab, setLabelTab] = useState<'BIN'|'SHIP'>('BIN');
  const [customZpl, setCustomZpl] = useState<string>(localStorage.getItem('custom_bin_zpl') || '^XA^FO50,50^ADN,36,20^FD${sku}^FS^XZ');
  
  // Features
  const [selectedOrders, setSelectedOrders] = useState<number[]>([]);
  const [activeWave, setActiveWave] = useState<WavePlan | null>(null);
  const [activeCount, setActiveCount] = useState<CycleCountSession | null>(null);
  const [activePO, setActivePO] = useState<PurchaseOrder | null>(null);
  const [packingOrder, setPackingOrder] = useState<Order | null>(null);
  
  // Visual Map State
  const [activeZone, setActiveZone] = useState<string>('All');
  const [selectedLocation, setSelectedLocation] = useState<LocationMaster | null>(null);

  // Modals
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showRMAModal, setShowRMAModal] = useState(false);
  const [showQuickReceive, setShowQuickReceive] = useState(false);
  const [showLabel, setShowLabel] = useState(false);
  const [currentZpl, setCurrentZpl] = useState('');
  const [showUserModal, setShowUserModal] = useState(false); // [NEW]
  const [editingUser, setEditingUser] = useState<UserData | null>(null); // [NEW]

  const handleLogin = (newToken: string) => {
    setToken(newToken);
    localStorage.setItem('token', newToken);
  };

  const handleLogout = () => {
    setToken(null);
    setCurrentUser(null);
    localStorage.removeItem('token');
    setIsMobileMode(false);
    window.history.pushState({}, '', '/');
  };

  // Safe Data Fetching with Pagination Handling
  const fetchAll = async () => {
    if (!token) return;
    try {
        const headers = { 'Authorization': `Token ${token}` };
        
        // 1. Fetch Current User first to determine permissions
        const meRes = await fetch(`${API_URL}/me/`, {headers});
        if(meRes.ok) setCurrentUser(await meRes.json());

        // 2. Parallel Fetch
        const responses = await Promise.allSettled([
            fetch(`${API_URL}/inventory/`, {headers}).then(r=>r.json()),
            fetch(`${API_URL}/orders/`, {headers}).then(r=>r.json()),
            fetch(`${API_URL}/rmas/`, {headers}).then(r=>r.json()),
            fetch(`${API_URL}/history/`, {headers}).then(r=>r.json()),
            fetch(`${API_URL}/dashboard/stats/`, {headers}).then(r=>r.json()),
            fetch(`${API_URL}/cycle-counts/`, {headers}).then(r=>r.json()),
            fetch(`${API_URL}/purchase-orders/`, {headers}).then(r=>r.json()),
            fetch(`${API_URL}/items/`, {headers}).then(r=>r.json()),
            fetch(`${API_URL}/replenishment-tasks/`, {headers}).then(r=>r.json()),
            fetch(`${API_URL}/replenishment-rules/`, {headers}).then(r=>r.json()),
            fetch(`${API_URL}/locations/`, {headers}).then(r=>r.json()),
            // New: User Stats & User Management (Admin only endpoints might return 403, handle gracefully)
            fetch(`${API_URL}/dashboard/users/`, {headers}).then(r=>r.ok ? r.json() : null).catch(() => null),
            fetch(`${API_URL}/users/`, {headers}).then(r=>r.ok ? r.json() : []).catch(() => []),
            fetch(`${API_URL}/groups/`, {headers}).then(r=>r.ok ? r.json() : []).catch(() => []),
            fetch(`${API_URL}/suppliers/`, {headers}).then(r=>r.ok ? r.json() : []).catch(() => []),
        ]);

        const getData = (idx: number, fallback: any = []) => {
            if (responses[idx].status === 'fulfilled') {
                const val = (responses[idx] as any).value;
                if (val && typeof val === 'object' && Array.isArray(val.results)) {
                    return val.results;
                }
                return val;
            }
            return fallback;
        };

        setInventory(getData(0));
        setOrders(getData(1));
        setRmas(getData(2));
        setHistory(getData(3));
        setStats(getData(4, null));
        setCounts(getData(5));
        setPos(getData(6));
        setItems(getData(7));
        setReplenishTasks(getData(8));
        setBinConfigs(getData(9));
        setLocations(getData(10));
        setUserStats(getData(11, null));
        setUsers(getData(12, []));
        setGroups(getData(13, []));
        setSuppliers(getData(14, []));

    } catch(e) { 
        console.error("Critical Data Fetch Error:", e); 
    }
  };

  useEffect(() => { 
      if(token) fetchAll(); 
  }, [token]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleGlobalKeys = (e: KeyboardEvent) => {
        if (!token) return;
        if (e.key === 'F1') { e.preventDefault(); navigate('Inventory'); }
        if (e.key === 'F2') { e.preventDefault(); navigate('Orders'); }
        if (e.key === 'F3') { e.preventDefault(); navigate('Reports'); }
    };
    window.addEventListener('keydown', handleGlobalKeys);
    return () => window.removeEventListener('keydown', handleGlobalKeys);
  }, [token]);

  useEffect(() => {
    if (!token) return;

    const ws = new WebSocket('ws://127.0.0.1:8000/ws/dashboard/');

    ws.onopen = () => {
        console.log('Connected to Real-time WMS Stream');
    };

    ws.onmessage = (e) => {
        const data = JSON.parse(e.data);
        const msgType = data.message?.type;

        if (msgType === 'INVENTORY_CHANGED' || msgType === 'ORDER_PICKED') {
            console.log('Real-time update received:', msgType);
            fetchAll();
        }
    };

    ws.onclose = () => {
        console.log('Disconnected from WMS Stream');
    };

    return () => {
        ws.close();
    };
  }, [token]);

  if (!token) {
      return <Login onLogin={handleLogin} />;
  }

  if (isMobileMode) {
      return <MobilePicker onLogout={handleLogout} />;
  }

  const navigate = (tab: string) => {
      if (activeTab !== tab) {
          setTabHistory(prev => [...prev, activeTab]);
          setActiveTab(tab);
          setPackingOrder(null);
      }
  };

  const handleBack = () => {
      if(packingOrder) { setPackingOrder(null); return; }
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
          order_number: `ORD-${Math.floor(Math.random()*9000)+1000}`, 
          customer_name: data.customer_name,
          customer_email: data.customer_email,
          customer_address: data.customer_address,
          customer_city: data.customer_city,
          customer_state: data.customer_state,
          customer_zip: data.customer_zip,
          customer_country: data.customer_country,
          lines: [{ item: item.id, qty_ordered: data.qty }]
      };
      const res = await fetch(`${API_URL}/orders/`, { method: 'POST', headers: {'Content-Type': 'application/json', 'Authorization': `Token ${token}`}, body: JSON.stringify(payload) });
      if(res.ok) { setShowOrderModal(false); fetchAll(); } else { alert("Error creating order"); }
  };

  const handleQuickReceive = async (data: any) => {
      const res = await fetch(`${API_URL}/inventory/receive/`, {
          method: 'POST', headers: {'Content-Type': 'application/json', 'Authorization': `Token ${token}`}, body: JSON.stringify(data)
      });
      if (res.ok) { 
          setShowQuickReceive(false); 
          alert("Received Successfully!"); 
          fetchAll(); 
      } else { 
          const err = await res.json();
          alert("Error: " + err.error); 
      }
  };

  const handleGenerateWave = async () => {
      const res = await fetch(`${API_URL}/orders/wave_plan/`, { 
          method: 'POST', headers: {'Content-Type': 'application/json', 'Authorization': `Token ${token}`}, body: JSON.stringify({ order_ids: selectedOrders }) 
      });
      const data = await res.json();
      if(res.ok) {
          data.pick_list = data.pick_list.map((p:any) => ({...p, status: 'PENDING'}));
          setActiveWave(data);
      } else { alert(data.error); }
  };

  const handleWavePickSubmit = async (item: any, qty: number, _: any, lot?: string) => {
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
                  method: 'POST', 
                  headers: {'Content-Type': 'application/json', 'Authorization': `Token ${token}`}, 
                  body: JSON.stringify({ 
                      sku: item.sku, 
                      location: item.location, 
                      qty: toPick,
                      lot_number: lot 
                  })
              });
              remainingQty -= toPick;
          }
          if (remainingQty <= 0) break;
      }
      if (activeWave) {
          const updatedList = activeWave.pick_list.map(p => p.sku === item.sku && p.location === item.location ? { ...p, status: 'PICKED' } : p);
          setActiveWave({ ...activeWave, pick_list: updatedList });
      }
  };

  const handleScannerException = async (item: any, type: string) => {
      if (type === 'SHORT_PICK') {
          const orderId = item.order_ids[0]; 
          
          const res = await fetch(`${API_URL}/orders/${orderId}/short_pick/`, {
              method: 'POST',
              headers: {'Content-Type': 'application/json', 'Authorization': `Token ${token}`},
              body: JSON.stringify({ 
                  sku: item.sku, 
                  location: item.location, 
                  qty: item.total_qty 
              })
          });
          
          if(res.ok) {
              alert("Short Pick Recorded. Cycle Count Generated.");
              fetchAll(); 
              if(activeWave) {
                  const updatedList = activeWave.pick_list.filter(p => p.sku !== item.sku || p.location !== item.location);
                  setActiveWave({...activeWave, pick_list: updatedList});
              }
          } else {
              alert("Error recording short pick");
          }
      }
  };

  const handleCycleCountSubmit = async (taskId: number, qty: number) => {
      const res = await fetch(`${API_URL}/cycle-counts/${activeCount?.id}/submit_task/`, {
          method: 'POST', headers: {'Content-Type': 'application/json', 'Authorization': `Token ${token}`}, body: JSON.stringify({ task_id: taskId, qty })
      });
      if(res.ok) {
          const updatedCounts = await fetch(`${API_URL}/cycle-counts/`, {headers: {'Authorization': `Token ${token}`}}).then(r=>r.json());
          setCounts(updatedCounts);
          const current = updatedCounts.find((c:any) => c.id === activeCount?.id);
          setActiveCount(current);
      }
  };

  const handleReceiveSubmit = async (item: any, qty: number, loc: string, lot?: string, expiry?: string) => {
      if(!activePO) return;
      const res = await fetch(`${API_URL}/purchase-orders/${activePO.id}/receive_item/`, {
          method: 'POST', headers: {'Content-Type': 'application/json', 'Authorization': `Token ${token}`}, 
          body: JSON.stringify({ 
              sku: item.sku, 
              location: loc, 
              qty: qty,
              lot_number: lot,
              expiry_date: expiry
          })
      });
      if(res.ok) {
          const updatedPos = await fetch(`${API_URL}/purchase-orders/`, {headers: {'Authorization': `Token ${token}`}}).then(r=>r.json());
          setPos(updatedPos);
          const current = updatedPos.find((p:any) => p.id === activePO.id);
          setActivePO(current);
      }
  };

  const handleMoveSubmit = async (data: any) => {
      const res = await fetch(`${API_URL}/inventory/move/`, {
          method: 'POST', headers: {'Content-Type': 'application/json', 'Authorization': `Token ${token}`}, body: JSON.stringify(data)
      });
      if(res.ok) { alert("Move Successful!"); fetchAll(); } 
      else { const err = await res.json(); alert("Error: " + err.error); }
  };

  const handleReplenishSubmit = async (task: any) => {
      await fetch(`${API_URL}/replenishment-tasks/${task.id}/complete/`, { method: 'POST', headers: {'Authorization': `Token ${token}`} });
      setReplenishTasks(prev => prev.map(t => t.id === task.id ? {...t, status: 'COMPLETED'} : t));
  };

  const handleGenerateReplenish = async () => {
      await fetch(`${API_URL}/replenishment-tasks/generate/`, { method: 'POST', headers: {'Authorization': `Token ${token}`} });
      fetchAll();
  };

  const handleAddRule = async (e: React.FormEvent) => {
      e.preventDefault();
      const form = e.target as HTMLFormElement;
      const data = {
          location_code: (form.elements.namedItem('loc') as HTMLSelectElement).value,
          item: (form.elements.namedItem('item') as HTMLSelectElement).value,
          min_qty: parseInt((form.elements.namedItem('min') as HTMLInputElement).value),
          max_qty: parseInt((form.elements.namedItem('max') as HTMLInputElement).value),
          is_pick_face: true
      };
      await fetch(`${API_URL}/replenishment-rules/`, { method: 'POST', headers: {'Content-Type': 'application/json', 'Authorization': `Token ${token}`}, body: JSON.stringify(data) });
      form.reset();
      fetchAll();
  };

  const handleCreateLocation = async (data: any) => {
      try {
          const res = await fetch(`${API_URL}/locations/`, { 
              method: 'POST', 
              headers: {'Content-Type': 'application/json', 'Authorization': `Token ${token}`}, 
              body: JSON.stringify(data) 
          });
          
          if (res.ok) {
              setShowLocationModal(false);
              fetchAll();
          } else {
              const errorData = await res.json();
              const errorMessage = Object.entries(errorData)
                  .map(([key, val]) => `${key}: ${val}`)
                  .join('\n');
              alert(`Failed to create location:\n${errorMessage}`);
          }
      } catch (e) {
          alert("Network error: Is the backend running?");
      }
  };

  const handleReportMissing = async (loc: string) => {
    if(!confirm(`Report items missing in ${loc}? This will lock the bin and generate a count task.`)) return;
    
    const res = await fetch(`${API_URL}/cycle-counts/create_for_location/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'Authorization': `Token ${token}`},
        body: JSON.stringify({ location: loc })
    });
    
    const data = await res.json();
    if(res.ok) {
        alert(data.message);
        setSelectedLocation(null); 
        fetchAll(); 
    } else {
        alert("Error: " + data.error);
    }
  };

  const handleOrderAction = async (id: number, action: string) => {
      if(!confirm(`Confirm ${action}?`)) return;
      
      try {
          const res = await fetch(`${API_URL}/orders/${id}/${action}/`, { 
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Token ${token}`
              }
          });
          
          const data = await res.json();

          if (!res.ok) {
              alert(`Error: ${data.error || 'Action failed'}`);
          } else {
              if (action === 'allocate') {
                  if (data.status === 'PENDING') {
                      alert("Allocation Incomplete: Not enough stock.");
                  } else if (data.status === 'ALLOCATED') {
                      alert("Order Allocated!");
                  }
              }
              fetchAll(); 
          }
      } catch (e) {
          console.error(e);
          alert("Connection Error");
      }
  };

  const handleGenerateLabel = async (id: number) => {
      const res = await fetch(`${API_URL}/orders/${id}/shipping_label/`, {headers: {'Authorization': `Token ${token}`}});
      if(res.ok) { const zpl = await res.text(); setCurrentZpl(zpl); setShowLabel(true); }
  };

  const handleCreateRMA = async (payload: any) => {
      const res = await fetch(`${API_URL}/rmas/`, { method: 'POST', headers: {'Content-Type': 'application/json', 'Authorization': `Token ${token}`}, body: JSON.stringify(payload) });
      if(res.ok) { setShowRMAModal(false); fetchAll(); }
  };

  const handleReceiveRMA = async (id: number) => {
      if(!confirm("Receive items to default dock?")) return;
      await fetch(`${API_URL}/rmas/${id}/process_receipt/`, { method: 'POST', headers: {'Authorization': `Token ${token}`} });
      fetchAll();
  };

  const handleAutoReplenish = async () => {
      const res = await fetch(`${API_URL}/purchase-orders/auto_replenish/`, {method: 'POST', headers: {'Authorization': `Token ${token}`}});
      if(res.ok) { alert((await res.json()).message); fetchAll(); }
  };

  const handleSaveUser = async (data: any) => {
      const method = editingUser ? 'PATCH' : 'POST';
      const url = editingUser ? `${API_URL}/users/${editingUser.id}/` : `${API_URL}/users/`;
      
      const res = await fetch(url, {
          method,
          headers: {'Content-Type': 'application/json', 'Authorization': `Token ${token}`},
          body: JSON.stringify(data)
      });
      
      if(res.ok) {
          setShowUserModal(false);
          setEditingUser(null);
          fetchAll();
      } else {
          alert("Failed to save user. Check data.");
      }
  };

  // --- NEW HANDLERS (CSV & LABELS) ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const formData = new FormData();
    formData.append('file', e.target.files[0]);
    
    try {
        const res = await fetch(`${API_URL}/items/upload_csv/`, {
            method: 'POST',
            headers: { 'Authorization': `Token ${token}` },
            body: formData
        });
        
        if (res.ok) { 
            alert("Items Imported Successfully!"); 
            fetchAll(); 
        } else { 
            alert("Import failed. Check CSV format."); 
        }
    } catch (e) {
        alert("Network Error during upload");
    }
  };

  const handlePrintBinLabel = async (location: any) => {
      if (!location) return;
      try {
          const res = await fetch(`${API_URL}/locations/${location.id}/bin_label/`, {
              headers: { 'Authorization': `Token ${token}` }
          });
          if (res.ok) {
              const zpl = await res.text();
              try {
                  await printZPL(zpl, ""); // Hardware print
                  alert(`Label sent for ${location.location_code}`);
              } catch (e) {
                  setCurrentZpl(zpl); setShowLabel(true); // Screen fallback
              }
          } else {
             alert("Failed to generate label");
          }
      } catch (e) { alert("Error printing label"); }
  };

  if (scannerMode !== 'IDLE') {
      return (
          <div className="h-screen w-screen bg-black flex items-center justify-center">
              <div className="w-full max-w-md h-[90vh]">
                  {scannerMode === 'WAVE' && activeWave && (
                      <UniversalScanner 
                        mode="WAVE" 
                        data={activeWave} 
                        locations={locations}
                        inventory={inventory}
                        token={token}
                        onUpdate={handleWavePickSubmit} 
                        onException={handleScannerException}
                        onBack={() => setScannerMode('IDLE')}
                        onComplete={() => { 
                            addToast("Wave Complete!", 'success'); // Using addToast
                            setScannerMode('IDLE'); 
                            setActiveWave(null); 
                            setSelectedOrders([]); 
                            fetchAll(); 
                        }} 
                      />
                  )}
                  {scannerMode === 'CYCLE' && activeCount && (
                      <UniversalScanner 
                        mode="CYCLE" 
                        data={activeCount} 
                        locations={locations} 
                        inventory={inventory} 
                        token={token}
                        onUpdate={(item:any, qty:number) => handleCycleCountSubmit(item.id, qty)} 
                        onBack={() => setScannerMode('IDLE')}
                        onComplete={() => { 
                            addToast("Count Complete!", 'success'); 
                            setScannerMode('IDLE'); 
                            setActiveCount(null); 
                            fetchAll(); 
                        }} 
                      />
                  )}
                  {scannerMode === 'RECEIVE' && activePO && (
                      <UniversalScanner 
                        mode="RECEIVE" 
                        data={activePO} 
                        locations={locations} 
                        inventory={inventory} 
                        token={token}
                        onUpdate={(item:any, qty:number, loc: string, lot: string, exp: string) => handleReceiveSubmit(item, qty, loc, lot, exp)} 
                        onBack={() => setScannerMode('IDLE')}
                        onComplete={() => { 
                            addToast("Receiving Complete!", 'success'); 
                            setScannerMode('IDLE'); 
                            setActivePO(null); 
                            fetchAll(); 
                        }} 
                      />
                  )}
                  {scannerMode === 'MOVE' && (
                      <UniversalScanner 
                        mode="MOVE" 
                        data={{reference:'Ad-Hoc Move'}} 
                        locations={locations} 
                        inventory={inventory} 
                        token={token}
                        onUpdate={handleMoveSubmit} 
                        onBack={() => setScannerMode('IDLE')}
                        onComplete={() => { 
                            addToast("Move Complete!", 'success');
                            setScannerMode('IDLE'); 
                            fetchAll(); 
                        }} 
                      />
                  )}
                  {scannerMode === 'REPLENISH' && (
                      <UniversalScanner 
                        mode="REPLENISH" 
                        data={replenishTasks} 
                        locations={locations} 
                        inventory={inventory} 
                        token={token}
                        onUpdate={handleReplenishSubmit} 
                        onBack={()=>setScannerMode('IDLE')} 
                        onComplete={()=>{
                            addToast("Replenishment Complete!", 'success');
                            setScannerMode('IDLE'); 
                            fetchAll();
                        }} 
                      />
                  )}
              </div>
          </div>
      );
  }

  const handleAddSupplier = async (e: React.FormEvent) => {
      e.preventDefault();
      const form = e.target as HTMLFormElement;
      const data = {
          name: (form.elements.namedItem('name') as HTMLInputElement).value,
          contact_email: (form.elements.namedItem('email') as HTMLInputElement).value
      };
      
      const res = await fetch(`${API_URL}/suppliers/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Token ${token}` },
          body: JSON.stringify(data)
      });
      
      if(res.ok) { 
          addToast("Vendor Added", 'success'); 
          fetchAll(); 
          form.reset(); 
      } else { 
          addToast("Failed to add vendor", 'error'); 
      }
  };

  const saveLabelTemplate = () => {
      localStorage.setItem('custom_bin_zpl', customZpl);
      addToast("Label Template Saved", 'success');
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col items-center justify-center p-6 text-slate-800 font-sans selection:bg-blue-200 dark:text-slate-100 dark:selection:bg-blue-900 transition-colors duration-500">
       <style>{`
        /* Track */
        .macos-scrollbar::-webkit-scrollbar {
            width: 14px;  /* Wider clickable area */
            height: 14px;
            background: transparent;
        }
        .macos-scrollbar::-webkit-scrollbar-track {
            background: transparent;
        }
        
        /* Thumb (The floating pill) */
        .macos-scrollbar::-webkit-scrollbar-thumb {
            background-color: rgba(0, 0, 0, 0.2);
            border-radius: 10px;
            border: 4px solid transparent; /* Creates the padding effect */
            background-clip: content-box;  /* Clips background to inside the border */
            min-height: 40px;
        }
        
        /* Hover State */
        .macos-scrollbar::-webkit-scrollbar-thumb:hover {
            background-color: rgba(0, 0, 0, 0.4);
            border: 3px solid transparent; /* Expands slightly on hover */
        }

        /* Dark Mode */
        .dark .macos-scrollbar::-webkit-scrollbar-thumb {
            background-color: rgba(255, 255, 255, 0.2);
        }
        .dark .macos-scrollbar::-webkit-scrollbar-thumb:hover {
            background-color: rgba(255, 255, 255, 0.4);
        }
        
        /* Corner (where X and Y bars meet) */
        .macos-scrollbar::-webkit-scrollbar-corner {
            background: transparent;
        }

        body, html {
            cursor: url('data:image/svg+xml;utf8,<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5.5 2.5L17.5 14.5L11.5 14.5L15.5 21.5L13.5 22.5L9.5 15.5L5.5 19.5V2.5Z" fill="black" stroke="white" stroke-width="1.5" stroke-linejoin="round"/></svg>') 2 2, auto;
        }

        /* Pointer (Hand) - macOS style usually just keeps the arrow or uses a specific hand */
        button, a, [role="button"], .cursor-pointer {
            cursor: url('data:image/svg+xml;utf8,<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 9.5C8 8.67 8.67 8 9.5 8C10.33 8 11 8.67 11 9.5V14H12V7.5C12 6.67 12.67 6 13.5 6C14.33 6 15 6.67 15 7.5V14H16V8.5C16 7.67 16.67 7 17.5 7C18.33 7 19 7.67 19 8.5V16C19 19.31 16.31 22 13 22H9C5.69 22 3 19.31 3 16V11.5C3 10.67 3.67 10 4.5 10C5.33 10 6 10.67 6 11.5V14H7V9.5C7 9.5 7.22 8 8 9.5Z" fill="black" stroke="white" stroke-width="1.5" stroke-linejoin="round"/></svg>') 10 10, pointer;
        }

      `}</style>

      <ToastContainer toasts={toasts} removeToast={(id: any) => setToasts(prev => prev.filter(t => t.id !== id))} />

      {darkMode && <CursorAura />}

      {showLabel && <LabelModal zpl={currentZpl} onClose={()=>setShowLabel(false)} />}
      {showOrderModal && <CreateOrderModal items={items} onClose={()=>setShowOrderModal(false)} onSubmit={handleCreateOrder} />}
      {showRMAModal && <CreateRMAModal orders={orders} onClose={()=>setShowRMAModal(false)} onSubmit={handleCreateRMA} />}
      {showLocationModal && <CreateLocationModal onClose={()=>setShowLocationModal(false)} onSubmit={handleCreateLocation} />}
      {showQuickReceive && <QuickReceiveModal items={items} locations={locations} onClose={()=>setShowQuickReceive(false)} onSubmit={handleQuickReceive} />}
      {showUserModal && <ManageUserModal user={editingUser} groups={groups} onClose={()=>{setShowUserModal(false); setEditingUser(null);}} onSubmit={handleSaveUser}/>}

      <div className="w-full max-w-[1400px] h-[85vh] bg-white/60 dark:bg-slate-900/60 backdrop-blur-2xl rounded-[2rem] shadow-2xl border border-white/40 dark:border-white/10 flex flex-col relative overflow-hidden animate-in fade-in zoom-in duration-500 z-10">
        
        {/* Toolbar */}
        <div className="h-12 flex items-center justify-between px-6 bg-white/10 border-b border-black/5 dark:border-white/5 shrink-0">
            <div className="flex items-center gap-4 w-40"><MacTrafficLights onRed={handleLogout} onYellow={handleBack} onGreen={toggleFullscreen} /></div>
            <div className="font-semibold text-sm text-slate-600/80 dark:text-slate-300 flex items-center gap-2"><Layers size={14} className="text-blue-600 dark:text-blue-400"/> NexWMS <span className="text-slate-400">v3.0</span></div>
            <div className="w-40 flex justify-end items-center gap-3">
                <button 
                  onClick={() => setDarkMode(!darkMode)} 
                  className="p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors text-slate-500 dark:text-slate-400"
                  title="Toggle Theme"
                >
                  {darkMode ? <Sun size={16} className="text-yellow-400"/> : <Moon size={16}/>}
                </button>

                <button onClick={fetchAll} className="p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors text-slate-500 dark:text-slate-400">
                    <RefreshCw size={16}/>
                </button>
                <div className="h-6 w-px bg-slate-300/50 dark:bg-slate-700/50 mx-1"></div>
                <div className="relative">
                    <button 
                        onClick={() => setShowProfileMenu(!showProfileMenu)}
                        className="flex items-center gap-2 hover:bg-white/40 dark:hover:bg-white/10 p-1.5 pr-3 rounded-full transition-all border border-transparent hover:border-white/40"
                    >
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-md">
                            <User size={16}/>
                        </div>
                        <div className="text-xs font-bold text-slate-600 dark:text-slate-300 hidden xl:block">{currentUser?.username || 'Admin'}</div>
                    </button>

                    {showProfileMenu && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setShowProfileMenu(false)}></div>
                            <div className="absolute right-0 top-12 w-56 bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl border border-white/60 dark:border-white/10 rounded-2xl shadow-2xl py-2 z-50 animate-in fade-in slide-in-from-top-2">
                                <div className="px-4 py-3 border-b border-black/5 dark:border-white/10 mb-1">
                                    <div className="text-sm font-bold text-slate-800 dark:text-white">Warehouse Admin</div>
                                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">admin@nexwms.com</div>
                                </div>
                                <div className="p-1">
                                    <button 
                                        onClick={() => {
                                            window.history.pushState({}, '', '/mobile');
                                            setIsMobileMode(true);
                                        }}
                                        className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg flex items-center gap-3 transition-colors"
                                    >
                                        <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center"><QrCode size={16}/></div>
                                        <div>
                                            <div className="font-bold">Mobile Scanner</div>
                                            <div className="text-[10px] text-slate-400">Switch to handheld view</div>
                                        </div>
                                    </button>
                                </div>
                                <div className="h-px bg-black/5 dark:bg-white/10 my-1 mx-2" />
                                <div className="p-1">
                                    <button onClick={handleLogout} className="w-full px-3 py-2 text-left text-sm hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg flex items-center gap-2 transition-colors font-medium">
                                        <LogOut size={16}/> Sign Out
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 scroll-smooth macos-scrollbar">
            
            {activeTab === 'Reports' && (
                <div className="max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4">
                    <div className="mb-6">
                        <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Performance Reports</h2>
                        <p className="text-slate-500 dark:text-slate-400 text-sm">User activity and warehouse metrics.</p>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-6">
                        <GlassCard className="col-span-1 min-h-[300px]" noPad>
                            <div className="p-4 border-b border-black/5 dark:border-white/10 font-bold text-slate-600 dark:text-slate-300 text-sm flex items-center gap-2">
                                <BarChart3 size={16} className="text-blue-500"/> User Leaderboard (All Time)
                            </div>
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-50/80 dark:bg-slate-800/80 text-[11px] uppercase text-slate-500 dark:text-slate-400 font-bold border-b border-black/5 dark:border-white/10">
                                    <tr><th className="p-4">Rank</th><th className="p-4">User</th><th className="p-4 text-right">Actions</th></tr>
                                </thead>
                                <tbody className="divide-y divide-black/5 dark:divide-white/10">
                                    {userStats?.leaderboard?.map((u, i) => (
                                        <tr key={i} className="hover:bg-blue-50/20 dark:hover:bg-blue-900/20 transition-colors">
                                            <td className="p-4 w-16">
                                                <div className={`w-6 h-6 rounded flex items-center justify-center font-bold text-xs ${i===0?'bg-yellow-100 text-yellow-700':i===1?'bg-slate-200 text-slate-700':'bg-orange-100 text-orange-700'}`}>{i+1}</div>
                                            </td>
                                            <td className="p-4 font-bold text-slate-700 dark:text-slate-200">{u.user__username || 'System'}</td>
                                            <td className="p-4 text-right font-mono font-bold text-blue-600 dark:text-blue-400">{u.total_actions}</td>
                                        </tr>
                                    ))}
                                    {!userStats && <tr><td colSpan={3} className="p-8 text-center text-slate-400">Loading stats...</td></tr>}
                                </tbody>
                            </table>
                        </GlassCard>

                        <GlassCard className="col-span-1 min-h-[300px] flex flex-col items-center justify-center text-center p-8 space-y-4">
                            <div className="w-24 h-24 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center">
                                <FileText size={48} className="text-slate-400"/>
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200">More Reports Coming Soon</h3>
                                <p className="text-slate-500 dark:text-slate-400 text-sm max-w-xs">Detailed pick rates, inventory accuracy, and dwell time analytics will be available here.</p>
                            </div>
                        </GlassCard>
                    </div>
                </div>
            )}

            {/* USERS TAB (Admin Only) */}
            {activeTab === 'Users' && (
                <div className="max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-800 dark:text-white">User Management</h2>
                            <p className="text-slate-500 dark:text-slate-400 text-sm">Manage access, roles, and warehouse staff.</p>
                        </div>
                        <button onClick={()=>{setEditingUser(null); setShowUserModal(true);}} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg hover:bg-blue-700 transition-all flex items-center gap-2">
                            <Plus size={16}/> Add User
                        </button>
                    </div>

                    <div className="grid grid-cols-4 gap-6 mb-8">
                        <GlassCard className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600"><Users size={24}/></div>
                            <div><div className="text-2xl font-bold">{users.length}</div><div className="text-xs text-slate-500 uppercase">Total Users</div></div>
                        </GlassCard>
                        <GlassCard className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600"><CheckCircle2 size={24}/></div>
                            <div><div className="text-2xl font-bold">{users.filter(u=>u.is_active).length}</div><div className="text-xs text-slate-500 uppercase">Active</div></div>
                        </GlassCard>
                        <GlassCard className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600"><Shield size={24}/></div>
                            <div><div className="text-2xl font-bold">{users.filter(u=>u.is_staff).length}</div><div className="text-xs text-slate-500 uppercase">Admins</div></div>
                        </GlassCard>
                    </div>

                    <GlassCard noPad className="overflow-hidden">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50/80 dark:bg-slate-800/80 text-[11px] uppercase text-slate-500 dark:text-slate-400 font-bold border-b border-black/5 dark:border-white/10">
                                <tr>
                                    <th className="p-4">User</th>
                                    <th className="p-4">Role / Groups</th>
                                    <th className="p-4">Status</th>
                                    <th className="p-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-black/5 dark:divide-white/10">
                                {users.map(u => (
                                    <tr key={u.id} className="hover:bg-blue-50/20 dark:hover:bg-blue-900/20 transition-colors">
                                        <td className="p-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-slate-600 dark:text-slate-300">
                                                    {u.username.substring(0,2).toUpperCase()}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-slate-700 dark:text-slate-200">{u.username}</div>
                                                    <div className="text-xs text-slate-500">{u.email}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex flex-wrap gap-1">
                                                {u.is_staff && <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-700 text-[10px] font-bold border border-purple-200">ADMIN</span>}
                                                {u.group_names.map(g => (
                                                    <span key={g} className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-bold border border-slate-200 dark:border-slate-600">{g}</span>
                                                ))}
                                                {!u.is_staff && u.group_names.length === 0 && <span className="text-xs text-slate-400 italic">No Roles</span>}
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            {u.is_active 
                                                ? <span className="text-green-600 font-bold text-xs flex items-center gap-1"><CheckCircle2 size={12}/> Active</span>
                                                : <span className="text-red-500 font-bold text-xs flex items-center gap-1"><X size={12}/> Inactive</span>
                                            }
                                        </td>
                                        <td className="p-4 text-right">
                                            <button onClick={()=>{setEditingUser(u); setShowUserModal(true);}} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-500 transition-colors">
                                                <Edit size={16}/>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </GlassCard>
                </div>
            )}

            {activeTab === 'Packing' && packingOrder ? (
                <PackingStationUI order={packingOrder} onBack={() => setPackingOrder(null)} onComplete={() => { setPackingOrder(null); fetchAll(); }} onPrint={(zpl) => { setCurrentZpl(zpl); setShowLabel(true); }} />
            ) : activeTab === 'Packing' && !packingOrder ? (
                <div className="max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4">
                    <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-6">Packing Queue</h2>
                    <div className="grid grid-cols-3 gap-6">
                        {orders.filter(o => o.status === 'PICKED').length === 0 && (<div className="col-span-3 text-center py-20 text-slate-400"><PackageCheck size={64} className="mx-auto mb-4 opacity-50"/><div>No orders ready for packing.</div></div>)}
                        {orders.filter(o => o.status === 'PICKED').map(o => (
                            <GlassCard key={o.id} className="group hover:scale-[1.02] transition-transform cursor-pointer" >
                                <div className="flex justify-between items-start mb-4"><div className="font-bold text-lg text-slate-700 dark:text-slate-200">{o.order_number}</div><div className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded font-bold">READY</div></div>
                                <div className="text-sm text-slate-500 dark:text-slate-400 mb-4">{o.customer_name}<br/>{o.customer_city || 'Unknown City'}</div>
                                <button onClick={() => setPackingOrder(o)} className="w-full bg-purple-600 text-white font-bold py-2 rounded-lg shadow-md hover:bg-purple-700 transition-colors">Start Packing</button>
                            </GlassCard>
                        ))}
                    </div>
                </div>
            ) : null}

            {activeTab === 'Waves' && (
                <div className="max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Wave Planning</h2>
                            <p className="text-slate-500 dark:text-slate-400 text-sm">Group allocated orders into optimized pick paths.</p>
                        </div>
                        {activeWave ? (
                            <div className="flex gap-2">
                                <button onClick={() => setActiveWave(null)} className="px-4 py-2 text-slate-500 dark:text-slate-400 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">Discard</button>
                                <button onClick={() => setScannerMode('WAVE')} className="bg-blue-600 text-white px-6 py-2 rounded-lg shadow-lg font-bold flex items-center gap-2 animate-pulse hover:bg-blue-700 transition-all">
                                    <Play size={18} /> Start Picking
                                </button>
                            </div>
                        ) : (
                            <button 
                                disabled={selectedOrders.length === 0}
                                onClick={handleGenerateWave}
                                className="bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg shadow-lg font-bold transition-all flex items-center gap-2 hover:bg-indigo-700 active:scale-95"
                            >
                                <Layers size={18} /> Generate Wave ({selectedOrders.length})
                            </button>
                        )}
                    </div>

                    <div className="grid grid-cols-12 gap-6">
                        {/* Left Column: Order Selection */}
                        <div className="col-span-5 flex flex-col gap-4 h-[600px]">
                            <div className="flex justify-between items-center">
                                <div className="font-bold text-slate-600 dark:text-slate-400 text-sm uppercase tracking-wider">Ready for Picking</div>
                                <div className="text-xs text-slate-400">{orders.filter(o => o.status === 'ALLOCATED').length} Orders</div>
                            </div>
                            
                            <div className="flex-1 overflow-y-auto space-y-3 pr-2 scroll-smooth macos-scrollbar">
                                {orders.filter(o => o.status === 'ALLOCATED').length === 0 && (
                                    <div className="text-center py-10 text-slate-400 italic border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                                        <PackageCheck size={48} className="mx-auto mb-2 opacity-20"/>
                                        No allocated orders found.<br/>
                                        <span className="text-xs">Go to "Orders" and click Allocate.</span>
                                    </div>
                                )}
                                {orders.filter(o => o.status === 'ALLOCATED').map(order => {
                                    const isSelected = selectedOrders.includes(order.id);
                                    return (
                                        <div 
                                            key={order.id}
                                            onClick={() => !activeWave && setSelectedOrders(prev => isSelected ? prev.filter(id => id !== order.id) : [...prev, order.id])}
                                            className={`p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 ${isSelected ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 shadow-md' : 'border-white dark:border-transparent bg-white/60 dark:bg-slate-800/60 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-white dark:hover:bg-slate-800'} ${activeWave ? 'opacity-50 pointer-events-none' : ''}`}
                                        >
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <div className={`font-bold ${isSelected ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-200'}`}>{order.order_number}</div>
                                                    <div className="text-xs text-slate-500 dark:text-slate-400">{order.customer_name}</div>
                                                </div>
                                                {isSelected ? <CheckCircle2 size={20} className="text-indigo-600 dark:text-indigo-400 fill-indigo-100 dark:fill-indigo-900"/> : <div className="w-5 h-5 rounded-full border-2 border-slate-300 dark:border-slate-600"/>}
                                            </div>
                                            <div className="mt-3 pt-3 border-t border-black/5 dark:border-white/10 flex justify-between items-center text-xs">
                                                <span className="font-mono text-slate-500 dark:text-slate-400">{new Date(order.created_at).toLocaleDateString()}</span>
                                                <span className="font-bold bg-white dark:bg-slate-900 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">{order.lines.length} Items</span>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Right Column: Wave Preview */}
                        <div className="col-span-7">
                            {activeWave ? (
                                <GlassCard className="h-full flex flex-col relative overflow-hidden animate-in zoom-in duration-300">
                                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"/>
                                    <div className="flex justify-between items-center mb-6">
                                        <div>
                                            <div className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mb-1">Active Wave Plan</div>
                                            <div className="text-4xl font-mono font-bold text-slate-800 dark:text-white tracking-tight">{activeWave.wave_id}</div>
                                        </div>
                                        <div className="text-right bg-slate-50 dark:bg-slate-800 px-4 py-2 rounded-xl border border-slate-100 dark:border-slate-700">
                                            <div className="text-3xl font-bold text-slate-700 dark:text-white">{activeWave.pick_list.length}</div>
                                            <div className="text-[10px] font-bold text-slate-400 uppercase">Total Tasks</div>
                                        </div>
                                    </div>
                                    
                                    <div className="flex-1 overflow-y-auto bg-slate-50/50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700 p-2 space-y-2 macos-scrollbar">
                                        {activeWave.pick_list.map((task: any, idx: number) => (
                                            <div key={idx} className="bg-white dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700 flex justify-between items-center shadow-sm hover:shadow-md transition-shadow">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 flex items-center justify-center font-bold text-xs font-mono">{idx + 1}</div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-bold text-lg text-slate-700 dark:text-white">{task.sku}</span>
                                                            {task.status === 'PICKED' && <CheckCircle2 size={14} className="text-green-500"/>}
                                                        </div>
                                                        <div className="flex items-center gap-1 text-xs text-slate-500 font-mono bg-yellow-50 dark:bg-yellow-900/20 px-1.5 py-0.5 rounded w-fit border border-yellow-100 dark:border-yellow-800 dark:text-yellow-200">
                                                            <MapPin size={10}/> {task.location}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="font-bold text-xl text-slate-800 dark:text-white">x{task.total_qty}</div>
                                                    <div className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${task.status === 'PICKED' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-400'}`}>
                                                        {task.status || 'PENDING'}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </GlassCard>
                            ) : (
                                <div className="h-full border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-3xl flex flex-col items-center justify-center text-slate-400 gap-6 bg-slate-50/50 dark:bg-slate-900/50">
                                    <div className="w-24 h-24 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center shadow-sm">
                                        <Layers size={40} className="text-indigo-200 dark:text-indigo-800"/>
                                    </div>
                                    <div className="text-center">
                                        <h3 className="font-bold text-slate-600 dark:text-slate-300 text-lg">No Wave Generated</h3>
                                        <p className="text-sm max-w-xs mx-auto mt-1">Select allocated orders from the left to generate an optimized picking path.</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'Moves' && (
                <div className="max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Internal Moves</h2>
                        <button onClick={()=>setScannerMode('MOVE')} className="bg-blue-600 text-white px-6 py-2 rounded-lg shadow-lg font-bold flex items-center gap-2"><ArrowRightLeft size={18}/> Start Transfer</button>
                    </div>
                    <GlassCard noPad className="overflow-hidden">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50/80 dark:bg-slate-800/80 text-[11px] uppercase text-slate-500 dark:text-slate-400 font-bold border-b border-black/5 dark:border-white/10"><tr><th className="p-4">Time</th><th className="p-4">Item</th><th className="p-4">From/To</th><th className="p-4 text-right">Qty</th></tr></thead>
                            <tbody className="divide-y divide-black/5 dark:divide-white/10">
                                {history.filter(h=>h.action==='MOVE').map(h => (
                                    <tr key={h.id} className="hover:bg-blue-50/20 dark:hover:bg-blue-900/20 transition-colors">
                                        <td className="p-4 font-mono text-xs text-slate-500 dark:text-slate-400">{new Date(h.timestamp).toLocaleString()}</td>
                                        <td className="p-4 font-medium text-slate-700 dark:text-slate-200">{h.sku_snapshot}</td>
                                        <td className="p-4 font-mono text-xs text-slate-600 dark:text-slate-300">{h.location_snapshot}</td>
                                        <td className="p-4 text-right font-bold text-slate-700 dark:text-white">{h.quantity_change}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </GlassCard>
                </div>
            )}

            {activeTab === 'Replenish' && (
                <div className="max-w-6xl mx-auto grid grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4">
                    <div className="col-span-2 space-y-6">
                        <div className="flex justify-between items-center">
                            <div><h2 className="text-2xl font-bold text-slate-800 dark:text-white">Replenishment Tasks</h2><p className="text-slate-500 dark:text-slate-400 text-sm">Moves required to refill pick faces.</p></div>
                            <div className="flex gap-2">
                                <button onClick={handleGenerateReplenish} className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-4 py-2 rounded-lg font-bold text-sm hover:bg-blue-200 dark:hover:bg-blue-900/60">Run Analysis</button>
                                <button onClick={()=>setScannerMode('REPLENISH')} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold text-sm shadow-lg flex items-center gap-2"><Play size={16}/> Start Job</button>
                            </div>
                        </div>
                        <GlassCard noPad className="overflow-hidden">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-50/80 dark:bg-slate-800/80 text-[11px] uppercase text-slate-500 dark:text-slate-400 font-bold border-b border-black/5 dark:border-white/10"><tr><th className="p-4">Status</th><th className="p-4">Item</th><th className="p-4">From (Reserve)</th><th className="p-4">To (Pick)</th><th className="p-4 text-right">Qty</th></tr></thead>
                                <tbody className="divide-y divide-black/5 dark:divide-white/10">
                                    {replenishTasks.map(t => (
                                        <tr key={t.id} className="hover:bg-blue-50/20 dark:hover:bg-blue-900/20 transition-colors">
                                            <td className="p-4"><StatusBadge status={t.status}/></td>
                                            <td className="p-4 font-bold text-slate-700 dark:text-slate-200">{t.item_sku}</td>
                                            <td className="p-4 font-mono text-slate-500 dark:text-slate-400">{t.source_location}</td>
                                            <td className="p-4 font-mono text-blue-600 dark:text-blue-400 font-bold">{t.dest_location}</td>
                                            <td className="p-4 text-right font-bold text-slate-700 dark:text-white">{t.qty_to_move}</td>
                                        </tr>
                                    ))}
                                    {replenishTasks.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-400">No active tasks. Run analysis to check levels.</td></tr>}
                                </tbody>
                            </table>
                        </GlassCard>
                    </div>
                    <div className="space-y-6">
                        <h3 className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2"><Settings2 size={18}/> Pick Face Rules</h3>
                        <GlassCard className="p-4 space-y-4">
                            <form onSubmit={handleAddRule} className="space-y-3">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Location</label>
                                    <select name="loc" className="w-full p-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm mt-1" required>
                                        <option value="">Select Bin...</option>
                                        {locations.filter(l => l.location_type === 'PICK').map(l => (
                                            <option key={l.id} value={l.location_code}>{l.location_code} ({l.zone})</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Item</label>
                                    <select name="item" className="w-full p-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm mt-1" required>
                                        <option value="">Select SKU...</option>
                                        {items.map(i=><option key={i.id} value={i.id}>{i.sku}</option>)}
                                    </select>
                                </div>
                                <div className="flex gap-2">
                                    <div className="w-1/2">
                                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Min</label>
                                        <input name="min" type="number" placeholder="Min" className="w-full p-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm mt-1" required/>
                                    </div>
                                    <div className="w-1/2">
                                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Max</label>
                                        <input name="max" type="number" placeholder="Max" className="w-full p-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm mt-1" required/>
                                    </div>
                                </div>
                                <button className="w-full bg-slate-800 dark:bg-white dark:text-slate-900 text-white py-2 rounded-lg font-bold text-sm">Add Rule</button>
                            </form>
                            <div className="border-t border-slate-200 dark:border-slate-700 pt-4 space-y-2">
                                {binConfigs.map(c => (
                                    <div key={c.id} className="flex justify-between text-xs bg-white/50 dark:bg-slate-800/50 p-2 rounded border border-white dark:border-slate-700 text-slate-700 dark:text-slate-300">
                                        <span className="font-mono font-bold">{c.location_code}</span>
                                        <span>{c.item_sku}</span>
                                        <span className="text-slate-500 dark:text-slate-400">{c.min_qty} - {c.max_qty}</span>
                                    </div>
                                ))}
                            </div>
                        </GlassCard>
                    </div>
                </div>
            )}

            {/* --- VISUAL WAREHOUSE MAP --- */}
            {activeTab === 'Layout' && (
                <div className="max-w-[1400px] mx-auto h-full flex flex-col animate-in fade-in slide-in-from-bottom-4">
                    <div className="flex justify-between items-center mb-4 shrink-0">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Warehouse Map</h2>
                            <p className="text-slate-500 dark:text-slate-400 text-sm">Interactive grid view. Click a bin to audit.</p>
                        </div>
                        
                        <div className="flex gap-2">
                            {/* Zone Filter */}
                            <div className="flex gap-2 bg-white/50 dark:bg-slate-800/50 p-1 rounded-xl border border-white/60 dark:border-white/10 shadow-sm">
                                {['All', ...Array.from(new Set(locations.map(l => l.zone)))].map(z => (
                                    <button 
                                        key={z} 
                                        onClick={() => setActiveZone(z)}
                                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeZone === z ? 'bg-slate-800 dark:bg-white text-white dark:text-slate-900 shadow-md' : 'text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700'}`}
                                    >
                                        {z || 'No Zone'}
                                    </button>
                                ))}
                            </div>
                            <button 
                                onClick={() => setShowLocationModal(true)}
                                className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold text-sm shadow-lg hover:bg-indigo-700 flex items-center gap-2"
                            >
                                <Plus size={16}/> Add Bin
                            </button>
                        </div>
                    </div>

                    <div className="flex gap-6 h-full overflow-hidden">
                        {/* The Visual Grid (Reusable Component) */}
                        <GlassCard noPad className="flex-1 relative bg-slate-50/50 dark:bg-slate-900/50 overflow-hidden border-slate-200 dark:border-slate-700">
                            <WarehouseMap 
                                locations={locations}
                                inventory={inventory}
                                activeZone={activeZone}
                                onBinClick={setSelectedLocation}
                            />
                        </GlassCard>

                        {/* Side Panel: Location Inspector */}
                        <div className="w-80 shrink-0 flex flex-col">
                            {selectedLocation ? (
                                <GlassCard className="h-full flex flex-col animate-in slide-in-from-right">
                                    <div className="flex justify-between items-start mb-6">
                                        <div>
                                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Inspector</div>
                                            <h3 className="text-3xl font-bold text-slate-800 dark:text-white font-mono">{selectedLocation.location_code}</h3>
                                            <div className="flex gap-2 mt-2">
                                                <span className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-1 rounded text-xs font-bold border border-slate-200 dark:border-slate-600">{selectedLocation.location_type}</span>
                                                <span className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-1 rounded text-xs font-bold border border-slate-200 dark:border-slate-600">{selectedLocation.zone}</span>
                                            </div>
                                        </div>
                                        <button onClick={() => setSelectedLocation(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white"><X size={20}/></button>
                                    </div>

                                    <div className="flex-1 overflow-y-auto -mx-2 px-2 space-y-2 macos-scrollbar">
                                        <div className="text-xs font-bold text-slate-400 uppercase mb-2">Contents</div>
                                        {inventory.filter(i => i.location_code === selectedLocation.location_code).length === 0 ? (
                                            <div className="text-center py-8 text-slate-400 italic bg-slate-50/50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                                                Bin is empty
                                            </div>
                                        ) : (
                                            inventory.filter(i => i.location_code === selectedLocation.location_code).map(inv => (
                                                <div key={inv.id} className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm">
                                                    <div className="font-bold text-slate-700 dark:text-slate-200">{inv.item_sku}</div>
                                                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">{inv.item_name}</div>
                                                    <div className="flex justify-between items-center border-t border-slate-100 dark:border-slate-700 pt-2">
                                                        <span className="text-xs text-slate-400">Qty</span>
                                                        <span className="font-bold text-lg text-blue-600 dark:text-blue-400">{inv.quantity}</span>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>

                                    <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700 space-y-3">
                                        <button 
                                            onClick={() => handleReportMissing(selectedLocation.location_code)}
                                            className="w-full py-3 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 font-bold rounded-xl border border-red-200 dark:border-red-800 flex items-center justify-center gap-2 transition-colors"
                                        >
                                            <AlertCircle size={18}/> Report Missing Item
                                        </button>
                                        <button 
                                            onClick={() => handlePrintBinLabel(selectedLocation)} 
                                            className="w-full py-3 bg-slate-800 hover:bg-slate-900 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 text-white font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 transition-colors"
                                        >
                                            <Printer size={18}/> Print Bin Label
                                        </button>
                                    </div>
                                </GlassCard>
                            ) : (
                                <div className="h-full border-2 border-dashed border-slate-300/50 dark:border-slate-700 rounded-2xl flex flex-col items-center justify-center text-slate-400 gap-4">
                                    <MapPin size={48} className="opacity-20"/>
                                    <p className="text-sm font-medium">Select a location on the map<br/>to view contents.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'Overview' && (
                <div className="space-y-8 max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4">
                    {/* Top KPI Cards */}
                    <div className="grid grid-cols-4 gap-6">
                        {[{l:"Total Items",v:stats?.total_stock,i:Package,c:"blue"},{l:"Bin Locations",v:stats?.total_locations,i:LayoutDashboard,c:"purple"},{l:"Restock Needed",v:stats?.low_stock,i:AlertCircle,c:"red"},{l:"Moves Today",v:stats?.recent_moves,i:Activity,c:"emerald"}].map((k,i)=>(
                            <GlassCard key={i} className="flex items-center gap-4 hover:scale-[1.02] transition-transform cursor-default">
                                <div className={`w-12 h-12 rounded-full bg-${k.c}-100 dark:bg-${k.c}-900/30 flex items-center justify-center text-${k.c}-600 dark:text-${k.c}-400`}><k.i/></div>
                                <div><div className="text-3xl font-bold text-slate-800 dark:text-white">{k.v}</div><div className="text-xs font-bold text-slate-400 uppercase">{k.l}</div></div>
                            </GlassCard>
                        ))}
                    </div>

                    <div className="grid grid-cols-3 gap-6">
                        {/* Recent Activity Feed */}
                        <GlassCard className="col-span-2 min-h-[300px]" noPad>
                            <div className="p-4 border-b border-black/5 dark:border-white/10 font-bold text-slate-600 dark:text-slate-300 text-sm flex justify-between items-center">
                                <div className="flex items-center gap-2"><History size={16}/> Recent Activity</div>
                                <button onClick={() => navigate('History')} className="text-xs bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 px-2 py-1 rounded text-slate-600 dark:text-slate-300 transition-colors flex items-center gap-1">Full History <ArrowRightCircle size={12}/></button>
                            </div>
                            <div className="divide-y divide-black/5 dark:divide-white/10 max-h-[300px] overflow-y-auto macos-scrollbar">
                                {history.slice(0, 6).map(h => (
                                    <div key={h.id} className="p-3 px-4 flex justify-between items-center text-sm hover:bg-white/40 dark:hover:bg-white/5 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <span className={`w-2 h-2 rounded-full ${h.action==='PICK'?'bg-purple-500': h.action==='RECEIVE'?'bg-blue-500':'bg-orange-500'}`}/>
                                            <span className="font-medium text-slate-700 dark:text-slate-200">{h.action}</span>
                                            <span className="text-slate-400">·</span>
                                            <span className="font-mono text-slate-600 dark:text-slate-300">{h.sku_snapshot}</span>
                                        </div>
                                        <div className="flex gap-4 text-slate-500 dark:text-slate-400 font-mono text-xs">
                                            <span>{h.location_snapshot}</span>
                                            <span className={h.quantity_change < 0 ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400'}>{h.quantity_change > 0 ? '+' : ''}{h.quantity_change}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </GlassCard>

                        {/* Velocity Heatmap Widget */}
                        <div className="space-y-4">
                             <GlassCard className="h-full flex flex-col" noPad>
                                <div className="p-4 border-b border-black/5 dark:border-white/10 font-bold text-slate-600 dark:text-slate-300 text-sm flex items-center gap-2"><Activity size={16}/> High Velocity Bins</div>
                                <div className="flex-1 p-4 space-y-3 overflow-y-auto max-h-[240px] macos-scrollbar">
                                    {stats?.heatmap && stats.heatmap.length > 0 ? (
                                        stats.heatmap.map((bin, idx) => (
                                            <div key={bin.location_snapshot} className="flex items-center gap-3">
                                                <div className="w-6 h-6 rounded bg-slate-100 dark:bg-slate-700 text-[10px] font-bold flex items-center justify-center text-slate-500 dark:text-slate-300">{idx + 1}</div>
                                                <div className="flex-1">
                                                    <div className="flex justify-between text-xs mb-1">
                                                        <span className="font-bold text-slate-700 dark:text-slate-200 font-mono">{bin.location_snapshot}</span>
                                                        <span className="text-slate-400">{bin.activity} moves</span>
                                                    </div>
                                                    <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                                        <div className="h-full bg-gradient-to-r from-blue-400 to-purple-500" style={{width: `${Math.min(100, (bin.activity / (stats.heatmap?.[0]?.activity || 1)) * 100)}%`}}></div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center text-slate-400 text-xs py-8">No activity data yet.</div>
                                    )}
                                </div>
                             </GlassCard>
                             
                             <button onClick={()=>navigate('Inventory')} className="w-full bg-white/50 dark:bg-slate-800/50 border border-white/40 dark:border-white/10 p-3 rounded-2xl hover:bg-white/80 dark:hover:bg-slate-800/80 transition-all text-left flex items-center justify-between group">
                                <div><div className="font-bold text-slate-700 dark:text-slate-200 text-sm">Lookup Item</div><div className="text-[10px] text-slate-500 dark:text-slate-400">Check stock & locations</div></div>
                                <Search className="text-slate-400 group-hover:text-blue-500 transition-colors" size={18}/>
                             </button>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'Orders' && (
                <div className="max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4">
                    <div className="flex justify-between items-center mb-6"><h2 className="text-2xl font-bold text-slate-800 dark:text-white">Sales Orders</h2><button onClick={() => setShowOrderModal(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg hover:bg-blue-700 transition-all flex items-center gap-2"><Plus size={16}/> New Order</button></div>
                    <GlassCard noPad className="overflow-hidden">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50/80 dark:bg-slate-800/80 text-[11px] uppercase text-slate-500 dark:text-slate-400 font-bold border-b border-black/5 dark:border-white/10"><tr><th className="p-4">Order #</th><th className="p-4">Customer</th><th className="p-4">Status</th><th className="p-4 text-right">Items</th><th className="p-4 text-right">Actions</th></tr></thead>
                            <tbody className="divide-y divide-black/5 dark:divide-white/10">
                                {orders.map(o => (
                                    <tr key={o.id} className="hover:bg-blue-50/20 dark:hover:bg-blue-900/20 transition-colors">
                                        <td className="p-4 font-bold text-slate-700 dark:text-slate-200">{o.order_number}</td><td className="p-4 text-slate-700 dark:text-slate-300">{o.customer_name}</td><td className="p-4"><StatusBadge status={o.status}/></td><td className="p-4 text-right font-mono text-slate-500 dark:text-slate-400">{o.lines.length}</td>
                                        <td className="p-4 text-right space-x-2">
                                            {/* Priority Badge */}
                                            {o.priority > 1 && (
                                                <span className="text-[10px] font-bold bg-red-100 text-red-600 px-2 py-1 rounded border border-red-200 inline-block mr-2 align-middle">
                                                    {o.priority === 3 ? 'URGENT' : 'HIGH'}
                                                </span>
                                            )}

                                            {/* Hold Toggle */}
                                            <button 
                                                onClick={async () => {
                                                    await fetch(`${API_URL}/orders/${o.id}/`, {
                                                        method: 'PATCH',
                                                        headers: {'Content-Type': 'application/json', 'Authorization': `Token ${token}`},
                                                        body: JSON.stringify({ is_on_hold: !o.is_on_hold })
                                                    });
                                                    fetchAll();
                                                }}
                                                className={`text-xs px-3 py-1 rounded font-bold border transition-colors ${
                                                    o.is_on_hold 
                                                    ? 'bg-red-500 text-white border-red-600 hover:bg-red-600' 
                                                    : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                                                }`}
                                            >
                                                {o.is_on_hold ? 'ON HOLD' : 'Hold'}
                                            </button>
                                            
                                            {/* Actions */}
                                            {o.status === 'PENDING' && !o.is_on_hold && <button onClick={()=>handleOrderAction(o.id, 'allocate')} className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700">Allocate</button>}
                                            {o.status === 'PICKED' && <button onClick={()=>navigate('Packing')} className="text-xs bg-purple-500 text-white px-3 py-1 rounded hover:bg-purple-600">Pack</button>}
                                            {o.status === 'PACKED' && <button onClick={()=>handleOrderAction(o.id, 'ship')} className="text-xs bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700">Ship</button>}
                                            {o.status === 'SHIPPED' && <button onClick={()=>handleGenerateLabel(o.id)} className="text-xs bg-slate-800 dark:bg-slate-700 text-white px-3 py-1 rounded hover:bg-black dark:hover:bg-slate-900">Label</button>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </GlassCard>
                </div>
            )}

            {activeTab === 'Receiving' && (
                <div className="max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4">
                    <div className="flex justify-between items-center mb-6"><h2 className="text-2xl font-bold text-slate-800 dark:text-white">Inbound Receiving</h2><button onClick={handleAutoReplenish} className="bg-slate-700 dark:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg hover:bg-slate-800 transition-all flex items-center gap-2"><RefreshCw size={16}/> Auto-Replenish</button></div>
                    <div className="grid grid-cols-2 gap-6">
                        {pos.map(p => (
                            <GlassCard key={p.id} className="hover:scale-[1.01] transition-transform">
                                <div className="flex justify-between items-start mb-4"><div><div className="font-bold text-lg text-slate-700 dark:text-white">{p.po_number}</div><div className="text-xs text-slate-500 dark:text-slate-400">{p.supplier_name}</div></div><StatusBadge status={p.status}/></div>
                                <div className="space-y-2 mb-6"><div className="flex justify-between text-xs font-bold text-slate-500 dark:text-slate-400 uppercase"><span>Progress</span><span>{Math.round((p.lines.reduce((a,b)=>a+(b.received||0),0) / p.lines.reduce((a,b)=>a+b.qty,0)) * 100) || 0}%</span></div><div className="h-2 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden"><div className="h-full bg-blue-500 transition-all duration-500" style={{width: `${(p.lines.reduce((a,b)=>a+(b.received||0),0) / p.lines.reduce((a,b)=>a+b.qty,0)) * 100}%`}}></div></div></div>
                                <div className="flex gap-2 mt-4">
                                    {p.status !== 'RECEIVED' && (
                                        <button onClick={()=>{setActivePO(p); setScannerMode('RECEIVE')}} className="flex-1 bg-blue-600 text-white font-bold py-2 rounded-lg shadow-md hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
                                            <Scan size={16}/> Start Receiving
                                        </button>
                                    )}
                                    <a 
                                        href={`${API_URL}/purchase-orders/${p.id}/download_pdf/`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 flex items-center justify-center border border-slate-300 dark:border-slate-600"
                                        title="Download PO PDF"
                                    >
                                        <FileText size={18}/>
                                    </a>
                                </div>
                            </GlassCard>
                        ))}
                    </div>
                </div>
            )}

            {activeTab === 'Returns' && (
                <div className="max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4">
                    <div className="flex justify-between items-center mb-6"><h2 className="text-2xl font-bold text-slate-800 dark:text-white">Returns (RMA)</h2><button onClick={() => setShowRMAModal(true)} className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg hover:bg-red-600 transition-all flex items-center gap-2"><RotateCcw size={16}/> New Return</button></div>
                    <GlassCard noPad className="overflow-hidden">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50/80 dark:bg-slate-800/80 text-[11px] uppercase text-slate-500 dark:text-slate-400 font-bold border-b border-black/5 dark:border-white/10"><tr><th className="p-4">RMA #</th><th className="p-4">Original Order</th><th className="p-4">Customer</th><th className="p-4">Status</th><th className="p-4 text-right">Actions</th></tr></thead>
                            <tbody className="divide-y divide-black/5 dark:divide-white/10">
                                {rmas.map(r => (
                                    <tr key={r.id} className="hover:bg-red-50/20 dark:hover:bg-red-900/20 transition-colors">
                                        <td className="p-4 font-bold text-slate-700 dark:text-slate-200">{r.rma_number}</td><td className="p-4 font-mono text-xs text-slate-600 dark:text-slate-300">{r.order_number}</td><td className="p-4 text-slate-700 dark:text-slate-300">{r.customer}</td><td className="p-4"><StatusBadge status={r.status}/></td><td className="p-4 text-right">{r.status === 'REQUESTED' && <button onClick={()=>handleReceiveRMA(r.id)} className="text-xs bg-slate-800 dark:bg-slate-700 text-white px-3 py-1 rounded hover:bg-black">Receive</button>}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </GlassCard>
                </div>
            )}

            {activeTab === 'History' && (
                <div className="max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4">
                    <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-6">Transaction History</h2>
                    <GlassCard noPad className="overflow-hidden">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50/80 dark:bg-slate-800/80 text-[11px] uppercase text-slate-500 dark:text-slate-400 font-bold border-b border-black/5 dark:border-white/10"><tr><th className="p-4">Time</th><th className="p-4">Action</th><th className="p-4">SKU</th><th className="p-4">Location</th><th className="p-4 text-right">Change</th></tr></thead>
                            <tbody className="divide-y divide-black/5 dark:divide-white/10">
                                {history.map(h => (
                                    <tr key={h.id} className="hover:bg-blue-50/20 dark:hover:bg-blue-900/20 transition-colors">
                                        <td className="p-4 font-mono text-xs text-slate-500 dark:text-slate-400">{new Date(h.timestamp).toLocaleString()}</td>
                                        <td className="p-4"><span className="font-bold text-[10px] uppercase tracking-wider bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded text-slate-600 dark:text-slate-300">{h.action}</span></td>
                                        <td className="p-4 font-medium text-slate-700 dark:text-slate-200">{h.sku_snapshot}</td>
                                        <td className="p-4 font-mono text-xs text-slate-600 dark:text-slate-300">{h.location_snapshot}</td>
                                        <td className={`p-4 text-right font-bold ${h.quantity_change > 0 ? 'text-green-600 dark:text-green-400' : h.quantity_change < 0 ? 'text-red-500 dark:text-red-400' : 'text-slate-400'}`}>{h.quantity_change > 0 ? '+' : ''}{h.quantity_change}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </GlassCard>
                </div>
            )}

            {activeTab === 'Inventory' && (
                <div className="max-w-6xl mx-auto">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Inventory</h2>
                        <div className="flex gap-2">
                            {/* CSV Import Button */}
                            <div className="relative">
                                <input type="file" onChange={handleFileUpload} className="hidden" id="csv-upload" accept=".csv"/>
                                <label htmlFor="csv-upload" className="bg-slate-700 text-white px-4 py-2 rounded-lg cursor-pointer flex items-center gap-2 hover:bg-slate-600 transition-colors shadow-md font-bold text-sm">
                                    <Upload size={16}/> Import CSV
                                </label>
                            </div>
                            <button onClick={()=>setShowQuickReceive(true)} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg hover:bg-emerald-700 transition-all flex items-center gap-2">
                                <ArrowDownCircle size={16}/> Quick Receive
                            </button>
                        </div>
                    </div>
                    <GlassCard noPad className="overflow-hidden">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50/80 dark:bg-slate-800/80 text-[11px] uppercase text-slate-500 dark:text-slate-400 font-bold border-b border-black/5 dark:border-white/10">
                                <tr>
                                    <th className="p-4">SKU</th>
                                    <th className="p-4">Location</th>
                                    <th className="p-4">Lot #</th>
                                    <th className="p-4">Expiry</th>
                                    {/* [MODIFIED] Added Status Header */}
                                    <th className="p-4">Status</th>
                                    <th className="p-4 text-right">Qty</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-black/5 dark:divide-white/10">
                                {inventory.map(i => (
                                    <tr key={i.id} className="hover:bg-blue-50/20 dark:hover:bg-blue-900/20 transition-colors">
                                        <td className="p-4 font-medium text-slate-700 dark:text-slate-200">{i.item_sku}</td>
                                        <td className="p-4 font-mono text-xs text-slate-600 dark:text-slate-300">{i.location_code}</td>
                                        <td className="p-4 font-mono text-xs text-slate-500 dark:text-slate-400">{i.lot_number || '-'}</td>
                                        <td className="p-4 font-mono text-xs text-slate-500 dark:text-slate-400">{i.expiry_date || '-'}</td>
                                        {/* [MODIFIED] Added Status Cell */}
                                        <td className="p-4">
                                            <span className={`px-2 py-1 rounded text-[10px] font-bold border ${
                                                i.status === 'AVAILABLE' ? 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800' :
                                                i.status === 'DAMAGED' ? 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800' :
                                                'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800'
                                            }`}>
                                                {i.status || 'AVAILABLE'}
                                            </span>
                                        </td>
                                        <td className="p-4 text-right font-bold text-slate-600 dark:text-slate-300">{i.quantity}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </GlassCard>
                </div>
            )}

            {activeTab === 'Scanner' && (
                <div className="max-w-4xl mx-auto grid grid-cols-2 gap-6">
                    <button onClick={()=>setScannerMode('MOVE')} className="bg-white/40 dark:bg-slate-800/40 border border-white/40 dark:border-white/10 p-8 rounded-2xl flex flex-col items-center gap-4 text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-800/60 transition-colors">
                        <ArrowRightLeft size={48}/>
                        <div className="font-bold">Internal Transfer</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">Move items between bins</div>
                    </button>
                    <div className="space-y-4">
                        <h3 className="font-bold text-slate-600 dark:text-slate-300 px-1">Cycle Counts</h3>
                        {counts.map(c => (
                            <button key={c.id} onClick={()=>{setActiveCount(c); setScannerMode('CYCLE');}} className="w-full bg-white/60 dark:bg-slate-800/60 hover:bg-white dark:hover:bg-slate-800 p-4 rounded-xl flex justify-between items-center shadow-sm hover:shadow-md transition-all text-slate-700 dark:text-slate-200">
                                <div><div className="font-bold font-mono">{c.reference}</div><StatusBadge status={c.status}/></div><ChevronRight className="text-slate-400"/>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {activeTab === 'Barcodes' && <BarcodeGenerator />}

            {/* VENDORS TAB */}
            {activeTab === 'Vendors' && (
                <div className="max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4">
                    <div className="flex justify-between items-end mb-6">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Vendor Management</h2>
                            <p className="text-slate-500 text-sm">Manage suppliers for inbound purchase orders.</p>
                        </div>
                        {/* Quick Add Form */}
                        <form onSubmit={handleAddSupplier} className="flex gap-2 bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                            <input name="name" placeholder="Supplier Name" required className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-blue-500/20" />
                            <input name="email" type="email" placeholder="Contact Email" required className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-blue-500/20" />
                            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors flex items-center gap-2"><Plus size={16}/> Add</button>
                        </form>
                    </div>

                    <div className="grid grid-cols-3 gap-6">
                        {suppliers.map(s => (
                            <GlassCard key={s.id} className="relative group hover:border-blue-400 transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600">
                                        <Truck size={24}/>
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-800 dark:text-white">{s.name}</h3>
                                        <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                            <div className="w-2 h-2 rounded-full bg-green-500"></div> Active Vendor
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                                    <div className="text-xs font-bold text-slate-400 uppercase">Contact</div>
                                    <div className="text-sm font-mono text-slate-600 dark:text-slate-300">{s.contact_email}</div>
                                </div>
                            </GlassCard>
                        ))}
                        {suppliers.length === 0 && (
                            <div className="col-span-3 py-12 text-center border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl text-slate-400">
                                No suppliers found. Add one above.
                            </div>
                        )}
                    </div>
                </div>
            )}
            {/* LABEL STUDIO TAB */}
            {activeTab === 'Labels' && (
                <div className="max-w-6xl mx-auto h-full flex flex-col animate-in fade-in">
                    <div className="mb-6 flex justify-between items-center">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Label Studio</h2>
                            <p className="text-slate-500 text-sm">Customize ZPL templates for printing.</p>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={()=>setLabelTab('BIN')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${labelTab==='BIN' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>Bin Labels</button>
                            <button onClick={()=>setLabelTab('SHIP')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${labelTab==='SHIP' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>Shipping Labels</button>
                        </div>
                    </div>

                    <div className="flex-1 flex gap-6 overflow-hidden pb-6">
                        {/* Editor */}
                        <GlassCard className="flex-1 flex flex-col" noPad>
                            <div className="p-4 border-b border-white/20 bg-black/5 dark:bg-white/5 flex justify-between items-center">
                                <span className="font-mono text-xs font-bold text-slate-500">ZPL EDITOR</span>
                                <button onClick={saveLabelTemplate} className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 flex items-center gap-1"><Save size={12}/> Save Template</button>
                            </div>
                            <textarea 
                                value={customZpl}
                                onChange={(e) => setCustomZpl(e.target.value)}
                                className="flex-1 w-full bg-slate-50 dark:bg-slate-900 p-4 font-mono text-xs outline-none resize-none text-slate-800 dark:text-slate-200"
                                spellCheck={false}
                            />
                        </GlassCard>

                        {/* Preview */}
                        <div className="w-[400px] flex flex-col gap-4">
                            <GlassCard className="flex-1 flex flex-col items-center justify-center bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700">
                                <div className="text-xs font-bold text-slate-400 mb-4 uppercase tracking-widest">Live Preview</div>
                                <img 
                                    src={`http://api.labelary.com/v1/printers/8dpmm/labels/4x6/0/${encodeURIComponent(customZpl.replace('${sku}', 'ITEM-123'))}`} 
                                    alt="Label Preview" 
                                    className="shadow-xl border border-gray-200 max-w-full max-h-[400px]" 
                                />
                            </GlassCard>
                            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl text-xs text-blue-700 dark:text-blue-300">
                                <strong>Variables:</strong> Use <code>{'${sku}'}</code>, <code>{'${loc}'}</code> as placeholders.
                            </div>
                        </div>
                    </div>
                </div>
            )}

        </div>

        {/* MacOS Dock */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/40 dark:bg-slate-900/40 backdrop-blur-2xl border border-white/50 dark:border-white/10 rounded-2xl px-4 py-3 shadow-2xl flex items-end gap-2 z-50">
             <DockItem icon={LayoutDashboard} label="Overview" active={activeTab==='Overview'} onClick={()=>navigate('Overview')} />
             <DockItem icon={MapIcon} label="Layout" active={activeTab==='Layout'} onClick={()=>navigate('Layout')} />
             <DockItem icon={Box} label="Inventory" active={activeTab==='Inventory'} onClick={()=>navigate('Inventory')} />
             <DockItem icon={Layers} label="Waves" active={activeTab==='Waves'} onClick={()=>navigate('Waves')} />
             <DockItem icon={ArrowDownCircle} label="Receiving" active={activeTab==='Receiving'} onClick={()=>navigate('Receiving')} />
             <DockItem icon={ArrowRightLeft} label="Moves" active={activeTab==='Moves'} onClick={()=>navigate('Moves')} />
             <DockItem icon={ClipboardList} label="Replenish" active={activeTab==='Replenish'} onClick={()=>navigate('Replenish')} />
             <DockItem icon={PackageCheck} label="Packing" active={activeTab==='Packing'} onClick={()=>navigate('Packing')} />
             <DockItem icon={ShoppingCart} label="Orders" active={activeTab==='Orders'} onClick={()=>navigate('Orders')} />
             <DockItem icon={RotateCcw} label="Returns" active={activeTab==='Returns'} onClick={()=>navigate('Returns')} />
             <div className="w-px h-10 bg-black/10 dark:bg-white/10 mx-2"></div>
             <DockItem icon={BarChart3} label="Reports" active={activeTab==='Reports'} onClick={()=>navigate('Reports')} />
             <DockItem icon={Scan} label="Scanner" active={activeTab==='Scanner'} onClick={()=>navigate('Scanner')} />
             <DockItem icon={QrCode} label="Barcodes" active={activeTab==='Barcodes'} onClick={()=>navigate('Barcodes')} />
             
             {/* Only show Admin tabs if Staff */}
             {currentUser?.is_staff && (
                 <>
                    <div className="w-px h-10 bg-black/10 dark:bg-white/10 mx-2"></div>
                    <DockItem icon={Truck} label="Vendors" active={activeTab==='Vendors'} onClick={()=>navigate('Vendors')} />
                    <DockItem icon={Tag} label="Labels" active={activeTab==='Labels'} onClick={()=>navigate('Labels')} />
                    <DockItem icon={Users} label="Users" active={activeTab==='Users'} onClick={()=>navigate('Users')} alert={!currentUser.is_active} />
                 </>
             )}
        </div>

      </div>
    </div>
  );
}

function addToast(arg0: string, arg1: string) {
    throw new Error('Function not implemented.');
}
function setShowLabel(arg0: boolean) {
    throw new Error('Function not implemented.');
}

function setCurrentZpl(zpl: string) {
    throw new Error('Function not implemented.');
}

