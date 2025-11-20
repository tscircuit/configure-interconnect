import { ConnectivityMap } from "connectivity-map"
import type { Normalized } from "./load-circuit"
import type { OuterPinNet, UserNetConnection } from "./outer-pin-nets"
import type { CircuitJson } from "./types"

export type TestFixtureOptions = {
  userConnections: UserNetConnection[]
  outerPinNets: Map<string, OuterPinNet>
  circuitData: Normalized
}

/**
 * Generate a test fixture circuit JSON that includes:
 * - 0.5mm x 0.5mm pads at the interconnect locations
 * - Traces connecting the pads according to user connections
 * - Test pads extended out to a 30mm x 30mm box
 * - Silkscreen text showing net names
 */
export function generateTestFixture(options: TestFixtureOptions): CircuitJson {
  const { userConnections, outerPinNets, circuitData } = options
  const circuitJson: CircuitJson = []

  // Create component for the test fixture
  const testFixtureComponentId = "test_fixture_component"
  circuitJson.push({
    type: "source_component",
    source_component_id: testFixtureComponentId,
    name: "test_fixture",
    ftype: "simple_chip",
  })

  // Map to track which outer pins belong to which net
  const outerPinToNet = new Map<string, UserNetConnection>()
  for (const conn of userConnections) {
    for (const pinName of conn.outerPinNames) {
      outerPinToNet.set(pinName, conn)
    }
  }

  // Build connectivity map from original circuit and user connections
  // Start with the original circuit's connectivity
  const originalNetMap: Record<string, string[]> = {}
  for (const port of circuitData.ports) {
    const netKey = port.subcircuit_connectivity_map_key
    if (!originalNetMap[netKey]) {
      originalNetMap[netKey] = []
    }
    // Use port_hints as unique identifiers for pads/pins
    for (const hint of port.port_hints) {
      originalNetMap[netKey].push(hint)
    }
  }

  const connectivityMap = new ConnectivityMap(originalNetMap)

  // Add user connections to merge nets
  for (const conn of userConnections) {
    if (conn.outerPinNames.length < 2) continue

    // Get all port hints for pins in this connection
    const allHints: string[] = []
    for (const pinName of conn.outerPinNames) {
      const outerPin = outerPinNets.get(pinName)
      if (outerPin) {
        // Add hints from the outer port and all inner ports in its net
        for (const port of [outerPin.outerPort, ...outerPin.ports]) {
          allHints.push(...port.port_hints)
        }
      }
    }

    // Connect all these hints together
    if (allHints.length >= 2) {
      connectivityMap.addConnections([allHints])
    }
  }

  // Get ALL outer pins (both connected and unconnected)
  const allOuterPins = Array.from(outerPinNets.entries()).map(
    ([pinName, outerPin]) => ({
      pinName,
      outerPin,
      connection: outerPinToNet.get(pinName),
    }),
  )

  // Create pads for each connected outer pin at their original positions
  const padSize = 0.5 // mm
  const testPadSize = 4.0 // mm (4mm x 4mm test pads)
  const testPadPitch = 5.0 // mm (5mm pitch between test pads)

  // Group pins by edge (top, right, bottom, left)
  const pinsByEdge = {
    top: [] as Array<{ pinName: string; outerPin: OuterPinNet; x: number }>,
    right: [] as Array<{ pinName: string; outerPin: OuterPinNet; y: number }>,
    bottom: [] as Array<{ pinName: string; outerPin: OuterPinNet; x: number }>,
    left: [] as Array<{ pinName: string; outerPin: OuterPinNet; y: number }>,
  }

  for (const { pinName, outerPin } of allOuterPins) {
    // Find the original pad position
    const originalPad = circuitData.pads.find((pad) =>
      outerPin.outerPort.port_hints.some((hint) =>
        pad.port_hints.includes(hint),
      ),
    )

    if (!originalPad) continue

    // Determine which edge the pin is on
    const absX = Math.abs(originalPad.x)
    const absY = Math.abs(originalPad.y)

    if (absX > absY) {
      // Pin is on left or right edge
      if (originalPad.x > 0) {
        pinsByEdge.right.push({ pinName, outerPin, y: originalPad.y })
      } else {
        pinsByEdge.left.push({ pinName, outerPin, y: originalPad.y })
      }
    } else {
      // Pin is on top or bottom edge
      if (originalPad.y > 0) {
        pinsByEdge.top.push({ pinName, outerPin, x: originalPad.x })
      } else {
        pinsByEdge.bottom.push({ pinName, outerPin, x: originalPad.x })
      }
    }
  }

  // Sort pins on each edge
  pinsByEdge.top.sort((a, b) => a.x - b.x)
  pinsByEdge.bottom.sort((a, b) => a.x - b.x)
  pinsByEdge.left.sort((a, b) => b.y - a.y) // top to bottom
  pinsByEdge.right.sort((a, b) => b.y - a.y) // top to bottom

  // Calculate fixture size based on the maximum number of pads on any edge
  const maxPadsPerEdge = Math.max(
    pinsByEdge.top.length,
    pinsByEdge.bottom.length,
    pinsByEdge.left.length,
    pinsByEdge.right.length,
  )
  const minFixtureSize = (maxPadsPerEdge - 1) * testPadPitch + 10 // Add 10mm margin
  const fixtureSize = Math.max(30, minFixtureSize) // At least 30mm

  // Calculate positions for test pads around the perimeter with 3mm pitch
  const testPadPositions = new Map<string, { x: number; y: number }>()

  // Top edge - center the pads
  const topStartX = (-(pinsByEdge.top.length - 1) * testPadPitch) / 2
  pinsByEdge.top.forEach((pin, idx) => {
    testPadPositions.set(pin.pinName, {
      x: topStartX + idx * testPadPitch,
      y: fixtureSize / 2,
    })
  })

  // Bottom edge - center the pads
  const bottomStartX = (-(pinsByEdge.bottom.length - 1) * testPadPitch) / 2
  pinsByEdge.bottom.forEach((pin, idx) => {
    testPadPositions.set(pin.pinName, {
      x: bottomStartX + idx * testPadPitch,
      y: -fixtureSize / 2,
    })
  })

  // Left edge - center the pads
  const leftStartY = ((pinsByEdge.left.length - 1) * testPadPitch) / 2
  pinsByEdge.left.forEach((pin, idx) => {
    testPadPositions.set(pin.pinName, {
      x: -fixtureSize / 2,
      y: leftStartY - idx * testPadPitch,
    })
  })

  // Right edge - center the pads
  const rightStartY = ((pinsByEdge.right.length - 1) * testPadPitch) / 2
  pinsByEdge.right.forEach((pin, idx) => {
    testPadPositions.set(pin.pinName, {
      x: fixtureSize / 2,
      y: rightStartY - idx * testPadPitch,
    })
  })

  // Create source ports for ALL pins (connected and unconnected)
  let portCounter = 0
  const pinToSourcePort = new Map<string, string>()
  const subcircuitId = "test_fixture_subcircuit"

  for (const { pinName, connection } of allOuterPins) {
    const sourcePortId = `test_fixture_port_${portCounter++}`
    pinToSourcePort.set(pinName, sourcePortId)

    // ALWAYS use connectivity map to determine the net this pin belongs to
    const connectivityKey = connectivityMap.getNetConnectedToId(pinName)
    if (!connectivityKey) {
      throw new Error(`No connectivity key found for pin ${pinName}`)
    }

    circuitJson.push({
      type: "source_port",
      source_port_id: sourcePortId,
      name: connection ? `${connection.name}_${pinName}` : pinName,
      source_component_id: testFixtureComponentId,
      subcircuit_id: subcircuitId,
      pin_number: portCounter,
      port_hints: [pinName],
      subcircuit_connectivity_map_key: connectivityKey,
    })
  }

  // Create source nets for ALL nets in the connectivity map
  const connectivityKeyToNetId = new Map<string, string>()
  const userConnectionNetIdMap = new Map<string, string>()
  const sourceNetObjects: Array<{
    netId: string,
    name: string,
    connectivityKey: string
  }> = []

  // First, create source nets for user connections
  for (const conn of userConnections) {
    if (conn.outerPinNames.length === 0) continue

    const netId = `test_fixture_net_${conn.id}`
    userConnectionNetIdMap.set(conn.id, netId)

    // Get connectivity key from the first pin in the connection
    const firstPinName = conn.outerPinNames[0]
    if (!firstPinName) {
      throw new Error(`Connection ${conn.id} has no outer pin names`)
    }
    const connectivityKey = connectivityMap.getNetConnectedToId(firstPinName)
    if (!connectivityKey) {
      throw new Error(
        `No connectivity key found for pin ${firstPinName} in connection ${conn.id}`
      )
    }

    connectivityKeyToNetId.set(connectivityKey, netId)
    sourceNetObjects.push({ netId, name: conn.name, connectivityKey })
  }

  // Create source nets for all other nets in the connectivity map
  let autoNetCounter = 0
  for (const { pinName } of allOuterPins) {
    const connectivityKey = connectivityMap.getNetConnectedToId(pinName)
    if (!connectivityKey) continue

    // Skip if we already created a net for this connectivity key
    if (connectivityKeyToNetId.has(connectivityKey)) continue

    const netId = `test_fixture_auto_net_${autoNetCounter++}`
    connectivityKeyToNetId.set(connectivityKey, netId)
    sourceNetObjects.push({ netId, name: `net_${pinName}`, connectivityKey })
  }

  // Create traces connecting ports in the same net
  const traceIdCounter = { value: 0 }
  const connectivityKeyToSourceTraceId = new Map<string, string>()

  for (const conn of userConnections) {
    if (conn.outerPinNames.length === 0) continue

    const portIds = conn.outerPinNames
      .map((pinName) => pinToSourcePort.get(pinName))
      .filter((id): id is string => id !== undefined)

    if (portIds.length < 2) continue

    // Get connectivity key from the first pin in the connection
    const firstPinName = conn.outerPinNames[0]
    if (!firstPinName) {
      throw new Error(`Connection ${conn.id} has no outer pin names`)
    }
    const connectivityKey = connectivityMap.getNetConnectedToId(firstPinName)
    if (!connectivityKey) {
      throw new Error(
        `No connectivity key found for pin ${firstPinName} in connection ${conn.id}`
      )
    }

    const netId = connectivityKeyToNetId.get(connectivityKey)
    if (!netId) {
      throw new Error(`No net ID found for connectivity key ${connectivityKey}`)
    }

    const sourceTraceId = `test_fixture_trace_${traceIdCounter.value++}`
    connectivityKeyToSourceTraceId.set(connectivityKey, sourceTraceId)

    circuitJson.push({
      type: "source_trace",
      source_trace_id: sourceTraceId,
      connected_source_port_ids: portIds,
      connected_source_net_ids: [netId],
      subcircuit_connectivity_map_key: connectivityKey,
    })
  }

  // Create PCB component
  const pcbComponentId = "test_fixture_pcb_component"
  circuitJson.push({
    type: "pcb_component",
    pcb_component_id: pcbComponentId,
    source_component_id: testFixtureComponentId,
    center: { x: 0, y: 0 },
    layer: "top",
    rotation: 0,
    width: fixtureSize,
    height: fixtureSize,
  })

  // Create PCB board (65mm x 65mm)
  circuitJson.push({
    type: "pcb_board",
    pcb_board_id: "test_fixture_board",
    center: { x: 0, y: 0 },
    width: 65,
    height: 65,
  })

  // Add pin1 indicator (triangle) at C1 position (-4.5, 4.5)
  // Arrow pointing right towards pin1, positioned to the left of the pad
  circuitJson.push({
    type: "pcb_silkscreen_path",
    pcb_silkscreen_path_id: "test_fixture_pin1_indicator",
    pcb_component_id: pcbComponentId,
    layer: "top",
    route: [
      { x: -6.0, y: 4.5 }, // arrow point (pointing right)
      { x: -6.8, y: 5.0 }, // top of arrow tail
      { x: -6.8, y: 4.0 }, // bottom of arrow tail
      { x: -6.0, y: 4.5 }, // back to point (close the triangle)
    ],
    stroke_width: 0.1,
  })

  // Create pads for ALL pads in the original circuit (outer pins, inner pins, everything)
  let padCounter = 0
  const padToPort = new Map<string, string>()
  const padIdToPcbPort = new Map<string, string>()
  const allSourcePortIds: string[] = [] // Collect all source port IDs created

  // First, create pads for ALL original pads from the circuit data
  for (const originalPad of circuitData.pads) {
    const pcbPortId = `test_fixture_pcb_port_all_${padCounter}`
    const chipPadId = `test_fixture_chip_pad_all_${padCounter}`

    // Find the corresponding port from the original circuit
    const port = circuitData.ports.find((p) =>
      p.port_hints.some((hint) => originalPad.port_hints.includes(hint)),
    )

    if (!port) {
      padCounter++
      continue
    }

    // Determine source port ID based on connections
    let sourcePortId: string | undefined

    // Check if this is an outer pin with a connection
    for (const [pinName, outerPin] of outerPinNets.entries()) {
      if (
        outerPin.outerPort.port_hints.some((hint) =>
          originalPad.port_hints.includes(hint),
        )
      ) {
        sourcePortId = pinToSourcePort.get(pinName)
        break
      }
    }

    // If no source port exists (inner pads), create one with proper connectivity
    if (!sourcePortId) {
      sourcePortId = `test_fixture_inner_port_${padCounter}`
      const padHint = originalPad.port_hints[0]
      if (padHint) {
        const connectivityKey = connectivityMap.getNetConnectedToId(padHint)
        if (connectivityKey) {
          circuitJson.push({
            type: "source_port",
            source_port_id: sourcePortId,
            name: padHint,
            source_component_id: testFixtureComponentId,
            subcircuit_id: subcircuitId,
            pin_number: padCounter + 1000, // Offset to avoid conflicts with outer pins
            port_hints: originalPad.port_hints,
            subcircuit_connectivity_map_key: connectivityKey,
          })
          allSourcePortIds.push(sourcePortId) // Track this port
        }
      }
    }

    circuitJson.push({
      type: "pcb_port",
      pcb_port_id: pcbPortId,
      source_port_id: sourcePortId || `unconnected_source_port_${padCounter}`,
      pcb_component_id: pcbComponentId,
      x: originalPad.x,
      y: originalPad.y,
      layers: ["top"],
    })

    circuitJson.push({
      type: "pcb_smtpad",
      pcb_smtpad_id: chipPadId,
      pcb_port_id: pcbPortId,
      pcb_component_id: pcbComponentId,
      shape: originalPad.shape,
      x: originalPad.x,
      y: originalPad.y,
      width: originalPad.width,
      height: originalPad.height,
      layer: "top",
      port_hints: originalPad.port_hints,
    })

    padIdToPcbPort.set(originalPad.pcb_smtpad_id, pcbPortId)
    padCounter++
  }

  // Now that all source_ports are created (outer + inner), collect them by connectivity key
  // so we can update source_traces with inner pad ports
  const connectivityKeyToPortIds = new Map<string, string[]>()

  // Add outer pin ports
  for (const [pinName, sourcePortId] of pinToSourcePort.entries()) {
    const connectivityKey = connectivityMap.getNetConnectedToId(pinName)
    if (connectivityKey) {
      if (!connectivityKeyToPortIds.has(connectivityKey)) {
        connectivityKeyToPortIds.set(connectivityKey, [])
      }
      connectivityKeyToPortIds.get(connectivityKey)!.push(sourcePortId)
    }
  }

  // Add inner pad ports (already tracked in allSourcePortIds)
  for (const sourcePortId of allSourcePortIds) {
    // Find the source_port in circuitJson to get its connectivity key
    const sourcePort = circuitJson.find(
      (obj) => obj.type === "source_port" && obj.source_port_id === sourcePortId
    ) as any
    if (sourcePort?.subcircuit_connectivity_map_key) {
      const connectivityKey = sourcePort.subcircuit_connectivity_map_key
      if (!connectivityKeyToPortIds.has(connectivityKey)) {
        connectivityKeyToPortIds.set(connectivityKey, [])
      }
      connectivityKeyToPortIds.get(connectivityKey)!.push(sourcePortId)
    }
  }

  // Update source_traces to include inner pad ports
  for (const obj of circuitJson) {
    if (obj.type === "source_trace" && obj.subcircuit_connectivity_map_key) {
      const allPortsForNet = connectivityKeyToPortIds.get(obj.subcircuit_connectivity_map_key) || []
      obj.connected_source_port_ids = allPortsForNet
    }
  }

  // Emit source_net objects
  for (const { netId, name, connectivityKey } of sourceNetObjects) {
    circuitJson.push({
      type: "source_net",
      source_net_id: netId,
      name: name,
      subcircuit_connectivity_map_key: connectivityKey,
    })
  }

  // Now create test pads for outer pins only
  let testPadCounter = 0
  for (const { pinName, outerPin, connection } of allOuterPins) {
    const originalPad = circuitData.pads.find((pad) =>
      outerPin.outerPort.port_hints.some((hint) =>
        pad.port_hints.includes(hint),
      ),
    )

    if (!originalPad) continue

    const sourcePortId = pinToSourcePort.get(pinName)!
    const pcbPortId = `test_fixture_pcb_port_outer_${testPadCounter}`

    // Create interconnect chip pad (0.5mm x 0.5mm) - this duplicates the outer pin
    const chipPadId = `test_fixture_chip_pad_outer_${testPadCounter}`
    padToPort.set(chipPadId, pcbPortId)

    circuitJson.push({
      type: "pcb_port",
      pcb_port_id: pcbPortId,
      source_port_id: sourcePortId,
      pcb_component_id: pcbComponentId,
      x: originalPad.x,
      y: originalPad.y,
      layers: ["top"],
    })

    circuitJson.push({
      type: "pcb_smtpad",
      pcb_smtpad_id: chipPadId,
      pcb_port_id: pcbPortId,
      pcb_component_id: pcbComponentId,
      shape: "rect",
      x: originalPad.x,
      y: originalPad.y,
      width: padSize,
      height: padSize,
      layer: "top",
      port_hints: [pinName],
    })

    // Create test pad at extended position
    const testPos = testPadPositions.get(pinName)!
    const testPadId = `test_fixture_test_pad_${testPadCounter}`
    const testPortId = `test_fixture_test_pcb_port_${testPadCounter}`

    circuitJson.push({
      type: "pcb_port",
      pcb_port_id: testPortId,
      source_port_id: sourcePortId,
      pcb_component_id: pcbComponentId,
      x: testPos.x,
      y: testPos.y,
      layers: ["top"],
    })

    circuitJson.push({
      type: "pcb_smtpad",
      pcb_smtpad_id: testPadId,
      pcb_port_id: testPortId,
      pcb_component_id: pcbComponentId,
      shape: "rect",
      x: testPos.x,
      y: testPos.y,
      width: testPadSize,
      height: testPadSize,
      layer: "top",
      port_hints: [`TEST_${pinName}`],
    })

    // Get connectivity key for the trace
    const padHint = originalPad.port_hints[0]
    if (!padHint) {
      throw new Error(
        `No port hints found for pad at (${originalPad.x}, ${originalPad.y})`
      )
    }
    const traceConnectivityKey = connectivityMap.getNetConnectedToId(padHint)
    if (!traceConnectivityKey) {
      throw new Error(
        `No connectivity key found for pad hint ${padHint} on pin ${pinName}`
      )
    }

    // Create source_trace for test pad connection
    const sourceTraceId = `test_fixture_source_trace_testpad_${testPadCounter}`
    const netId = connectivityKeyToNetId.get(traceConnectivityKey)
    if (!netId) {
      throw new Error(
        `No net ID found for connectivity key ${traceConnectivityKey} on pin ${pinName}`
      )
    }

    circuitJson.push({
      type: "source_trace",
      source_trace_id: sourceTraceId,
      connected_source_port_ids: [sourcePortId],
      connected_source_net_ids: [netId],
      subcircuit_connectivity_map_key: traceConnectivityKey,
    })

    // Create PCB trace connecting chip pad to test pad
    const traceId = `test_fixture_pcb_trace_${testPadCounter}`

    circuitJson.push({
      type: "pcb_trace",
      pcb_trace_id: traceId,
      source_trace_id: sourceTraceId,
      route: [
        { x: originalPad.x, y: originalPad.y, width: 0.15, layer: "top" },
        { x: testPos.x, y: testPos.y, width: 0.15, layer: "top" },
      ],
      subcircuit_connectivity_map_key: traceConnectivityKey,
    })

    // Create silkscreen text for net name outside the test pad
    // Position text 0.5mm away from edge of test pad (testPadSize/2 + 0.5)
    const textOffset = testPadSize / 2 + 0.5 // mm offset from pad edge
    let textX = testPos.x
    let textY = testPos.y
    let anchorAlignment:
      | "center_left"
      | "center_right"
      | "top_center"
      | "bottom_center" = "center_left"

    // Position text outside the box and set appropriate anchor alignment
    if (Math.abs(testPos.x) > Math.abs(testPos.y)) {
      // Text is on left or right edge
      if (testPos.x > 0) {
        // Right edge - text goes to the right
        textX = testPos.x + textOffset
        anchorAlignment = "center_left"
      } else {
        // Left edge - text goes to the left
        textX = testPos.x - textOffset
        anchorAlignment = "center_right"
      }
    } else {
      // Text is on top or bottom edge
      if (testPos.y > 0) {
        // Top edge - text goes above
        textY = testPos.y + textOffset
        anchorAlignment = "bottom_center"
      } else {
        // Bottom edge - text goes below
        textY = testPos.y - textOffset
        anchorAlignment = "top_center"
      }
    }

    // Always show pin name as the main text
    circuitJson.push({
      type: "pcb_silkscreen_text",
      pcb_silkscreen_text_id: `test_fixture_text_${testPadCounter}`,
      text: pinName,
      pcb_component_id: pcbComponentId,
      anchor_position: { x: textX, y: textY },
      anchor_alignment: anchorAlignment,
      layer: "top",
      font_size: 0.8,
    })

    // If there's a net name, show it underneath the pin name
    if (connection) {
      const netTextX = textX
      let netTextY = textY

      // Offset the net name text based on anchor alignment
      if (
        anchorAlignment === "center_left" ||
        anchorAlignment === "center_right"
      ) {
        // For left/right edges, offset vertically below the pin name
        netTextY = textY - 1.0 // 1mm below pin name
      } else {
        // For top/bottom edges, keep same Y but offset X slightly
        if (anchorAlignment === "bottom_center") {
          netTextY = textY + 1.0 // 1mm above pin name
        } else {
          netTextY = textY - 1.0 // 1mm below pin name
        }
      }

      circuitJson.push({
        type: "pcb_silkscreen_text",
        pcb_silkscreen_text_id: `test_fixture_text_net_${testPadCounter}`,
        text: connection.name,
        pcb_component_id: pcbComponentId,
        anchor_position: { x: netTextX, y: netTextY },
        anchor_alignment: anchorAlignment,
        layer: "top",
        font_size: 0.6, // Slightly smaller font for net name
      })
    }

    testPadCounter++
  }

  // Add PCB traces to connect nets together (routing between connected pads)
  for (const conn of userConnections) {
    if (conn.outerPinNames.length < 2) continue

    // Get all outer pins in this connection
    const connectedOuterPins = conn.outerPinNames
      .map((pinName) => outerPinNets.get(pinName))
      .filter((pin): pin is OuterPinNet => pin !== undefined)

    // For C pins, create traces between adjacent nets
    const cPins = connectedOuterPins.filter((pin) => pin.kind === "C")

    if (cPins.length >= 2) {
      // Find one-hop connections between consecutive C nets
      for (let i = 0; i < cPins.length - 1; i++) {
        const net1 = cPins[i]!
        const net2 = cPins[i + 1]!

        // Get all pads for each net
        const pads1 = circuitData.pads.filter((pad) =>
          net1.ports.some((port) =>
            port.port_hints.some((hint) => pad.port_hints.includes(hint)),
          ),
        )
        const pads2 = circuitData.pads.filter((pad) =>
          net2.ports.some((port) =>
            port.port_hints.some((hint) => pad.port_hints.includes(hint)),
          ),
        )

        // Find adjacent pads between the two nets (within 1.5mm)
        // Only draw one trace per net pair
        let traceCreated = false
        for (const pad1 of pads1) {
          if (traceCreated) break
          for (const pad2 of pads2) {
            const dx = Math.abs(pad1.x - pad2.x)
            const dy = Math.abs(pad1.y - pad2.y)
            if (dx <= 1.5 && dy <= 1.5 && (dx > 0.01 || dy > 0.01)) {
              // Found a connection - query connectivity map for the bridge key
              const pad1Hint = pad1.port_hints[0]
              if (!pad1Hint) {
                throw new Error(
                  `No port hints found for pad at (${pad1.x}, ${pad1.y})`
                )
              }
              const bridgeConnectivityKey =
                connectivityMap.getNetConnectedToId(pad1Hint)
              if (!bridgeConnectivityKey) {
                throw new Error(
                  `No connectivity key found for bridge pad hint ${pad1Hint}`
                )
              }

              // For inner bridge connections, reference the source_trace that connects the outer pins
              // Inner pads don't have their own source_ports, but the pcb_trace should reference
              // the source_trace of the connection they're routing
              const sourceTraceIdForBridge = connectivityKeyToSourceTraceId.get(bridgeConnectivityKey)

              // Create PCB trace with bridge connectivity key
              // Reference the source_trace for this connection if it exists
              circuitJson.push({
                type: "pcb_trace",
                pcb_trace_id: `test_fixture_net_trace_${conn.id}_${i}`,
                ...(sourceTraceIdForBridge && { source_trace_id: sourceTraceIdForBridge }),
                route: [
                  { x: pad1.x, y: pad1.y, width: 0.15, layer: "top" },
                  { x: pad2.x, y: pad2.y, width: 0.15, layer: "top" },
                ],
                subcircuit_connectivity_map_key: bridgeConnectivityKey,
              })
              traceCreated = true
              break
            }
          }
        }
      }
    }
  }

  return circuitJson
}

