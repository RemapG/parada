
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { Peer, DataConnection, MediaConnection } from 'peerjs';
import { 
  Plus, Hash, Volume2, Mic, MicOff, Settings, Bell, Search, 
  Users as UsersIcon, MessageSquare, Home, 
  ChevronDown, PhoneOff, Monitor, Gift, Smile, Radio, Loader2
} from 'lucide-react';

// --- Константы ---
const LOBBY_ID = 'vibespace-global-public-lobby-v3'; // Уникальный ключ для этой версии

interface User {
  id: string;
  username: string;
  avatar: string;
}

interface PresenceInfo {
  userId: string;
  username: string;
  avatar: string;
  channelId: string;
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

const App = () => {
  const [user, setUser] = useState<User | null>(null);
  const [peer, setPeer] = useState<Peer | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<string>('gen-1');
  const [status, setStatus] = useState<string>('offline');
  
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [presenceMap, setPresenceMap] = useState<Record<string, PresenceInfo>>({});
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  
  const connections = useRef<Record<string, DataConnection>>({});
  const voiceCalls = useRef<Record<string, MediaConnection>>({});
  const localStream = useRef<MediaStream | null>(null);
  
  const [isMuted, setIsMuted] = useState(false);
  const [isLobbyHost, setIsLobbyHost] = useState(false);

  // --- Сетевая логика: Обнаружение ---

  const connectToPeer = useCallback((targetId: string) => {
    if (!peer || targetId === peer.id || connections.current[targetId]) return;
    console.log(`[Mesh] Attempting to link with: ${targetId}`);
    const conn = peer.connect(targetId, { reliable: true });
    setupDataConnection(conn);
  }, [peer]);

  const setupDataConnection = useCallback((conn: DataConnection) => {
    conn.on('open', () => {
      connections.current[conn.peer] = conn;
      setStatus(`Connected to ${Object.keys(connections.current).length} peers`);
      
      // Gossip: делимся списком всех, кого знаем
      conn.send({ 
        type: 'GOSSIP', 
        peers: [peer!.id, ...Object.keys(connections.current)] 
      });
      
      if (user) sendPresence(conn);
    });

    conn.on('data', (data: any) => {
      if (!data || !data.type) return;
      switch (data.type) {
        case 'GOSSIP':
          data.peers.forEach((pId: string) => connectToPeer(pId));
          break;
        case 'PRESENCE':
          setPresenceMap(prev => ({ 
            ...prev, 
            [data.payload.userId]: { ...data.payload, lastSeen: Date.now() } 
          }));
          break;
        case 'MSG':
          setMessages(prev => ({
            ...prev,
            [data.channelId]: [...(prev[data.channelId] || []), data.message]
          }));
          break;
      }
    });

    const cleanup = () => {
      delete connections.current[conn.peer];
      setPresenceMap(prev => {
        const next = { ...prev };
        delete next[conn.peer];
        return next;
      });
      if (voiceCalls.current[conn.peer]) {
        voiceCalls.current[conn.peer].close();
        delete voiceCalls.current[conn.peer];
      }
      setRemoteStreams(prev => {
        const next = { ...prev };
        delete next[conn.peer];
        return next;
      });
    };

    conn.on('close', cleanup);
    conn.on('error', cleanup);
  }, [peer, user, connectToPeer]);

  const sendPresence = (conn: DataConnection) => {
    if (!user) return;
    conn.send({
      type: 'PRESENCE',
      payload: {
        userId: user.id,
        username: user.username,
        avatar: user.avatar,
        channelId: activeChannelId,
        isMuted,
        isSpeaking: !isMuted && activeChannelId.includes('voice')
      }
    });
  };

  const initPeer = (myId: string, isLobby: boolean = false) => {
    const p = new Peer(myId, {
      config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
    });

    p.on('open', (id) => {
      console.log('[Peer] Started with ID:', id);
      setPeer(p);
      setIsLobbyHost(isLobby);
      setStatus(isLobby ? 'Hosting Mesh' : 'Mesh Client Active');
      
      // Если мы не лобби, стучимся в лобби
      if (!isLobby) {
        const lobbyConn = p.connect(LOBBY_ID, { reliable: true });
        setupDataConnection(lobbyConn);
      }
    });

    p.on('connection', setupDataConnection);

    p.on('call', async (call) => {
      console.log('[Voice] Receiving call from:', call.peer);
      if (!localStream.current) {
        localStream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      call.answer(localStream.current);
      call.on('stream', (stream) => {
        setRemoteStreams(prev => ({ ...prev, [call.peer]: stream }));
      });
      voiceCalls.current[call.peer] = call;
    });

    p.on('error', (err) => {
      if (err.type === 'id-taken') {
        // Если лобби занято, заходим как обычный пир
        const randomId = `vibe-${Math.random().toString(36).substr(2, 6)}`;
        initPeer(randomId, false);
      } else {
        console.error('[Peer Error]', err);
      }
    });
  };

  const handleLogin = (username: string) => {
    if (!username.trim()) return;
    const initialUser = { 
      id: '', // Будет установлено после инициализации Peer
      username, 
      avatar: `https://api.dicebear.com/7.x/pixel-art/svg?seed=${username}&backgroundColor=b6e3f4` 
    };
    setUser(initialUser);
    
    // Пытаемся стать лобби
    initPeer(LOBBY_ID, true);
  };

  // Обновляем ID пользователя после того как Peer открылся
  useEffect(() => {
    if (peer && user && !user.id) {
      setUser(prev => prev ? { ...prev, id: peer.id } : null);
    }
  }, [peer, user]);

  // --- Голосовая логика ---
  useEffect(() => {
    if (!peer || !activeChannelId.includes('voice')) {
      (Object.values(voiceCalls.current) as MediaConnection[]).forEach(c => c.close());
      voiceCalls.current = {};
      setRemoteStreams({});
      return;
    }

    const startVoice = async () => {
      try {
        if (!localStream.current) {
          localStream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
        localStream.current.getAudioTracks().forEach(t => t.enabled = !isMuted);

        // Звоним всем, кто в канале и чье имя "старше" (чтобы не звонить друг другу одновременно)
        (Object.values(presenceMap) as PresenceInfo[]).forEach(p => {
          if (p.channelId === activeChannelId && p.userId !== peer.id && !voiceCalls.current[p.userId]) {
            if (peer.id < p.userId) { // Детерминированный выбор звонящего
              console.log('[Voice] Calling:', p.username);
              const call = peer.call(p.userId, localStream.current!);
              call.on('stream', (stream) => {
                setRemoteStreams(prev => ({ ...prev, [p.userId]: stream }));
              });
              voiceCalls.current[p.userId] = call;
            }
          }
        });
      } catch (e) {
        console.error('[Media] Error:', e);
      }
    };

    startVoice();
  }, [activeChannelId, presenceMap, peer, isMuted]);

  // Heartbeat Presence
  useEffect(() => {
    if (!peer || !user) return;
    const interval = setInterval(() => {
      (Object.values(connections.current) as DataConnection[]).forEach(conn => {
        if (conn.open) sendPresence(conn);
      });
    }, 2500);
    return () => clearInterval(interval);
  }, [user, peer, activeChannelId, isMuted]);

  const sendMessage = (text: string) => {
    if (!text.trim() || !user) return;
    const msg: Message = { id: Date.now(), author: user.username, avatar: user.avatar, content: text, timestamp: new Date() };
    setMessages(prev => ({ ...prev, [activeChannelId]: [...(prev[activeChannelId] || []), msg] }));
    (Object.values(connections.current) as DataConnection[]).forEach(conn => {
      if (conn.open) conn.send({ type: 'MSG', channelId: activeChannelId, message: msg });
    });
  };

  if (!user || !peer) return (
    <div className="h-screen w-screen flex items-center justify-center bg-[#1e1f22]">
      <div className="bg-[#313338] p-10 rounded-lg shadow-2xl w-full max-w-[420px] border border-white/5">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-[#5865f2] rounded-2xl flex items-center justify-center text-white mb-4">
            <Radio size={40} className={user ? 'animate-pulse' : ''} />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">VibeSpace Mesh</h2>
          <p className="text-[#b5bac1] text-sm text-center">Групповое общение без серверов</p>
        </div>
        {!user ? (
          <div className="space-y-4">
            <input 
              autoFocus 
              className="w-full bg-[#1e1f22] text-white p-3 rounded border border-black/20 outline-none focus:border-[#5865f2]"
              placeholder="Введите имя пользователя" 
              onKeyDown={(e) => e.key === 'Enter' && handleLogin((e.target as HTMLInputElement).value)}
            />
            <button 
              onClick={() => handleLogin((document.querySelector('input') as HTMLInputElement).value)}
              className="w-full bg-[#5865f2] py-3 rounded font-bold text-white hover:bg-[#4752c4] transition-all active:scale-95"
            >
              Войти в сеть
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="animate-spin text-[#5865f2]" size={32} />
            <p className="text-white animate-pulse">Установка P2P соединения...</p>
          </div>
        )}
      </div>
    </div>
  );

  const onlineUsers = Object.values(presenceMap) as PresenceInfo[];

  return (
    <div className="flex h-screen w-screen bg-[#1e1f22] text-[#dbdee1] overflow-hidden" onClick={() => {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
    }}>
      {Object.entries(remoteStreams).map(([id, stream]) => (
        <audio key={id} autoPlay ref={el => { if(el) el.srcObject = stream; }} />
      ))}

      {/* Nav */}
      <nav className="w-[72px] bg-[#1e1f22] flex flex-col items-center py-3 space-y-2 border-r border-black/20">
        <div onClick={() => setActiveChannelId('gen-1')} className="w-12 h-12 flex items-center justify-center bg-[#313338] rounded-[24px] hover:rounded-[16px] hover:bg-[#5865f2] transition-all cursor-pointer">
          <Home size={28} />
        </div>
        <div className="w-8 h-[2px] bg-[#35363c] rounded-full"></div>
        <div className="w-12 h-12 rounded-[16px] bg-[#5865f2] flex items-center justify-center shadow-lg">
          <span className="font-bold text-lg">GC</span>
        </div>
      </nav>

      {/* Sidebar */}
      <aside className="w-60 bg-[#2b2d31] flex flex-col">
        <header className="h-12 border-b border-black/20 flex items-center px-4 font-bold shadow-sm">
          Mesh Network
        </header>
        
        <div className="flex-1 p-2 space-y-6 overflow-y-auto">
          <div>
            <p className="text-[12px] font-bold text-[#949ba4] uppercase px-2 mb-2">Каналы</p>
            {['gen-1', 'voice-1', 'voice-2'].map(id => (
              <div 
                key={id}
                onClick={() => setActiveChannelId(id)}
                className={`flex items-center px-2 py-1.5 rounded cursor-pointer transition-all mb-1 ${activeChannelId === id ? 'bg-[#3f4147] text-white' : 'text-[#949ba4] hover:bg-[#35373c] hover:text-[#dbdee1]'}`}
              >
                {id.includes('voice') ? <Volume2 size={20} className="mr-2" /> : <Hash size={20} className="mr-2" />}
                <span className="truncate">{id === 'gen-1' ? 'основной' : id === 'voice-1' ? 'Гостиная' : 'Игровая'}</span>
              </div>
            ))}
          </div>

          <div>
             <p className="text-[12px] font-bold text-[#949ba4] uppercase px-2 mb-2">Голос в сети</p>
             {onlineUsers.filter(p => p.channelId.includes('voice')).map(p => (
               <div key={p.userId} className="flex items-center gap-2 px-2 py-1">
                 <div className={`w-6 h-6 rounded-full overflow-hidden ${p.isSpeaking ? 'ring-2 ring-green-500' : ''}`}>
                   <img src={p.avatar} />
                 </div>
                 <span className="text-sm opacity-80">{p.username}</span>
               </div>
             ))}
          </div>
        </div>

        <div className="bg-[#232428] px-2 h-[52px] flex items-center gap-2 border-t border-black/10">
          <img src={user.avatar} className="w-8 h-8 rounded-full" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white truncate">{user.username}</p>
            <p className="text-[10px] text-green-500 font-bold uppercase tracking-wider">{isLobbyHost ? 'HOST' : 'CLIENT'}</p>
          </div>
          <div className="flex text-[#b5bac1]">
            <div onClick={() => setIsMuted(!isMuted)} className={`p-1.5 rounded cursor-pointer ${isMuted ? 'text-red-500 bg-red-500/10' : 'hover:bg-[#3f4147]'}`}>
              {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
            </div>
            <div className="p-1.5 hover:bg-[#3f4147] rounded cursor-pointer"><Settings size={18} /></div>
          </div>
        </div>
      </aside>

      {/* Main Chat */}
      <main className="flex-1 bg-[#313338] flex flex-col">
        <header className="h-12 border-b border-black/20 flex items-center px-4 justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <Hash className="text-[#80848e]" />
            <span className="font-bold text-white">{activeChannelId === 'gen-1' ? 'основной' : 'Голосовой чат'}</span>
          </div>
          <div className="text-xs font-mono opacity-40">{status}</div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col">
          {activeChannelId.includes('voice') ? (
            <div className="h-full w-full flex flex-col items-center justify-center gap-10">
              <div className="flex flex-wrap justify-center gap-8">
                {/* Local User */}
                <div className="flex flex-col items-center gap-2">
                  <div className={`w-24 h-24 rounded-full p-1 bg-[#2b2d31] transition-all ${!isMuted ? 'ring-4 ring-green-500' : ''}`}>
                    <img src={user.avatar} className="w-full h-full rounded-full" />
                  </div>
                  <span className="font-bold">{user.username} (Вы)</span>
                </div>
                {/* Remote Users in the SAME channel */}
                {onlineUsers.filter(p => p.channelId === activeChannelId).map(p => (
                  <div key={p.userId} className="flex flex-col items-center gap-2 animate-in fade-in duration-300">
                    <div className={`w-24 h-24 rounded-full p-1 bg-[#2b2d31] transition-all ${p.isSpeaking ? 'ring-4 ring-green-500' : ''}`}>
                      <img src={p.avatar} className="w-full h-full rounded-full" />
                    </div>
                    <span className="font-bold">{p.username}</span>
                    {p.isMuted && <MicOff size={16} className="text-red-500" />}
                  </div>
                ))}
              </div>
              <div className="bg-[#1e1f22]/90 backdrop-blur-md p-4 rounded-3xl flex gap-6 shadow-2xl border border-white/5">
                <button onClick={() => setIsMuted(!isMuted)} className={`p-4 rounded-full transition-all ${isMuted ? 'bg-red-500' : 'bg-[#4e5058] hover:bg-[#6d6f78]'} text-white shadow-lg`}><Mic size={28} /></button>
                <button onClick={() => setActiveChannelId('gen-1')} className="bg-red-500 p-4 rounded-full text-white hover:bg-red-600 transition-all shadow-lg"><PhoneOff size={28} /></button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-end">
              <div className="space-y-4 mb-4">
                {(messages[activeChannelId] || []).map(m => (
                  <div key={m.id} className="flex gap-4 px-4 py-1 hover:bg-white/5 transition-colors rounded">
                    <img src={m.avatar} className="w-10 h-10 rounded-full mt-1" />
                    <div>
                      <div className="flex items-baseline gap-2"><span className="font-bold text-white">{m.author}</span><span className="text-[11px] text-[#949ba4]">{new Date(m.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span></div>
                      <p className="text-[#dbdee1]">{m.content}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="bg-[#383a40] rounded-lg px-4 py-3 flex items-center gap-4">
                <Plus className="bg-[#b5bac1] text-[#383a40] rounded-full p-1 cursor-pointer hover:bg-white transition-all" />
                <form className="flex-1" onSubmit={e => { e.preventDefault(); const t = e.target as any; sendMessage(t.msg.value); t.reset(); }}>
                  <input name="msg" autoComplete="off" className="bg-transparent w-full outline-none" placeholder="Написать сообщение..." />
                </form>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Members Bar */}
      <aside className="w-60 bg-[#2b2d31] border-l border-black/20 hidden lg:flex flex-col">
        <header className="h-12 border-b border-black/20 flex items-center px-4 font-bold">
          Участники ({onlineUsers.length + 1})
        </header>
        <div className="p-3 space-y-4 overflow-y-auto">
          <div className="text-xs font-bold text-[#949ba4] uppercase px-2">В сети</div>
          <div className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-[#35373c] cursor-pointer group">
            <div className="relative"><img src={user.avatar} className="w-8 h-8 rounded-full" /><div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-[#2b2d31]"></div></div>
            <span className="font-medium text-white">{user.username}</span>
          </div>
          {onlineUsers.map(u => (
            <div key={u.userId} className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-[#35373c] cursor-pointer group">
              <div className="relative"><img src={u.avatar} className="w-8 h-8 rounded-full" /><div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-[#2b2d31]"></div></div>
              <span className="font-medium text-[#949ba4] group-hover:text-white truncate">{u.username}</span>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
