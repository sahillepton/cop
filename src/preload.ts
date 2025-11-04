import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('udp', {
  onMessage: (callback: (data: string) => void) => {
    ipcRenderer.on('udp-message', (_, data) => {
      console.log('📡 UDP message received in preload:', data)
      callback(data)
    })
  },
  sendMessage: (msg: string) => {
    console.log('📤 Sending UDP message from renderer:', msg)
    ipcRenderer.send('udp-send', msg)
  },
})

contextBridge.exposeInMainWorld('udpConfig', {
  submit: (host: string, port: number) => {
    ipcRenderer.send('udp-config', { host, port })
  },
})
