import type React from "react"
import { useMemo, useState } from "react"
import { colorByIndex } from "../colors"
import { loadCircuit } from "../load-circuit"
import { groupPortsIntoNets } from "../nets"
import { getOuterPinNets, type UserNetConnection } from "../outer-pin-nets"
import { generateTestFixture, generateFootprint } from "../generate-test-fixture"
import { ConnectionTable } from "./ConnectionTable"
import { Dropdown } from "./Dropdown"
import { InterconnectCanvas } from "./InterconnectCanvas"

const CHIP_OPTIONS = [
  {
    value: "lga36p_10x10mm_xalt_2025_11",
    label: "LGA36P 10x10mm XALT 2025-11",
  },
]

export const App: React.FC = () => {
  const [selectedChip, setSelectedChip] = useState(CHIP_OPTIONS[0]!.value)
  const [userConnections, setUserConnections] = useState<UserNetConnection[]>(
    [],
  )
  // Selection mode: which connection is waiting for pin selection
  const [selectionModeConnectionId, setSelectionModeConnectionId] = useState<
    string | null
  >(null)
  const [generatedContent, setGeneratedContent] = useState<{
    type: "test-fixture" | "footprint"
    svg: string
    circuitJson: any
  } | null>(null)

  // Load circuit data
  const circuitData = useMemo(() => loadCircuit(), [])

  // Group ports into nets based on subcircuit_connectivity_map_key
  const netGroups = useMemo(
    () => groupPortsIntoNets(circuitData.ports, circuitData.nets),
    [circuitData.ports, circuitData.nets],
  )

  // Get outer pin nets (C1-C18, X1-X18)
  const outerPinNets = useMemo(() => getOuterPinNets(netGroups), [netGroups])

  // Create portToConnection mapping
  const portToConnection = useMemo(() => {
    const map = new Map<string, string>() // portId -> connectionId
    for (const conn of userConnections) {
      for (const pinName of conn.outerPinNames) {
        const outerPin = outerPinNets.get(pinName)
        if (!outerPin) continue
        // Mark all ports in this net as part of this connection
        for (const port of outerPin.ports) {
          map.set(port.source_port_id, conn.id)
        }
      }
    }
    return map
  }, [userConnections, outerPinNets])

  const handleCreateConnection = () => {
    const nextNumber = userConnections.length + 1
    const newConn: UserNetConnection = {
      id: `conn_${Date.now()}`,
      name: `NET${nextNumber}`,
      outerPinNames: [],
      color: colorByIndex(userConnections.length),
    }
    setUserConnections([...userConnections, newConn])
    // Automatically enter selection mode for the new connection
    setSelectionModeConnectionId(newConn.id)
    // Clear generated content when adding new connection
    setGeneratedContent(null)
  }

  const handleRemoveConnection = (connectionId: string) => {
    setUserConnections(userConnections.filter((c) => c.id !== connectionId))
    if (selectionModeConnectionId === connectionId) {
      setSelectionModeConnectionId(null)
    }
  }

  const handleAddPinToConnection = (connectionId: string, pinName: string) => {
    const conn = userConnections.find((c) => c.id === connectionId)
    if (!conn) return

    const outerPin = outerPinNets.get(pinName)
    if (!outerPin) return

    // Check if already in this connection
    if (conn.outerPinNames.includes(pinName)) return

    // X pins: can only have themselves and their diagonal partner
    if (outerPin.kind === "X") {
      if (conn.outerPinNames.length > 0) {
        alert("X pins cannot be connected with other pins")
        return
      }

      // Find the partner X pin by looking for other X pins with the same connectivity key
      const pinsToAdd = [pinName]

      for (const [otherPinName, otherPin] of outerPinNets.entries()) {
        if (otherPin.kind === "X" &&
            otherPin.connectivityKey === outerPin.connectivityKey &&
            otherPinName !== pinName) {
          pinsToAdd.push(otherPinName)
          console.log(`Found partner X pin: ${otherPinName} for ${pinName}`)
        }
      }

      console.log(`Adding X pin(s):`, pinsToAdd)

      // Add all X pins from this net to the connection
      setUserConnections(
        userConnections.map((c) =>
          c.id === connectionId
            ? { ...c, outerPinNames: [...c.outerPinNames, ...pinsToAdd] }
            : c,
        ),
      )
      // Exit selection mode immediately since X pins can't have additional connections
      setSelectionModeConnectionId(null)
      return
    }

    // C pins: check if trying to add to a connection with X pins
    if (outerPin.kind === "C" && conn.outerPinNames.length > 0) {
      const hasXPin = conn.outerPinNames.some((name) => {
        const pin = outerPinNets.get(name)
        return pin?.kind === "X"
      })
      if (hasXPin) {
        alert("Cannot add C pins to a connection with X pins")
        return
      }
    }

    setUserConnections(
      userConnections.map((c) =>
        c.id === connectionId
          ? { ...c, outerPinNames: [...c.outerPinNames, pinName] }
          : c,
      ),
    )
  }

  const handleRemovePinFromConnection = (
    connectionId: string,
    pinName: string,
  ) => {
    setUserConnections(
      userConnections.map((c) =>
        c.id === connectionId
          ? {
              ...c,
              outerPinNames: c.outerPinNames.filter((p) => p !== pinName),
            }
          : c,
      ),
    )
  }

  const handleRenameConnection = (connectionId: string, newName: string) => {
    setUserConnections(
      userConnections.map((c) =>
        c.id === connectionId ? { ...c, name: newName } : c,
      ),
    )
  }

  const handleEnterSelectionMode = (connectionId: string) => {
    setSelectionModeConnectionId(connectionId)
  }

  const handleExitSelectionMode = () => {
    setSelectionModeConnectionId(null)
  }

  const handleOuterPinClick = (pinName: string) => {
    // Empty string signals exit selection mode
    if (pinName === '') {
      setSelectionModeConnectionId(null)
      return
    }

    if (selectionModeConnectionId) {
      handleAddPinToConnection(selectionModeConnectionId, pinName)
    }
  }

  const handleGenerateTestFixture = async () => {
    // Generate test fixture circuit JSON
    const testFixtureCircuit = generateTestFixture({
      userConnections,
      outerPinNets,
      circuitData,
    })

    // Dynamically import circuit-to-svg
    const { convertCircuitJsonToPcbSvg } = await import("circuit-to-svg")

    // Convert to SVG
    const svg = convertCircuitJsonToPcbSvg(testFixtureCircuit as any, {
      width: 800,
      height: 800,
      matchBoardAspectRatio: true,
    })

    setGeneratedContent({
      type: "test-fixture",
      svg,
      circuitJson: testFixtureCircuit,
    })
  }

  const handleGenerateFootprint = async () => {
    // Generate footprint circuit JSON
    const footprintCircuit = generateFootprint({
      userConnections,
      outerPinNets,
      circuitData,
    })

    // Dynamically import circuit-to-svg
    const { convertCircuitJsonToPcbSvg } = await import("circuit-to-svg")

    // Convert to SVG
    const svg = convertCircuitJsonToPcbSvg(footprintCircuit as any, {
      width: 800,
      height: 800,
      matchBoardAspectRatio: true,
    })

    setGeneratedContent({
      type: "footprint",
      svg,
      circuitJson: footprintCircuit,
    })
  }

  const handleDownloadCircuitJson = () => {
    if (!generatedContent) return

    // Create a blob from the JSON
    const jsonString = JSON.stringify(generatedContent.circuitJson, null, 2)
    const blob = new Blob([jsonString], { type: "application/json" })
    const url = URL.createObjectURL(blob)

    // Create a temporary link and trigger download
    const link = document.createElement("a")
    link.href = url
    link.download = `${generatedContent.type}.circuit.json`
    document.body.appendChild(link)
    link.click()

    // Cleanup
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">
          Configure Interconnect
        </h1>

        <Dropdown
          value={selectedChip}
          onChange={setSelectedChip}
          options={CHIP_OPTIONS}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <InterconnectCanvas
              pads={circuitData.pads}
              ports={circuitData.ports}
              outerPinNets={outerPinNets}
              userConnections={userConnections}
              portToConnection={portToConnection}
              selectionModeConnectionId={selectionModeConnectionId}
              onOuterPinClick={handleOuterPinClick}
            />
          </div>

          <div>
            <ConnectionTable
              userConnections={userConnections}
              outerPinNets={outerPinNets}
              portToConnection={portToConnection}
              selectionModeConnectionId={selectionModeConnectionId}
              onCreateConnection={handleCreateConnection}
              onRemoveConnection={handleRemoveConnection}
              onRemovePinFromConnection={handleRemovePinFromConnection}
              onRenameConnection={handleRenameConnection}
              onEnterSelectionMode={handleEnterSelectionMode}
              onExitSelectionMode={handleExitSelectionMode}
            />
          </div>
        </div>

        <div className="mt-6 p-4 bg-white rounded-lg border border-gray-300">
          <h3 className="font-semibold text-sm mb-2">Legend:</h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-gray-400 rounded opacity-30" />
              <span>Unused pins</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-600 rounded" />
              <span>Used pins (connection color)</span>
            </div>
          </div>
        </div>

        <div className="mt-6 p-4 bg-white rounded-lg border border-gray-300">
          <div className="flex gap-4 mb-4">
            <button
              type="button"
              onClick={handleGenerateTestFixture}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
            >
              Generate Test Fixture
            </button>
            <button
              type="button"
              onClick={handleGenerateFootprint}
              className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-semibold"
            >
              Generate Footprint
            </button>
          </div>

          {generatedContent && (
            <>
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-lg">
                  {generatedContent.type === "test-fixture"
                    ? "Test Fixture"
                    : "Footprint"}
                </h3>
                <button
                  type="button"
                  onClick={handleDownloadCircuitJson}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold text-sm"
                >
                  Download Circuit JSON
                </button>
              </div>
              <div
                className="border border-gray-200 rounded overflow-auto"
                dangerouslySetInnerHTML={{ __html: generatedContent.svg }}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
