/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "true" when the app should talk to the local Firebase emulator suite. */
  readonly VITE_USE_EMULATORS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
