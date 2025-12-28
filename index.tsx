
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { Peer, DataConnection, MediaConnection } from 'peerjs';
import { 
  Plus, Hash, Volume2, Mic, MicOff, Settings, Bell, Search, 
  Users as UsersIcon, MessageSquare, Home, 
  ChevronDown, PhoneOff, Monitor, Gift, Smile, Radio
} from 'lucide-react';

// --- Константы ---
// Узлы-встречи. Первый вошедший "занимает" ID, остальные подключаются к нему.
const MEETING_POINTS = [
  'vibespace-lobby-v2-alpha',
  'vibespace-lobby-v2-beta',
  'vibespace-lobby-v2-gamma'
];

interface User {
  id: string;
  username: string;
  avatar: string;
}

interface PresenceInfo {
  userId: string;
  username: string;
  avatar: string;
  serverId: string;
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
  
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [presenceMap, setPresenceMap] = useState<Record<string, PresenceInfo>>({});
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  
  const connections = useRef<Record<string, DataConnection>>({});
  const voiceCalls = useRef<Record<string, MediaConnection>>({});
  const localStream = useRef<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  // --- Сетевые функции ---

  const connectToPeer = useCallback((targetId: string) => {
    if (!peer || targetId === peer.id || connections.current[targetId]) return;
    
    const conn = peer.connect(targetId, { reliable: true });
    handleNewConnection(conn);
  }, [peer]);

