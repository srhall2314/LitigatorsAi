"use client"

interface ValidationSummaryProps {
  /**
   * Statistics object with risk-based counts
   */
  statistics: {
    lowRisk: number
    moderateRisk: number
    needsReview: number
    total: number
  }
  /**
   * Optional title for the summary section
   */
  title?: string
  /**
   * Whether to show the total count
   * @default true
   */
  showTotal?: boolean
  /**
   * Layout variant: 'full' shows all 4 columns, 'compact' shows only risk levels
   * @default 'full'
   */
  variant?: 'full' | 'compact'
  /**
   * Optional className for the container
   */
  className?: string
}

/**
 * Reusable ValidationSummary component that displays risk-based validation statistics.
 * Uses risk-centric labels: Low Risk, Moderate Risk, Needs Review
 */
export function ValidationSummary({
  statistics,
  title = "Validation Summary",
  showTotal = true,
  variant = 'full',
  className = ""
}: ValidationSummaryProps) {
  const { lowRisk, moderateRisk, needsReview, total } = statistics

  const gridCols = variant === 'full' && showTotal ? 'grid-cols-4' : 'grid-cols-3'

  return (
    <div className={`p-4 bg-gray-50 rounded-md ${className}`}>
      {title && (
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      )}
      <div className={`grid ${gridCols} gap-4`}>
        {showTotal && (
          <div>
            <div className="text-sm text-gray-600">Total Validated</div>
            <div className="text-2xl font-bold text-gray-900">{total}</div>
          </div>
        )}
        <div>
          <div className="text-sm text-gray-600">Low Risk</div>
          <div className="text-2xl font-bold text-green-600">{lowRisk}</div>
        </div>
        <div>
          <div className="text-sm text-gray-600">Moderate Risk</div>
          <div className="text-2xl font-bold text-yellow-600">{moderateRisk}</div>
        </div>
        <div>
          <div className="text-sm text-gray-600">Needs Review</div>
          <div className="text-2xl font-bold text-red-600">{needsReview}</div>
        </div>
      </div>
    </div>
  )
}

