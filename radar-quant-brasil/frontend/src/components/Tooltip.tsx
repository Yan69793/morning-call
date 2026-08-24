import { useState, useRef } from 'react'

interface Props {
  content: string
  children: React.ReactNode
}

export function Tooltip({ content, children }: Props) {
  const [isVisible, setIsVisible] = useState(false)
  const timeoutRef = useRef<number | undefined>(undefined)

  const show = () => {
    if (timeoutRef.current !== undefined) clearTimeout(timeoutRef.current)
    setIsVisible(true)
  }

  const hide = () => {
    timeoutRef.current = setTimeout(() => setIsVisible(false), 200)
  }

  return (
    <div className="relative inline-block" onMouseEnter={show} onMouseLeave={hide}>
      {children}
      {isVisible && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg shadow-lg whitespace-nowrap max-w-xs">
          {content}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700" />
        </div>
      )}
    </div>
  )
}
