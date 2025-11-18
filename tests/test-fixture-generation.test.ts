import { describe, expect, test } from "bun:test"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { colorByIndex } from "../lib/colors"
import { generateTestFixture } from "../lib/generate-test-fixture"
import { loadCircuit } from "../lib/load-circuit"
import { groupPortsIntoNets } from "../lib/nets"
import { getOuterPinNets, type UserNetConnection } from "../lib/outer-pin-nets"

describe("Test fixture generation", () => {
  const circuitData = loadCircuit()
  const netGroups = groupPortsIntoNets(circuitData.ports, circuitData.nets)
  const outerPinNets = getOuterPinNets(netGroups)

  test("Generate test fixture with C1, C3, C5 connected", () => {
    // Create a user connection with pins C1, C3, C5
    const userConnections: UserNetConnection[] = [
      {
        id: "conn_test_1",
        name: "NET1",
        outerPinNames: ["C1", "C3", "C5"],
        color: colorByIndex(0),
      },
    ]

    // Generate test fixture circuit JSON
    const testFixtureCircuit = generateTestFixture({
      userConnections,
      outerPinNets,
      circuitData,
    })

    // Verify the circuit has the expected structure
    expect(testFixtureCircuit).toBeDefined()
    expect(Array.isArray(testFixtureCircuit)).toBe(true)
    expect(testFixtureCircuit.length).toBeGreaterThan(0)

    // Check for source component
    const sourceComponent = testFixtureCircuit.find(
      (el: any) => el.type === "source_component"
    )
    expect(sourceComponent).toBeDefined()

    // Check for source ports (should have 36 for all outer pins)
    const sourcePorts = testFixtureCircuit.filter(
      (el: any) => el.type === "source_port"
    )
    expect(sourcePorts.length).toBe(36)

    // Check for source nets
    const sourceNets = testFixtureCircuit.filter(
      (el: any) => el.type === "source_net"
    )
    expect(sourceNets.length).toBe(1)
    expect((sourceNets[0] as any).name).toBe("NET1")

    // Check for PCB pads (should have 172 - 100 original pads + 36 outer pin duplicates + 36 test pads)
    const pcbPads = testFixtureCircuit.filter(
      (el: any) => el.type === "pcb_smtpad"
    )
    expect(pcbPads.length).toBe(172)

    // Check for PCB traces (should have 38 - 36 connecting chip pads to test pads + 2 connecting C1-C3-C5)
    const pcbTraces = testFixtureCircuit.filter(
      (el: any) => el.type === "pcb_trace"
    )
    expect(pcbTraces.length).toBe(38)

    // Check for silkscreen text (should have 36 for pin names + 3 for net names = 39 total)
    const silkscreenText = testFixtureCircuit.filter(
      (el: any) => el.type === "pcb_silkscreen_text"
    )
    expect(silkscreenText.length).toBe(39) // 36 pin names + 3 net names

    // Verify pin names are shown
    const pinNameText = silkscreenText.filter(
      (text: any) => ["C1", "C3", "C5"].includes(text.text)
    )
    expect(pinNameText.length).toBe(3)

    // Verify connected pins also have NET1 as additional text
    const netNameText = silkscreenText.filter(
      (text: any) => text.text === "NET1"
    )
    expect(netNameText.length).toBe(3) // C1, C3, C5 each have net name below
  })

  test("Generate test fixture with multiple nets", () => {
    // Create multiple user connections
    const userConnections: UserNetConnection[] = [
      {
        id: "conn_test_1",
        name: "NET1",
        outerPinNames: ["C1", "C3"],
        color: colorByIndex(0),
      },
      {
        id: "conn_test_2",
        name: "NET2",
        outerPinNames: ["C5", "C7"],
        color: colorByIndex(1),
      },
    ]

    // Generate test fixture circuit JSON
    const testFixtureCircuit = generateTestFixture({
      userConnections,
      outerPinNets,
      circuitData,
    })

    // Check for source nets (should have 2)
    const sourceNets = testFixtureCircuit.filter(
      (el: any) => el.type === "source_net"
    )
    expect(sourceNets.length).toBe(2)

    // Check for source traces (should have 2, one for each net)
    const sourceTraces = testFixtureCircuit.filter(
      (el: any) => el.type === "source_trace"
    )
    expect(sourceTraces.length).toBe(2)

    // Check for PCB pads (should have 172 - 100 original pads + 36 outer pin duplicates + 36 test pads)
    const pcbPads = testFixtureCircuit.filter(
      (el: any) => el.type === "pcb_smtpad"
    )
    expect(pcbPads.length).toBe(172)
  })

  test("Generate test fixture SVG snapshot for C1-C3-C5 connection", async () => {
    // Create a user connection with pins C1, C3, C5
    const userConnections: UserNetConnection[] = [
      {
        id: "conn_test_1",
        name: "NET1",
        outerPinNames: ["C1", "C3", "C5"],
        color: colorByIndex(0),
      },
    ]

    // Generate test fixture circuit JSON
    const testFixtureCircuit = generateTestFixture({
      userConnections,
      outerPinNets,
      circuitData,
    })

    // Convert to SVG
    const svg = convertCircuitJsonToPcbSvg(testFixtureCircuit as any, {
      width: 800,
      height: 800,
      matchBoardAspectRatio: true,
    })

    // Create SVG snapshot
    await expect(svg).toMatchSvgSnapshot(import.meta.path)
  })

  test("Generate test fixture SVG snapshot with multiple nets", async () => {
    // Create multiple user connections
    const userConnections: UserNetConnection[] = [
      {
        id: "conn_test_1",
        name: "NET1",
        outerPinNames: ["C1", "C3", "C5"],
        color: colorByIndex(0),
      },
      {
        id: "conn_test_2",
        name: "NET2",
        outerPinNames: ["C7", "C9"],
        color: colorByIndex(1),
      },
      {
        id: "conn_test_3",
        name: "NET3",
        outerPinNames: ["C11", "C13", "C15"],
        color: colorByIndex(2),
      },
    ]

    // Generate test fixture circuit JSON
    const testFixtureCircuit = generateTestFixture({
      userConnections,
      outerPinNets,
      circuitData,
    })

    // Convert to SVG
    const svg = convertCircuitJsonToPcbSvg(testFixtureCircuit as any, {
      width: 800,
      height: 800,
      matchBoardAspectRatio: true,
    })

    // Create SVG snapshot
    await expect(svg).toMatchSvgSnapshot(import.meta.path)
  })

  test("Generate test fixture with X pins", async () => {
    // Create a connection with X pins (they should auto-pair)
    const userConnections: UserNetConnection[] = [
      {
        id: "conn_test_x",
        name: "X_NET",
        outerPinNames: ["X1", "X9"], // X1 and X9 are diagonal partners
        color: colorByIndex(0),
      },
    ]

    // Generate test fixture circuit JSON
    const testFixtureCircuit = generateTestFixture({
      userConnections,
      outerPinNets,
      circuitData,
    })

    // Convert to SVG
    const svg = convertCircuitJsonToPcbSvg(testFixtureCircuit as any, {
      width: 800,
      height: 800,
      matchBoardAspectRatio: true,
    })

    // Create SVG snapshot
    await expect(svg).toMatchSvgSnapshot(import.meta.path)
  })

  test("Export test fixture circuit JSON for manual inspection", () => {
    // Create a realistic configuration
    const userConnections: UserNetConnection[] = [
      {
        id: "conn_1",
        name: "VCC",
        outerPinNames: ["C1", "C2"],
        color: "#FF0000",
      },
      {
        id: "conn_2",
        name: "GND",
        outerPinNames: ["C17", "C18"],
        color: "#000000",
      },
      {
        id: "conn_3",
        name: "SIGNAL",
        outerPinNames: ["C5", "C7", "C9"],
        color: "#0000FF",
      },
    ]

    // Generate test fixture circuit JSON
    const testFixtureCircuit = generateTestFixture({
      userConnections,
      outerPinNets,
      circuitData,
    })

    // Log the circuit JSON for manual inspection
    console.log("\n=== Test Fixture Circuit JSON ===")
    console.log(JSON.stringify(testFixtureCircuit, null, 2))
    console.log("=================================\n")

    expect(testFixtureCircuit).toBeDefined()
  })
})
