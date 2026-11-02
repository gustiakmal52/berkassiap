export type OutputFormat = 'pdf' | 'original';

export interface Requirement {
  id: string;
  title: string;
  required: boolean;
  format: OutputFormat;
  maxSizeMB: number;
  outputName: string;
  maxPages?: number;
}

export interface ValidationIssue {
  code: string;
  message: string;
}

export interface PreparedDocument {
  requirementId: string;
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
  pageCount: number;
  sourceNames: string[];
  issues: ValidationIssue[];
}

export interface DocumentInput {
  requirement: Requirement;
  files: File[];
}

export interface PackageResult {
  documents: PreparedDocument[];
  issues: ValidationIssue[];
  ready: boolean;
}
