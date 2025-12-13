# LitAI - Citation Checker

**The hallucination detector for legal AI.** A comprehensive post-drafting review tool that programmatically extracts citations from legal documents, validates them through a multi-tier verification system, and flags suspicious citations for lawyer review.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Core Workflow](#core-workflow)
- [Three-Tier Validation System](#three-tier-validation-system)
- [Features](#features)
- [Database Schema](#database-schema)
- [API Structure](#api-structure)
- [Development](#development)
- [Deployment](#deployment)

## Overview

### Problem Statement

AI-generated legal content (briefs, motions, memoranda) frequently contains hallucinated, fabricated, or misquoted citations. Lawyers need a systematic way to audit and verify citations before filing documents.

### Solution

Citation Checker is a post-drafting review tool that:
1. Extracts citations from legal documents (Word format)
2. Validates citations through a sophisticated three-tier verification system
3. Flags suspicious citations with detailed analysis for lawyer review
4. Provides comprehensive reports and structured data output

### Positioning

**The hallucination detector for legal AI.** Solves the core trust problem with AI-assisted legal drafting by providing systematic citation verification.

---

## Architecture

### High-Level Flow

```
Document Upload → JSON Generation → Citation Identification → Validation → Review → Report
```

1. **Upload**: User uploads Word document (.doc, .docx)
2. **JSON Generation**: Document parsed into structured JSON format
3. **Citation Identification**: Citations extracted using pattern matching or Eyecite
4. **Validation**: Three-tier validation system processes each citation
5. **Review**: User reviews discrepancies and validation results
6. **Report**: Final citation validation report generated

### System Components

- **Frontend**: Next.js 14 with App Router, React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL (Neon) with Prisma ORM
- **Storage**: Vercel Blob Storage for document files
- **Authentication**: NextAuth.js with Prisma adapter
- **AI Models**: Anthropic Claude, OpenAI GPT, Google Gemini, xAI Grok

---

## Tech Stack

### Core Technologies

- **Framework**: Next.js 16.0.10 (App Router)
- **Language**: TypeScript 5.5.0
- **Styling**: Tailwind CSS 3.4.0
- **Database**: PostgreSQL (Neon serverless)
- **ORM**: Prisma 6.19.0
- **Authentication**: NextAuth.js 4.24.7
- **File Storage**: Vercel Blob Storage

### AI/ML Libraries

- **Anthropic**: `@anthropic-ai/sdk` 0.71.0
- **OpenAI**: `openai` 6.9.1
- **Google Gemini**: `@google/generative-ai` 0.24.1
- **Citation Parsing**: `@beshkenadze/eyecite` 2.7.6

### Document Processing

- **Word Parsing**: `mammoth` 1.11.0 (converts .docx to HTML/text)

### Utilities

- **PDF Generation**: `jspdf` 3.0.4
- **Password Hashing**: `bcryptjs` 2.4.3
- **Retry Logic**: `async-retry` (via types)

---

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL database (Neon recommended)
- Vercel account (for Blob Storage)
- API keys:
  - Anthropic API key (required for citation validation)
  - OpenAI API key (optional, for GPT models)
  - Google Gemini API key (optional, for Gemini models)
  - Grok API key (optional, for xAI Grok models)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd LitAI
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   Create a `.env` file in the root directory:
   ```env
   # Database
   DATABASE_URL="postgresql://user:password@host:port/database"
   DIRECT_URL="postgresql://user:password@host:port/database"
   
   # NextAuth
   NEXTAUTH_SECRET="generate-with-openssl-rand-base64-32"
   NEXTAUTH_URL="http://localhost:3000"
   
   # Storage
   BLOB_READ_WRITE_TOKEN="your-vercel-blob-token"
   
   # AI API Keys
   ANTHROPIC_API_KEY="your-anthropic-key"  # Required
   OPENAI_API_KEY="your-openai-key"        # Optional
   GEMINI_API_KEY="your-gemini-key"        # Optional
   GROK_API_KEY="your-grok-key"            # Optional
   ```

4. **Set up the database**
   ```bash
   # Generate Prisma Client
   npm run db:generate
   
   # Push schema to database
   npm run db:push
   
   # Or run migrations
   npm run db:migrate
   ```

5. **Run the development server**
   ```bash
   npm run dev
   ```

6. **Open the application**
   
   Navigate to [http://localhost:3000](http://localhost:3000)

### Database Seeding (Optional)

```bash
npm run db:seed
```

---

## Core Workflow

### Step-by-Step Process

1. **Upload File** (`/citation-checker`)
   - User uploads Word document (.doc, .docx)
   - File stored in Vercel Blob Storage
   - `FileUpload` and `CitationCheck` records created

2. **Generate JSON** (`/citation-checker/[fileId]/generate-json`)
   - Document parsed using Mammoth
   - Converted to structured JSON format (see `citationjson.md`)
   - JSON stored in `CitationCheck.jsonData`

3. **Identify Citations** (`/citation-checker/[fileId]/identify-citations`)
   - Two methods available:
     - **Custom**: Regex-based pattern matching
     - **Eyecite**: Library-based citation extraction
   - Citations extracted and added to JSON structure
   - Citation markers inserted into document text

4. **Validate Citations** (`/citation-checker/[fileId]/validate-citations`)
   - Queue-based validation system
   - Each citation processed through three-tier validation
   - Progress tracked via `ValidationJob` and `ValidationQueueItem`

5. **Review Discrepancies** (`/citation-checker/[fileId]/review-discrepancies`)
   - User reviews flagged citations
   - Detailed analysis from Tier 3 available

6. **Citations Report** (`/citation-checker/[fileId]/report`)
   - Final validation report
   - Summary statistics
   - Export capabilities

### Workflow Component

The main workflow is managed by `CitationCheckerWorkflow.tsx`, which provides:
- Step-by-step navigation
- Progress tracking
- State management
- Context panels for debugging

---

## Three-Tier Validation System

### Tier 1: Structure Validation (Programmatic)

**Purpose**: Determine if text is actually a citation format.

**Approach**: Rule-based pattern matching (no AI)
- Regex patterns for citation formats
- Case law: `"Party v. Party, Volume Reporter Page (Court Year)"`
- Statutes: `"Title Code § Section"`
- Regulations: CFR/state regulation patterns
- Secondary sources: `"Author, Title (Publisher Year)"`
- Validates against known reporter abbreviations and court codes

**Output**: Binary gate (citation / not citation)

**Cost**: $0 (pure code)

**Implementation**: `lib/citation-identification/patterns.ts`, `lib/citation-identification/validators.ts`

### Tier 2: Consensus Validation (Fast, Cost-Efficient)

**Purpose**: Does this citation look valid? Fast, cheap validation using multiple AI agents.

**Approach**: Five independent LLM evaluations per citation
- **Citation Authority Validator**: Validates citation format and authority
- **Case Ecology Validator**: Checks court/year/reporter combination validity
- **Temporal Reality Validator**: Flags temporal inconsistencies (too new, too old)
- **Legal Knowledge Validator**: Applies general legal knowledge
- **Reality Assessment Expert**: Broad synthesis and reality check

**Model**: Claude Haiku 4.5 (fast, cost-efficient)

**Voting Logic**:
- **Numeric Scoring** (new format): Scores 1-10, average calculated
  - Average ≥ 8.0: `CITATION_LIKELY_VALID`
  - Average 5.0-7.9: `CITATION_UNCERTAIN`
  - Average < 5.0: `CITATION_LIKELY_HALLUCINATED`
- **Verdict-Based** (legacy): VALID/INVALID/UNCERTAIN votes
  - Unanimous VALID → passes
  - Split decision → escalate to Tier 3
  - Majority flag → escalate to Tier 3

**Escalation Criteria**:
- Standard deviation > 2.0 (high variance)
- Average score < 6.0
- Confidence score < 0.8

**Output**: Panel evaluations, consensus verdict, confidence score

**Cost**: ~$0.001-0.005 per citation (5 agents × Haiku)

**Implementation**: `lib/citation-identification/validation.ts`

### Tier 3: Advanced Review (Deep Analysis)

**Purpose**: Explain what's wrong so the lawyer can judge.

**Approach**: Three-agent panel with deeper reasoning
- **Rigorous Legal Investigator**: Deep investigation of citation validity
- **Holistic Legal Analyst**: Comprehensive legal analysis
- **Pattern Recognition Expert**: Pattern-based anomaly detection

**Model**: Claude Sonnet 4.5 (most capable model)

**Risk Levels**:
- `LOW_RISK`: Citation appears valid
- `MODERATE_RISK`: Some concerns, may still be valid
- `NEEDS_ADDITIONAL_REVIEW`: Significant concerns requiring review

**Output**: Detailed analysis, risk assessment, recommendations

**Cost**: ~$0.01-0.05 per citation (only escalated citations)

**Implementation**: `lib/citation-identification/validation.ts` (Tier 3 functions)

### Heavy Analysis (Alternative Approach)

**Purpose**: Full-document analysis using heavy models (Claude Sonnet, GPT-4, Gemini Pro, Grok).

**Approach**: Single model analyzes entire document and all citations at once.

**Use Cases**:
- Comparative analysis across multiple runs
- Full-document context understanding
- Alternative validation approach

**Models Supported**:
- Anthropic: Claude Sonnet 4.5
- OpenAI: GPT-4o, GPT-5.1
- Google: Gemini 1.5 Pro, Gemini 3 Pro
- xAI: Grok 3 Fast

**Implementation**: `lib/citation-identification/heavy-analysis.ts`

---

## Features

### Core Features

- **Document Upload**: Word document (.doc, .docx) upload and storage
- **JSON Generation**: Structured document representation
- **Citation Identification**: 
  - Custom regex-based extraction
  - Eyecite library integration
- **Multi-Tier Validation**: Three-tier validation system
- **Queue-Based Processing**: Asynchronous validation with progress tracking
- **Heavy Analysis**: Full-document analysis with multiple model providers
- **Test Runs**: Comparative analysis across multiple validation runs
- **Validation Runs**: Track and compare validation history
- **Reports**: Comprehensive citation validation reports

### User Management

- **Authentication**: NextAuth.js with multiple providers
- **User Roles**: Admin and user roles
- **User Management**: Admin interface for user management

### Advanced Features

- **Token Tracking**: Detailed token usage and cost tracking
- **Retry Logic**: Automatic retry for failed validations
- **Context Extraction**: Document context extraction for citations
- **Citation Revalidation**: Individual citation revalidation
- **Comparison Tools**: Compare validation runs

---

## Database Schema

### Core Models

#### User
- User accounts with authentication
- Role-based access (user/admin)
- Relationships to file uploads and citation checks

#### FileUpload
- Uploaded documents
- Metadata (filename, size, MIME type)
- Blob Storage URL
- Relationships to citation checks

#### CitationCheck
- Main citation check record
- Version tracking
- Status tracking (uploaded → json_generated → citations_identified → citations_validated → ...)
- JSON data storage (JsonB)
- Relationships to file uploads and validation jobs

#### ValidationJob
- Validation job tracking
- Progress tracking (Tier 2 and Tier 3)
- Status (pending, processing, completed, failed)

#### ValidationQueueItem
- Individual citation validation tasks
- Queue-based processing
- Retry tracking
- Result storage

### Schema Location

See `prisma/schema.prisma` for complete schema definition.

---

## API Structure

### Citation Checker APIs

#### File Management
- `POST /api/citation-checker/files` - Upload file
- `GET /api/citation-checker/files` - List files
- `GET /api/citation-checker/files/[fileId]` - Get file details
- `DELETE /api/citation-checker/files/[fileId]` - Delete file
- `POST /api/citation-checker/files/[fileId]/generate-json` - Generate JSON

#### Citation Checks
- `GET /api/citation-checker/checks/[id]` - Get check details
- `POST /api/citation-checker/checks/[id]/identify-citations` - Identify citations (custom)
- `POST /api/citation-checker/checks/[id]/identify-citations-eyecite` - Identify citations (Eyecite)
- `POST /api/citation-checker/checks/[id]/validate-citations` - Start validation
- `GET /api/citation-checker/checks/[id]/validate-citations` - Get validation status

#### Citation Revalidation
- `POST /api/citation-checker/checks/[id]/citations/[citationId]/revalidate` - Revalidate single citation

#### Heavy Analysis
- `POST /api/citation-checker/files/[fileId]/heavy-analysis` - Run heavy analysis
- `GET /api/citation-checker/files/[fileId]/heavy-analysis-runs` - List runs
- `GET /api/citation-checker/files/[fileId]/heavy-analysis/[runId]` - Get run results
- `POST /api/citation-checker/files/[fileId]/heavy-analysis/compare` - Compare runs

#### Test Runs
- `POST /api/citation-checker/files/[fileId]/test-runs` - Create test run
- `GET /api/citation-checker/files/[fileId]/test-runs` - List test runs
- `GET /api/citation-checker/files/[fileId]/test-runs/[testRunId]` - Get test run results

#### Validation Runs
- `GET /api/citation-checker/files/[fileId]/validation-runs` - List validation runs

#### Queue Processing
- `POST /api/citation-checker/worker/process-queue` - Process queue items

### Admin APIs

- `GET /api/admin/users` - List users
- `POST /api/admin/users` - Create user
- `GET /api/admin/users/[id]` - Get user
- `PATCH /api/admin/users/[id]` - Update user
- `DELETE /api/admin/users/[id]` - Delete user

### Authentication

- `GET /api/auth/[...nextauth]` - NextAuth.js endpoints

---

## Development

### Project Structure

```
LitAI/
├── app/                          # Next.js App Router
│   ├── api/                      # API routes
│   │   ├── citation-checker/     # Citation checker APIs
│   │   ├── admin/                # Admin APIs
│   │   └── auth/                  # Authentication
│   ├── citation-checker/         # Citation checker pages
│   ├── admin/                    # Admin pages
│   └── dashboard/                # Dashboard pages
├── lib/                          # Library code
│   ├── citation-identification/  # Citation validation logic
│   │   ├── patterns.ts           # Citation pattern matching
│   │   ├── validation.ts         # Tier 2 & 3 validation
│   │   ├── heavy-analysis.ts     # Heavy model analysis
│   │   ├── queue.ts              # Queue management
│   │   ├── worker.ts             # Queue worker
│   │   └── ...                   # Other utilities
│   ├── document-parser/          # Document parsing
│   └── ...                       # Other utilities
├── components/                   # React components
├── types/                        # TypeScript types
├── prisma/                       # Database schema
└── test/                         # Test files
```

### Key Libraries

#### Citation Identification (`lib/citation-identification/`)

- **`index.ts`**: Main citation identification service
- **`patterns.ts`**: Regex patterns for citation matching
- **`validators.ts`**: Tier 1 validation logic
- **`validation.ts`**: Tier 2 and Tier 3 validation
- **`heavy-analysis.ts`**: Heavy model analysis
- **`queue.ts`**: Queue management and job creation
- **`worker.ts`**: Queue processing worker
- **`context-extractor.ts`**: Document context extraction
- **`response-parser.ts`**: AI response parsing
- **`validation-prompts.ts`**: Tier 2 validation prompts
- **`tier3-prompts.ts`**: Tier 3 validation prompts
- **`token-tracking.ts`**: Token usage and cost tracking
- **`model-pricing.ts`**: Model pricing information
- **`format-helpers.ts`**: Citation formatting utilities
- **`comparison.ts`**: Comparison utilities
- **`logger.ts`**: Logging utilities
- **`lookup-tables.ts`**: Citation lookup tables

### Development Commands

```bash
# Development
npm run dev              # Start dev server

# Database
npm run db:generate      # Generate Prisma Client
npm run db:push          # Push schema changes
npm run db:migrate       # Run migrations
npm run db:studio        # Open Prisma Studio
npm run db:seed          # Seed database

# Build
npm run build            # Build for production
npm run start            # Start production server
npm run lint             # Run ESLint
```

### Environment Variables

See [Getting Started](#getting-started) for required environment variables.

### Code Style

- TypeScript strict mode enabled
- ESLint with Next.js config
- Prettier (if configured)

---

## Deployment

### Vercel Deployment

This project is configured for Vercel deployment.

1. **Add environment variables in Vercel dashboard:**
   - `DATABASE_URL` - Neon database connection string
   - `DIRECT_URL` - Neon direct connection string
   - `NEXTAUTH_SECRET` - NextAuth secret
   - `NEXTAUTH_URL` - Production URL
   - `BLOB_READ_WRITE_TOKEN` - Vercel Blob Storage token
   - `ANTHROPIC_API_KEY` - Anthropic API key (required)
   - `OPENAI_API_KEY` - OpenAI API key (optional)
   - `GEMINI_API_KEY` - Google Gemini API key (optional)
   - `GROK_API_KEY` - xAI Grok API key (optional)
   - `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1` - Set to "1" to avoid Prisma checksum errors

2. **Database setup:**
   ```bash
   npm run db:push
   ```

3. **Build process:**
   - `postinstall` script automatically runs `prisma generate`
   - `build` script runs `prisma generate && next build`
   - Vercel build command includes checksum ignore flag

### Database Migrations

For production, use Prisma migrations:

```bash
npm run db:migrate
```

### Monitoring

- Monitor API usage and costs
- Track validation job completion rates
- Monitor queue processing times
- Watch for stuck validation jobs

---

## Additional Documentation

- **`goal.md`**: Product vision and architecture overview
- **`citationjson.md`**: JSON structure specification
- **`citationID.md`**: Citation identification details
- **`validationT2.md`**: Tier 2 validation specification
- **`tier3prompt.md`**: Tier 3 prompt details
- **`TOKEN_TRACKING.md`**: Token tracking documentation
- **`VALIDATION_ISSUES_RESEARCH.md`**: Known validation issues

---

## License

[Add your license here]

---

## Support

For issues, questions, or contributions, please [add your support channels here].
