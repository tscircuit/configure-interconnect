import type { SourceNet, SourcePort } from "./types"

export type PinKind = "C" | "X" | "IN"

export const pinKind = (portOrHint: { port_hints: string[] }): PinKind => {
  // Check all hints, not just the first one
  for (const h of portOrHint.port_hints) {
    if (h.startsWith("C") && h.match(/^C\d+$/)) return "C"
    if (h.startsWith("X") && h.match(/^X\d+$/)) return "X"
  }
  return "IN"
}

export type NetGroup = {
  ports: SourcePort[]
  net?: SourceNet
}

// Group ports by subcircuit_connectivity_map_key (CLAUDE.md)
export const groupPortsIntoNets = (
  ports: SourcePort[],
  nets: SourceNet[],
): Map<string, NetGroup> => {
  const byKey = new Map<string, NetGroup>()

  for (const p of ports) {
    const k = p.subcircuit_connectivity_map_key
    if (!byKey.has(k)) byKey.set(k, { ports: [], net: undefined })
    byKey.get(k)!.ports.push(p)
  }

  for (const n of nets) {
    const k = n.subcircuit_connectivity_map_key
    if (!byKey.has(k)) byKey.set(k, { ports: [], net: undefined })
    byKey.get(k)!.net = n
  }

  return byKey // key => { net?, ports[] }
}
