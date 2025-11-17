# Circuit JSON Structure Summary

## Overview

This document describes the structure of `lib/lga36p_10x10mm_xalt.circuit.json`, which defines the **LGA36p 10x10mm XALT interconnect chip**. This chip has 100 pins total: 36 outer pins (18 configurable C pins, 18 non-configurable X pins) and 64 inner routing pins arranged in an 8x8 matrix.

## File Structure

The JSON file contains 554+ objects representing a complete circuit definition. Key object types:

| Object Type | Count | Purpose |
|------------|-------|---------|
| `source_port` | 100 | Pin/port definitions |
| `source_net` | 36 | Net definitions |
| `source_trace` | 109 | Connection/trace definitions |
| `pcb_smtpad` | 100 | Physical SMT pad definitions |
| `pcb_port` | 100 | PCB port locations |
| `pcb_solder_paste` | 100 | Solder paste definitions |
| `schematic_port` | 100 | Schematic view ports |

## Pin Types and Organization

### Outer Pins (36 pins)

#### X Pins (18 pins) - Non-configurable Crossing Pins

**Names:** X1 through X18
**Pin Numbers:** 2, 4, 6, 8, 10, 11, 21, 31, 41, 51, 61, 71, 81, 91, 92, 94, 96, 98

These pins are pre-configured to cross diagonally across the chip. Each X pin has a fixed connection to another X pin:
- X1 ↔ X10
- X2 ↔ X11
- X3 ↔ X12
- ... (and so on)

**UI Notes:**
- Draw in red color
- Show as faded when unused
- Display tooltip: "Non-configurable crossing pin"
- Cannot be added to custom nets

#### C Pins (18 pins) - Configurable Pins

**Names:** C1 through C18
**Pin Numbers:** 1, 3, 5, 7, 9, 20, 30, 40, 50, 60, 70, 80, 90, 93, 95, 97, 99, 100

These pins can be configured to connect to any net, allowing flexible routing through the chip.

**UI Notes:**
- Draw in gray when unused
- Draw in unique net color when part of a configured net
- Can be added to custom connections
- Show arrows connecting to configured pins

### Inner Pins (64 pins)

**Naming Pattern:** `IN{net_id}_R{row}_C{col}`
**Examples:** IN2_R1_C1, IN13_R1_C2, IN5_R1_C3
**Pin Numbers:** 12-19, 22-29, 32-39, 42-49, 52-59, 62-69, 72-79, 82-89

Organized in an **8x8 grid** (rows 1-8, columns 1-8) for internal routing between outer pins.

**UI Notes:**
- Draw in gray when unused
- Draw in net color when used for routing
- Not directly user-selectable (used automatically for routing)

## Physical Layout

### Board Dimensions
- **Size:** 10mm × 10mm
- **Material:** FR4
- **Thickness:** 1.4mm
- **Layers:** 4

### Coordinate System
- **Origin:** (0, 0) at chip center
- **Pad Size:** 0.3mm × 0.3mm
- **Spacing:** 1mm between adjacent pins

### Pin Placement
- **Top edge** (y = 4.5): 10 pins from x = -4.5 to x = 4.5
- **Bottom edge** (y = -4.5): 10 pins from x = -4.5 to x = 4.5
- **Left edge** (x = -4.5): 10 pins from y = 4.5 to y = -4.5
- **Right edge** (x = 4.5): 10 pins from y = 4.5 to y = -4.5
- **Inner matrix:** 8×8 grid approximately from (-3.5, -3.5) to (3.5, 3.5)

## Data Structures

### source_port (Pin Definition)

```json
{
  "type": "source_port",
  "source_port_id": "source_port_0",
  "name": "pin1",
  "pin_number": 1,
  "port_hints": ["pin1", "C1", "1"],
  "source_component_id": "source_component_0",
  "subcircuit_id": "subcircuit_source_group_0",
  "subcircuit_connectivity_map_key": "unnamedsubcircuit13476_connectivity_net9"
}
```

**Key Fields:**
- `pin_number`: Physical pin number (1-100)
- `port_hints`: Array containing pin name identifiers (e.g., ["C1"] for configurable pins, ["X1"] for crossing pins)
- `subcircuit_connectivity_map_key`: Links this port to its net

### source_net (Net Definition)

