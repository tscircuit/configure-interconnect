import type React from "react"
import { useState } from "react"
import type { OuterPinNet, UserNetConnection } from "../outer-pin-nets"

interface ConnectionTableProps {
  userConnections: UserNetConnection[]
  outerPinNets: Map<string, OuterPinNet>
  portToConnection: Map<string, string>
  selectionModeConnectionId: string | null
  onCreateConnection: () => void
  onRemoveConnection: (connectionId: string) => void
  onRemovePinFromConnection: (connectionId: string, pinName: string) => void
  onRenameConnection: (connectionId: string, newName: string) => void
  onEnterSelectionMode: (connectionId: string) => void
  onExitSelectionMode: () => void
}

export const ConnectionTable: React.FC<ConnectionTableProps> = ({
  userConnections,
  outerPinNets,
  selectionModeConnectionId,
  onCreateConnection,
  onRemoveConnection,
  onRemovePinFromConnection,
  onRenameConnection,
  onEnterSelectionMode,
  onExitSelectionMode,
}) => {
  const [editingConnectionId, setEditingConnectionId] = useState<string | null>(
    null,
  )
  const [editingName, setEditingName] = useState("")
  return (
    <div className="border border-gray-300 rounded-lg p-4 bg-white">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Connections</h2>
        <button
          onClick={onCreateConnection}
          className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
        >
          New Connection
        </button>
      </div>

      {selectionModeConnectionId && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-300 rounded">
          <p className="text-sm text-blue-800 mb-2">
            <strong>Selection Mode:</strong> Click on outer pins (C or X) on the
            canvas to add them to this connection.
          </p>
          <button
            onClick={onExitSelectionMode}
            className="px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm"
          >
            Done Selecting
          </button>
        </div>
      )}

      <div className="space-y-4 max-h-96 overflow-y-auto">
        {userConnections.length === 0 ? (
          <p className="text-gray-500 text-sm">
            No connections yet. Click "New Connection" to start.
          </p>
        ) : (
          userConnections.map((conn) => {
            const isInSelectionMode = selectionModeConnectionId === conn.id
            const isEditing = editingConnectionId === conn.id

            return (
              <div
                key={conn.id}
                className={`border rounded p-3 ${
                  isInSelectionMode
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200"
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: conn.color }}
                    />
                    {isEditing ? (
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={() => {
                          if (editingName.trim()) {
                            onRenameConnection(conn.id, editingName.trim())
                          }
                          setEditingConnectionId(null)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            if (editingName.trim()) {
                              onRenameConnection(conn.id, editingName.trim())
                            }
                            setEditingConnectionId(null)
                          } else if (e.key === "Escape") {
                            setEditingConnectionId(null)
                          }
                        }}
                        className="font-medium text-sm px-1 py-0.5 border border-blue-500 rounded"
                        autoFocus
                      />
                    ) : (
                      <span
                        className="font-medium text-sm cursor-pointer hover:bg-gray-100 px-1 py-0.5 rounded"
                        onClick={() => {
                          setEditingConnectionId(conn.id)
                          setEditingName(conn.name)
                        }}
                      >
                        {conn.name}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {!isInSelectionMode && (
                      <button
                        onClick={() => onEnterSelectionMode(conn.id)}
                        className="text-xs hover:underline text-blue-600"
                      >
                        Add Nets
                      </button>
                    )}
                    <button
                      onClick={() => onRemoveConnection(conn.id)}
                      className="text-red-600 hover:text-red-800 text-xs"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <div className="mb-2">
                  <div className="text-xs font-medium text-gray-700 mb-1">
                    Connected Nets:
                  </div>
                  {conn.outerPinNames.length === 0 ? (
                    <p className="text-xs text-gray-500">No nets connected</p>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {conn.outerPinNames.map((pinName) => {
                        const outerPin = outerPinNets.get(pinName)
                        if (!outerPin) return null

                        return (
                          <div
                            key={pinName}
                            className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-xs"
                          >
                            <span
                              className={
                                outerPin.kind === "X"
                                  ? "text-red-600 font-bold"
                                  : ""
                              }
                            >
                              {pinName}
                            </span>
                            <button
                              onClick={() =>
                                onRemovePinFromConnection(conn.id, pinName)
                              }
                              className="text-red-600 hover:text-red-800"
                            >
                              ×
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
