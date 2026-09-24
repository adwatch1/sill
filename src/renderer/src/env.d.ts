/// <reference types="vite/client" />
import type { MediaApi, NotesApi, PanelApi, SettingsApi } from '../../preload'

declare global {
  interface Window {
    panel: PanelApi
    notes: NotesApi
    settings: SettingsApi
    media: MediaApi
  }
}
