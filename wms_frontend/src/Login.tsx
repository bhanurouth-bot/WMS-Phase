import React, { useState } from 'react';
import { ArrowRight, Loader2, Lock } from 'lucide-react';

interface LoginProps {
  onLogin: (token: string) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('http://127.0.0.1:8000/api/login/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (res.ok) {
        onLogin(data.token);
      } else {
        setError('Invalid credentials');
      }
    } catch (err) {
      setError('Server error. Is backend running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen w-screen bg-cover bg-center flex flex-col items-center justify-center relative overflow-hidden"
         style={{ backgroundImage: `url('https://images.unsplash.com/photo-1477346611705-65d1883cee1e?q=80&w=2070&auto=format&fit=crop')` }}>
      
      {/* Blur Overlay */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-md"></div>

      <div className="relative z-10 flex flex-col items-center animate-in fade-in zoom-in duration-500">
        {/* Avatar Circle */}
        <div className="w-24 h-24 rounded-full bg-gray-200/20 backdrop-blur-xl border border-white/20 shadow-2xl flex items-center justify-center mb-6 overflow-hidden">
            <div className="w-full h-full bg-gradient-to-br from-blue-400 to-purple-600 opacity-80"></div>
        </div>

        <h1 className="text-white text-2xl font-semibold mb-6 tracking-tight drop-shadow-md">
           {username || 'Warehouse Admin'}
        </h1>

        <form onSubmit={handleSubmit} className="w-64 relative group">
          {/* Username Field (Hidden initially or styled minimally if you prefer just password like real macOS, 
              but for a web app we need both) */}
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            className="w-full bg-white/20 backdrop-blur-md text-white placeholder-white/50 px-4 py-2 rounded-t-lg border-b border-white/10 focus:outline-none focus:bg-white/30 transition-all text-sm text-center"
            autoFocus
          />
          
          {/* Password Field */}
          <div className="relative">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full bg-white/20 backdrop-blur-md text-white placeholder-white/50 px-4 py-2 rounded-b-lg focus:outline-none focus:bg-white/30 transition-all text-sm text-center"
            />
            
            <button 
                disabled={loading}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white/70 hover:text-white transition-colors p-1 rounded-full hover:bg-white/20"
            >
                {loading ? <Loader2 size={14} className="animate-spin"/> : <ArrowRight size={14}/>}
            </button>
          </div>
        </form>

        {error && (
            <div className="mt-4 bg-red-500/80 backdrop-blur text-white text-xs px-3 py-1 rounded-full shadow-lg animate-bounce">
                {error}
            </div>
        )}

        <div className="mt-12 text-white/40 text-xs flex flex-col items-center gap-2">
            <div className="flex gap-1 items-center"><Lock size={12}/> Secured WMS Environment</div>
            <p>NexWMS v1.0</p>
        </div>
      </div>
    </div>
  );
}