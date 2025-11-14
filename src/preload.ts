import { contextBridge, ipcRenderer } from 'electron';

// Expose a small, safe API to the renderer for receiving UDP node updates.
// This keeps contextIsolation intact and avoids giving full ipcRenderer access.
contextBridge.exposeInMainWorld('udp', {
	onDataFromMain: (callback: (data: any) => void) => {
		// Ensure we don't attach duplicate listeners from multiple calls
		ipcRenderer.removeAllListeners('data-from-main');
		ipcRenderer.on('data-from-main', (_event, data) => {
			try {
				callback(data);
			} catch (e) {
				// swallow callback errors to avoid crashing the preload
				console.error('udp.onDataFromMain callback error', e);
			}
		});
	},
});

// Small convenience: allow renderer to request the latest nodes if needed
contextBridge.exposeInMainWorld('udpRequest', {
	requestLatest: () => ipcRenderer.invoke('udp-request-latest'),
});
