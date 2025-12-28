
import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Peer, DataConnection } from 'peerjs';
import { 
  Plus, Hash, Volume2, Mic, MicOff, Settings, Bell, Search, 
  Users as UsersIcon, HelpCircle, Gift, Sticker, Smile, MessageSquare,
  Phone, Monitor, MonitorOff, Video, VideoOff, Info, LogOut,
  Wifi, Share2, Copy, Check, X, UserPlus, Home, ChevronDown, 
  UserMinus, Ghost, Camera, PhoneOff
} from 'lucide-react';

// --- Types ---
interface User {
  id: string;
  username: string;
  avatar: string;
}

interface Friend extends User {
  peerId: string;
  status: 'online' | 'offline';
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

// --- App Component ---
const App = () => {
  const [user, setUser] = useState<User | null>(null);
  const [peer, setPeer] = useState<Peer | null>(null);
  const [view, setView] = useState<'home' | 'server'>('home');
  
  const [servers, setServers] = useState<Server[]>([
    { id: '1', name: 'Global Community', icon: 'https://api.dicebear.com/7.x/initials/svg?seed=GC&backgroundColor=5865f2', channels: [
      { id: 'gen-1', name: 'general', type: 'text' },
      { id: 'voice-1', name: 'Lounge', type: 'voice' }
    ]}
  ]);
  
  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [connections, setConnections] = useState<Record<string, DataConnection>>({});
  
  // UI States
  const [showCreateServer, setShowCreateServer] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [newChannelType, setNewChannelType] = useState<'text' | 'voice'>('text');
  const [copied, setCopied] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, activeChannelId]);

  useEffect(() => {
    return () => {
      if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [screenStream]);

  const handleLogin = (username: string) => {
    if (!username.trim()) return;
    const id = `vibe-${username.toLowerCase().replace(/\s/g, '-')}-${Math.floor(Math.random()*1000)}`;
    const newUser = { id, username, avatar: `https://api.dicebear.com/7.x/pixel-art/svg?seed=${username}&backgroundColor=b6e3f4` };
    setUser(newUser);
    
    const newPeer = new Peer(id);
    newPeer.on('connection', (conn) => {
      conn.on('data', (data: any) => handleData(data, conn));
    });
    setPeer(newPeer);
  };

  const handleData = (data: any, conn: DataConnection) => {
    if (data.type === 'MSG') {
      setMessages(prev => ({
        ...prev,
        [data.channelId]: [...(prev[data.channelId] || []), data.message]
      }));
    }
    if (data.type === 'FRIEND_REQ') {
      setFriends(prev => {
        if (prev.find(f => f.peerId === conn.peer)) return prev;
        return [...prev, { ...data.user, peerId: conn.peer, status: 'online' }];
      });
      setConnections(prev => ({ ...prev, [conn.peer]: conn }));
    }
    if (data.type === 'INVITE') {
      alert(`${data.inviter} пригласил вас на сервер ${data.serverName}!`);
    }
  };

  const createServer = (name: string) => {
    if (!name.trim()) return;
    const newServer: Server = {
      id: Date.now().toString(),
      name,
      icon: `https://api.dicebear.com/7.x/initials/svg?seed=${name}&backgroundColor=5865f2`,
      channels: [{ id: `c-${Date.now()}`, name: 'general', type: 'text' }]
    };
    setServers([...servers, newServer]);
    setShowCreateServer(false);
  };

  const createChannel = (name: string, type: 'text' | 'voice') => {
    if (!name.trim()) return;
    setServers(prev => prev.map(s => {
      if (s.id === activeServerId) {
        return { ...s, channels: [...s.channels, { id: Date.now().toString(), name: name.replace(/\s+/g, '-').toLowerCase(), type }] };
      }
      return s;
    }));
    setShowCreateChannel(false);
  };

  const addFriend = (peerId: string) => {
    if (!peer || !user || !peerId.trim()) return;
    const conn = peer.connect(peerId);
    conn.on('open', () => {
      conn.send({ type: 'FRIEND_REQ', user });
      setFriends(prev => {
         if (prev.find(f => f.peerId === peerId)) return prev;
         return [...prev, { 
            username: peerId.split('-')[1] || 'Friend', 
            peerId, 
            status: 'online', 
            avatar: `https://api.dicebear.com/7.x/pixel-art/svg?seed=${peerId}&backgroundColor=ffd5dc`,
            id: peerId
          } as Friend];
      });
      setConnections(prev => ({ ...prev, [peerId]: conn }));
      setShowAddFriend(false);
    });
  };

  const inviteFriendToServer = (friendPeerId: string) => {
    const conn = connections[friendPeerId];
    if (conn) {
      conn.send({ 
        type: 'INVITE', 
        serverName: activeServer?.name, 
        serverId: activeServerId, 
        inviter: user?.username 
      });
      alert(`Приглашение отправлено!`);
    } else {
      alert("Друг сейчас не в сети.");
    }
  };

  const sendMessage = (text: string) => {
    if (!text.trim() || !activeChannelId || !user) return;
    const msg: Message = { id: Date.now(), author: user.username, avatar: user.avatar, content: text, timestamp: new Date() };
    setMessages(prev => ({ ...prev, [activeChannelId]: [...(prev[activeChannelId] || []), msg] }));
    
    Object.values(connections).forEach(conn => {
      conn.send({ type: 'MSG', channelId: activeChannelId, message: msg });
    });
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
      }
      setScreenStream(null);
      setIsScreenSharing(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        setScreenStream(stream);
        setIsScreenSharing(true);
        
        stream.getVideoTracks()[0].onended = () => {
          setIsScreenSharing(false);
          setScreenStream(null);
        };
      } catch (err) {
        console.error("Error sharing screen:", err);
      }
    }
  };

  useEffect(() => {
    if (isScreenSharing && videoRef.current && screenStream) {
      videoRef.current.srcObject = screenStream;
    }
  }, [isScreenSharing, screenStream]);

  const activeServer = servers.find(s => s.id === activeServerId);
  const activeChannel = activeServer?.channels.find(c => c.id === activeChannelId);

  if (!user) return (
    <div className="h-screen w-screen flex items-center justify-center bg-[#1e1f22]">
      <div className="bg-[#313338] p-10 rounded-lg shadow-2xl w-full max-w-[480px] border border-white/5">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-[#5865f2] rounded-2xl flex items-center justify-center text-white mb-4 shadow-lg">
            <MessageSquare size={40} />
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">С возвращением!</h2>
          <p className="text-[#b5bac1]">Мы так рады видеть вас снова!</p>
        </div>
        
        <div className="space-y-6">
          <div>
            <label className="block text-[12px] font-bold text-[#b5bac1] uppercase mb-2 tracking-wide">Имя пользователя</label>
            <input 
              autoFocus 
              className="w-full bg-[#1e1f22] text-white p-3 rounded outline-none border border-black/20 focus:border-[#5865f2] transition-colors"
              placeholder="Как нам вас называть?" 
              onKeyDown={(e) => e.key === 'Enter' && handleLogin((e.target as HTMLInputElement).value)}
            />
          </div>
          <button onClick={() => handleLogin((document.querySelector('input') as HTMLInputElement).value)} className="w-full bg-[#5865f2] py-3 rounded font-bold text-white hover:bg-[#4752c4] transition-all transform active:scale-[0.98] shadow-lg">Продолжить</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen w-screen bg-[#1e1f22] overflow-hidden">
      {/* Servers List */}
      <nav className="w-[72px] bg-[#1e1f22] flex flex-col items-center py-3 space-y-2 border-r border-black/20 flex-shrink-0">
        <div 
          onClick={() => setView('home')}
          className={`w-12 h-12 flex items-center justify-center cursor-pointer transition-all duration-200 ${view === 'home' ? 'bg-[#5865f2] rounded-[16px] text-white' : 'bg-[#313338] rounded-[24px] text-[#dbdee1] hover:rounded-[16px] hover:bg-[#5865f2] hover:text-white'}`}
        >
          <Home size={28} />
        </div>
        <div className="w-8 h-[2px] bg-[#35363c] rounded-full"></div>
        {servers.map(s => (
          <div key={s.id} 
            onClick={() => { setView('server'); setActiveServerId(s.id); setActiveChannelId(s.channels[0].id); }}
            className={`w-12 h-12 cursor-pointer transition-all duration-200 overflow-hidden relative group ${activeServerId === s.id && view === 'server' ? 'rounded-[16px]' : 'rounded-[24px] hover:rounded-[16px]'}`}
          >
            <img src={s.icon} className="w-full h-full object-cover" alt={s.name} />
            {activeServerId === s.id && view === 'server' && <div className="absolute left-0 top-1/4 bottom-1/4 w-1 bg-white rounded-r-full"></div>}
          </div>
        ))}
        <div onClick={() => setShowCreateServer(true)} className="w-12 h-12 bg-[#313338] rounded-[24px] flex items-center justify-center cursor-pointer hover:rounded-[16px] hover:bg-[#23a559] transition-all duration-200 group">
          <Plus className="text-[#23a559] group-hover:text-white" />
        </div>
      </nav>

      {/* Sub Sidebar */}
      <aside className="w-60 bg-[#2b2d31] flex flex-col flex-shrink-0">
        {view === 'home' ? (
          <>
            <header className="h-12 border-b border-black/20 flex items-center px-4 shadow-sm bg-[#2b2d31]">
              <input className="w-full bg-[#1e1f22] text-xs p-1.5 rounded outline-none border border-black/20" placeholder="Поиск" />
            </header>
            <div className="flex-1 p-2 space-y-1 overflow-y-auto">
               <div className="flex items-center px-2 py-2 rounded bg-[#3f4147] text-white cursor-pointer transition-colors">
                  <UsersIcon size={20} className="mr-3 text-[#dbdee1]" /> <span className="font-medium">Друзья</span>
               </div>
               <p className="text-[12px] font-bold text-[#949ba4] uppercase px-2 mt-4 mb-1 tracking-wider">Личные сообщения</p>
               {friends.length === 0 ? (
                  <div className="px-4 py-8 text-center opacity-30">
                    <Ghost size={40} className="mx-auto mb-2" />
                    <p className="text-xs">Нет активных переписок</p>
                  </div>
               ) : friends.map(f => (
                 <div key={f.peerId} className="flex items-center px-2 py-1.5 rounded hover:bg-[#35373c] cursor-pointer group transition-colors">
                    <div className="relative">
                      <img src={f.avatar} className="w-8 h-8 rounded-full mr-3" alt={f.username} />
                      <div className="absolute bottom-0 right-3 w-3 h-3 bg-[#23a559] rounded-full border-2 border-[#2b2d31]"></div>
                    </div>
                    <span className="text-[#949ba4] group-hover:text-[#dbdee1] truncate font-medium">{f.username}</span>
                 </div>
               ))}
            </div>
          </>
        ) : (
          <>
            <header onClick={() => setShowInviteModal(true)} className="h-12 border-b border-black/20 flex items-center px-4 justify-between hover:bg-[#35373c] cursor-pointer transition-colors shadow-sm group bg-[#2b2d31]">
              <span className="font-bold text-white truncate text-[15px]">{activeServer?.name}</span>
              <ChevronDown size={18} className="text-[#949ba4] group-hover:text-white" />
            </header>
            <div className="flex-1 p-2 overflow-y-auto">
               <div className="flex items-center justify-between text-[#949ba4] px-2 mb-1 group/header">
                  <span className="text-[12px] font-bold uppercase tracking-wider group-hover/header:text-[#dbdee1]">Каналы</span>
                  <Plus size={14} className="cursor-pointer hover:text-white transition-colors" onClick={(e) => { e.stopPropagation(); setShowCreateChannel(true); }} />
               </div>
               {activeServer?.channels.map(c => (
                 <div key={c.id} onClick={() => { setActiveChannelId(c.id); }} className={`flex items-center px-2 py-1.5 rounded mb-[2px] cursor-pointer group transition-all ${activeChannelId === c.id ? 'bg-[#3f4147] text-white shadow-sm' : 'text-[#949ba4] hover:bg-[#35373c] hover:text-[#dbdee1]'}`}>
                    {c.type === 'text' ? <Hash size={20} className="mr-1.5 opacity-60" /> : <Volume2 size={20} className="mr-1.5 opacity-60" />}
                    <span className="truncate flex-1 font-medium">{c.name}</span>
                 </div>
               ))}
            </div>
          </>
        )}
        
        <div className="bg-[#232428] px-2 h-[52px] flex items-center gap-2 border-t border-black/10">
           <div className="relative cursor-pointer group">
              <img src={user.avatar} className="w-8 h-8 rounded-full border border-black/20" alt="me" />
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-[#23a559] rounded-full border-2 border-[#232428]"></div>
           </div>
           <div className="flex-1 min-w-0">
              <p className="text-[13px] font-bold text-white truncate">{user.username}</p>
              <p className="text-[11px] text-[#b5bac1] truncate tracking-tighter cursor-pointer hover:underline" onClick={() => { navigator.clipboard.writeText(user.id); alert('ID Copied!'); }}>#{user.id.split('-').pop()}</p>
           </div>
           <div className="flex gap-0.5 text-[#b5bac1]">
             <div onClick={() => setIsMuted(!isMuted)} className={`p-1.5 rounded cursor-pointer transition-colors ${isMuted ? 'text-[#ed4245]' : 'hover:bg-[#3f4147]'}`}>{isMuted ? <MicOff size={18} /> : <Mic size={18} />}</div>
             <div className="p-1.5 hover:bg-[#3f4147] rounded cursor-pointer transition-colors"><Settings size={18} /></div>
           </div>
        </div>
      </aside>

      {/* Main Area */}
      <main className="flex-1 bg-[#313338] flex flex-col relative min-w-0">
        {view === 'home' ? (
          <div className="flex-1 flex flex-col">
            <header className="h-12 border-b border-black/20 flex items-center px-4 gap-4 shadow-sm bg-[#313338]/95 backdrop-blur z-10">
              <div className="flex items-center text-[#dbdee1] font-bold border-r border-white/10 pr-4">
                <UsersIcon size={20} className="mr-2 opacity-60" /> Друзья
              </div>
              <div className="flex gap-4 text-[#b5bac1] font-medium text-sm flex-1">
                <span className="text-white bg-[#3f4147] px-2 py-0.5 rounded cursor-pointer">В сети</span>
                <span className="hover:bg-[#3f4147] hover:text-white px-2 py-0.5 rounded cursor-pointer transition-colors">Все</span>
                <button onClick={() => setShowAddFriend(true)} className="bg-[#23a559] text-white px-3 py-0.5 rounded hover:bg-[#1a7a42] transition-colors ml-2 font-bold">Добавить друга</button>
              </div>
            </header>
            <div className="flex-1 p-8 overflow-y-auto">
               {friends.length === 0 ? (
                 <div className="flex flex-col items-center justify-center h-full opacity-20 text-center">
                    <Ghost size={64} className="mb-4" />
                    <p className="text-xl font-bold">Wumpus ждет друзей...</p>
                    <p className="text-sm mt-2">Добавьте кого-нибудь по их уникальному ID!</p>
                 </div>
               ) : (
                 <div className="max-w-4xl mx-auto space-y-4">
                    <p className="text-[#949ba4] text-[12px] font-bold uppercase tracking-widest px-1">В сети — {friends.length}</p>
                    <div className="space-y-1">
                      {friends.map(f => (
                        <div key={f.peerId} className="flex items-center justify-between p-3 border-t border-white/5 hover:bg-[#35373c] rounded-lg group transition-all cursor-pointer">
                           <div className="flex items-center gap-4">
                              <img src={f.avatar} className="w-10 h-10 rounded-full bg-[#1e1f22]" alt={f.username} />
                              <div><p className="text-white font-bold">{f.username}</p><p className="text-xs text-[#b5bac1]">В сети</p></div>
                           </div>
                           <div className="flex gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                              <div className="p-2.5 bg-[#1e1f22] rounded-full text-[#b5bac1] hover:text-[#dbdee1] transition-colors shadow-lg"><MessageSquare size={18} /></div>
                              <div className="p-2.5 bg-[#1e1f22] rounded-full text-[#b5bac1] hover:text-[#ed4245] transition-colors shadow-lg"><X size={18} /></div>
                           </div>
                        </div>
                      ))}
                    </div>
                 </div>
               )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            <header className="h-12 border-b border-black/20 flex items-center px-4 shadow-sm justify-between bg-[#313338]/95 backdrop-blur z-10">
              <div className="flex items-center gap-2 overflow-hidden">
                {activeChannel?.type === 'text' ? <Hash className="text-[#80848e]" size={24} /> : <Volume2 className="text-[#80848e]" size={24} />}
                <span className="font-bold text-white truncate">{activeChannel?.name}</span>
              </div>
              <div className="flex gap-4 text-[#b5bac1] items-center">
                 <Bell size={20} className="hover:text-white cursor-pointer transition-colors" />
                 <UsersIcon size={20} className="hover:text-white cursor-pointer transition-colors" />
                 <Search size={20} className="hover:text-white cursor-pointer transition-colors" />
              </div>
            </header>

            <div className={`flex-1 overflow-y-auto p-4 space-y-4 flex flex-col ${activeChannel?.type === 'voice' ? 'items-center justify-center' : ''}`} ref={scrollRef}>
               {activeChannel?.type === 'text' ? (
                 <>
                    <div className="pb-10 pt-4 px-2">
                       <div className="w-20 h-20 bg-[#41434a] rounded-full flex items-center justify-center mb-4 shadow-inner">
                          <Hash size={40} className="text-white" />
                       </div>
                       <h1 className="text-3xl font-bold text-white mb-1">Добро пожаловать в #{activeChannel?.name}!</h1>
                       <p className="text-[#b5bac1] text-lg opacity-70">Это начало канала #{activeChannel?.name}.</p>
                       <div className="h-[1px] bg-white/5 w-full mt-6"></div>
                    </div>
                    <div className="space-y-1">
                      {(messages[activeChannelId || ''] || []).map(m => (
                        <div key={m.id} className="flex gap-4 group hover:bg-[#2e3035] -mx-4 px-4 py-1.5 transition-colors">
                           <img src={m.avatar} className="w-10 h-10 rounded-full flex-shrink-0 mt-0.5 cursor-pointer active:scale-95 transition-transform" alt={m.author} />
                           <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-2">
                                 <span className="font-bold text-white hover:underline cursor-pointer text-[15px]">{m.author}</span>
                                 <span className="text-[11px] text-[#949ba4] font-medium">{new Date(m.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                              </div>
                              <p className="text-[#dbdee1] break-words whitespace-pre-wrap">{m.content}</p>
                           </div>
                        </div>
                      ))}
                    </div>
                 </>
               ) : (
                 <div className="h-full w-full flex items-center justify-center flex-col gap-6 overflow-hidden">
                    {isScreenSharing ? (
                      <div className="relative w-full max-w-4xl bg-black rounded-xl overflow-hidden shadow-2xl flex-1 max-h-[70%] border border-white/5">
                        <video ref={videoRef} autoPlay muted className="w-full h-full object-contain" />
                        <div className="absolute bottom-4 left-4 bg-black/60 px-3 py-1 rounded-full text-xs text-white flex items-center gap-2">
                           <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                           В ЭФИРЕ: Экран пользователя {user.username}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-4 transition-all hover:scale-105">
                         <div className={`w-36 h-36 rounded-full p-1.5 bg-[#2b2d31] shadow-2xl relative ${!isMuted ? 'is-speaking' : ''}`}>
                            <img src={user.avatar} className="w-full h-full rounded-full" alt="avatar" />
                            {isMuted && <div className="absolute bottom-2 right-2 bg-[#ed4245] p-2 rounded-full border-4 border-[#2b2d31]"><MicOff size={20} className="text-white" /></div>}
                         </div>
                         <span className="font-bold text-2xl text-white tracking-wide">{user.username}</span>
                      </div>
                    )}

                    <div className="flex gap-6 bg-[#1e1f22]/80 backdrop-blur p-4 rounded-3xl shadow-2xl border border-white/10">
                       <button onClick={() => setIsMuted(!isMuted)} className={`p-4 rounded-full transition-all hover:scale-110 shadow-lg ${isMuted ? 'bg-[#ed4245]' : 'bg-[#4e5058] hover:bg-[#6d6f78]'}`}>
                         {isMuted ? <MicOff size={28} className="text-white" /> : <Mic size={28} className="text-white" />}
                       </button>
                       <button onClick={toggleScreenShare} className={`p-4 rounded-full transition-all hover:scale-110 shadow-lg ${isScreenSharing ? 'bg-[#23a559]' : 'bg-[#4e5058] hover:bg-[#6d6f78]'}`}>
                         {isScreenSharing ? <MonitorOff size={28} className="text-white" /> : <Monitor size={28} className="text-white" />}
                       </button>
                       <button onClick={() => setActiveChannelId(activeServer?.channels.find(c => c.type === 'text')?.id || null)} className="bg-[#ed4245] p-4 rounded-full text-white hover:bg-[#c03537] shadow-lg hover:scale-110 transition-all"><PhoneOff size={28} /></button>
                    </div>
                 </div>
               )}
            </div>

            {activeChannel?.type === 'text' && (
              <div className="px-4 pb-6 mt-auto">
                <div className="bg-[#383a40] rounded-lg px-4 py-2.5 flex items-center gap-4 shadow-inner">
                   <Plus className="bg-[#b5bac1] hover:bg-white text-[#383a40] rounded-full p-0.5 cursor-pointer transition-all active:scale-90" size={20} />
                   <form onSubmit={(e) => { e.preventDefault(); sendMessage((e.target as any).msg.value); (e.target as any).reset(); }} className="flex-1">
                     <input name="msg" autoComplete="off" className="bg-transparent w-full outline-none text-[#dbdee1] placeholder-[#6d6f78] text-[15px]" placeholder={`Написать в #${activeChannel?.name}`} />
                   </form>
                   <div className="flex gap-3 text-[#b5bac1]">
                      <Gift size={22} className="hover:text-[#dbdee1] cursor-pointer" />
                      <Smile size={22} className="hover:text-[#dbdee1] cursor-pointer" />
                   </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modals */}
      {showCreateServer && (
        <div className="modal-backdrop" onClick={() => setShowCreateServer(false)}>
          <div className="bg-[#313338] p-8 rounded-lg w-full max-w-[440px] shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-2xl font-bold text-white text-center mb-2">Создайте свой сервер</h2>
            <p className="text-[#b5bac1] text-center mb-8">Назовите свой сервер как душе угодно.</p>
            <input id="sname" className="w-full bg-[#1e1f22] text-white p-3 rounded mb-8 outline-none border border-black/20 focus:border-[#5865f2] transition-colors" placeholder="Имя сервера" defaultValue={user?.username + "'s server"} />
            <div className="flex justify-between items-center bg-[#2b2d31] -mx-8 -mb-8 p-4 rounded-b-lg mt-4">
               <button onClick={() => setShowCreateServer(false)} className="text-white hover:underline px-4">Отмена</button>
               <button onClick={() => createServer((document.getElementById('sname') as HTMLInputElement).value)} className="bg-[#5865f2] text-white px-8 py-2.5 rounded font-bold hover:bg-[#4752c4] transition-all">Создать</button>
            </div>
          </div>
        </div>
      )}

      {showCreateChannel && (
        <div className="modal-backdrop" onClick={() => setShowCreateChannel(false)}>
          <div className="bg-[#313338] p-8 rounded-lg w-full max-w-[440px] shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-white">Создать канал</h2>
              <X className="text-[#b5bac1] cursor-pointer hover:text-white" onClick={() => setShowCreateChannel(false)} />
            </div>
            
            <div className="space-y-4 mb-8">
               <div onClick={() => setNewChannelType('text')} className={`p-4 rounded-lg cursor-pointer border flex justify-between items-center ${newChannelType === 'text' ? 'bg-[#3f4147] border-[#5865f2]' : 'bg-[#2b2d31] border-transparent hover:bg-[#35373c]'}`}>
                  <div className="flex items-center gap-4"><Hash size={24} className="text-[#949ba4]" /><div className="text-left"><p className="text-white font-bold">Текстовый</p><p className="text-xs text-[#949ba4]">Сообщения, файлы и стикеры</p></div></div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${newChannelType === 'text' ? 'border-[#5865f2]' : 'border-[#949ba4]'}`}>{newChannelType === 'text' && <div className="w-2.5 h-2.5 rounded-full bg-[#5865f2]"></div>}</div>
               </div>

               <div onClick={() => setNewChannelType('voice')} className={`p-4 rounded-lg cursor-pointer border flex justify-between items-center ${newChannelType === 'voice' ? 'bg-[#3f4147] border-[#5865f2]' : 'bg-[#2b2d31] border-transparent hover:bg-[#35373c]'}`}>
                  <div className="flex items-center gap-4"><Volume2 size={24} className="text-[#949ba4]" /><div className="text-left"><p className="text-white font-bold">Голосовой</p><p className="text-xs text-[#949ba4]">Общение голосом и демонстрация экрана</p></div></div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${newChannelType === 'voice' ? 'border-[#5865f2]' : 'border-[#949ba4]'}`}>{newChannelType === 'voice' && <div className="w-2.5 h-2.5 rounded-full bg-[#5865f2]"></div>}</div>
               </div>
            </div>

            <label className="text-[12px] font-bold text-[#b5bac1] uppercase mb-2 block tracking-wider">Имя канала</label>
            <input id="cname" className="w-full bg-[#1e1f22] text-white p-3 rounded mb-10 outline-none border border-black/20 focus:border-[#5865f2]" placeholder="новый-канал" />

            <div className="flex justify-end items-center gap-4 bg-[#2b2d31] -mx-8 -mb-8 p-4 rounded-b-lg">
               <button onClick={() => setShowCreateChannel(false)} className="text-white hover:underline text-sm font-medium">Отмена</button>
               <button onClick={() => createChannel((document.getElementById('cname') as HTMLInputElement).value, newChannelType)} className="bg-[#5865f2] text-white px-8 py-2.5 rounded font-bold hover:bg-[#4752c4] transition-all">Создать канал</button>
            </div>
          </div>
        </div>
      )}

      {showAddFriend && (
        <div className="modal-backdrop" onClick={() => setShowAddFriend(false)}>
          <div className="bg-[#313338] p-8 rounded-lg w-full max-w-[440px] shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-white mb-2 uppercase tracking-wide">Добавить друга</h2>
            <p className="text-[#b5bac1] text-sm mb-6 leading-relaxed">Введите уникальный VibeSpace ID вашего друга:</p>
            <input id="fid" className="w-full bg-[#1e1f22] text-white p-3 rounded mb-8 outline-none border border-black/20 focus:border-[#5865f2] shadow-inner" placeholder="vibe-nickname-123" />
            <div className="flex justify-end gap-2 bg-[#2b2d31] -mx-8 -mb-8 p-4 rounded-b-lg">
               <button onClick={() => setShowAddFriend(false)} className="text-white hover:underline px-6 py-2 text-sm font-medium">Отмена</button>
               <button onClick={() => addFriend((document.getElementById('fid') as HTMLInputElement).value)} className="bg-[#5865f2] text-white px-8 py-2.5 rounded font-bold hover:bg-[#4752c4] transition-all">Отправить запрос</button>
            </div>
          </div>
        </div>
      )}

      {showInviteModal && (
        <div className="modal-backdrop" onClick={() => setShowInviteModal(false)}>
          <div className="bg-[#313338] p-8 rounded-lg w-full max-w-[480px] shadow-2xl" onClick={e => e.stopPropagation()}>
             <div className="flex justify-between items-center mb-6">
                <h2 className="text-white font-bold flex items-center gap-3 text-xl"><UserPlus size={24} className="text-[#23a559]" /> Пригласить друзей на {activeServer?.name}</h2>
                <X className="text-[#949ba4] cursor-pointer hover:text-white" onClick={() => setShowInviteModal(false)} />
             </div>
             
             <div className="space-y-4 mb-8 max-h-60 overflow-y-auto pr-2">
                <p className="text-[#b5bac1] text-[12px] font-bold uppercase tracking-widest px-1">Список друзей</p>
                {friends.length === 0 ? (
                  <div className="p-4 bg-black/20 rounded-lg text-center"><p className="text-xs text-[#949ba4]">У вас еще нет друзей для приглашения!</p></div>
                ) : friends.map(f => (
                  <div key={f.peerId} className="flex items-center justify-between p-2 rounded-lg hover:bg-[#2b2d31] transition-colors">
                     <div className="flex items-center gap-3"><img src={f.avatar} className="w-9 h-9 rounded-full" alt={f.username} /><span className="font-bold text-white">{f.username}</span></div>
                     <button onClick={() => inviteFriendToServer(f.peerId)} className="border border-[#5865f2] text-[#5865f2] hover:bg-[#5865f2] hover:text-white px-3 py-1 rounded text-xs font-bold transition-all active:scale-95">Пригласить</button>
                  </div>
                ))}
             </div>
             <div className="flex gap-2 bg-[#1e1f22] p-2 rounded border border-black/40 shadow-inner">
                <input readOnly value={user?.id} className="bg-transparent flex-1 text-sm text-[#dbdee1] outline-none px-2 font-mono" />
                <button onClick={() => { navigator.clipboard.writeText(user?.id || ''); setCopied(true); setTimeout(()=>setCopied(false), 2000); }} className={`px-5 py-2 rounded text-sm font-bold transition-all ${copied ? 'bg-[#23a559]' : 'bg-[#5865f2] hover:bg-[#4752c4]'} text-white`}>{copied ? 'Скопировано!' : 'Копировать'}</button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
