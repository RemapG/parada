
import { Server, User } from './types';

export const INITIAL_SERVERS: Server[] = [
  {
    id: '1',
    name: 'General Community',
    icon: 'https://picsum.photos/id/10/48/48',
    channels: [
      { id: 'general', name: 'general', type: 'text' },
      { id: 'resources', name: 'resources', type: 'text' },
      { id: 'voice-general', name: 'General Voice', type: 'voice' },
    ]
  },
  {
    id: '2',
    name: 'TypeScript Mastery',
    icon: 'https://picsum.photos/id/20/48/48',
    channels: [
      { id: 'ts-chat', name: 'typescript-help', type: 'text' },
      { id: 'react-stuff', name: 'react-patterns', type: 'text' },
    ]
  },
  {
    id: '3',
    name: 'Tailwind Wizards',
    icon: 'https://picsum.photos/id/30/48/48',
    channels: [
      { id: 'css-tricks', name: 'css-wizardry', type: 'text' },
      { id: 'showcase', name: 'showcase', type: 'text' },
    ]
  }
];

export const INITIAL_USERS: User[] = [
  { id: '1', username: 'Alex', avatar: 'https://picsum.photos/id/64/48/48', status: 'online', activity: 'Playing Visual Studio Code' },
  { id: '2', username: 'Sarah', avatar: 'https://picsum.photos/id/65/48/48', status: 'idle' },
  { id: '3', username: 'Mike', avatar: 'https://picsum.photos/id/66/48/48', status: 'dnd', activity: 'Listening to Spotify' },
];
