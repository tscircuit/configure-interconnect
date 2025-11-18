import type React from "react"
import { useMemo, useState } from "react"
import { colorForNet } from "../colors"
import { loadCircuit } from "../load-circuit"
import { groupPortsIntoNets } from "../nets"
import { getOuterPinNets, type UserNetConnection } from "../outer-pin-nets"
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
    const newConn: UserNetConnection = {
      id: `conn_${Date.now()}`,
      outerPinNames: [],
      color: colorForNet(`conn_${Date.now()}`),
    }
    setUserConnections([...userConnections, newConn])
    // Automatically enter selection mode for the new connection
    setSelectionModeConnectionId(newConn.id)
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
      // Add this X pin - the diagonal partner is automatically part of the trace
      setUserConnections(
        userConnections.map((c) =>
          c.id === connectionId
            ? { ...c, outerPinNames: [...c.outerPinNames, pinName] }
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

  const handleEnterSelectionMode = (connectionId: string) => {
    setSelectionModeConnectionId(connectionId)
  }

  const handleExitSelectionMode = () => {
    setSelectionModeConnectionId(null)
  }

  const handleOuterPinClick = (pinName: string) => {
    if (selectionModeConnectionId) {
      handleAddPinToConnection(selectionModeConnectionId, pinName)
    }
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
              onEnterSelectionMode={handleEnterSelectionMode}
              onExitSelectionMode={handleExitSelectionMode}
            />
          </div>
        </div>

        <div className="mt-6 p-4 bg-white rounded-lg border border-gray-300">
          <h3 className="font-semibold text-sm mb-2">Legend:</h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-red-600 rounded" />
              <span>X pins (non-configurable, always cross diagonally)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-gray-400 rounded opacity-30" />
              <span>Unused C/Inner pins</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-600 rounded" />
              <span>Used C/Inner pins (net color)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-red-600 rounded opacity-30" />
              <span>Unused X pins (faded)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
