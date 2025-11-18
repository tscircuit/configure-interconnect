import type React from "react"
import { type ReactNode, useState } from "react"

interface TooltipProps {
  content: string
  children: ReactNode
}

export const Tooltip: React.FC<TooltipProps> = ({ content, children }) => {
  const [isVisible, setIsVisible] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })

  const handleMouseMove = (e: React.MouseEvent) => {
    setPosition({ x: e.clientX, y: e.clientY })
  }

  return (
    <>
      <g
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onMouseMove={handleMouseMove}
      >
        {children}
      </g>
      {isVisible && (
        <foreignObject
          x={0}
          y={0}
          width="100%"
          height="100%"
          pointerEvents="none"
        >
          <div
            style={{
              position: "fixed",
              left: `${position.x + 10}px`,
              top: `${position.y + 10}px`,
              pointerEvents: "none",
              zIndex: 9999,
            }}
            className="bg-gray-900 text-white text-xs px-2 py-1 rounded shadow-lg whitespace-pre-line"
          >
            {content}
          </div>
        </foreignObject>
      )}
    </>
  )
}
