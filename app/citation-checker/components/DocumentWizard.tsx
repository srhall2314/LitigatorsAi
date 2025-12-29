"use client"

import { useState } from "react"

export interface DocumentWizardData {
  documentType: string
  court: string
  caseName: string
  plaintiff?: string
  defendant?: string
  movant?: string
  respondent?: string
  caseNumber?: string
  filingDate?: string
  motionType?: string
  keyIssues?: string
  additionalContext?: string
}

interface DocumentWizardProps {
  onGenerate: (data: DocumentWizardData) => void
  onSkip: () => void
}

export function DocumentWizard({ onGenerate, onSkip }: DocumentWizardProps) {
  const [formData, setFormData] = useState<DocumentWizardData>({
    documentType: "",
    court: "",
    caseName: "",
    plaintiff: "",
    defendant: "",
    movant: "",
    respondent: "",
    caseNumber: "",
    filingDate: "",
    motionType: "",
    keyIssues: "",
    additionalContext: "",
  })

  const [errors, setErrors] = useState<Partial<Record<keyof DocumentWizardData, string>>>({})

  const documentTypes = [
    { value: "brief", label: "Brief" },
    { value: "motion", label: "Motion" },
    { value: "memorandum", label: "Memorandum of Law" },
    { value: "response", label: "Response/Reply Brief" },
    { value: "opposition", label: "Opposition Brief" },
    { value: "other", label: "Other" },
  ]

  const motionTypes = [
    { value: "summary-judgment", label: "Motion for Summary Judgment" },
    { value: "dismiss", label: "Motion to Dismiss" },
    { value: "compel", label: "Motion to Compel" },
    { value: "strike", label: "Motion to Strike" },
    { value: "protect", label: "Motion for Protective Order" },
    { value: "default", label: "Motion for Default Judgment" },
    { value: "preliminary-injunction", label: "Motion for Preliminary Injunction" },
    { value: "other", label: "Other Motion" },
  ]

  const handleChange = (field: keyof DocumentWizardData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    // Clear error for this field
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }))
    }
  }

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof DocumentWizardData, string>> = {}

    if (!formData.documentType) {
      newErrors.documentType = "Document type is required"
    }
    if (!formData.court) {
      newErrors.court = "Court is required"
    }
    if (!formData.caseName) {
      newErrors.caseName = "Case name is required"
    }

    // Validate party fields based on document type
    if (formData.documentType === "motion" || formData.documentType === "opposition") {
      if (!formData.movant && !formData.respondent) {
        // At least one should be filled, but we'll make it optional for now
      }
    } else {
      if (!formData.plaintiff && !formData.defendant) {
        // At least one should be filled, but we'll make it optional for now
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (validate()) {
      onGenerate(formData)
    }
  }

  const isMotion = formData.documentType === "motion" || formData.documentType === "opposition"

  return (
    <div className="border border-gray-200 rounded-lg bg-white p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-2xl font-semibold text-black mb-2">
              Document Creation Wizard
            </h2>
            <p className="text-gray-600">
              Fill in the information below to generate your initial document draft
            </p>
          </div>
          <button
            type="button"
            onClick={onSkip}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 whitespace-nowrap"
          >
            Skip Wizard
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Document Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Document Type <span className="text-red-500">*</span>
          </label>
          <select
            value={formData.documentType}
            onChange={(e) => handleChange("documentType", e.target.value)}
            className={`w-full border rounded-md px-3 py-2 text-sm ${
              errors.documentType ? "border-red-500" : "border-gray-300"
            } focus:outline-none focus:ring-2 focus:ring-indigo-500`}
          >
            <option value="">Select document type...</option>
            {documentTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
          {errors.documentType && (
            <p className="mt-1 text-sm text-red-600">{errors.documentType}</p>
          )}
        </div>

        {/* Motion Type (if motion) */}
        {isMotion && formData.documentType && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Motion Type
            </label>
            <select
              value={formData.motionType}
              onChange={(e) => handleChange("motionType", e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Select motion type...</option>
              {motionTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Court */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Court <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.court}
            onChange={(e) => handleChange("court", e.target.value)}
            placeholder="e.g., United States District Court for the Southern District of New York"
            className={`w-full border rounded-md px-3 py-2 text-sm ${
              errors.court ? "border-red-500" : "border-gray-300"
            } focus:outline-none focus:ring-2 focus:ring-indigo-500`}
          />
          {errors.court && <p className="mt-1 text-sm text-red-600">{errors.court}</p>}
        </div>

        {/* Case Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Case Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.caseName}
            onChange={(e) => handleChange("caseName", e.target.value)}
            placeholder="e.g., Smith v. Jones"
            className={`w-full border rounded-md px-3 py-2 text-sm ${
              errors.caseName ? "border-red-500" : "border-gray-300"
            } focus:outline-none focus:ring-2 focus:ring-indigo-500`}
          />
          {errors.caseName && <p className="mt-1 text-sm text-red-600">{errors.caseName}</p>}
        </div>

        {/* Parties - Show different fields based on document type */}
        {isMotion ? (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Movant
              </label>
              <input
                type="text"
                value={formData.movant}
                onChange={(e) => handleChange("movant", e.target.value)}
                placeholder="Name of party filing the motion"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Respondent
              </label>
              <input
                type="text"
                value={formData.respondent}
                onChange={(e) => handleChange("respondent", e.target.value)}
                placeholder="Name of opposing party"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Plaintiff
              </label>
              <input
                type="text"
                value={formData.plaintiff}
                onChange={(e) => handleChange("plaintiff", e.target.value)}
                placeholder="Name of plaintiff"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Defendant
              </label>
              <input
                type="text"
                value={formData.defendant}
                onChange={(e) => handleChange("defendant", e.target.value)}
                placeholder="Name of defendant"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </>
        )}

        {/* Case Number */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Case Number
          </label>
          <input
            type="text"
            value={formData.caseNumber}
            onChange={(e) => handleChange("caseNumber", e.target.value)}
            placeholder="e.g., 1:23-cv-12345"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Filing Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Filing Date
          </label>
          <input
            type="date"
            value={formData.filingDate}
            onChange={(e) => handleChange("filingDate", e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Key Issues */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Key Issues / Topics
          </label>
          <textarea
            value={formData.keyIssues}
            onChange={(e) => handleChange("keyIssues", e.target.value)}
            placeholder="Describe the main legal issues, arguments, or topics to address in the document..."
            rows={4}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
        </div>

        {/* Additional Context */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Additional Context
          </label>
          <textarea
            value={formData.additionalContext}
            onChange={(e) => handleChange("additionalContext", e.target.value)}
            placeholder="Any additional information, facts, or context that should be included..."
            rows={4}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
        </div>

        {/* Buttons */}
        <div className="flex gap-4 pt-4">
          <button
            type="submit"
            className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 font-medium"
          >
            Generate Document Draft
          </button>
        </div>
      </form>
    </div>
  )
}

