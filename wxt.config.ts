import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import { DEFAULT_HOST_PERMISSIONS, OPTIONAL_HOST_PERMISSIONS } from './lib/hosts';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Local Session Switcher',
    description: 'Swap test-user sessions (cookies + storage) on local projects.',
    homepage_url: 'https://abdallahsaber065.github.io/local-session-switcher/',
    permissions: ['storage', 'cookies', 'contextMenus', 'sidePanel'],
    host_permissions: [...DEFAULT_HOST_PERMISSIONS],
    optional_host_permissions: [...OPTIONAL_HOST_PERMISSIONS],
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
