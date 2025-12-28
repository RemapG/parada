
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { Peer, DataConnection, MediaConnection } from 'peerjs';
import { 
  Plus, Hash, Volume2, Mic, MicOff, Settings, Bell, Search, 
  Users as UsersIcon, MessageSquare, X, UserPlus, Home, 
  ChevronDown, Ghost, PhoneOff, Monitor, MonitorOff, Gift, Smile
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
}

interface Message {
  id: number;
  author: string;
  avatar: string;
  content: string;
  timestamp: Date;
}

interface Channel {
  id: string;
  name: string;
  type: 'text' | 'voice';
}

interface Server {
  id: string;
  name: string;
  icon: string;
  channels: Channel[];
}

const App = () => {
  const [user, setUser] = useState<User | null>(null);
  const [peer, setPeer] = useState<Peer | null>(null);
  const [view, setView] = useState<'home' | 'server'>('home');
  const [servers] = useState<Server[]>([
    { id: '1', name: 'Global Community', icon: 'https://api.dicebear.com/7.x/initials/svg?seed=GC&backgroundColor=5865f2', channels: [
      { id: 'gen-1', name: 'general', type: 'text' },
      { id: 'voice-1', name: 'Lounge', type: 'voice' },
      { id: 'voice-2', name: 'Gaming', type: 'voice' }
    ]}
  ]);

  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  
  // Peer states
  const [connections, setConnections] = useState<Record<string, DataConnection>>({});
  const [presenceMap, setPresenceMap] = useState<Record<string, PresenceInfo>>({});
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const voiceCalls = useRef<Record<string, MediaConnection>>({});
  
  // UI states
  const [isMuted, setIsMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const localStream = useRef<MediaStream | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // --- Signaling Logic ---
  const broadcast = useCallback((data: any) => {
    Object.values(connections).forEach(conn => {
      if (conn.open) conn.send(data);
    });
  }, [connections]);

  const handleIncomingData = useCallback((data: any, conn: DataConnection) => {
    switch (data.type) {
      case 'PRESENCE':
        setPresenceMap(prev => ({ ...prev, [data.payload.userId]: data.payload }));
        break;
      case 'MSG':
        setMessages(prev => ({
          ...prev,
          [data.channelId]: [...(prev[data.channelId] || []), data.message]
        }));
        break;
      case 'MESH_NODES':
        // Automatic discovery: connect to IDs we don't have yet
        data.nodes.forEach((nodeId: string) => {
          if (nodeId !== peer?.id && !connections[nodeId]) {
            connectToPeer(nodeId);
          }
        });
        break;
    }
  }, [peer, connections]);

  const connectToPeer = (targetId: string) => {
    if (!peer || connections[targetId]) return;
    const conn = peer.connect(targetId);
    setupConnection(conn);
  };

  const setupConnection = (conn: DataConnection) => {
    conn.on('open', () => {
      setConnections(prev => ({ ...prev, [conn.peer]: conn }));
      // Share current connections to build the mesh
      const allNodes = [peer?.id, ...Object.keys(connections)].filter(Boolean);
      conn.send({ type: 'MESH_NODES', nodes: allNodes });
    });
    conn.on('data', (data) => handleIncomingData(data, conn));
    conn.on('close', () => {
      setConnections(prev => {
        const next = { ...prev };
        delete next[conn.peer];
        return next;
      });
      setPresenceMap(prev => {
        const next = { ...prev };
        delete next[conn.peer];
        return next;
      });
    });
  };

  const handleLogin = (username: string) => {
    if (!username.trim()) return;
    const id = `vibe-${username.toLowerCase().replace(/\s/g, '-')}-${Math.floor(Math.random() * 9000 + 1000)}`;
    const newUser = { id, username, avatar: `https://api.dicebear.com/7.x/pixel-art/svg?seed=${id}&backgroundColor=b6e3f4` };
    setUser(newUser);
    
    const newPeer = new Peer(id);
    newPeer.on('connection', setupConnection);
    
    newPeer.on('call', async (call) => {
      if (!localStream.current) {
        localStream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      call.answer(localStream.current);
      call.on('stream', (remoteStream) => {
        setRemoteStreams(prev => ({ ...prev, [call.peer]: remoteStream }));
      });
    });

    setPeer(newPeer);
  };

  // --- Voice Logic ---
  useEffect(() => {
    const channel = servers.find(s => s.id === activeServerId)?.channels.find(c => c.id === activeChannelId);
    
    const manageVoice = async () => {
      if (channel?.type === 'voice') {
        try {
          if (!localStream.current) {
            localStream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
          }
          localStream.current.getAudioTracks().forEach(track => track.enabled = !isMuted);

          // Call everyone in the same channel
          Object.values(presenceMap).forEach(p => {
            if (p.channelId === activeChannelId && p.userId !== peer?.id && !voiceCalls.current[p.userId]) {
              const call = peer!.call(p.userId, localStream.current!);
              call.on('stream', (remoteStr) => {
                setRemoteStreams(prev => ({ ...prev, [p.userId]: remoteStr }));
              });
              voiceCalls.current[p.userId] = call;
            }
          });
        } catch (e) {
          console.error("Mic error:", e);
        }
      } else {
        // Exit voice
        Object.values(voiceCalls.current).forEach(c => c.close());
        voiceCalls.current = {};
        setRemoteStreams({});
      }
    };

    manageVoice();
  }, [activeChannelId, activeServerId, peer, presenceMap, isMuted]);

  // Presence Pulse
  useEffect(() => {
    if (!user || !peer) return;
    const interval = setInterval(() => {
      broadcast({
        type: 'PRESENCE',
        payload: {
          userId: user.id,
          username: user.username,
          avatar: user.avatar,
          serverId: activeServerId,
          channelId: activeChannelId,
          isMuted,
          isSpeaking: !isMuted // Simplified
        }
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [user, peer, activeServerId, activeChannelId, isMuted, broadcast]);

  const sendMessage = (text: string) => {
    if (!text.trim() || !activeChannelId || !user) return;
    const msg: Message = { id: Date.now(), author: user.username, avatar: user.avatar, content: text, timestamp: new Date() };
    setMessages(prev => ({ ...prev, [activeChannelId]: [...(prev[activeChannelId] || []), msg] }));
    broadcast({ type: 'MSG', channelId: activeChannelId, message: msg });
  };

  if (!user) return (
    <div className="h-screen w-screen flex items-center justify-center bg-[#1e1f22]">
      <div className="bg-[#313338] p-10 rounded-lg shadow-2xl w-full max-w-[480px] border border-white/5">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-[#5865f2] rounded-2xl flex items-center justify-center text-white mb-4 shadow-lg">
            <MessageSquare size={40} />
          </div>
          <h2 className="text-3xl font-bold text-white mb-2 text-center">VibeSpace Online</h2>
          <p className="text-[#b5bac1] text-center">Бесплатное P2P общение без серверов</p>
        </div>
        <div className="space-y-6">
          <input 
            autoFocus 
            className="w-full bg-[#1e1f22] text-white p-3 rounded outline-none border border-black/20 focus:border-[#5865f2] transition-colors"
            placeholder="Ваш никнейм" 
            onKeyDown={(e) => e.key === 'Enter' && handleLogin((e.target as HTMLInputElement).value)}
          />
          <button onClick={() => handleLogin((document.querySelector('input') as HTMLInputElement).value)} className="w-full bg-[#5865f2] py-3 rounded font-bold text-white hover:bg-[#4752c4] transition-all transform active:scale-[0.98] shadow-lg">Вход</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen w-screen bg-[#1e1f22] overflow-hidden">
      {/* Audio Engine */}
      {Object.entries(remoteStreams).map(([id, stream]) => (
        <audio key={id} autoPlay ref={el => { if(el) el.srcObject = stream; }} />
      ))}

      {/* Nav */}
      <nav className="w-[72px] bg-[#1e1f22] flex flex-col items-center py-3 space-y-2 flex-shrink-0 border-r border-black/20">
        <div onClick={() => setView('home')} className={`w-12 h-12 flex items-center justify-center cursor-pointer transition-all duration-200 ${view === 'home' ? 'bg-[#5865f2] rounded-[16px] text-white' : 'bg-[#313338] rounded-[24px] text-[#dbdee1] hover:rounded-[16px] hover:bg-[#5865f2] hover:text-white'}`}><Home size={28} /></div>
        <div className="w-8 h-[2px] bg-[#35363c] rounded-full"></div>
        {servers.map(s => (
          <div key={s.id} onClick={() => { setView('server'); setActiveServerId(s.id); setActiveChannelId(s.channels[0].id); }} className={`w-12 h-12 cursor-pointer transition-all duration-200 overflow-hidden relative group ${activeServerId === s.id && view === 'server' ? 'rounded-[16px]' : 'rounded-[24px] hover:rounded-[16px]'}`}>
            <img src={s.icon} className="w-full h-full object-cover" />
            {activeServerId === s.id && view === 'server' && <div className="absolute left-0 top-1/4 bottom-1/4 w-1 bg-white rounded-r-full"></div>}
          </div>
        ))}
        <div className="w-12 h-12 bg-[#313338] rounded-[24px] flex items-center justify-center cursor-pointer hover:rounded-[16px] hover:bg-[#23a559] transition-all text-[#23a559] hover:text-white"><Plus /></div>
      </nav>

      {/* Sidebar */}
      <aside className="w-60 bg-[#2b2d31] flex flex-col flex-shrink-0">
        <header className="h-12 border-b border-black/20 flex items-center px-4 justify-between hover:bg-[#35373c] cursor-pointer transition-colors shadow-sm bg-[#2b2d31]">
          <span className="font-bold text-white truncate">{view === 'home' ? 'Личные сообщения' : servers.find(s=>s.id===activeServerId)?.name}</span>
          <ChevronDown size={18} className="text-[#949ba4]" />
        </header>
        
        <div className="flex-1 p-2 overflow-y-auto">
          {view === 'server' && servers.find(s=>s.id===activeServerId)?.channels.map(c => (
            <div key={c.id} className="mb-2">
              <div onClick={() => setActiveChannelId(c.id)} className={`flex items-center px-2 py-1.5 rounded cursor-pointer group transition-all ${activeChannelId === c.id ? 'bg-[#3f4147] text-white' : 'text-[#949ba4] hover:bg-[#35373c] hover:text-[#dbdee1]'}`}>
                {c.type === 'text' ? <Hash size={20} className="mr-1.5 opacity-60" /> : <Volume2 size={20} className="mr-1.5 opacity-60" />}
                <span className="truncate font-medium">{c.name}</span>
              </div>
              {/* Occupants */}
              <div className="ml-6 space-y-1 mt-1">
                {Object.values(presenceMap).filter(p => p.channelId === c.id && p.serverId === activeServerId).map(p => (
                  <div key={p.userId} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-white/5 group/user">
                    <div className={`relative ${p.isSpeaking ? 'is-speaking-mini' : ''}`}>
                      <img src={p.avatar} className="w-6 h-6 rounded-full" />
                      {p.isMuted && <MicOff size={10} className="absolute -bottom-1 -right-1 text-[#ed4245] bg-[#2b2d31] rounded-full" />}
                    </div>
                    <span className="text-sm text-[#949ba4] group-hover/user:text-[#dbdee1] truncate">{p.username}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {view === 'home' && (
            <div className="space-y-1">
              <div className="flex items-center px-2 py-2 rounded bg-[#3f4147] text-white cursor-pointer"><UsersIcon size={20} className="mr-3" /> Друзья</div>
              {Object.values(presenceMap).map(f => (
                <div key={f.userId} className="flex items-center px-2 py-1.5 rounded hover:bg-[#35373c] cursor-pointer group">
                  <div className="relative"><img src={f.avatar} className="w-8 h-8 rounded-full mr-3" /><div className="absolute bottom-0 right-3 w-3 h-3 bg-[#23a559] rounded-full border-2 border-[#2b2d31]"></div></div>
                  <span className="text-[#949ba4] group-hover:text-[#dbdee1] font-medium">{f.username}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* User Footer */}
        <div className="bg-[#232428] px-2 h-[52px] flex items-center gap-2 border-t border-black/10 mt-auto">
          <div className="relative"><img src={user.avatar} className="w-8 h-8 rounded-full" /><div className="absolute bottom-0 right-0 w-3 h-3 bg-[#23a559] rounded-full border-2 border-[#232428]"></div></div>
          <div className="flex-1 min-w-0"><p className="text-[13px] font-bold text-white truncate">{user.username}</p><p className="text-[11px] text-[#b5bac1] truncate hover:underline cursor-pointer" onClick={() => { navigator.clipboard.writeText(user.id); alert('ID скопирован!'); }}>#{user.id.split('-').pop()}</p></div>
          <div className="flex text-[#b5bac1]"><div onClick={() => setIsMuted(!isMuted)} className={`p-1.5 rounded cursor-pointer ${isMuted ? 'text-[#ed4245]' : 'hover:bg-[#3f4147]'}`}>{isMuted ? <MicOff size={18} /> : <Mic size={18} />}</div><div className="p-1.5 hover:bg-[#3f4147] rounded cursor-pointer"><Settings size={18} /></div></div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 bg-[#313338] flex flex-col min-w-0">
        <header className="h-12 border-b border-black/20 flex items-center px-4 justify-between shadow-sm bg-[#313338]">
          <div className="flex items-center gap-2">
            {view === 'home' ? <UsersIcon className="text-[#80848e]" /> : <Hash className="text-[#80848e]" />}
            <span className="font-bold text-white">{view === 'home' ? 'Друзья' : servers.find(s=>s.id===activeServerId)?.channels.find(c=>c.id===activeChannelId)?.name}</span>
          </div>
          <div className="flex gap-4 text-[#b5bac1]">
            <button onClick={() => setShowAddFriend(true)} className="bg-[#23a559] text-white px-3 py-1 rounded text-sm font-bold hover:bg-[#1a7a42] transition-colors">Добавить друга</button>
            <Bell size={20} className="hover:text-white cursor-pointer" />
            <Search size={20} className="hover:text-white cursor-pointer" />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col" ref={scrollRef}>
          {view === 'server' && servers.find(s=>s.id===activeServerId)?.channels.find(c=>c.id===activeChannelId)?.type === 'voice' ? (
            <div className="h-full w-full flex flex-col items-center justify-center gap-10">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
                {/* Local */}
                <div className="flex flex-col items-center gap-3">
                  <div className={`w-32 h-32 rounded-full p-1 bg-[#2b2d31] relative ${!isMuted ? 'is-speaking' : ''}`}><img src={user.avatar} className="w-full h-full rounded-full" />{isMuted && <MicOff className="absolute bottom-1 right-1 bg-[#ed4245] p-2 rounded-full text-white" />}</div>
                  <span className="font-bold text-white">{user.username} (Вы)</span>
                </div>
                {/* Remotes */}
                {Object.values(presenceMap).filter(p => p.channelId === activeChannelId && p.userId !== user.id).map(p => (
                  <div key={p.userId} className="flex flex-col items-center gap-3">
                    <div className={`w-32 h-32 rounded-full p-1 bg-[#2b2d31] relative ${p.isSpeaking ? 'is-speaking' : ''}`}><img src={p.avatar} className="w-full h-full rounded-full" />{p.isMuted && <MicOff className="absolute bottom-1 right-1 bg-[#ed4245] p-2 rounded-full text-white" />}</div>
                    <span className="font-bold text-white">{p.username}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-6 bg-[#1e1f22] p-4 rounded-3xl shadow-2xl border border-white/5">
                <button onClick={() => setIsMuted(!isMuted)} className={`p-4 rounded-full ${isMuted ? 'bg-[#ed4245]' : 'bg-[#4e5058] hover:bg-[#6d6f78]'} text-white transition-all`}><Mic size={28} /></button>
                <button onClick={() => setIsScreenSharing(!isScreenSharing)} className={`p-4 rounded-full ${isScreenSharing ? 'bg-[#23a559]' : 'bg-[#4e5058] hover:bg-[#6d6f78]'} text-white transition-all`}><Monitor size={28} /></button>
                <button onClick={() => setActiveChannelId('gen-1')} className="bg-[#ed4245] p-4 rounded-full text-white hover:bg-[#c03537] transition-all"><PhoneOff size={28} /></button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col">
               <div className="flex-1 space-y-1">
                {(messages[activeChannelId || ''] || []).map(m => (
                  <div key={m.id} className="flex gap-4 hover:bg-black/5 -mx-4 px-4 py-1.5 transition-colors">
                    <img src={m.avatar} className="w-10 h-10 rounded-full mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2"><span className="font-bold text-white">{m.author}</span><span className="text-[11px] text-[#949ba4]">{new Date(m.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span></div>
                      <p className="text-[#dbdee1] break-words">{m.content}</p>
                    </div>
                  </div>
                ))}
              </div>
              {activeChannelId && (
                <div className="mt-4">
                  <div className="bg-[#383a40] rounded-lg px-4 py-2.5 flex items-center gap-4">
                    <Plus className="bg-[#b5bac1] text-[#383a40] rounded-full p-0.5 cursor-pointer" size={20} />
                    <form className="flex-1" onSubmit={e => { e.preventDefault(); const target = e.target as any; sendMessage(target.msg.value); target.reset(); }}>
                      <input name="msg" autoComplete="off" className="bg-transparent w-full outline-none text-[#dbdee1]" placeholder={`Написать в #${servers.find(s=>s.id===activeServerId)?.channels.find(c=>c.id===activeChannelId)?.name}`} />
                    </form>
                    <div className="flex gap-3 text-[#b5bac1]"><Gift size={22} className="cursor-pointer" /><Smile size={22} className="cursor-pointer" /></div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Add Friend Modal */}
      {showAddFriend && (
        <div className="modal-backdrop" onClick={() => setShowAddFriend(false)}>
          <div className="bg-[#313338] p-8 rounded-lg w-full max-w-[440px] shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-white mb-4 uppercase">Добавить друга по ID</h2>
            <input id="fid" className="w-full bg-[#1e1f22] text-white p-3 rounded mb-6 outline-none border border-black/20 focus:border-[#5865f2]" placeholder="vibe-nickname-1234" />
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowAddFriend(false)} className="text-white hover:underline">Отмена</button>
              <button onClick={() => { connectToPeer((document.getElementById('fid') as HTMLInputElement).value); setShowAddFriend(false); }} className="bg-[#5865f2] text-white px-6 py-2 rounded font-bold hover:bg-[#4752c4]">Добавить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