```json
{
  "type": "source_net",
  "source_net_id": "source_net_0",
  "name": "NIN0",
  "member_source_group_ids": [],
  "subcircuit_connectivity_map_key": "unnamedsubcircuit13476_connectivity_net9"
}
```

**Net Naming Patterns:**
- Inner routing nets: `NIN0`, `NIN1`, `NIN2`, etc.
- X pin nets: `Nnet_X18`, `Nnet_X17`, etc.

### source_trace (Connection Definition)

```json
{
  "type": "source_trace",
  "source_trace_id": "source_trace_0",
  "connected_source_port_ids": ["source_port_10", "source_port_89"],
  "connected_source_net_ids": [],
  "display_name": "U1.X1 to U1.X10",
  "subcircuit_connectivity_map_key": "unnamedsubcircuit13476_connectivity_net0"
}
```

**Connection Types:**
1. **Port-to-Port** (X pins): `connected_source_port_ids` has 2 port IDs
2. **Port-to-Net** (C pins): `connected_source_port_ids` has 1 port ID, `connected_source_net_ids` has 1 net ID

### pcb_smtpad (Physical Pad Layout)

```json
{
  "type": "pcb_smtpad",
  "pcb_smtpad_id": "pcb_smtpad_0",
  "pcb_port_id": "pcb_port_0",
  "layer": "bottom",
  "shape": "rect",
  "width": 0.3,
  "height": 0.3,
  "port_hints": ["C1"],
  "x": -4.5,
  "y": 4.5
}
```

**Key Fields:**
- `x`, `y`: Pad center coordinates in mm
- `width`, `height`: Pad dimensions (all pads are 0.3mm × 0.3mm)
- `port_hints`: Links to source_port name
- `layer`: "top" or "bottom"

## UI Implementation Guide

### Identifying Pin Types

Check the `port_hints` array in `source_port` objects:
- **C pins:** Contains strings starting with "C" (e.g., "C1", "C2")
- **X pins:** Contains strings starting with "X" (e.g., "X1", "X2")
- **Inner pins:** Contains strings starting with "IN" (e.g., "IN2_R1_C1")

### Drawing Pads

1. Use `pcb_smtpad` objects for position (`x`, `y`) and dimensions (`width`, `height`)
2. Apply color based on pin type and usage:
   - **Unused X pins:** Red, faded
   - **Used X pins:** Red, solid
   - **Unused C pins:** Gray, faded
   - **Used C pins:** Unique color per net, solid
   - **Unused inner pins:** Gray, faded
   - **Used inner pins:** Net color, solid

### Finding Net Membership

To find all pins on the same net:
1. Get the `subcircuit_connectivity_map_key` from the source port
2. Find all other `source_port` objects with the same `subcircuit_connectivity_map_key`
3. Find the corresponding `source_net` object with the same key

### Determining Connections

Parse `source_trace` objects:
- For **X pins:** Look for traces with 2 ports in `connected_source_port_ids`
- For **C pins:** Look for traces with 1 port in `connected_source_port_ids` and 1 net in `connected_source_net_ids`
- Use `display_name` for user-friendly connection labels (e.g., "U1.C1 to net.MyNet")

### Routing Between C Pins

When connecting two C pins:
1. Identify the nets for both C pins
2. Find available inner pins that can bridge the connection
3. The 8×8 inner grid is designed to allow at least one "single hop" connection between any two outer pins
4. Draw routing lines through selected inner pins
5. Update the visual state of all affected pins (outer C pins + inner routing pins) to the net color

### Hover Interactions

When user hovers over a pad:
1. Display tooltip with:
   - Pin number
   - Pin name (C1, X5, etc.)
   - Net name (if connected)
   - "Non-configurable crossing pin" (for X pins)
2. Highlight all pads on the same net
3. If it's an X pin, highlight its diagonal crossing partner
4. If it's a C pin with connections, highlight the connection path

## Configuration Workflow

### User Actions
1. **Select interconnect model:** Choose lga36p_10x10mm_xalt_2025_11 from dropdown
2. **Insert new connection:** Add a row to the configuration table
3. **Add pins to connection:** Select C pins to join the same net
4. **View connections:** See arrows drawn from C pins showing configured routes
5. **Hover for details:** Inspect pin properties and net membership

### Constraints
- X pins cannot be added to user-defined connections (always in diagonal pairs)
- C pins can be freely configured to form custom nets
- Inner pins are automatically used for routing (not directly user-configurable)
- Each net should have a unique color for visual distinction
