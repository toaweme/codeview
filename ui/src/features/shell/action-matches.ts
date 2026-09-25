export function actionMatches(query: string, label: string): number[] | null {
  const l = label.toLowerCase()
  const positions: number[] = []
  for (const word of query.toLowerCase().split(/\s+/).filter(Boolean)) {
    const at = l.indexOf(word)
    if (at < 0) return null
    for (let i = 0; i < word.length; i++) positions.push(at + i)
  }
  return positions
}