/**
 * Generate just the footprint circuit JSON that includes:
 * - 0.5mm x 0.5mm pads at the interconnect locations
 * - Traces connecting the pads according to user connections
 * - No test pads, no board, no silkscreen text
 */
export function generateFootprint(options: TestFixtureOptions): CircuitJson {
  const { userConnections, outerPinNets, circuitData } = options
  const circuitJson: CircuitJson = []

  // Create component for the footprint
  const pcbComponentId = "footprint_pcb_component"
  circuitJson.push({
    type: "source_component",
    source_component_id: "footprint_component",
    name: "footprint",
    ftype: "simple_chip",
  })

  // Map to track which outer pins belong to which net
  const outerPinToNet = new Map<string, UserNetConnection>()
  for (const conn of userConnections) {
    for (const pinName of conn.outerPinNames) {
      outerPinToNet.set(pinName, conn)
    }
  }

  // Build connectivity map from original circuit and user connections
  // Start with the original circuit's connectivity
  const originalNetMap: Record<string, string[]> = {}
  for (const port of circuitData.ports) {
    const netKey = port.subcircuit_connectivity_map_key
    if (!originalNetMap[netKey]) {
      originalNetMap[netKey] = []
    }
    // Use port_hints as unique identifiers for pads/pins
    for (const hint of port.port_hints) {
      originalNetMap[netKey].push(hint)
    }
  }

  const connectivityMap = new ConnectivityMap(originalNetMap)

  // Add user connections to merge nets
  for (const conn of userConnections) {
    if (conn.outerPinNames.length < 2) continue

    // Get all port hints for pins in this connection
    const allHints: string[] = []
    for (const pinName of conn.outerPinNames) {
      const outerPin = outerPinNets.get(pinName)
      if (outerPin) {
        // Add hints from the outer port and all inner ports in its net
        for (const port of [outerPin.outerPort, ...outerPin.ports]) {
          allHints.push(...port.port_hints)
        }
      }
    }

    // Connect all these hints together
    if (allHints.length >= 2) {
      connectivityMap.addConnections([allHints])
    }
  }

  // Create source nets for ALL nets in the connectivity map
  const connectivityKeyToNetId = new Map<string, string>()
  const footprintSourceNetObjects: Array<{
    netId: string,
    name: string,
    connectivityKey: string
  }> = []

  // First, create source nets for user connections
  for (const conn of userConnections) {
    if (conn.outerPinNames.length === 0) continue

    const netId = `footprint_net_${conn.id}`

    // Get connectivity key from the first pin in the connection
    const firstPinName = conn.outerPinNames[0]
    if (!firstPinName) {
      throw new Error(`Connection ${conn.id} has no outer pin names`)
    }
    const connectivityKey = connectivityMap.getNetConnectedToId(firstPinName)
    if (!connectivityKey) {
      throw new Error(
        `No connectivity key found for pin ${firstPinName} in connection ${conn.id}`
      )
    }

    connectivityKeyToNetId.set(connectivityKey, netId)
    footprintSourceNetObjects.push({ netId, name: conn.name, connectivityKey })
  }

  // Create source nets for all other nets in the connectivity map
  let autoNetCounter = 0
  for (const pad of circuitData.pads) {
    const padHint = pad.port_hints[0]
    if (!padHint) continue

    const connectivityKey = connectivityMap.getNetConnectedToId(padHint)
    if (!connectivityKey) continue

    // Skip if we already created a net for this connectivity key
    if (connectivityKeyToNetId.has(connectivityKey)) continue

    const netId = `footprint_auto_net_${autoNetCounter++}`
    connectivityKeyToNetId.set(connectivityKey, netId)
    footprintSourceNetObjects.push({ netId, name: `net_${padHint}`, connectivityKey })
  }

  // Create source_traces for user connections (for inner bridge traces to reference)
  const connectivityKeyToSourceTraceId = new Map<string, string>()
  let footprintTraceCounter = 0

  for (const conn of userConnections) {
    if (conn.outerPinNames.length === 0) continue

    // Get connectivity key from the first pin in the connection
    const firstPinName = conn.outerPinNames[0]
    if (!firstPinName) {
      throw new Error(`Connection ${conn.id} has no outer pin names`)
    }
    const connectivityKey = connectivityMap.getNetConnectedToId(firstPinName)
    if (!connectivityKey) {
      throw new Error(
        `No connectivity key found for pin ${firstPinName} in connection ${conn.id}`
      )
    }

    const sourceTraceId = `footprint_trace_src_${footprintTraceCounter++}`
    connectivityKeyToSourceTraceId.set(connectivityKey, sourceTraceId)

    const netId = connectivityKeyToNetId.get(connectivityKey)
    if (!netId) {
      throw new Error(`No net ID found for connectivity key ${connectivityKey}`)
    }

    // Note: For footprint, we don't create source_ports, so we can't list connected_source_port_ids
    // The source_trace just represents the logical connection
    circuitJson.push({
      type: "source_trace",
      source_trace_id: sourceTraceId,
      connected_source_port_ids: [],
      connected_source_net_ids: [netId],
      subcircuit_connectivity_map_key: connectivityKey,
    })
  }

  // Create pads for each outer pin at their original positions
  const padSize = 0.5 // mm
  const innerPinPadSize = 0.5 // mm for inner pins

  // Create PCB component (no board)
  const fixtureSize = 55 // mm (size of the component, not a board)
  circuitJson.push({
    type: "pcb_component",
    pcb_component_id: pcbComponentId,
    source_component_id: "footprint_component",
    center: { x: 0, y: 0 },
    layer: "top",
    rotation: 0,
    width: fixtureSize,
    height: fixtureSize,
  })

  // Add pin1 indicator (triangle) at C1 position (-4.5, 4.5)
  // Arrow pointing right towards pin1, positioned to the left of the pad
  circuitJson.push({
    type: "pcb_silkscreen_path",
    pcb_silkscreen_path_id: "footprint_pin1_indicator",
    pcb_component_id: pcbComponentId,
    layer: "top",
    route: [
      { x: -6.0, y: 4.5 }, // arrow point (pointing right)
      { x: -6.8, y: 5.0 }, // top of arrow tail
      { x: -6.8, y: 4.0 }, // bottom of arrow tail
      { x: -6.0, y: 4.5 }, // back to point (close the triangle)
    ],
    stroke_width: 0.1,
  })

  // Create pads for ALL pads in the original circuit (outer pins, inner pins, everything)
  let padCounter = 0
  const padToPort = new Map<string, string>()

  // Helper to add a pad
  const addPad = (
    padId: string,
    portId: string,
    x: number,
    y: number,
    width: number,
    height: number,
    portHints: string[],
  ) => {
    circuitJson.push({
      type: "pcb_port",
      pcb_port_id: `footprint_pcb_port_${padCounter}`,
      source_port_id: portId,
      pcb_component_id: pcbComponentId,
      x,
      y,
      layers: ["top"],
    })

    circuitJson.push({
      type: "pcb_smtpad",
      pcb_smtpad_id: padId,
      pcb_port_id: `footprint_pcb_port_${padCounter}`,
      pcb_component_id: pcbComponentId,
      shape: "rect",
      x,
      y,
      width,
      height,
      layer: "top",
      port_hints: portHints,
    })

    padToPort.set(padId, `footprint_pcb_port_${padCounter}`)
    padCounter++
  }

  // Add pads for ALL pads from the original circuit
  const footprintConnectivityKeyToPortIds = new Map<string, string[]>()
  for (const pad of circuitData.pads) {
    const port = circuitData.ports.find((p) =>
      p.port_hints?.includes(pad.port_hints?.[0] || ""),
    )
    if (!port) continue

    const sourcePortId = port.source_port_id
    addPad(
      `footprint_pad_${padCounter}`,
      sourcePortId,
      pad.x,
      pad.y,
      pad.shape === "circle" ? innerPinPadSize : padSize,
      pad.shape === "circle" ? innerPinPadSize : padSize,
      pad.port_hints || [],
    )

    // Collect source ports by connectivity key
    const connectivityKey = port.subcircuit_connectivity_map_key
    if (!footprintConnectivityKeyToPortIds.has(connectivityKey)) {
      footprintConnectivityKeyToPortIds.set(connectivityKey, [])
    }
    footprintConnectivityKeyToPortIds.get(connectivityKey)!.push(sourcePortId)
  }

  // Update source_traces to include inner pad ports
  for (const obj of circuitJson) {
    if (obj.type === "source_trace" && obj.subcircuit_connectivity_map_key) {
      const allPortsForNet = footprintConnectivityKeyToPortIds.get(obj.subcircuit_connectivity_map_key) || []
      obj.connected_source_port_ids = allPortsForNet
    }
  }

  // Emit source_net objects
  for (const { netId, name, connectivityKey } of footprintSourceNetObjects) {
    circuitJson.push({
      type: "source_net",
      source_net_id: netId,
      name: name,
      subcircuit_connectivity_map_key: connectivityKey,
    })
  }

  // Add PCB traces to connect nets together (routing between connected pads)
  // SAME LOGIC AS TEST FIXTURE
  for (const conn of userConnections) {
    if (conn.outerPinNames.length < 2) continue

    // Get all outer pins in this connection
    const connectedOuterPins = conn.outerPinNames
      .map((pinName) => outerPinNets.get(pinName))
      .filter((pin): pin is OuterPinNet => pin !== undefined)

    // For C pins, create traces between adjacent nets
    const cPins = connectedOuterPins.filter((pin) => pin.kind === "C")

    if (cPins.length >= 2) {
      // Find one-hop connections between consecutive C nets
      for (let i = 0; i < cPins.length - 1; i++) {
        const net1 = cPins[i]!
        const net2 = cPins[i + 1]!

        // Get all pads for each net
        const pads1 = circuitData.pads.filter((pad) =>
          net1.ports.some((port) =>
            port.port_hints.some((hint) => pad.port_hints.includes(hint)),
          ),
        )
        const pads2 = circuitData.pads.filter((pad) =>
          net2.ports.some((port) =>
            port.port_hints.some((hint) => pad.port_hints.includes(hint)),
          ),
        )

        // Find adjacent pads between the two nets (within 1.5mm)
        // Only draw one trace per net pair
        let traceCreated = false
        for (const pad1 of pads1) {
          if (traceCreated) break
          for (const pad2 of pads2) {
            const dx = Math.abs(pad1.x - pad2.x)
            const dy = Math.abs(pad1.y - pad2.y)
            if (dx <= 1.5 && dy <= 1.5 && (dx > 0.01 || dy > 0.01)) {
              // Found a connection - query connectivity map for the bridge key
              const pad1Hint = pad1.port_hints[0]
              if (!pad1Hint) {
                throw new Error(
                  `No port hints found for pad at (${pad1.x}, ${pad1.y})`
                )
              }
              const bridgeConnectivityKey =
                connectivityMap.getNetConnectedToId(pad1Hint)
              if (!bridgeConnectivityKey) {
                throw new Error(
                  `No connectivity key found for bridge pad hint ${pad1Hint}`
                )
              }

              // For inner bridge connections, reference the source_trace that connects the outer pins
              // Inner pads don't have their own source_ports, but the pcb_trace should reference
              // the source_trace of the connection they're routing
              const sourceTraceIdForBridge = connectivityKeyToSourceTraceId.get(bridgeConnectivityKey)

              // Create PCB trace with bridge connectivity key
              // Reference the source_trace for this connection if it exists
              circuitJson.push({
                type: "pcb_trace",
                pcb_trace_id: `footprint_trace_${conn.id}_${i}`,
                ...(sourceTraceIdForBridge && { source_trace_id: sourceTraceIdForBridge }),
                route: [
                  { x: pad1.x, y: pad1.y, width: 0.15, layer: "top" },
                  { x: pad2.x, y: pad2.y, width: 0.15, layer: "top" },
                ],
                subcircuit_connectivity_map_key: bridgeConnectivityKey,
              })
              traceCreated = true
              break
            }
          }
        }
      }
    }
  }

  return circuitJson
}
