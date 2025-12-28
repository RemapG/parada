
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { Peer, DataConnection, MediaConnection } from 'peerjs';
import { 
  Plus, Hash, Volume2, Mic, MicOff, Settings, Bell, Search, 
  Users as UsersIcon, MessageSquare, X, Home, 
  ChevronDown, PhoneOff, Monitor, MonitorOff, Gift, Smile
} from 'lucide-react';

// --- Types ---
interface User {
  id: string;
  username: string;
  avatar: string;
}

interface PresenceInfo {
  userId: string;
  username: string;
  avatar: string;
  serverId: string | null;
  channelId: string | null;
  isMuted: boolean;
  isSpeaking: boolean;
  lastSeen: number;
}

interface Message {
  id: number;
  author: string;
  avatar: string;
  content: string;
  timestamp: Date;
}

// Список потенциальных узлов для стыковки
const DISCOVERY_HUBS = [
  'vibespace-discovery-v1-0',
  'vibespace-discovery-v1-1',
  'vibespace-discovery-v1-2'
];

const App = () => {
  const [user, setUser] = useState<User | null>(null);
  const [peer, setPeer] = useState<Peer | null>(null);
  const [view, setView] = useState<'home' | 'server'>('home');
  const [activeServerId] = useState<string>('1');
  const [activeChannelId, setActiveChannelId] = useState<string>('gen-1');
  
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [presenceMap, setPresenceMap] = useState<Record<string, PresenceInfo>>({});
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  
  // Refs для работы с сетью без лишних ререндеров
  const connections = useRef<Record<string, DataConnection>>({});
  const voiceCalls = useRef<Record<string, MediaConnection>>({});
  const localStream = useRef<MediaStream | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [isMuted, setIsMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  // --- Сетевая логика ---
  
  const connectToId = useCallback((targetId: string) => {
    if (!peer || targetId === peer.id || connections.current[targetId]) return;
    
    console.log(`Connecting to ${targetId}...`);
    const conn = peer.connect(targetId, { reliable: true });
    setupConnection(conn);
  }, [peer]);

  const setupConnection = useCallback((conn: DataConnection) => {
    conn.on('open', () => {
      connections.current[conn.peer] = conn;
      // При подключении сразу просим список пиров
      conn.send({ type: 'REQ_PEER_LIST' });
      sendPresence(conn);
    });

    conn.on('data', (data: any) => {
      if (!data || !data.type) return;

      switch (data.type) {
        case 'PRESENCE':
          setPresenceMap(prev => ({ 
            ...prev, 
            [data.payload.userId]: { ...data.payload, lastSeen: Date.now() } 
          }));
          break;
          
        case 'REQ_PEER_LIST':
          conn.send({ 
            type: 'RES_PEER_LIST', 
            peers: [peer!.id, ...Object.keys(connections.current)] 
          });
          break;
          
        case 'RES_PEER_LIST':
          data.peers.forEach((pId: string) => connectToId(pId));
          break;
          
        case 'MSG':
          setMessages(prev => ({
            ...prev,
            [data.channelId]: [...(prev[data.channelId] || []), data.message]
          }));
          break;
      }
    });

    conn.on('close', () => {
      delete connections.current[conn.peer];
      setPresenceMap(prev => {
        const next = { ...prev };
        delete next[conn.peer];
        return next;
      });
    });

    conn.on('error', (err) => {
      console.error("Conn Error:", err);
      delete connections.current[conn.peer];
    });
  }, [peer, connectToId]);

  const sendPresence = (conn: DataConnection) => {
    if (!user) return;
    conn.send({
      type: 'PRESENCE',
      payload: {
        userId: user.id,
        username: user.username,
        avatar: user.avatar,
        serverId: activeServerId,
        channelId: activeChannelId,
        isMuted,
        isSpeaking: !isMuted && activeChannelId.includes('voice')
      }
    });
  };

  const handleLogin = (username: string) => {
    if (!username.trim()) return;
    const cleanName = username.toLowerCase().replace(/\s/g, '-');
    const id = `vibe-${cleanName}-${Math.floor(Math.random() * 10000)}`;
    const newUser = { id, username, avatar: `https://api.dicebear.com/7.x/pixel-art/svg?seed=${id}&backgroundColor=b6e3f4` };
    setUser(newUser);
    
    const newPeer = new Peer(id, {
      debug: 1,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' }
        ]
      }
    });

    newPeer.on('open', (myId) => {
      console.log('My ID:', myId);
      // Пытаемся найти хабы для стыковки
      DISCOVERY_HUBS.forEach(hubId => connectToId(hubId));
    });

    newPeer.on('connection', setupConnection);
    
    // Входящие звонки
    newPeer.on('call', async (call) => {
      if (!localStream.current) {
        localStream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      call.answer(localStream.current);
      call.on('stream', (remoteStr) => {
        setRemoteStreams(prev => ({ ...prev, [call.peer]: remoteStr }));
      });
      voiceCalls.current[call.peer] = call;
    });

    setPeer(newPeer);
  };

  // --- Голосовая логика ---
  useEffect(() => {
    const isVoice = activeChannelId.includes('voice');
    
    const manageVoice = async () => {
      if (isVoice && peer) {
        try {
          if (!localStream.current) {
            localStream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
          }
          // Управление мутом локального трека
          localStream.current.getAudioTracks().forEach(t => t.enabled = !isMuted);

          // Звоним тем, кто в том же канале
          // Fix: Explicitly cast Object.values to PresenceInfo[] to resolve "unknown" type error
          (Object.values(presenceMap) as PresenceInfo[]).forEach(p => {
            if (p.channelId === activeChannelId && p.userId !== peer.id && !voiceCalls.current[p.userId]) {
              // Правило: звонит тот, чей ID меньше (алфавитно)
              if (peer.id < p.userId) {
                console.log(`Calling ${p.username}...`);
                const call = peer.call(p.userId, localStream.current!);
                call.on('stream', (remoteStr) => {
                  setRemoteStreams(prev => ({ ...prev, [p.userId]: remoteStr }));
                });
                voiceCalls.current[p.userId] = call;
              }
            }
          });
        } catch (e) {
          console.error("Media Error:", e);
        }
      } else {
        // Сброс звонков при выходе из канала
        // Fix: Explicitly cast Object.values to MediaConnection[] to resolve "unknown" type error
        (Object.values(voiceCalls.current) as MediaConnection[]).forEach(c => c.close());
        voiceCalls.current = {};
        setRemoteStreams({});
      }
    };

    manageVoice();
  }, [activeChannelId, presenceMap, peer, isMuted]);

  // Периодическая рассылка статуса
  useEffect(() => {
    if (!peer || !user) return;
    const interval = setInterval(() => {
      (Object.values(connections.current) as DataConnection[]).forEach(conn => {
        if (conn.open) sendPresence(conn);
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [user, peer, activeChannelId, isMuted]);

  // Очистка призраков (тех, кто пропал)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setPresenceMap(prev => {
        const next = { ...prev };
        let changed = false;
        Object.keys(next).forEach(id => {
          if (now - next[id].lastSeen > 10000) {
            delete next[id];
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const sendMessage = (text: string) => {
    if (!text.trim() || !activeChannelId || !user) return;
    const msg: Message = { id: Date.now(), author: user.username, avatar: user.avatar, content: text, timestamp: new Date() };
    setMessages(prev => ({ ...prev, [activeChannelId]: [...(prev[activeChannelId] || []), msg] }));
    
    (Object.values(connections.current) as DataConnection[]).forEach(conn => {
      if (conn.open) conn.send({ type: 'MSG', channelId: activeChannelId, message: msg });
    });
  };

  if (!user) return (
    <div className="h-screen w-screen flex items-center justify-center bg-[#1e1f22]">
      <div className="bg-[#313338] p-10 rounded-lg shadow-2xl w-full max-w-[440px] border border-white/5">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-[#5865f2] rounded-2xl flex items-center justify-center text-white mb-4 shadow-lg">
            <MessageSquare size={40} />
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">VibeSpace</h2>
          <p className="text-[#b5bac1]">P2P Discord Clone</p>
        </div>
        <div className="space-y-6">
          <input 
            autoFocus 
            className="w-full bg-[#1e1f22] text-white p-3 rounded outline-none border border-black/20 focus:border-[#5865f2] transition-colors"
            placeholder="Ваш никнейм" 
            onKeyDown={(e) => e.key === 'Enter' && handleLogin((e.target as HTMLInputElement).value)}
          />
          <button onClick={() => handleLogin((document.querySelector('input') as HTMLInputElement).value)} className="w-full bg-[#5865f2] py-3 rounded font-bold text-white hover:bg-[#4752c4] transition-all transform active:scale-[0.98]">Войти</button>
        </div>
      </div>
    </div>
  );

  // Fix: Explicitly cast Object.values to PresenceInfo[] to resolve "unknown" type error
  const onlineUsers = Object.values(presenceMap) as PresenceInfo[];

  return (
    <div className="flex h-screen w-screen bg-[#1e1f22] overflow-hidden text-[#dbdee1]" onClick={() => {
      // Разблокировка аудио по клику для некоторых браузеров
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
    }}>
      {Object.entries(remoteStreams).map(([id, stream]) => (
        <audio key={id} autoPlay ref={el => { if(el) el.srcObject = stream; }} />
      ))}

      {/* Nav */}
      <nav className="w-[72px] bg-[#1e1f22] flex flex-col items-center py-3 space-y-2 flex-shrink-0 border-r border-black/20">
        <div onClick={() => setView('home')} className={`w-12 h-12 flex items-center justify-center cursor-pointer transition-all duration-200 ${view === 'home' ? 'bg-[#5865f2] rounded-[16px] text-white' : 'bg-[#313338] rounded-[24px] text-[#dbdee1] hover:rounded-[16px] hover:bg-[#5865f2] hover:text-white'}`}><Home size={28} /></div>
        <div className="w-8 h-[2px] bg-[#35363c] rounded-full"></div>
        <div onClick={() => setView('server')} className={`w-12 h-12 cursor-pointer transition-all duration-200 relative group ${view === 'server' ? 'rounded-[16px]' : 'rounded-[24px] hover:rounded-[16px]'}`}>
          <img src="https://api.dicebear.com/7.x/initials/svg?seed=GC&backgroundColor=5865f2" className="w-full h-full rounded-inherit" />
        </div>
      </nav>

      {/* Sidebar */}
      <aside className="w-60 bg-[#2b2d31] flex flex-col flex-shrink-0">
        <header className="h-12 border-b border-black/20 flex items-center px-4 justify-between bg-[#2b2d31] shadow-sm">
          <span className="font-bold text-white truncate">Global Mesh</span>
          <ChevronDown size={18} className="text-[#949ba4]" />
        </header>
        
        <div className="flex-1 p-2 overflow-y-auto">
          {view === 'server' ? (
            <div className="space-y-4">
              <div>
                <p className="text-[12px] font-bold text-[#949ba4] uppercase px-2 mb-1">Каналы</p>
                {[
                  { id: 'gen-1', name: 'general', type: 'text' },
                  { id: 'voice-1', name: 'Lounge', type: 'voice' },
                  { id: 'voice-2', name: 'Gaming', type: 'voice' }
                ].map(c => (
                  <div key={c.id} className="mb-1">
                    <div onClick={() => setActiveChannelId(c.id)} className={`flex items-center px-2 py-1.5 rounded cursor-pointer transition-all ${activeChannelId === c.id ? 'bg-[#3f4147] text-white' : 'text-[#949ba4] hover:bg-[#35373c] hover:text-[#dbdee1]'}`}>
                      {c.type === 'text' ? <Hash size={20} className="mr-1.5 opacity-60" /> : <Volume2 size={20} className="mr-1.5 opacity-60" />}
                      <span className="truncate font-medium">{c.name}</span>
                    </div>
                    {/* Список людей в канале */}
                    <div className="ml-6 space-y-1 mt-0.5">
                      {/* Fix: onlineUsers is already cast to PresenceInfo[] above */}
                      {onlineUsers.filter(p => p.channelId === c.id).map(p => (
                        <div key={p.userId} className="flex items-center gap-2 py-0.5 px-2">
                          <div className={`relative ${p.isSpeaking ? 'is-speaking-mini' : ''}`}>
                            <img src={p.avatar} className="w-6 h-6 rounded-full" />
                            {p.isMuted && <MicOff size={10} className="absolute -bottom-1 -right-1 text-[#ed4245] bg-[#2b2d31] rounded-full" />}
                          </div>
                          <span className="text-sm text-[#949ba4] truncate">{p.username}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center px-2 py-2 rounded bg-[#3f4147] text-white cursor-pointer mb-2">
                <UsersIcon size={20} className="mr-3 text-[#dbdee1]" /> <span className="font-medium">В сети ({onlineUsers.length + 1})</span>
              </div>
              {onlineUsers.map(u => (
                <div key={u.userId} className="flex items-center px-2 py-1.5 rounded hover:bg-[#35373c] cursor-pointer group">
                  <div className="relative"><img src={u.avatar} className="w-8 h-8 rounded-full mr-3" /><div className="absolute bottom-0 right-3 w-3 h-3 bg-[#23a559] rounded-full border-2 border-[#2b2d31]"></div></div>
                  <span className="text-[#949ba4] group-hover:text-[#dbdee1] font-medium">{u.username}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-[#232428] px-2 h-[52px] flex items-center gap-2 border-t border-black/10 mt-auto">
          <div className="relative"><img src={user.avatar} className="w-8 h-8 rounded-full" /><div className="absolute bottom-0 right-0 w-3 h-3 bg-[#23a559] rounded-full border-2 border-[#232428]"></div></div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-white truncate">{user.username}</p>
            <p className="text-[11px] text-[#23a559] truncate font-medium">Node Active</p>
          </div>
          <div className="flex text-[#b5bac1]">
            <div onClick={() => setIsMuted(!isMuted)} className={`p-1.5 rounded cursor-pointer transition-colors ${isMuted ? 'text-[#ed4245]' : 'hover:bg-[#3f4147]'}`}>
              {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
            </div>
            <div className="p-1.5 hover:bg-[#3f4147] rounded cursor-pointer"><Settings size={18} /></div>
          </div>
        </div>
      </aside>

      {/* Main Area */}
      <main className="flex-1 bg-[#313338] flex flex-col min-w-0">
        <header className="h-12 border-b border-black/20 flex items-center px-4 justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <Hash className="text-[#80848e]" />
            <span className="font-bold text-white">{activeChannelId.includes('voice') ? 'Voice Chat' : 'Text Channel'}</span>
          </div>
          <div className="flex gap-4 text-[#b5bac1] items-center">
            <div className="text-xs bg-black/20 px-2 py-1 rounded">ID: {peer?.id.split('-').pop()}</div>
            <Bell size={20} className="hover:text-white cursor-pointer" />
            <Search size={20} className="hover:text-white cursor-pointer" />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col" ref={scrollRef}>
          {activeChannelId.includes('voice') ? (
            <div className="h-full w-full flex flex-col items-center justify-center gap-10">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-10">
                {/* Me */}
                <div className="flex flex-col items-center gap-3">
                  <div className={`w-32 h-32 rounded-full p-1 bg-[#2b2d31] relative shadow-2xl transition-all ${!isMuted ? 'is-speaking' : ''}`}>
                    <img src={user.avatar} className="w-full h-full rounded-full" />
                    {isMuted && <div className="absolute bottom-1 right-1 bg-[#ed4245] p-2 rounded-full text-white border-4 border-[#2b2d31]"><MicOff size={20} /></div>}
                  </div>
                  <span className="font-bold text-lg text-white">{user.username} (Вы)</span>
                </div>
                {/* Others */}
                {/* Fix: onlineUsers is already cast to PresenceInfo[] above */}
                {onlineUsers.filter(p => p.channelId === activeChannelId).map(p => (
                  <div key={p.userId} className="flex flex-col items-center gap-3 scale-in">
                    <div className={`w-32 h-32 rounded-full p-1 bg-[#2b2d31] relative shadow-2xl transition-all ${p.isSpeaking ? 'is-speaking' : ''}`}>
                      <img src={p.avatar} className="w-full h-full rounded-full" />
                      {p.isMuted && <div className="absolute bottom-1 right-1 bg-[#ed4245] p-2 rounded-full text-white border-4 border-[#2b2d31]"><MicOff size={20} /></div>}
                    </div>
                    <span className="font-bold text-lg text-white">{p.username}</span>
                  </div>
                ))}
              </div>
              
              <div className="flex gap-6 bg-[#1e1f22]/90 backdrop-blur p-4 rounded-3xl shadow-2xl border border-white/10">
                <button onClick={() => setIsMuted(!isMuted)} className={`p-4 rounded-full transition-all hover:scale-110 ${isMuted ? 'bg-[#ed4245]' : 'bg-[#4e5058] hover:bg-[#6d6f78]'} text-white`}><Mic size={28} /></button>
                <button onClick={() => setIsScreenSharing(!isScreenSharing)} className={`p-4 rounded-full transition-all hover:scale-110 ${isScreenSharing ? 'bg-[#23a559]' : 'bg-[#4e5058] hover:bg-[#6d6f78]'} text-white`}><Monitor size={28} /></button>
                <button onClick={() => setActiveChannelId('gen-1')} className="bg-[#ed4245] p-4 rounded-full text-white hover:bg-[#c03537] hover:scale-110 transition-all"><PhoneOff size={28} /></button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-end min-h-full">
              <div className="space-y-4 mb-4">
                {(messages[activeChannelId] || []).map(m => (
                  <div key={m.id} className="flex gap-4 hover:bg-black/5 -mx-4 px-4 py-1.5 transition-colors">
                    <img src={m.avatar} className="w-10 h-10 rounded-full mt-0.5" />
                    <div>
                      <div className="flex items-baseline gap-2"><span className="font-bold text-white">{m.author}</span><span className="text-[11px] text-[#949ba4]">{new Date(m.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span></div>
                      <p className="text-[#dbdee1] break-words">{m.content}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="bg-[#383a40] rounded-lg px-4 py-2.5 flex items-center gap-4">
                <Plus className="bg-[#b5bac1] text-[#383a40] rounded-full p-0.5 cursor-pointer hover:bg-white transition-all" size={20} />
                <form className="flex-1" onSubmit={e => { e.preventDefault(); const t = e.target as any; sendMessage(t.msg.value); t.reset(); }}>
                  <input name="msg" autoComplete="off" className="bg-transparent w-full outline-none text-[#dbdee1] placeholder-[#6d6f78]" placeholder={`Написать сообщение...`} />
                </form>
                <div className="flex gap-3 text-[#b5bac1]"><Gift size={22} /><Smile size={22} /></div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
