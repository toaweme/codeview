/// <reference types="vite/client" />

// set at build time by goreleaser and the taskfile, and unset in development
interface ImportMetaEnv {
  readonly VITE_VERSION?: string
  readonly VITE_COMMIT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
