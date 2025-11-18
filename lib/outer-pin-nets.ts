import type { NetGroup } from "./nets"
import { pinKind } from "./nets"
import type { SourcePort } from "./types"

export type OuterPinNet = {
  name: string // "C1", "X18", etc.
  kind: "C" | "X"
  connectivityKey: string
  ports: SourcePort[] // All ports in this net (outer + inner)
  outerPort: SourcePort // The outer C or X pin
}

/**
 * Extract outer pin nets (C1-C18, X1-X18) from the circuit data.
 * Each outer pin defines a net that includes inner routing pins.
 */
export const getOuterPinNets = (
  netGroups: Map<string, NetGroup>,
): Map<string, OuterPinNet> => {
  const outerPinNets = new Map<string, OuterPinNet>()

  for (const [connectivityKey, netGroup] of netGroups.entries()) {
    // Find the outer pin (C or X) in this net
    const outerPort = netGroup.ports.find((p) => {
      const kind = pinKind(p)
      return kind === "C" || kind === "X"
    })

    if (!outerPort) continue

    const kind = pinKind(outerPort)
    if (kind !== "C" && kind !== "X") continue

    // Get the pin name (C1, X18, etc.)
    const pinName = outerPort.port_hints.find(
      (h) => h.startsWith("C") || h.startsWith("X"),
    )
    if (!pinName) continue

    outerPinNets.set(pinName, {
      name: pinName,
      kind,
      connectivityKey,
      ports: netGroup.ports,
      outerPort,
    })
  }

  return outerPinNets
}

/**
 * User connection joining multiple outer pin nets together
 */
export type UserNetConnection = {
  id: string
  outerPinNames: string[] // ["C1", "C3", "C5"]
  color: string
}
