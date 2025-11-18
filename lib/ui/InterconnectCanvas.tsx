import type React from "react"
import { useMemo, useState } from "react"
import { pinKind } from "../nets"
import type { OuterPinNet, UserNetConnection } from "../outer-pin-nets"
import type { PcbSmtPad, SourcePort } from "../types"

interface InterconnectCanvasProps {
  pads: PcbSmtPad[]
  ports: SourcePort[]
  outerPinNets: Map<string, OuterPinNet>
  userConnections: UserNetConnection[]
  portToConnection: Map<string, string>
  selectionModeConnectionId: string | null
  onOuterPinClick: (pinName: string) => void
}

export const InterconnectCanvas: React.FC<InterconnectCanvasProps> = ({
  pads,
  ports,
  outerPinNets,
  userConnections,
  portToConnection,
  selectionModeConnectionId,
  onOuterPinClick,
}) => {
  const [hoveredPadId, setHoveredPadId] = useState<string | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(
    null,
  )

  // Create a map from port_hints to port for easy lookup
  const hintToPort = useMemo(() => {
    const map = new Map<string, SourcePort>()
    for (const port of ports) {
      for (const hint of port.port_hints) {
        map.set(hint, port)
      }
    }
    return map
  }, [ports])

  // Create map from port to outer pin net
  const portToOuterPinNet = useMemo(() => {
    const map = new Map<string, OuterPinNet>()
    for (const [_pinName, outerPin] of outerPinNets.entries()) {
      for (const port of outerPin.ports) {
        map.set(port.source_port_id, outerPin)
      }
    }
    return map
  }, [outerPinNets])

  // Find the port for a given pad
  const getPadPort = (pad: PcbSmtPad): SourcePort | undefined => {
    for (const hint of pad.port_hints) {
      const port = hintToPort.get(hint)
      if (port) return port
    }
    return undefined
  }

  // Get net name for display (e.g., "X1_X9" for X pins, "C1" for C pins)
  const getNetDisplayName = (outerPin: OuterPinNet): string => {
    if (outerPin.kind === "X") {
      const pinNum = Number.parseInt(outerPin.name.slice(1), 10)
      const partnerNum = pinNum <= 9 ? pinNum + 8 : pinNum - 8
      // Always display with the lower pin number first for consistency
      const [first, second] = pinNum < partnerNum ? [pinNum, partnerNum] : [partnerNum, pinNum]
      return `X${first}_X${second}`
    }
    return outerPin.name
  }

  // Calculate bounds
  const bounds = useMemo(() => {
    if (pads.length === 0)
      return { minX: -5, maxX: 5, minY: -5, maxY: 5, width: 10, height: 10 }

    const xs = pads.map((p) => p.x)
    const ys = pads.map((p) => p.y)
    const padding = 1
    const minX = Math.min(...xs) - padding
    const maxX = Math.max(...xs) + padding
    const minY = Math.min(...ys) - padding
    const maxY = Math.max(...ys) + padding

    return {
      minX,
      maxX,
      minY,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
    }
  }, [pads])

  const scale = 60 // pixels per mm
  const canvasWidth = bounds.width * scale
  const canvasHeight = bounds.height * scale

  // Convert mm coordinates to pixels
  const mmToPixels = (x: number, y: number) => ({
    x: (x - bounds.minX) * scale,
    y: (y - bounds.minY) * scale,
  })

  // Find the one-hop connection between two outer pin nets
  // Returns [pad from net1, pad from net2] if they are adjacent
  const findOneHopConnection = (
    net1: OuterPinNet,
    net2: OuterPinNet,
  ): [PcbSmtPad, PcbSmtPad] | null => {
    // Get all pads for each net
    const pads1 = pads.filter((pad) =>
      net1.ports.some((port) =>
        port.port_hints.some((hint) => pad.port_hints.includes(hint)),
      ),
    )
    const pads2 = pads.filter((pad) =>
      net2.ports.some((port) =>
        port.port_hints.some((hint) => pad.port_hints.includes(hint)),
      ),
    )

    // Find adjacent pads between the two nets (within 1.5mm)
    for (const pad1 of pads1) {
      for (const pad2 of pads2) {
        const dx = Math.abs(pad1.x - pad2.x)
        const dy = Math.abs(pad1.y - pad2.y)
        if (dx <= 1.5 && dy <= 1.5 && (dx > 0.01 || dy > 0.01)) {
          return [pad1, pad2]
        }
      }
    }

    return null
  }

  // Check if a pad is selectable
  const isPadSelectable = (pad: PcbSmtPad): boolean => {
    if (!selectionModeConnectionId) return false
    const port = getPadPort(pad)
    if (!port) return false
    const kind = pinKind(port)
    if (kind !== "C" && kind !== "X") return false
    const connId = portToConnection.get(port.source_port_id)
    return connId === undefined
  }

  return (
    <div className="border border-gray-300 rounded-lg overflow-auto bg-gray-50 p-4">
      <div
        className="relative bg-white"
        style={{
          width: `${canvasWidth}px`,
          height: `${canvasHeight}px`,
        }}
      >
        {/* Draw traces as SVG - MUST BE FIRST so divs are on top */}
        <svg
          className="absolute top-0 left-0 pointer-events-none"
          style={{ zIndex: 0 }}
          width={canvasWidth}
          height={canvasHeight}
        >
          {userConnections.map((conn) => {
            const cPins = conn.outerPinNames.filter((name) => {
              const outerPin = outerPinNets.get(name)
              return outerPin?.kind === "C"
            })

            if (cPins.length < 2) return null

            // Get the outer pin nets
            const cNets = cPins
              .map((pinName) => outerPinNets.get(pinName))
              .filter((net): net is OuterPinNet => net !== undefined)

            if (cNets.length < 2) return null

            // Find one-hop connections between consecutive C nets
            const traces: Array<[PcbSmtPad, PcbSmtPad]> = []
            for (let i = 0; i < cNets.length - 1; i++) {
              const connection = findOneHopConnection(cNets[i]!, cNets[i + 1]!)
              if (connection) {
                traces.push(connection)
              }
            }

            return (
              <g key={conn.id}>
                {traces.map((trace, idx) => {
                  const [pad1, pad2] = trace
                  const pos1 = mmToPixels(pad1.x, pad1.y)
                  const pos2 = mmToPixels(pad2.x, pad2.y)

                  return (
                    <line
                      key={`${conn.id}-${idx}`}
                      x1={pos1.x}
                      y1={pos1.y}
                      x2={pos2.x}
                      y2={pos2.y}
                      stroke={conn.color}
                      strokeWidth={3}
                      opacity={0.8}
                      markerEnd="url(#arrowhead)"
                    />
                  )
                })}
              </g>
            )
          })}
          <defs>
            <marker
              id="arrowhead"
              markerWidth={10}
              markerHeight={10}
              refX={5}
              refY={3}
              orient="auto"
            >
              <polygon points="0 0, 6 3, 0 6" fill="currentColor" />
            </marker>
          </defs>
        </svg>

        {/* Draw pads as divs */}
        {pads.map((pad) => {
          const port = getPadPort(pad)
          const kind = port ? pinKind(port) : "IN"
          const connId = port
            ? portToConnection.get(port.source_port_id)
            : undefined
          const isUsed = connId !== undefined
          const isSelectable = isPadSelectable(pad)
          const isOuterPin = kind === "C" || kind === "X"

          const conn = connId
            ? userConnections.find((c) => c.id === connId)
            : undefined

          const outerPinNet = port
            ? portToOuterPinNet.get(port.source_port_id)
            : undefined
          const netDisplayName = outerPinNet
            ? getNetDisplayName(outerPinNet)
            : ""

          // Determine color and opacity
          let bgColor: string
          let opacity = 1

          if (kind === "X") {
            bgColor = "#dc2626"
            if (isSelectable) {
              bgColor = "#3b82f6"
              opacity = 0.7
            } else {
              opacity = isUsed ? 1 : 0.25
            }
          } else if (kind === "C") {
            if (isSelectable) {
              bgColor = "#3b82f6"
              opacity = 0.7
            } else if (isUsed && conn) {
              bgColor = conn.color
              opacity = 1
            } else {
              bgColor = "#9ca3af"
              opacity = 0.25
            }
          } else {
            // Inner pins
            if (isUsed && conn) {
              bgColor = conn.color
              opacity = 0.6
            } else {
              bgColor = "#9ca3af"
              opacity = 0.15
            }
          }

          const pos = mmToPixels(pad.x, pad.y)
          const width = pad.width * scale
          const height = pad.height * scale

          const handleClick = () => {
            if (isSelectable) {
              const outerPin = port
                ? portToOuterPinNet.get(port.source_port_id)
                : undefined
              if (outerPin) {
                onOuterPinClick(outerPin.name)
              }
            }
          }

          const handleMouseEnter = (e: React.MouseEvent) => {
            setHoveredPadId(pad.pcb_smtpad_id)
            setTooltipPos({ x: e.clientX, y: e.clientY })
          }

          const handleMouseMove = (e: React.MouseEvent) => {
            setTooltipPos({ x: e.clientX, y: e.clientY })
          }

          const handleMouseLeave = () => {
            setHoveredPadId(null)
            setTooltipPos(null)
          }

          const hint = pad.port_hints[0] ?? ""
          const pinNumber = port?.pin_number ?? "?"
          const connName = conn ? `Connection ${conn.id.slice(-8)}` : "none"

          const tooltipText =
            kind === "X"
              ? `${hint} (Pin ${pinNumber})\nNet: ${netDisplayName}\nNon-configurable X pin\nConnection: ${connName}`
              : kind === "C"
                ? `${hint} (Pin ${pinNumber})\nNet: ${netDisplayName}\nConnection: ${connName}`
                : `${hint} (Pin ${pinNumber})\nInner pin\nConnection: ${connName}`

          // Calculate darker border color
          const darkerBorder = (() => {
            // Parse hex color and make it darker
            const hex = bgColor.replace('#', '')
            const r = Number.parseInt(hex.substring(0, 2), 16)
            const g = Number.parseInt(hex.substring(2, 4), 16)
            const b = Number.parseInt(hex.substring(4, 6), 16)
            const darker = (c: number) => Math.max(0, Math.floor(c * 0.6))
            return `rgb(${darker(r)}, ${darker(g)}, ${darker(b)})`
          })()

          return (
            <div key={pad.pcb_smtpad_id}>
              {/* Label above the pad */}
              {isOuterPin && netDisplayName && (
                <div
                  className="absolute"
                  style={{
                    left: `${pos.x}px`,
                    top: `${pos.y - height / 2 - 12}px`,
                    transform: "translateX(-50%)",
                    fontSize: "9px",
                    fontWeight: "bold",
                    color: bgColor,
                    opacity: 1,
                    userSelect: "none",
                    zIndex: 10,
                    pointerEvents: "none",
                    textShadow: "0 0 2px white, 0 0 2px white",
                  }}
                >
                  {netDisplayName}
                </div>
              )}
              {/* Pad box */}
              <div
                className="absolute"
                style={{
                  left: `${pos.x - width / 2}px`,
                  top: `${pos.y - height / 2}px`,
                  width: `${width}px`,
                  height: `${height}px`,
                  backgroundColor: bgColor,
                  opacity,
                  border: isSelectable
                    ? "2px solid #3b82f6"
                    : `1px solid ${darkerBorder}`,
                  cursor: isSelectable ? "pointer" : "default",
                  zIndex: 10,
                  pointerEvents: "auto",
                }}
                onClick={handleClick}
                onMouseEnter={handleMouseEnter}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
              />
            </div>
          )
        })}

        {/* Render tooltips outside of pad divs to avoid opacity inheritance */}
        {hoveredPadId && tooltipPos && (() => {
          const pad = pads.find(p => p.pcb_smtpad_id === hoveredPadId)
          if (!pad) return null

          const port = getPadPort(pad)
          const kind = port ? pinKind(port) : "IN"
          const connId = port ? portToConnection.get(port.source_port_id) : undefined
          const conn = connId ? userConnections.find((c) => c.id === connId) : undefined
          const outerPinNet = port ? portToOuterPinNet.get(port.source_port_id) : undefined
          const netDisplayName = outerPinNet ? getNetDisplayName(outerPinNet) : ""
          const hint = pad.port_hints[0] ?? ""
          const pinNumber = port?.pin_number ?? "?"
          const connName = conn ? `Connection ${conn.id.slice(-8)}` : "none"

          const tooltipText =
            kind === "X"
              ? `${hint} (Pin ${pinNumber})\nNet: ${netDisplayName}\nNon-configurable X pin\nConnection: ${connName}`
              : kind === "C"
                ? `${hint} (Pin ${pinNumber})\nNet: ${netDisplayName}\nConnection: ${connName}`
                : `${hint} (Pin ${pinNumber})\nInner pin\nConnection: ${connName}`

          return (
            <div
              className="fixed bg-gray-900 text-white text-xs px-3 py-2 rounded shadow-lg whitespace-pre-line pointer-events-none"
              style={{
                left: `${tooltipPos.x + 10}px`,
                top: `${tooltipPos.y + 10}px`,
                zIndex: 9999,
              }}
            >
              {tooltipText}
            </div>
          )
        })()}

      </div>
    </div>
  )
}
