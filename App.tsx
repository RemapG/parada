
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
      
      <div className="glass p-10 rounded-[40px] shadow-2xl w-full max-w-[440px] relative z-10 text-center border border-white/10">
        <div className="bg-gradient-to-tr from-purple-500 to-cyan-400 w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-lg shadow-purple-500/20">
          <Zap className="text-white" size={32} />
        </div>
        <h2 className="text-4xl font-extrabold text-white mb-2 tracking-tight">VibeSpace</h2>
        <p className="text-gray-400 mb-8 font-medium">Step into the future of chill.</p>
        
        <form onSubmit={handleSubmit} className="space-y-6 text-left">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-300 ml-1 italic tracking-widest uppercase">Your Handle</label>
            <input 
              type="text" 
              autoFocus
              className="w-full bg-white/5 border border-white/10 text-white p-4 rounded-2xl outline-none focus:ring-2 focus:ring-purple-500 transition-all placeholder:text-gray-600"
              placeholder="e.g. cyber_ghost"
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
              className="text-purple-400 text-sm font-bold hover:text-purple-300 transition-colors uppercase tracking-widest"
             >
               REFRESH LOOK
             </button>
          </div>
          
          <button type="submit" className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black py-4 rounded-2xl transition-all shadow-xl shadow-purple-900/20 active:scale-95 uppercase tracking-widest">
            ENTER SPACE
          </button>
        </form>
      </div>
    </div>
  );
};

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('vibe_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [activeServer, setActiveServer] = useState<Server>(INITIAL_SERVERS[0]);
  const [activeChannel, setActiveChannel] = useState<Channel>(INITIAL_SERVERS[0].channels[0]);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [inputValue, setInputValue] = useState('');
  const [isInVoice, setIsInVoice] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<{id: string, stream: MediaStream, name: string}[]>([]);
  
  const peerRef = useRef<any>(null);
  const userVideoRef = useRef<HTMLVideoElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentCalls = useRef<Map<string, any>>(new Map());

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, activeChannel]);

  useEffect(() => {
    if (currentUser && !peerRef.current) {
      // Accessing Peer from global scope securely
      // @ts-ignore
      const PeerClass = window.Peer;
      if (!PeerClass) {
        console.error("PeerJS not loaded from CDN");
        return;
      }
      
      const peer = new PeerClass(currentUser.id);
      
      peer.on('error', (err: any) => {
        console.error('Peer error:', err);
      });

      peer.on('call', (call: any) => {
        if (localStream) {
          call.answer(localStream);
          handleCallStream(call);
        }
      });
      peerRef.current = peer;
    }
    return () => {
      if (peerRef.current) {
        peerRef.current.destroy();
        peerRef.current = null;
      }
    };
  }, [currentUser, localStream]);

  const handleCallStream = (call: any) => {
    call.on('stream', (remoteStream: MediaStream) => {
      setRemoteStreams(prev => {
        if (prev.find(s => s.id === call.peer)) return prev;
        return [...prev, { id: call.peer, stream: remoteStream, name: 'Guest ' + call.peer.slice(-3) }];
      });
    });
    call.on('close', () => {
      setRemoteStreams(prev => prev.filter(s => s.id !== call.peer));
      currentCalls.current.delete(call.peer);
    });
    currentCalls.current.set(call.peer, call);
  };

  if (!currentUser) return <AuthScreen onLogin={setCurrentUser} />;

  const startCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: { width: 1280, height: 720 } 
      });
      setLocalStream(stream);
      setIsInVoice(true);
      setIsCameraOn(true);
      if (userVideoRef.current) userVideoRef.current.srcObject = stream;
    } catch (e) {
      console.warn("Camera failed, trying audio only", e);
      try {
        const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true });
        setLocalStream(audioOnly);
        setIsInVoice(true);
      } catch (audioErr) {
        alert("Please enable microphone permissions to join the voice space.");
      }
    }
  };

  const stopCall = () => {
    localStream?.getTracks().forEach(t => t.stop());
    currentCalls.current.forEach(call => call.close());
    currentCalls.current.clear();
    setLocalStream(null);
    setRemoteStreams([]);
    setIsInVoice(false);
    setIsScreenSharing(false);
    setIsCameraOn(false);
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      stopCall();
      startCall();
      setIsScreenSharing(false);
      return;
    }

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];
      
      if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
          localStream.removeTrack(videoTrack);
          videoTrack.stop();
        }
        localStream.addTrack(screenTrack);
        setIsScreenSharing(true);
        if (userVideoRef.current) userVideoRef.current.srcObject = localStream;

        screenTrack.onended = () => {
          setIsScreenSharing(false);
          startCall();
        };
      }
    } catch (err) {
      console.error("Screen share failed", err);
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
      {/* LEFT DOCK - SERVER LIST */}
      <nav className="flex flex-col items-center py-6 px-3 glass rounded-[32px] w-20 space-y-4 border border-white/5 flex-shrink-0">
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
          <button onClick={() => { stopCall(); setCurrentUser(null); }} className="w-12 h-12 glass rounded-2xl flex items-center justify-center text-red-400 hover:text-red-300 transition-colors">
            <LogOut size={20} />
          </button>
        </div>
      </nav>

      {/* CENTER PANEL - CHANNELS AND CONTENT */}
      <div className="flex flex-1 gap-4 overflow-hidden min-w-0">
        
        {/* CHANNEL DRAWER */}
        <aside className="w-64 glass rounded-[32px] flex flex-col p-4 border border-white/5 flex-shrink-0">
          <div className="px-4 py-4 mb-4">
            <h2 className="text-xl font-black text-white tracking-tighter uppercase italic truncate">{activeServer.name}</h2>
          </div>
          
          <div className="flex-1 space-y-6 overflow-y-auto pr-2 custom-scrollbar">
            <div>
              <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3 ml-4 italic">Lobby</p>
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
            
            <div className="pt-4 border-t border-white/5">
               <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3 ml-4 italic">Spaces</p>
               <div className="flex items-center px-4 py-3 rounded-2xl text-gray-400 hover:bg-white/5 cursor-pointer">
                 <Compass className="mr-3" size={18} />
                 <span className="text-sm font-bold">Explore</span>
               </div>
            </div>
          </div>

          {/* USER MINI CARD */}
          <div className="mt-4 p-3 bg-white/5 rounded-2xl flex items-center gap-3 border border-white/5">
             <div className="relative flex-shrink-0">
               <img src={currentUser.avatar} className="w-10 h-10 rounded-xl" alt="Me" />
               <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 border-2 border-[#121220] rounded-full shadow-lg shadow-green-500/40"></div>
             </div>
             <div className="flex-1 min-w-0">
               <p className="text-sm font-black text-white truncate">{currentUser.username}</p>
               <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tight">Vibing Solo</p>
             </div>
             <Settings size={18} className="text-gray-500 hover:text-white cursor-pointer transition-colors" />
          </div>
        </aside>

        {/* MAIN FEED */}
        <main className="flex-1 glass rounded-[32px] flex flex-col border border-white/5 relative overflow-hidden min-w-0">
          <header className="flex items-center justify-between px-8 py-6 border-b border-white/5 backdrop-blur-md z-10">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/10 rounded-xl border border-purple-500/20">
                {activeChannel.type === 'text' ? <MessageSquare className="text-purple-400" size={20} /> : <Radio className="text-purple-400" size={20} />}
              </div>
              <h3 className="text-xl font-black text-white tracking-tighter uppercase italic">{activeChannel.name}</h3>
            </div>
            <div className="flex items-center gap-4 text-gray-400">
               <Search size={20} className="hover:text-white cursor-pointer transition-colors" />
               <Bell size={20} className="hover:text-white cursor-pointer transition-colors" />
               <Users size={20} className="hover:text-white cursor-pointer transition-colors" />
            </div>
          </header>

          {activeChannel.type === 'voice' ? (
            <div className="flex-1 p-6 flex flex-col relative">
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 overflow-y-auto content-start pb-24 custom-scrollbar">
                 {/* MY CARD */}
                 <div className={`aspect-video glass rounded-[32px] relative overflow-hidden border-2 transition-all flex items-center justify-center group shadow-xl ${isCameraOn ? 'border-purple-500/50' : 'border-white/5'}`}>
                   {localStream && (isCameraOn || isScreenSharing) ? (
                     <video ref={userVideoRef} autoPlay playsInline muted className={`w-full h-full object-cover ${isScreenSharing ? '' : 'scale-x-[-1]'}`} />
                   ) : (
                     <div className="text-center group-hover:scale-110 transition-transform duration-500">
                        <img src={currentUser.avatar} className="w-24 h-24 rounded-full mx-auto mb-4 border-4 border-purple-500/30 shadow-2xl" alt="Me" />
                        <span className="text-lg font-black text-white uppercase italic tracking-widest">You</span>
                     </div>
                   )}
                   <div className="absolute bottom-4 left-4 glass px-3 py-1 rounded-full text-[10px] font-black text-white backdrop-blur-md uppercase border border-white/10 tracking-widest">
                     {isScreenSharing ? 'SCREEN CASTING' : 'LOCAL VIBE'}
                   </div>
                 </div>

                 {/* REMOTE CARDS */}
                 {remoteStreams.map(rs => (
                   <div key={rs.id} className="aspect-video glass rounded-[32px] relative overflow-hidden border border-white/5 flex items-center justify-center voice-active shadow-xl transition-all hover:scale-[1.02]">
                     <video autoPlay playsInline ref={el => { if(el) el.srcObject = rs.stream }} className="w-full h-full object-cover" />
                     <div className="absolute bottom-4 left-4 glass px-3 py-1 rounded-full text-[10px] font-black text-white backdrop-blur-md uppercase border border-white/10 tracking-widest">
                       {rs.name}
                     </div>
                   </div>
                 ))}
                 
                 {remoteStreams.length === 0 && (
                   <div className="aspect-video glass rounded-[32px] flex flex-col items-center justify-center space-y-3 text-gray-500 border border-dashed border-white/10 opacity-60">
                     <Radio size={48} className="animate-pulse" />
                     <span className="font-black text-xs uppercase tracking-[0.2em]">Waiting for vibes...</span>
                   </div>
                 )}
              </div>

              {/* FLOATING CONTROLS */}
              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-[#0a0a14]/90 backdrop-blur-3xl p-4 rounded-[32px] border border-white/10 shadow-2xl z-20">
                 <button onClick={() => setIsCameraOn(!isCameraOn)} className={`p-4 rounded-2xl transition-all hover:scale-110 active:scale-90 ${isCameraOn ? 'bg-purple-600 text-white' : 'glass text-gray-500 hover:text-white'}`}>
                   {isCameraOn ? <Video size={24} /> : <VideoOff size={24} />}
                 </button>
                 <button onClick={() => setIsMuted(!isMuted)} className={`p-4 rounded-2xl transition-all hover:scale-110 active:scale-90 ${isMuted ? 'bg-red-500 text-white' : 'glass text-gray-500 hover:text-white'}`}>
                   {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
                 </button>
                 <button onClick={toggleScreenShare} className={`p-4 rounded-2xl transition-all hover:scale-110 active:scale-90 ${isScreenSharing ? 'bg-cyan-500 text-white' : 'glass text-gray-500 hover:text-white'}`}>
                    <Monitor size={24} />
                 </button>
                 <div className="w-[1px] h-10 bg-white/10 mx-2"></div>
                 <button onClick={stopCall} className="p-4 bg-red-600 hover:bg-red-500 text-white rounded-2xl transition-all shadow-lg shadow-red-900/40 active:scale-90 hover:scale-110">
                   <PhoneOff size={24} />
                 </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col p-6 overflow-hidden">
               <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-6 pr-4 mb-4 custom-scrollbar">
                  {(messages[activeChannel.id] || []).length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center opacity-10 select-none">
                       <Zap size={120} className="mb-6" />
                       <h4 className="text-4xl font-black italic uppercase tracking-tighter">NEW SPACE STARTED</h4>
                    </div>
                  )}
                  {(messages[activeChannel.id] || []).map((msg) => (
                    <div key={msg.id} className={`flex gap-4 group animate-in slide-in-from-bottom-2 duration-300 ${msg.author === currentUser.username ? 'flex-row-reverse' : ''}`}>
                      <img src={msg.avatar} className="w-10 h-10 rounded-xl flex-shrink-0 shadow-lg" alt={msg.author} />
                      <div className={`flex flex-col ${msg.author === currentUser.username ? 'items-end' : 'items-start'}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-black text-purple-400 uppercase tracking-widest">{msg.author}</span>
                          <span className="text-[10px] text-gray-600 font-bold">{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div className={`p-4 rounded-[24px] max-w-md text-sm leading-relaxed font-medium shadow-sm ${msg.author === currentUser.username ? 'bg-gradient-to-tr from-purple-700 to-indigo-600 text-white rounded-tr-none' : 'glass text-gray-200 rounded-tl-none border border-white/5'}`}>
                          {msg.content}
                        </div>
                      </div>
                    </div>
                  ))}
               </div>

               {/* MESSAGE INPUT */}
               <form onSubmit={handleSendMessage} className="mt-auto">
                 <div className="glass p-2 rounded-[28px] flex items-center border border-white/10 shadow-2xl focus-within:border-purple-500/50 transition-all bg-[#0d0d16]/50">
                    <button type="button" className="p-3 text-gray-500 hover:text-purple-400 transition-colors">
                      <Plus size={24} />
                    </button>
                    <input 
                      type="text" 
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      placeholder={`Send vibe to #${activeChannel.name}`}
                      className="bg-transparent flex-1 outline-none text-white px-3 py-3 placeholder:text-gray-600 font-bold text-sm"
                    />
                    <div className="flex items-center gap-1">
                      <button type="button" className="p-3 text-gray-500 hover:text-purple-400 hidden sm:block">
                        <Smile size={24} />
                      </button>
                      <button type="submit" className="p-3 bg-gradient-to-tr from-purple-500 to-indigo-600 text-white rounded-2xl hover:shadow-xl shadow-purple-500/40 active:scale-90 transition-all hover:scale-105">
                        <Send size={20} />
                      </button>
                    </div>
                 </div>
               </form>
            </div>
          )}
        </main>
      </div>

      {/* RIGHT SIDEBAR - VIBES & ACTIVITY */}
      <aside className="hidden xl:flex flex-col w-72 glass rounded-[32px] p-6 border border-white/5 flex-shrink-0">
        <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] mb-6 italic">Current Vibe</h3>
        <div className="space-y-6">
           <div className="flex items-center gap-4 group cursor-pointer">
              <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center group-hover:bg-purple-500/10 transition-colors border border-white/5">
                 <Sparkles className="text-yellow-400 group-hover:scale-125 transition-transform" size={24} />
              </div>
              <div>
                 <p className="text-sm font-black text-white uppercase italic">Hyperfocus</p>
                 <p className="text-[10px] text-gray-500 font-bold">8 people listening</p>
              </div>
           </div>
           
           <div className="pt-6 border-t border-white/5">
              <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] mb-4 italic">In Space</h3>
              <div className="space-y-4">
                 {['cyber_ninja', 'luna_wave', 'pixel_junkie'].map((user, i) => (
                   <div key={user} className="flex items-center gap-3 hover:bg-white/5 p-2 rounded-xl transition-colors cursor-pointer group">
                      <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user}`} className="w-8 h-8 rounded-lg shadow-md group-hover:scale-110 transition-transform" alt={user} />
                      <span className="text-sm font-bold text-gray-300 group-hover:text-white">{user}</span>
                      <div className="ml-auto w-2 h-2 rounded-full bg-cyan-500 shadow-lg shadow-cyan-500/50"></div>
                   </div>
                 ))}
              </div>
           </div>
        </div>

        <div className="mt-auto p-5 rounded-[24px] bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-purple-500/30 relative overflow-hidden group cursor-pointer">
           <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
           <p className="text-[10px] font-black text-purple-400 mb-1 tracking-widest uppercase">PRO SPACE</p>
           <p className="text-xs text-gray-200 font-bold mb-3 leading-tight uppercase italic">Unlock HD streaming & custom emotes.</p>
           <button className="w-full py-2 bg-purple-500 hover:bg-purple-400 text-white rounded-xl text-[10px] font-black transition-all shadow-lg shadow-purple-900/40 uppercase tracking-widest">UPGRADE</button>
        </div>
      </aside>
    </div>
  );
}
