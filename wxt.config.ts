import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

const LOCAL_HOSTS = [
  'http://localhost/*',
  'https://localhost/*',
  'http://127.0.0.1/*',
  'https://127.0.0.1/*',
];

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Local Session Switcher',
    description: 'Swap test-user sessions (cookies + storage) on local projects.',
    permissions: ['storage', 'cookies', 'contextMenus', 'sidePanel'],
    host_permissions: LOCAL_HOSTS,
    commands: {
      'next-user': {
        suggested_key: { default: 'Alt+Shift+U' },
        description: 'Switch to next user (active project)',
      },
      'prev-user': {
        suggested_key: { default: 'Alt+Shift+Y' },
        description: 'Switch to previous user (active project)',
      },
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
