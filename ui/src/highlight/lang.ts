const NAMES: Record<string, string> = {
  dockerfile: 'dockerfile',
  containerfile: 'dockerfile',
  makefile: 'make',
  gnumakefile: 'make',
  'go.mod': 'go',
  'go.sum': 'txt',
  'go.work': 'go',
  '.gitignore': 'shellscript',
  '.dockerignore': 'shellscript',
  '.env': 'dotenv',
  '.bashrc': 'bash',
  '.zshrc': 'zsh',
  jenkinsfile: 'groovy',
  'cmakelists.txt': 'cmake',
  justfile: 'just',
  'taskfile.yml': 'yaml',
  license: 'txt',
}

const EXTS: Record<string, string> = {
  mjs: 'js',
  cjs: 'js',
  mts: 'ts',
  cts: 'ts',
  h: 'c',
  hpp: 'cpp',
  cc: 'cpp',
  svg: 'xml',
  plist: 'xml',
  csproj: 'xml',
  mod: 'go',
  env: 'dotenv',
  tf: 'hcl',
  tfvars: 'hcl',
  lock: 'json',
  gotmpl: 'go-template',
  tmpl: 'go-template',
  service: 'ini',
  conf: 'ini',
  cfg: 'ini',
  txt: 'txt',
  log: 'log',
}

export function langFor(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1).toLowerCase()
  if (NAMES[base]) return NAMES[base]
  if (base.startsWith('dockerfile')) return 'dockerfile'
  if (base.startsWith('.env')) return 'dotenv'
  const dot = base.lastIndexOf('.')
  if (dot < 0) return 'txt'
  const ext = base.slice(dot + 1)
  return EXTS[ext] ?? ext
}