  const handleNewConnection = useCallback((conn: DataConnection) => {
    conn.on('open', () => {
      console.log(`[P2P] Connected to ${conn.peer}`);
      connections.current[conn.peer] = conn;
      
      // Сразу обмениваемся списками известных узлов (Gossip)
      conn.send({ 
        type: 'GOSSIP', 
        peers: [peer!.id, ...Object.keys(connections.current)] 
      });
      
      // Отправляем свой статус
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

    conn.on('close', () => {
      console.log(`[P2P] Connection closed with ${conn.peer}`);
      delete connections.current[conn.peer];
      cleanupUser(conn.peer);
    });

    conn.on('error', (err) => {
      console.error(`[P2P] Conn Error with ${conn.peer}:`, err);
      delete connections.current[conn.peer];
      cleanupUser(conn.peer);
    });
  }, [peer, user, connectToPeer]);

  const cleanupUser = (userId: string) => {
    setPresenceMap(prev => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
    if (voiceCalls.current[userId]) {
      voiceCalls.current[userId].close();
      delete voiceCalls.current[userId];
    }
    setRemoteStreams(prev => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
  };

  const sendPresence = (conn: DataConnection) => {
    if (!user) return;
    conn.send({
      type: 'PRESENCE',
      payload: {
        userId: user.id,
        username: user.username,
        avatar: user.avatar,
        serverId: '1',
        channelId: activeChannelId,
        isMuted,
        isSpeaking: !isMuted && activeChannelId.includes('voice')
      }
    });
  };

  const handleLogin = async (username: string) => {
    if (!username.trim()) return;
    setIsConnecting(true);
    
    // Создаем уникальный ID для этого сеанса
    const myId = `vibe-${username.toLowerCase().replace(/\s/g, '-')}-${Math.floor(Math.random() * 10000)}`;
    const newUser = { 
      id: myId, 
      username, 
      avatar: `https://api.dicebear.com/7.x/pixel-art/svg?seed=${myId}&backgroundColor=b6e3f4` 
    };
    setUser(newUser);
    
    const newPeer = new Peer(myId, {
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' }
        ]
      }
    });

    newPeer.on('open', (id) => {
      console.log('[P2P] My Peer ID:', id);
      setIsConnecting(false);
      // Пытаемся зацепиться за точки встречи
      MEETING_POINTS.forEach(point => {
        const conn = newPeer.connect(point, { reliable: true });
        handleNewConnection(conn);
      });
    });

    // Обработка входящих соединений данных
    newPeer.on('connection', handleNewConnection);
    
    // Обработка входящих звонков
    newPeer.on('call', async (call) => {
      console.log(`[Voice] Incoming call from ${call.peer}`);
      try {
        if (!localStream.current) {
          localStream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
        call.answer(localStream.current);
        call.on('stream', (stream) => {
          setRemoteStreams(prev => ({ ...prev, [call.peer]: stream }));
        });
        voiceCalls.current[call.peer] = call;
      } catch (err) {
        console.error("[Voice] Failed to answer call:", err);
      }
    });

    newPeer.on('error', (err) => {
      if (err.type === 'peer-unavailable') return; // Ожидаемо для точек встречи
      console.error('[P2P] Peer Error:', err);
    });

    setPeer(newPeer);
  };

  // --- Голосовой движок ---
  useEffect(() => {
    const isVoice = activeChannelId.includes('voice');
    
    const manageVoice = async () => {
      if (isVoice && peer) {
        try {
          if (!localStream.current) {
            localStream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
          }
          // Мут локального микрофона
          localStream.current.getAudioTracks().forEach(t => t.enabled = !isMuted);

          // Обзваниваем всех, кто в том же канале
          // Используем правило: звонит тот, чей ID меньше (лексикографически)
          (Object.values(presenceMap) as PresenceInfo[]).forEach(p => {
            if (p.channelId === activeChannelId && p.userId !== peer.id && !voiceCalls.current[p.userId]) {
              if (peer.id < p.userId) {
                console.log(`[Voice] Calling ${p.username}...`);
                const call = peer.call(p.userId, localStream.current!);
                call.on('stream', (stream) => {
                  setRemoteStreams(prev => ({ ...prev, [p.userId]: stream }));
                });
                voiceCalls.current[p.userId] = call;
              }
            }
          });
        } catch (e) {
          console.error("[Voice] Media Error:", e);
        }
      } else {
        // Выход из голоса: закрываем звонки
        (Object.values(voiceCalls.current) as MediaConnection[]).forEach(c => c.close());
        voiceCalls.current = {};
        setRemoteStreams({});
      }
    };

    manageVoice();
  }, [activeChannelId, presenceMap, peer, isMuted]);

  // Рассылка статуса всем подключенным
  useEffect(() => {
    if (!peer || !user) return;
    const interval = setInterval(() => {
      (Object.values(connections.current) as DataConnection[]).forEach(conn => {
        if (conn.open) sendPresence(conn);
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [user, peer, activeChannelId, isMuted]);

  // Очистка неактивных пользователей
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setPresenceMap(prev => {
        const next = { ...prev };
        let changed = false;
        Object.keys(next).forEach(id => {
          if (now - next[id].lastSeen > 12000) {
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
    if (!text.trim() || !user) return;
    const msg: Message = { 
      id: Date.now(), 
      author: user.username, 
      avatar: user.avatar, 
      content: text, 
      timestamp: new Date() 
    };
    
    setMessages(prev => ({ 
      ...prev, 
      [activeChannelId]: [...(prev[activeChannelId] || []), msg] 
    }));
    
    (Object.values(connections.current) as DataConnection[]).forEach(conn => {
      if (conn.open) conn.send({ type: 'MSG', channelId: activeChannelId, message: msg });
    });
  };

  if (!user) return (
    <div className="h-screen w-screen flex items-center justify-center bg-[#1e1f22]">
      <div className="bg-[#313338] p-10 rounded-lg shadow-2xl w-full max-w-[440px] border border-white/5 animate-scale-in">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-[#5865f2] rounded-2xl flex items-center justify-center text-white mb-4 shadow-lg">
            <Radio size={40} className={isConnecting ? 'animate-pulse' : ''} />
          </div>
          <h2 className="text-3xl font-bold text-white mb-2 tracking-tight">VibeSpace Mesh</h2>
          <p className="text-[#b5bac1] text-sm text-center">Глобальное P2P общение. Никаких серверов, только вы и ваши друзья.</p>
        </div>
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-[12px] font-bold text-[#b5bac1] uppercase">Никнейм</label>
            <input 
              autoFocus 
              disabled={isConnecting}
              className="w-full bg-[#1e1f22] text-white p-3 rounded outline-none border border-black/20 focus:border-[#5865f2] transition-all disabled:opacity-50"
              placeholder="Введите имя..." 
              onKeyDown={(e) => e.key === 'Enter' && handleLogin((e.target as HTMLInputElement).value)}
            />
          </div>
          <button 
            disabled={isConnecting}
            onClick={() => handleLogin((document.querySelector('input') as HTMLInputElement).value)} 
            className="w-full bg-[#5865f2] py-3 rounded font-bold text-white hover:bg-[#4752c4] transition-all transform active:scale-[0.98] shadow-lg flex items-center justify-center gap-2"
          >
            {isConnecting ? 'Подключение...' : 'Войти'}
          </button>
        </div>
      </div>
    </div>
  );

  const onlineUsers = Object.values(presenceMap) as PresenceInfo[];

  return (
    <div className="flex h-screen w-screen bg-[#1e1f22] overflow-hidden text-[#dbdee1]" onClick={() => {
      // Браузер требует взаимодействия для аудио
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
    }}>
      {/* Audio Streams */}
      {Object.entries(remoteStreams).map(([id, stream]) => (
        <audio key={id} autoPlay ref={el => { if(el) el.srcObject = stream; }} />
      ))}

      {/* Nav Sidebar */}
      <nav className="w-[72px] bg-[#1e1f22] flex flex-col items-center py-3 space-y-2 flex-shrink-0 border-r border-black/20">
        <div onClick={() => setActiveChannelId('gen-1')} className={`w-12 h-12 flex items-center justify-center cursor-pointer transition-all duration-200 bg-[#313338] rounded-[24px] text-[#dbdee1] hover:rounded-[16px] hover:bg-[#5865f2] hover:text-white`}>
          <Home size={28} />
        </div>
        <div className="w-8 h-[2px] bg-[#35363c] rounded-full"></div>
        <div className={`w-12 h-12 cursor-pointer transition-all duration-200 relative group rounded-[16px]`}>
          <img src="https://api.dicebear.com/7.x/initials/svg?seed=GC&backgroundColor=5865f2" className="w-full h-full rounded-inherit" />
        </div>
      </nav>

      {/* Channels Sidebar */}
      <aside className="w-60 bg-[#2b2d31] flex flex-col flex-shrink-0">
        <header className="h-12 border-b border-black/20 flex items-center px-4 justify-between shadow-sm">
          <span className="font-bold text-white truncate">Global Mesh Network</span>
          <ChevronDown size={18} />
        </header>
        
        <div className="flex-1 p-2 overflow-y-auto space-y-6">
          <div>
            <p className="text-[12px] font-bold text-[#949ba4] uppercase px-2 mb-2 flex items-center justify-between">
              Текстовые каналы <Plus size={14} className="cursor-pointer" />
            </p>
            {['gen-1', 'offtopic'].map(id => (
              <div 
                key={id}
                onClick={() => setActiveChannelId(id)}
                className={`flex items-center px-2 py-1.5 rounded cursor-pointer transition-all mb-[2px] ${activeChannelId === id ? 'bg-[#3f4147] text-white' : 'text-[#949ba4] hover:bg-[#35373c] hover:text-[#dbdee1]'}`}
              >
                <Hash size={20} className="mr-1.5 opacity-60" />
                <span className="truncate font-medium">{id === 'gen-1' ? 'основной' : 'флуд'}</span>
              </div>
            ))}
          </div>

          <div>
            <p className="text-[12px] font-bold text-[#949ba4] uppercase px-2 mb-2">Голосовые каналы</p>
            {['voice-1', 'voice-2'].map(id => (
              <div key={id} className="mb-2">
                <div 
                  onClick={() => setActiveChannelId(id)}
                  className={`flex items-center px-2 py-1.5 rounded cursor-pointer transition-all ${activeChannelId === id ? 'bg-[#3f4147] text-white' : 'text-[#949ba4] hover:bg-[#35373c] hover:text-[#dbdee1]'}`}
                >
                  <Volume2 size={20} className="mr-1.5 opacity-60" />
                  <span className="truncate font-medium">{id === 'voice-1' ? 'Гостиная' : 'Игровая'}</span>
                </div>
                {/* Users in Voice */}
                <div className="ml-6 space-y-1 mt-1">
                  {onlineUsers.filter(p => p.channelId === id).map(p => (
                    <div key={p.userId} className="flex items-center gap-2 py-1 px-2 group">
                      <div className={`relative ${p.isSpeaking ? 'ring-2 ring-[#23a559] rounded-full p-[1px]' : ''}`}>
                        <img src={p.avatar} className="w-6 h-6 rounded-full" />
                        {p.isMuted && <MicOff size={10} className="absolute -bottom-1 -right-1 text-[#ed4245] bg-[#2b2d31] rounded-full p-[1px]" />}
                      </div>
                      <span className="text-sm text-[#949ba4] group-hover:text-[#dbdee1] truncate">{p.username}</span>
                    </div>
                  ))}
                  {activeChannelId === id && (
                     <div className="flex items-center gap-2 py-1 px-2">
                        <div className={`relative ${!isMuted ? 'ring-2 ring-[#23a559] rounded-full p-[1px]' : ''}`}>
                          <img src={user.avatar} className="w-6 h-6 rounded-full" />
                          {isMuted && <MicOff size={10} className="absolute -bottom-1 -right-1 text-[#ed4245] bg-[#2b2d31] rounded-full p-[1px]" />}
                        </div>
                        <span className="text-sm text-white font-medium truncate">{user.username} (Вы)</span>
                     </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* User Footer */}
        <div className="bg-[#232428] px-2 h-[52px] flex items-center gap-2 border-t border-black/10 mt-auto">
          <div className="relative cursor-pointer group">
            <img src={user.avatar} className="w-8 h-8 rounded-full" />
            <div className="absolute bottom-0 right-0 w-3 h-3 bg-[#23a559] rounded-full border-2 border-[#232428]"></div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-white truncate">{user.username}</p>
            <p className="text-[11px] text-[#23a559] truncate font-medium">Node: {Object.keys(connections.current).length} peers</p>
          </div>
          <div className="flex text-[#b5bac1]">
            <div onClick={() => setIsMuted(!isMuted)} className={`p-1.5 rounded cursor-pointer transition-colors ${isMuted ? 'text-[#ed4245] bg-white/5' : 'hover:bg-[#3f4147]'}`}>
              {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
            </div>
            <div className="p-1.5 hover:bg-[#3f4147] rounded cursor-pointer transition-colors"><Settings size={18} /></div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 bg-[#313338] flex flex-col min-w-0">
        <header className="h-12 border-b border-black/20 flex items-center px-4 justify-between shadow-sm bg-[#313338]">
          <div className="flex items-center gap-2">
            {activeChannelId.includes('voice') ? <Volume2 className="text-[#80848e]" /> : <Hash className="text-[#80848e]" />}
            <span className="font-bold text-white">{activeChannelId.includes('voice') ? 'Голосовое общение' : 'Текстовый канал'}</span>
          </div>
          <div className="flex gap-4 text-[#b5bac1] items-center">
             <div className="flex -space-x-2">
                {onlineUsers.slice(0, 3).map(u => (
                  <img key={u.userId} src={u.avatar} className="w-6 h-6 rounded-full ring-2 ring-[#313338]" title={u.username} />
                ))}
                {onlineUsers.length > 3 && <div className="w-6 h-6 rounded-full bg-[#4e5058] flex items-center justify-center text-[10px] font-bold text-white">+{onlineUsers.length - 3}</div>}
             </div>
             <Bell size={20} className="hover:text-white cursor-pointer" />
             <Search size={20} className="hover:text-white cursor-pointer" />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col">
          {activeChannelId.includes('voice') ? (
            <div className="h-full w-full flex flex-col items-center justify-center gap-10">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-12">
                {/* Local Me */}
                <div className="flex flex-col items-center gap-3">
                  <div className={`w-32 h-32 rounded-full p-1 bg-[#2b2d31] relative shadow-2xl transition-all duration-300 ${!isMuted ? 'ring-4 ring-[#23a559]' : ''}`}>
                    <img src={user.avatar} className="w-full h-full rounded-full" />
                    {isMuted && <div className="absolute bottom-1 right-1 bg-[#ed4245] p-2 rounded-full text-white border-4 border-[#2b2d31]"><MicOff size={20} /></div>}
                  </div>
                  <span className="font-bold text-lg text-white">{user.username} (Вы)</span>
                </div>
                {/* Remote Peers in this channel */}
                {onlineUsers.filter(p => p.channelId === activeChannelId).map(p => (
                  <div key={p.userId} className="flex flex-col items-center gap-3 animate-scale-in">
                    <div className={`w-32 h-32 rounded-full p-1 bg-[#2b2d31] relative shadow-2xl transition-all duration-300 ${p.isSpeaking ? 'ring-4 ring-[#23a559]' : ''}`}>
                      <img src={p.avatar} className="w-full h-full rounded-full" />
                      {p.isMuted && <div className="absolute bottom-1 right-1 bg-[#ed4245] p-2 rounded-full text-white border-4 border-[#2b2d31]"><MicOff size={20} /></div>}
                    </div>
                    <span className="font-bold text-lg text-white">{p.username}</span>
                  </div>
                ))}
              </div>
              
              <div className="flex gap-6 bg-[#1e1f22]/95 backdrop-blur-md p-5 rounded-[2.5rem] shadow-2xl border border-white/5">
                <button onClick={() => setIsMuted(!isMuted)} className={`p-4 rounded-full transition-all hover:scale-110 ${isMuted ? 'bg-[#ed4245]' : 'bg-[#4e5058] hover:bg-[#6d6f78]'} text-white`} title="Mute/Unmute"><Mic size={28} /></button>
                <button className={`p-4 rounded-full bg-[#4e5058] hover:bg-[#6d6f78] text-white transition-all hover:scale-110`} title="Share Screen"><Monitor size={28} /></button>
                <button onClick={() => setActiveChannelId('gen-1')} className="bg-[#ed4245] p-4 rounded-full text-white hover:bg-[#c03537] hover:scale-110 transition-all shadow-xl" title="Disconnect"><PhoneOff size={28} /></button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-end min-h-full">
              <div className="space-y-4 mb-4">
                {(messages[activeChannelId] || []).map(m => (
                  <div key={m.id} className="flex gap-4 hover:bg-black/10 -mx-4 px-4 py-1.5 transition-colors group">
                    <img src={m.avatar} className="w-10 h-10 rounded-full mt-0.5 shadow-md" />
                    <div className="flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-bold text-white hover:underline cursor-pointer">{m.author}</span>
                        <span className="text-[11px] text-[#949ba4] font-medium">{new Date(m.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                      </div>
                      <p className="text-[#dbdee1] break-words text-[15px] leading-relaxed">{m.content}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="bg-[#383a40] rounded-xl px-4 py-3 flex items-center gap-4 sticky bottom-0 shadow-lg mb-2">
                <div className="bg-[#b5bac1] text-[#383a40] rounded-full p-1 cursor-pointer hover:bg-white transition-all transform active:scale-90">
                  <Plus size={18} strokeWidth={3} />
                </div>
                <form className="flex-1" onSubmit={e => { e.preventDefault(); const t = e.target as any; sendMessage(t.msg.value); t.reset(); }}>
                  <input name="msg" autoComplete="off" className="bg-transparent w-full outline-none text-[#dbdee1] placeholder-[#6d6f78]" placeholder={`Написать сообщение в #${activeChannelId}`} />
                </form>
                <div className="flex gap-4 text-[#b5bac1]">
                   <Gift size={22} className="cursor-pointer hover:text-white" />
                   <Smile size={22} className="cursor-pointer hover:text-white" />
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Right Sidebar: Members List */}
      <aside className="w-60 bg-[#2b2d31] flex-shrink-0 border-l border-black/20 hidden xl:flex flex-col">
        <header className="h-12 border-b border-black/20 flex items-center px-4 font-bold text-white shadow-sm">
           Участники
        </header>
        <div className="p-3 overflow-y-auto space-y-4">
           <div>
              <p className="text-[12px] font-bold text-[#949ba4] uppercase px-2 mb-2">В сети — {onlineUsers.length + 1}</p>
              <div className="space-y-1">
                 {/* Me */}
                 <div className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-[#35373c] cursor-pointer group">
                    <div className="relative">
                       <img src={user.avatar} className="w-8 h-8 rounded-full" />
                       <div className="absolute bottom-0 right-0 w-3 h-3 bg-[#23a559] rounded-full border-2 border-[#2b2d31]"></div>
                    </div>
                    <span className="font-medium text-[#dbdee1] truncate">{user.username} (Вы)</span>
                 </div>
                 {/* Others */}
                 {onlineUsers.map(u => (
                    <div key={u.userId} className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-[#35373c] cursor-pointer group">
                       <div className="relative">
                          <img src={u.avatar} className="w-8 h-8 rounded-full" />
                          <div className="absolute bottom-0 right-0 w-3 h-3 bg-[#23a559] rounded-full border-2 border-[#2b2d31]"></div>
                       </div>
                       <span className="font-medium text-[#949ba4] group-hover:text-[#dbdee1] truncate">{u.username}</span>
                    </div>
                 ))}
              </div>
           </div>
        </div>
      </aside>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
