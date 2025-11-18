/**
 * Citation Lookup Tables Loader
 * Loads and provides access to citation validation lookup tables
 */

import lookupTablesData from '@/citation-lookup-tables.json'

export interface LookupTables {
  federal_reporters: {
    supreme_court: string[]
    federal_appellate: string[]
    federal_district: string[]
    specialized: string[]
  }
  federal_courts: {
    supreme_court: string[]
    circuit_courts: string[]
    district_courts: string[]
  }
  federal_codes: {
    statutes: string[]
    regulations: string[]
    specialized: string[]
  }
  federal_rules: string[]
  state_reporters: Record<string, string[]>
  state_court_abbreviations: Record<string, string[]>
  state_codes: Record<string, string[]>
}

let lookupTables: LookupTables | null = null

export function getLookupTables(): LookupTables {
  if (!lookupTables) {
    lookupTables = lookupTablesData as LookupTables
  }
  return lookupTables
}

/**
 * Get all valid federal reporters
 */
export function getAllFederalReporters(): string[] {
  const tables = getLookupTables()
  return [
    ...tables.federal_reporters.supreme_court,
    ...tables.federal_reporters.federal_appellate,
    ...tables.federal_reporters.federal_district,
    ...tables.federal_reporters.specialized,
  ]
}

/**
 * Get all valid federal court abbreviations
 */
export function getAllFederalCourts(): string[] {
  const tables = getLookupTables()
  return [
    ...tables.federal_courts.supreme_court,
    ...tables.federal_courts.circuit_courts,
    ...tables.federal_courts.district_courts,
  ]
}

/**
 * Check if a reporter abbreviation is valid
 */
export function isValidReporter(reporter: string): boolean {
  const allReporters = getAllFederalReporters()
  return allReporters.some(r => r.toLowerCase() === reporter.toLowerCase())
}

/**
 * Check if a court abbreviation is valid
 */
export function isValidCourt(court: string): boolean {
  const allCourts = getAllFederalCourts()
  return allCourts.some(c => c.toLowerCase() === court.toLowerCase())
}

/**
 * Check if a code abbreviation is valid (federal)
 */
export function isValidCode(code: string): boolean {
  const tables = getLookupTables()
  const allCodes = [
    ...tables.federal_codes.statutes,
    ...tables.federal_codes.regulations,
    ...tables.federal_codes.specialized,
  ]
  return allCodes.some(c => c.toLowerCase() === code.toLowerCase())
}

/**
 * Check if a rule abbreviation is valid
 */
export function isValidRule(rule: string): boolean {
  const tables = getLookupTables()
  return tables.federal_rules.some(r => r.toLowerCase() === rule.toLowerCase())
}

