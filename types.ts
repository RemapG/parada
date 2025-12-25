
export interface Server {
  id: string;
  name: string;
  icon: string;
  channels: Channel[];
}

export interface Channel {
  id: string;
  name: string;
  type: 'text' | 'voice';
  description?: string;
}

export interface Message {
  id: string;
  author: string;
  avatar: string;
  content: string;
  timestamp: Date;
}

export interface User {
  id: string;
  username: string;
  avatar: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
  activity?: string;
}
