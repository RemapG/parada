
import React, { useState, useEffect, useRef } from 'react';
import { Server, Channel, Message, User } from './types.ts';
import { INITIAL_SERVERS } from './constants.tsx';
import { 
  Plus, Hash, Volume2, Mic, MicOff, Settings, 
  Send, Smile, Users, Bell, Search, 
  PhoneOff, Video, VideoOff, Monitor, LogOut,
  Sparkles, Zap, MessageSquare, Compass, Radio,
  AtSign, HelpCircle, Gift, Sticker, Image as ImageIcon
} from 'lucide-react';

const AuthScreen = ({ onLogin }: { onLogin: (user: User) => void }) => {
  const [username, setUsername] = useState('');
  const [avatar, setAvatar] = useState(`https://api.dicebear.com/7.x/pixel-art/svg?seed=${Math.random()}`);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    const newUser: User = {
      id: `u_${Math.random().toString(36).substr(2, 5)}`,
      username,
      avatar,
      status: 'online'
    };
    localStorage.setItem('vibe_user', JSON.stringify(newUser));
    onLogin(newUser);
  };

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-[#1e1f22]">
      <div className="bg-[#313338] p-8 rounded-lg shadow-2xl w-full max-w-[480px] text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Welcome back!</h2>
        <p className="text-[#b5bac1] mb-6">We're so excited to see you again!</p>
        
        <form onSubmit={handleSubmit} className="space-y-5 text-left">
          <div>
            <label className="block text-[12px] font-bold text-[#b5bac1] uppercase mb-2">Email or Phone Number</label>
            <input 
              type="text" 
              className="w-full bg-[#1e1f22] text-[#dbdee1] p-2.5 rounded border-none outline-none focus:ring-1 focus:ring-[#5865f2]"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          
          <div className="flex flex-col items-center">
             <img src={avatar} className="w-20 h-20 rounded-full bg-[#1e1f22] mb-3" alt="Avatar" />
             <button 
              type="button"
              onClick={() => setAvatar(`https://api.dicebear.com/7.x/pixel-art/svg?seed=${Math.random()}`)}
              className="text-[#00a8fc] text-xs hover:underline"
             >
               Change Avatar
             </button>
          </div>
          
          <button type="submit" className="w-full bg-[#5865f2] hover:bg-[#4752c4] text-white font-medium py-2.5 rounded transition-colors">
            Log In
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
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, activeChannel]);

  if (!currentUser) return <AuthScreen onLogin={setCurrentUser} />;

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
    <div className="flex h-screen w-screen bg-[#1e1f22] text-[#dbdee1] overflow-hidden">
      {/* Servers Sidebar */}
      <nav className="flex flex-col items-center py-3 w-[72px] space-y-2 flex-shrink-0 bg-[#1e1f22]">
        <div className="w-12 h-12 bg-[#313338] rounded-[24px] flex items-center justify-center cursor-pointer mb-2 group transition-all duration-200 hover:rounded-[16px] hover:bg-[#5865f2]">
          <MessageSquare className="text-white group-hover:scale-110 transition-transform" size={28} />
        </div>
        <div className="w-8 h-[2px] bg-[#35363c] rounded-full mb-2"></div>
        {INITIAL_SERVERS.map(s => (
          <div key={s.id} className="relative group flex items-center">
            <div className={`absolute left-0 w-1 bg-white rounded-r-full transition-all duration-200 ${activeServer.id === s.id ? 'h-10' : 'h-2 scale-0 group-hover:scale-100 group-hover:h-5'}`}></div>
            <div 
              onClick={() => { setActiveServer(s); setActiveChannel(s.channels[0]); }}
              className={`w-12 h-12 cursor-pointer transition-all duration-200 overflow-hidden flex items-center justify-center ${activeServer.id === s.id ? 'rounded-[16px] bg-[#5865f2]' : 'rounded-[24px] bg-[#313338] hover:rounded-[16px] hover:bg-[#5865f2]'}`}
            >
              <img src={s.icon} className="w-full h-full object-cover" alt={s.name} />
            </div>
          </div>
        ))}
        <div className="w-12 h-12 bg-[#313338] rounded-[24px] flex items-center justify-center cursor-pointer group transition-all duration-200 hover:rounded-[16px] hover:bg-[#23a559]">
          <Plus className="text-[#23a559] group-hover:text-white transition-colors" size={24} />
        </div>
      </nav>

      {/* Channels Sidebar */}
      <aside className="w-60 bg-[#2b2d31] flex flex-col flex-shrink-0">
        <header className="h-12 flex items-center px-4 shadow-sm border-b border-[#1f2023] hover:bg-[#35373c] cursor-pointer transition-colors">
          <h2 className="font-bold text-white truncate text-[15px]">{activeServer.name}</h2>
        </header>
        
        <div className="flex-1 overflow-y-auto pt-4 px-2 space-y-4">
          <div>
            {activeServer.channels.map(c => (
              <div 
                key={c.id} 
                onClick={() => setActiveChannel(c)}
                className={`group flex items-center px-2 py-1.5 rounded cursor-pointer mb-[2px] transition-colors ${activeChannel.id === c.id ? 'bg-[#3f4147] text-white' : 'text-[#949ba4] hover:bg-[#35373c] hover:text-[#dbdee1]'}`}
              >
                {c.type === 'text' ? <Hash size={20} className="mr-1.5 text-[#80848e]" /> : <Volume2 size={20} className="mr-1.5 text-[#80848e]" />}
                <span className="text-[15px] font-medium truncate">{c.name}</span>
                <div className="ml-auto hidden group-hover:flex gap-1.5 text-[#b5bac1]">
                   <Settings size={14} className="hover:text-[#dbdee1]" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* User Status Footer */}
        <div className="h-[52px] bg-[#232428] px-2 flex items-center gap-2">
           <div className="relative">
             <img src={currentUser.avatar} className="w-8 h-8 rounded-full" alt="Me" />
             <div className="absolute bottom-0 right-0 w-3 h-3 bg-[#23a559] rounded-full border-[3px] border-[#232428]"></div>
           </div>
           <div className="flex-1 min-w-0 leading-tight">
             <p className="text-[13px] font-bold text-white truncate">{currentUser.username}</p>
             <p className="text-[11px] text-[#b5bac1] truncate">Online</p>
           </div>
           <div className="flex items-center text-[#b5bac1]">
              <div className="p-1.5 hover:bg-[#3f4147] rounded cursor-pointer transition-colors"><Mic size={18} /></div>
              <div className="p-1.5 hover:bg-[#3f4147] rounded cursor-pointer transition-colors"><Settings size={18} /></div>
           </div>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 bg-[#313338] flex flex-col min-w-0">
        <header className="h-12 flex items-center justify-between px-4 border-b border-[#1f2023] shadow-sm">
          <div className="flex items-center gap-2">
            <Hash size={24} className="text-[#80848e]" />
            <h3 className="font-bold text-white text-[15px]">{activeChannel.name}</h3>
          </div>
          <div className="flex items-center gap-4 text-[#b5bac1]">
             <Bell size={20} className="hover:text-[#dbdee1] cursor-pointer" />
             <Search size={20} className="hover:text-[#dbdee1] cursor-pointer" />
             <Users size={20} className="hover:text-[#dbdee1] cursor-pointer" />
             <HelpCircle size={20} className="hover:text-[#dbdee1] cursor-pointer" />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
          <div className="mb-8">
             <div className="w-16 h-16 bg-[#41434a] rounded-full flex items-center justify-center mb-4">
                <Hash size={40} className="text-white" />
             </div>
             <h1 className="text-3xl font-bold text-white mb-1">Welcome to #{activeChannel.name}!</h1>
             <p className="text-[#b5bac1]">This is the start of the #{activeChannel.name} channel.</p>
          </div>

          {(messages[activeChannel.id] || []).map((msg) => (
            <div key={msg.id} className="flex gap-4 hover:bg-[#2e3035] -mx-4 px-4 py-1 transition-colors group">
              <img src={msg.avatar} className="w-10 h-10 rounded-full mt-1 flex-shrink-0 cursor-pointer hover:shadow-lg" alt={msg.author} />
              <div className="flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="font-bold text-white hover:underline cursor-pointer text-[15px]">{msg.author}</span>
                  <span className="text-[12px] text-[#949ba4] font-medium">{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
                <div className="text-[#dbdee1] text-[15px] leading-relaxed">
                  {msg.content}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="px-4 pb-6">
          <form onSubmit={handleSendMessage} className="bg-[#383a40] rounded-lg flex items-center px-4 py-2.5 gap-4">
             <div className="text-[#b5bac1] hover:text-[#dbdee1] cursor-pointer transition-colors">
               <Plus className="bg-[#b5bac1] text-[#383a40] rounded-full p-0.5" size={20} />
             </div>
             <input 
               type="text" 
               value={inputValue}
               onChange={(e) => setInputValue(e.target.value)}
               placeholder={`Message #${activeChannel.name}`}
               className="bg-transparent flex-1 outline-none text-[#dbdee1] placeholder-[#6d6f78] text-[15px]"
             />
             <div className="flex items-center gap-3 text-[#b5bac1]">
                <Gift size={20} className="hover:text-[#dbdee1] cursor-pointer" />
                <Sticker size={20} className="hover:text-[#dbdee1] cursor-pointer" />
                <Smile size={20} className="hover:text-[#dbdee1] cursor-pointer" />
             </div>
          </form>
        </div>
      </main>
    </div>
  );
}
