import { describe, expect, test } from "bun:test"
import { loadCircuit } from "../lib/load-circuit"
import { groupPortsIntoNets, pinKind } from "../lib/nets"
import { getOuterPinNets } from "../lib/outer-pin-nets"

describe("Trace connection logic", () => {
  const circuitData = loadCircuit()
  const netGroups = groupPortsIntoNets(circuitData.ports, circuitData.nets)
  const outerPinNets = getOuterPinNets(netGroups)

  test("Pin 25 and Pin 26 should be in nets that share a common inner pin (one hop)", () => {
    // Find the ports for pin 25 and 26
    const port25 = circuitData.ports.find((p) => p.pin_number === 25)
    const port26 = circuitData.ports.find((p) => p.pin_number === 26)

    expect(port25).toBeDefined()
    expect(port26).toBeDefined()

    console.log("Port 25:", port25!.name, port25!.port_hints)
    console.log("Port 26:", port26!.name, port26!.port_hints)

    // Get their outer pin nets
    const net25Key = port25!.subcircuit_connectivity_map_key
    const net26Key = port26!.subcircuit_connectivity_map_key

    const netGroup25 = netGroups.get(net25Key)
    const netGroup26 = netGroups.get(net26Key)

    expect(netGroup25).toBeDefined()
    expect(netGroup26).toBeDefined()

    console.log("Net 25 has", netGroup25!.ports.length, "ports")
    console.log("Net 26 has", netGroup26!.ports.length, "ports")

    // Get all pads for each net - use port_hints to match
    const pads25 = circuitData.pads.filter((pad) =>
      netGroup25!.ports.some((port) =>
        port.port_hints.some((hint) => pad.port_hints.includes(hint)),
      ),
    )
    const pads26 = circuitData.pads.filter((pad) =>
      netGroup26!.ports.some((port) =>
        port.port_hints.some((hint) => pad.port_hints.includes(hint)),
      ),
    )

    console.log(
      "Net 25 pads:",
      pads25.map((p) => p.port_hints.join(",")),
    )
    console.log(
      "Net 26 pads:",
      pads26.map((p) => p.port_hints.join(",")),
    )

    // Find adjacent pads between the two nets (within 1.5mm)
    const adjacentPairs: Array<{ pad1: any; pad2: any }> = []
    for (const pad1 of pads25) {
      for (const pad2 of pads26) {
        const dx = Math.abs(pad1.x - pad2.x)
        const dy = Math.abs(pad1.y - pad2.y)
        if (dx <= 1.5 && dy <= 1.5 && (dx > 0.01 || dy > 0.01)) {
          adjacentPairs.push({ pad1, pad2 })
        }
      }
    }

    console.log(
      "Adjacent pairs:",
      adjacentPairs.map(
        (p) => `${p.pad1.port_hints[0]} <-> ${p.pad2.port_hints[0]}`,
      ),
    )

    expect(adjacentPairs.length).toBeGreaterThan(0)
  })

  test("C3 and C12 should have a one-hop connection", () => {
    const c3Net = outerPinNets.get("C3")
    const c12Net = outerPinNets.get("C12")

    expect(c3Net).toBeDefined()
    expect(c12Net).toBeDefined()

    console.log("C3 net has", c3Net!.ports.length, "ports")
    console.log("C12 net has", c12Net!.ports.length, "ports")

    // Get all pads for each net - use port_hints to match
    const padsC3 = circuitData.pads.filter((pad) =>
      c3Net!.ports.some((port) =>
        port.port_hints.some((hint) => pad.port_hints.includes(hint)),
      ),
    )
    const padsC12 = circuitData.pads.filter((pad) =>
      c12Net!.ports.some((port) =>
        port.port_hints.some((hint) => pad.port_hints.includes(hint)),
      ),
    )

    console.log(
      "C3 net pads:",
      padsC3.map((p) => p.port_hints.join(",")),
    )
    console.log(
      "C12 net pads:",
      padsC12.map((p) => p.port_hints.join(",")),
    )

    // Find adjacent pads between the two nets
    const adjacentPairs: Array<{ pad1: any; pad2: any }> = []
    for (const pad1 of padsC3) {
      for (const pad2 of padsC12) {
        const dx = Math.abs(pad1.x - pad2.x)
        const dy = Math.abs(pad1.y - pad2.y)
        if (dx <= 1.5 && dy <= 1.5 && (dx > 0.01 || dy > 0.01)) {
          adjacentPairs.push({ pad1, pad2 })
        }
      }
    }

    console.log(
      "C3-C12 adjacent pairs:",
      adjacentPairs.map(
        (p) => `${p.pad1.port_hints[0]} <-> ${p.pad2.port_hints[0]}`,
      ),
    )

    expect(adjacentPairs.length).toBeGreaterThan(0)
  })
})
