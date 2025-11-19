/**
 * Type declarations for @beshkenadze/eyecite
 */

declare module '@beshkenadze/eyecite' {
  export interface CitationMetadata {
    plaintiff?: string
    defendant?: string
    court?: string
    [key: string]: any
  }

  export interface CitationBase {
    toString(): string
    volume?: number | string
    reporter?: string
    page?: number | string
    year?: number | string
    metadata?: CitationMetadata
  }

  export class FullCaseCitation implements CitationBase {
    toString(): string
    volume?: number | string
    reporter?: string
    page?: number | string
    year?: number | string
    metadata?: CitationMetadata
  }

  export class ShortCaseCitation implements CitationBase {
    toString(): string
    volume?: number | string
    reporter?: string
    page?: number | string
    year?: number | string
    metadata?: CitationMetadata
  }

  export class SupraCitation implements CitationBase {
    toString(): string
    volume?: number | string
    reporter?: string
    page?: number | string
    year?: number | string
    metadata?: CitationMetadata
  }

  export class IdCitation implements CitationBase {
    toString(): string
    volume?: number | string
    reporter?: string
    page?: number | string
    year?: number | string
    metadata?: CitationMetadata
  }

  export type Citation = FullCaseCitation | ShortCaseCitation | SupraCitation | IdCitation | CitationBase

  export function getCitations(
    text: string,
    removeAmbiguous?: boolean,
    tokenizer?: any,
    markupText?: string,
    cleanSteps?: string[]
  ): Citation[]
}

