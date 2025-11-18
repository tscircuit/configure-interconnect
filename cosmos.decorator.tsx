import type React from "react"
import { useLayoutEffect, useState } from "react"

export const TailwindDecorator = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const [isLoaded, setIsLoaded] = useState(false)

  useLayoutEffect(() => {
    const script = document.createElement("script")
    script.src = "https://cdn.tailwindcss.com"
    script.onload = () => setIsLoaded(true)
    document.head.appendChild(script)
  }, [])

  if (!isLoaded) return null

  return <>{children}</>
}

export default TailwindDecorator
