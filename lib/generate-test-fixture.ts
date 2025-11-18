import type { CircuitJson } from "./types"
import type { UserNetConnection } from "./outer-pin-nets"
import type { OuterPinNet } from "./outer-pin-nets"
import type { Normalized } from "./load-circuit"

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

  // Get ALL outer pins (both connected and unconnected)
  const allOuterPins = Array.from(outerPinNets.entries()).map(
    ([pinName, outerPin]) => ({
      pinName,
      outerPin,
      connection: outerPinToNet.get(pinName),
    })
  )

  // Create pads for each connected outer pin at their original positions
  const padSize = 0.5 // mm
  const testPadSize = 1.0 // mm
  const testPadPitch = 3.0 // mm (3mm pitch between test pads)

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
        pad.port_hints.includes(hint)
      )
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
    pinsByEdge.right.length
  )
  const minFixtureSize = (maxPadsPerEdge - 1) * testPadPitch + 10 // Add 10mm margin
  const fixtureSize = Math.max(30, minFixtureSize) // At least 30mm

  // Calculate positions for test pads around the perimeter with 3mm pitch
  const testPadPositions = new Map<string, { x: number; y: number }>()

  // Top edge - center the pads
  const topStartX = -(pinsByEdge.top.length - 1) * testPadPitch / 2
  pinsByEdge.top.forEach((pin, idx) => {
    testPadPositions.set(pin.pinName, {
      x: topStartX + idx * testPadPitch,
      y: fixtureSize / 2,
    })
  })

  // Bottom edge - center the pads
  const bottomStartX = -(pinsByEdge.bottom.length - 1) * testPadPitch / 2
  pinsByEdge.bottom.forEach((pin, idx) => {
    testPadPositions.set(pin.pinName, {
      x: bottomStartX + idx * testPadPitch,
      y: -fixtureSize / 2,
    })
  })

  // Left edge - center the pads
  const leftStartY = (pinsByEdge.left.length - 1) * testPadPitch / 2
  pinsByEdge.left.forEach((pin, idx) => {
    testPadPositions.set(pin.pinName, {
      x: -fixtureSize / 2,
      y: leftStartY - idx * testPadPitch,
    })
  })

  // Right edge - center the pads
  const rightStartY = (pinsByEdge.right.length - 1) * testPadPitch / 2
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

    circuitJson.push({
      type: "source_port",
      source_port_id: sourcePortId,
      name: connection ? `${connection.name}_${pinName}` : pinName,
      source_component_id: testFixtureComponentId,
      subcircuit_id: subcircuitId,
      pin_number: portCounter,
      port_hints: [pinName],
      subcircuit_connectivity_map_key: connection
        ? `test_fixture_net_${connection.id}`
        : `test_fixture_unconnected_${pinName}`,
    })
  }

  // Create source nets for each user connection
  const netIdMap = new Map<string, string>()
  for (const conn of userConnections) {
    if (conn.outerPinNames.length === 0) continue

    const netId = `test_fixture_net_${conn.id}`
    netIdMap.set(conn.id, netId)

    circuitJson.push({
      type: "source_net",
      source_net_id: netId,
      name: conn.name,
      subcircuit_connectivity_map_key: `test_fixture_net_${conn.id}`,
    })
  }

  // Create traces connecting ports in the same net
  const traceIdCounter = { value: 0 }
  for (const conn of userConnections) {
    if (conn.outerPinNames.length === 0) continue

    const netId = netIdMap.get(conn.id)!
    const portIds = conn.outerPinNames
      .map(pinName => pinToSourcePort.get(pinName))
      .filter((id): id is string => id !== undefined)

    if (portIds.length < 2) continue

    circuitJson.push({
      type: "source_trace",
      source_trace_id: `test_fixture_trace_${traceIdCounter.value++}`,
      connected_source_port_ids: portIds,
      connected_source_net_ids: [netId],
      subcircuit_connectivity_map_key: `test_fixture_net_${conn.id}`,
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

  // Create PCB board
  circuitJson.push({
    type: "pcb_board",
    pcb_board_id: "test_fixture_board",
    center: { x: 0, y: 0 },
    width: fixtureSize + 2,
    height: fixtureSize + 2,
  })

  // Create pads for interconnect chip and test pads (ALL pins)
  let padCounter = 0
  const padToPort = new Map<string, string>()
  const connectionTraceIds = new Map<string, string>()

  for (const { pinName, outerPin, connection } of allOuterPins) {
    const originalPad = circuitData.pads.find((pad) =>
      outerPin.outerPort.port_hints.some((hint) =>
        pad.port_hints.includes(hint)
      )
    )

    if (!originalPad) continue

    const sourcePortId = pinToSourcePort.get(pinName)!
    const pcbPortId = `test_fixture_pcb_port_${padCounter}`

    // Create interconnect chip pad (0.5mm x 0.5mm)
    const chipPadId = `test_fixture_chip_pad_${padCounter}`
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
    const testPadId = `test_fixture_test_pad_${padCounter}`
    const testPortId = `test_fixture_test_pcb_port_${padCounter}`

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

    // Create PCB trace connecting chip pad to test pad
    const traceId = `test_fixture_pcb_trace_${padCounter}`
    circuitJson.push({
      type: "pcb_trace",
      pcb_trace_id: traceId,
      route: [
        { x: originalPad.x, y: originalPad.y, width: 0.15, layer: "top" },
        { x: testPos.x, y: testPos.y, width: 0.15, layer: "top" },
      ],
    })

    // Create silkscreen text for net name outside the test pad
    const textOffset = 2 // mm offset from pad
    let textX = testPos.x
    let textY = testPos.y

    // Position text outside the box
    if (Math.abs(testPos.x) > Math.abs(testPos.y)) {
      textX = testPos.x > 0 ? testPos.x + textOffset : testPos.x - textOffset
    } else {
      textY = testPos.y > 0 ? testPos.y + textOffset : testPos.y - textOffset
    }

    circuitJson.push({
      type: "pcb_silkscreen_text",
      pcb_silkscreen_text_id: `test_fixture_text_${padCounter}`,
      text: connection ? connection.name : pinName,
      pcb_component_id: pcbComponentId,
      center: { x: textX, y: textY },
      layer: "top",
      font_size: 0.8,
    })

    padCounter++
  }

  return circuitJson
}
