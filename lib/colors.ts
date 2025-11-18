const palette = [
  "#3b82f6", // bright blue
  "#ef4444", // bright red
  "#10b981", // bright green
  "#f59e0b", // bright orange
  "#8b5cf6", // bright purple
  "#ec4899", // bright pink
  "#14b8a6", // bright teal
  "#f97316", // bright amber
  "#06b6d4", // bright cyan
  "#a855f7", // bright violet
  "#22c55e", // bright lime
  "#eab308", // bright yellow
]

export const colorForNet = (id: string): string => {
  // stable hash -> palette index
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return palette[Math.abs(h) % palette.length] ?? "#3b82f6"
}

export const colorByIndex = (index: number): string => {
  return palette[index % palette.length] ?? "#3b82f6"
}
