// [text, light colour, dark colour, style bitmask (1 italic, 2 bold, 4 underline)]
export type Tok = [text: string, light?: string, dark?: string, style?: number]

export type ToWorker =
  | { type: 'open'; id: number; path: string; text: string; want: number }
  | { type: 'want'; id: number; want: number }
  | { type: 'close'; id: number }

export type FromWorker =
  | { type: 'chunk'; id: number; start: number; lines: Tok[][] }
  | { type: 'done'; id: number }
  | { type: 'plain'; id: number }
