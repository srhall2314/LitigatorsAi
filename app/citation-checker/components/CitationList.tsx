"use client"

interface Citation {
  id: string
  citationText: string
  citationType: string
}

interface CitationListProps {
  citations: Citation[]
  maxHeight?: string
  maxItems?: number
  compact?: boolean
}

export function CitationList({ 
  citations, 
  maxHeight = "max-h-96", 
  maxItems,
  compact = false 
}: CitationListProps) {
  if (citations.length === 0) return null

  const displayCitations = maxItems ? citations.slice(0, maxItems) : citations
  const remainingCount = maxItems ? citations.length - maxItems : 0

  const typeColor = {
    case: 'bg-blue-100 text-blue-800',
    statute: 'bg-green-100 text-green-800',
    regulation: 'bg-purple-100 text-purple-800',
    rule: 'bg-orange-100 text-orange-800',
    unknown: 'bg-gray-100 text-gray-800'
  }

  const containerClass = compact ? 'p-4 bg-gray-50 border border-gray-200 rounded-md' : 'p-4 bg-gray-50 border border-gray-200 rounded-md mt-4'
  const headingClass = compact ? 'text-sm font-semibold text-gray-900 mb-3' : 'text-lg font-semibold text-gray-900 mb-3'
  const listClass = compact ? `space-y-1 ${maxHeight} overflow-y-auto` : `space-y-2 ${maxHeight} overflow-y-auto`
  const itemClass = compact 
    ? 'flex items-center gap-2 p-1.5 bg-white rounded border border-gray-200'
    : 'flex items-start gap-2 p-2 bg-white rounded border border-gray-200 hover:border-gray-300 transition-colors'
  const badgeClass = compact ? 'px-1.5 py-0.5 text-xs font-medium rounded flex-shrink-0' : 'px-2 py-0.5 text-xs font-medium rounded flex-shrink-0'
  const textClass = compact 
    ? 'text-xs text-gray-600 flex-1 truncate'
    : 'text-sm text-gray-700 flex-1 break-words'
  const moreClass = compact ? 'text-xs text-gray-500 text-center pt-1' : 'text-sm text-gray-500 text-center pt-1'

  return (
    <div className={containerClass}>
      <h3 className={headingClass}>
        {compact ? `Citations (${citations.length})` : `Found ${citations.length} ${citations.length === 1 ? 'Citation' : 'Citations'}`}
      </h3>
      <div className={listClass}>
        {displayCitations.map((citation: any, index: number) => {
          const type = citation.citationType || 'unknown'
          const text = citation.citationText || ''
          const colorClass = typeColor[type as keyof typeof typeColor] || 'bg-gray-100 text-gray-800'
          const displayText = compact 
            ? (text.length > 60 ? `${text.substring(0, 60)}...` : text)
            : (text.length > 100 ? `${text.substring(0, 100)}...` : text)
          
          return (
            <div 
              key={citation.id || index} 
              className={itemClass}
            >
              <span className={`${badgeClass} ${colorClass}`}>
                {compact ? type.charAt(0).toUpperCase() : type.toUpperCase()}
              </span>
              <span className={textClass}>
                {displayText}
              </span>
            </div>
          )
        })}
        {remainingCount > 0 && (
          <div className={moreClass}>
            ...and {remainingCount} more
          </div>
        )}
      </div>
    </div>
  )
}

