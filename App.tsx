
import React, { useState, useEffect, useRef } from 'react';
import { Server, Channel, Message, User } from './types.ts';
import { INITIAL_SERVERS } from './constants.tsx';
import { 
  Plus, Hash, Volume2, Mic, MicOff, Settings, 
  Send, Smile, Users, Bell, Search, 
  PhoneOff, Video, VideoOff, Monitor, LogOut,
  Sparkles, Zap, MessageSquare, Compass, Radio
} from 'lucide-react';

const AuthScreen = ({ onLogin }: { onLogin: (user: User) => void }) => {
  const [username, setUsername] = useState('');
  const [avatar, setAvatar] = useState(`https://api.dicebear.com/7.x/avataaars/svg?seed=${Math.random()}`);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    const newUser: User = {
      id: `u_${Math.random().toString(36).substr(2, 5)}_${Date.now().toString().slice(-4)}`,
      username,
      avatar,
      status: 'online'
    };
    localStorage.setItem('vibe_user', JSON.stringify(newUser));
    onLogin(newUser);
  };

  return (
    <div className="h-screen w-screen flex items-center justify-center p-4 bg-[#0a0a12]">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-600/20 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-cyan-600/20 blur-[120px] rounded-full"></div>
      </div>
      
      <div className="glass p-10 rounded-[40px] shadow-2xl w-full max-w-[440px] relative z-10 text-center border border-white/10" style={{
        background: 'rgba(255, 255, 255, 0.03)',
        backdropFilter: 'blur(12px)'
      }}>
        <div className="bg-gradient-to-tr from-purple-500 to-cyan-400 w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-lg shadow-purple-500/20">
          <Zap className="text-white" size={32} />
        </div>
        <h2 className="text-4xl font-extrabold text-white mb-2 tracking-tight">VibeSpace</h2>
        <p className="text-gray-400 mb-8 font-medium italic">Step into the future of chill.</p>
        
        <form onSubmit={handleSubmit} className="space-y-6 text-left">
          <div className="space-y-2">
            <label className="text-sm font-black text-gray-300 ml-1 uppercase tracking-widest opacity-70">Handle</label>
            <input 
              type="text" 
              autoFocus
              className="w-full bg-white/5 border border-white/10 text-white p-4 rounded-2xl outline-none focus:ring-2 focus:ring-purple-500 transition-all placeholder:text-gray-600"
              placeholder="cyber_ghost"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          
          <div className="flex flex-col items-center py-2">
             <div className="p-1 rounded-full bg-gradient-to-r from-purple-500 to-cyan-500 mb-4 shadow-lg shadow-purple-500/20">
               <img src={avatar} className="w-24 h-24 rounded-full bg-[#1a1a2e]" alt="Avatar" />
             </div>
             <button 
              type="button"
              onClick={() => setAvatar(`https://api.dicebear.com/7.x/avataaars/svg?seed=${Math.random()}`)}
              className="text-purple-400 text-xs font-black hover:text-purple-300 transition-colors uppercase tracking-widest"
             >
               Refresh Style
             </button>
          </div>
          
          <button type="submit" className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black py-4 rounded-2xl transition-all shadow-xl shadow-purple-900/20 active:scale-95 uppercase tracking-widest">
            Enter Space
          </button>
        </form>
      </div>
    </div>
  );
};

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem('vibe_user');
      return saved ? JSON.parse(saved) : null;
    } catch(e) { return null; }
  });

  const [activeServer, setActiveServer] = useState<Server>(INITIAL_SERVERS[0]);
  const [activeChannel, setActiveChannel] = useState<Channel>(INITIAL_SERVERS[0].channels[0]);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [inputValue, setInputValue] = useState('');
  const [isInVoice, setIsInVoice] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<{id: string, stream: MediaStream, name: string}[]>([]);
  
  const peerRef = useRef<any>(null);
  const userVideoRef = useRef<HTMLVideoElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, activeChannel]);

  useEffect(() => {
    if (currentUser && !peerRef.current) {
      // @ts-ignore
      const PeerClass = window.Peer;
      if (!PeerClass) return;
      
      const peer = new PeerClass(currentUser.id);
      peer.on('error', console.error);
      peer.on('call', (call: any) => {
        if (localStream) {
          call.answer(localStream);
          handleCallStream(call);
        }
      });
      peerRef.current = peer;
    }
  }, [currentUser, localStream]);

  const handleCallStream = (call: any) => {
    call.on('stream', (remoteStream: MediaStream) => {
      setRemoteStreams(prev => {
        if (prev.find(s => s.id === call.peer)) return prev;
        return [...prev, { id: call.peer, stream: remoteStream, name: 'User ' + call.peer.slice(-3) }];
      });
    });
    call.on('close', () => {
      setRemoteStreams(prev => prev.filter(s => s.id !== call.peer));
    });
  };

  if (!currentUser) return <AuthScreen onLogin={setCurrentUser} />;

  const startCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      setLocalStream(stream);
      setIsInVoice(true);
      setIsCameraOn(true);
      if (userVideoRef.current) userVideoRef.current.srcObject = stream;
    } catch (e) {
      console.error(e);
      alert("Microphone/Camera access required.");
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    const msg: Message = {
      id: Date.now().toString(),
      author: currentUser.username,
      avatar: currentUser.avatar,
      content: inputValue,
      timestamp: new Date()
    };
    setMessages(prev => ({ ...prev, [activeChannel.id]: [...(prev[activeChannel.id] || []), msg] }));
    setInputValue('');
  };

  return (
    <div className="flex h-screen w-screen p-4 gap-4 bg-[#08080f] text-gray-200">
      <nav className="flex flex-col items-center py-6 px-3 rounded-[32px] w-20 space-y-4 border border-white/5 flex-shrink-0" style={{ background: 'rgba(255, 255, 255, 0.03)', backdropFilter: 'blur(12px)' }}>
        <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl flex items-center justify-center cursor-pointer shadow-lg shadow-purple-500/20 mb-4 hover:rotate-12 transition-transform">
          <Zap className="text-white" size={24} />
        </div>
        {INITIAL_SERVERS.map(s => (
          <div 
            key={s.id} 
            onClick={() => { setActiveServer(s); setActiveChannel(s.channels[0]); }}
            className={`w-12 h-12 rounded-2xl cursor-pointer transition-all hover:scale-110 active:scale-95 overflow-hidden border-2 ${activeServer.id === s.id ? 'border-purple-500 shadow-lg shadow-purple-500/30' : 'border-transparent opacity-60 hover:opacity-100'}`}
          >
            <img src={s.icon} className="w-full h-full object-cover" alt={s.name} />
          </div>
        ))}
        <div className="mt-auto">
          <button onClick={() => { localStorage.removeItem('vibe_user'); window.location.reload(); }} className="w-12 h-12 rounded-2xl flex items-center justify-center text-red-400 hover:text-red-300 transition-colors" style={{ background: 'rgba(255, 255, 255, 0.03)' }}>
            <LogOut size={20} />
          </button>
        </div>
      </nav>

      <div className="flex flex-1 gap-4 overflow-hidden min-w-0">
        <aside className="w-64 rounded-[32px] flex flex-col p-4 border border-white/5 flex-shrink-0" style={{ background: 'rgba(255, 255, 255, 0.03)', backdropFilter: 'blur(12px)' }}>
          <div className="px-4 py-4 mb-4">
            <h2 className="text-xl font-black text-white tracking-tighter uppercase italic truncate">{activeServer.name}</h2>
          </div>
          <div className="flex-1 space-y-6 overflow-y-auto pr-2">
            <div>
              <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3 ml-4">Lobby</p>
              {activeServer.channels.map(c => (
                <div 
                  key={c.id} 
                  onClick={() => { setActiveChannel(c); if(c.type === 'voice' && !isInVoice) startCall(); }}
                  className={`flex items-center px-4 py-3 rounded-2xl cursor-pointer transition-all mb-1 font-bold ${activeChannel.id === c.id ? 'bg-gradient-to-r from-purple-600 to-purple-500 text-white shadow-lg shadow-purple-500/20' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
                >
                  {c.type === 'text' ? <MessageSquare className="mr-3" size={18} /> : <Radio className="mr-3" size={18} />}
                  <span className="text-sm truncate">{c.name}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 p-3 bg-white/5 rounded-2xl flex items-center gap-3 border border-white/5">
             <img src={currentUser.avatar} className="w-10 h-10 rounded-xl" alt="Me" />
             <div className="flex-1 min-w-0">
               <p className="text-sm font-black text-white truncate">{currentUser.username}</p>
               <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tight">Online</p>
             </div>
             <Settings size={18} className="text-gray-500 hover:text-white cursor-pointer" />
          </div>
        </aside>

        <main className="flex-1 rounded-[32px] flex flex-col border border-white/5 relative overflow-hidden min-w-0" style={{ background: 'rgba(255, 255, 255, 0.03)', backdropFilter: 'blur(12px)' }}>
          <header className="flex items-center justify-between px-8 py-6 border-b border-white/5 backdrop-blur-md z-10">
            <div className="flex items-center gap-3">
              <h3 className="text-xl font-black text-white tracking-tighter uppercase italic">{activeChannel.name}</h3>
            </div>
            <div className="flex items-center gap-4 text-gray-400">
               <Search size={20} className="hover:text-white cursor-pointer" />
               <Bell size={20} className="hover:text-white cursor-pointer" />
            </div>
          </header>

          <div className="flex-1 flex flex-col p-6 overflow-hidden">
             <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-6 pr-4 mb-4">
                {(messages[activeChannel.id] || []).map((msg) => (
                  <div key={msg.id} className={`flex gap-4 group ${msg.author === currentUser.username ? 'flex-row-reverse' : ''}`}>
                    <img src={msg.avatar} className="w-10 h-10 rounded-xl flex-shrink-0" alt={msg.author} />
                    <div className={`flex flex-col ${msg.author === currentUser.username ? 'items-end' : 'items-start'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-black text-purple-400 uppercase">{msg.author}</span>
                      </div>
                      <div className={`p-4 rounded-[24px] max-w-md text-sm leading-relaxed ${msg.author === currentUser.username ? 'bg-gradient-to-tr from-purple-700 to-indigo-600 text-white rounded-tr-none' : 'text-gray-200 rounded-tl-none border border-white/5'}`} style={{ background: msg.author === currentUser.username ? undefined : 'rgba(255,255,255,0.03)' }}>
                        {msg.content}
                      </div>
                    </div>
                  </div>
                ))}
             </div>
             <form onSubmit={handleSendMessage} className="mt-auto">
               <div className="p-2 rounded-[28px] flex items-center border border-white/10 shadow-2xl bg-[#0d0d16]/50" style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(12px)' }}>
                  <input 
                    type="text" 
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder={`Message #${activeChannel.name}`}
                    className="bg-transparent flex-1 outline-none text-white px-5 py-3 font-bold text-sm"
                  />
                  <button type="submit" className="p-3 bg-gradient-to-tr from-purple-500 to-indigo-600 text-white rounded-2xl">
                    <Send size={20} />
                  </button>
               </div>
             </form>
          </div>
        </main>
      </div>
    </div>
  );
}
