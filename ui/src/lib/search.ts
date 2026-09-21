export function escapeAction(value: string): 'clear' | 'blur' {
  return value ? 'clear' : 'blur'
}
