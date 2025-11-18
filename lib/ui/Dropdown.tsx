import type React from "react"

interface DropdownProps {
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
}

export const Dropdown: React.FC<DropdownProps> = ({
  value,
  onChange,
  options,
}) => {
  return (
    <div className="mb-4">
      <label
        htmlFor="chip-select"
        className="block text-sm font-medium text-gray-700 mb-2"
      >
        Select Interconnect Chip:
      </label>
      <select
        id="chip-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}
