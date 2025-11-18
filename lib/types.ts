export type SourcePort = {
  type: "source_port"
  source_port_id: string
  name: string // e.g. "pin1"
  pin_number: number // 1..100
  port_hints: string[] // ["C1"], ["X4"], ["IN2_R1_C1"], etc.
  subcircuit_connectivity_map_key: string // used to group into nets
  source_component_id: string
  subcircuit_id: string
}

export type SourceNet = {
  type: "source_net"
  source_net_id: string
  name: string // e.g. "NIN0", "Nnet_X18"
  subcircuit_connectivity_map_key: string
}

export type SourceTrace = {
  type: "source_trace"
  source_trace_id: string
  connected_source_port_ids: string[]
  connected_source_net_ids: string[]
  display_name?: string
  subcircuit_connectivity_map_key: string
}

export type PcbSmtPad = {
  type: "pcb_smtpad"
  pcb_smtpad_id: string
  pcb_port_id: string
  layer: "top" | "bottom"
  shape: "rect" | "circle"
  width: number
  height: number
  port_hints: string[] // usually ["C1"], ["X5"], ...
  x: number // mm, origin at chip center
  y: number // mm
  pcb_component_id: string
  subcircuit_id: string
  is_covered_with_solder_mask?: boolean
}

export type CircuitObject =
  | SourcePort
  | SourceNet
  | SourceTrace
  | PcbSmtPad
  | { type: string; [key: string]: any }

export type CircuitJson = CircuitObject[]

// User-created connection for the UI
export type UserConnection = {
  id: string
  netId: string
  portIds: string[]
  color: string
}
