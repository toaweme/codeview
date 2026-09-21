export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  const units = ['KiB', 'MiB', 'GiB']
  let v = n / 1024
  let u = 0
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024
    u++
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[u]}`
}

export function shortHash(hash: string): string {
  return hash.slice(0, 7)
}

const IMAGE = /\.(png|jpe?g|gif|webp|avif|bmp|ico)$/i

export function isImagePath(path: string): boolean {
  return IMAGE.test(path)
}
