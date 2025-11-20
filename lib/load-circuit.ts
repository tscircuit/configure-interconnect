import circuitData from "./lga36p_10x10mm_xalt.circuit.json" with {
  type: "json",
}
import type {
  CircuitJson,
  PcbSmtPad,
  SourceNet,
  SourcePort,
  SourceTrace,
} from "./types"

export type Normalized = {
  ports: SourcePort[]
  nets: SourceNet[]
  traces: SourceTrace[]
  pads: PcbSmtPad[]
}

export const loadCircuit = (): Normalized => {
  const objects = (
    Array.isArray(circuitData)
      ? circuitData
      : ((circuitData as any).objects ?? [])
  ) as CircuitJson

  const byType = <T extends { type: string }>(t: string) =>
    objects.filter((o: any) => o.type === t) as T[]

  // Get pads and convert their size from 0.3x0.3mm to 0.5x0.5mm
  // This is because the footprint uses larger pads than the chip
  const originalPads = byType<PcbSmtPad>("pcb_smtpad")
  const pads = originalPads.map((pad) => ({
    ...pad,
    width: pad.width === 0.3 ? 0.5 : pad.width,
    height: pad.height === 0.3 ? 0.5 : pad.height,
  }))

  return {
    ports: byType<SourcePort>("source_port"),
    nets: byType<SourceNet>("source_net"),
    traces: byType<SourceTrace>("source_trace"),
    pads,
  }
}
