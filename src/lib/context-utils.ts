/**
 * Context normalization and validation utilities
 */

export interface FileInfo {
    path: string;
    startLine: number;
    endLine: number;
    lineCount: number;
}

export interface ContextIndex {
    [filePath: string]: FileInfo;
}

/**
 * Normalize context: remove empty lines, duplicates, ensure perfect format
 */
export function normalizeContext(context: string): string {
    if (!context) return "";
    
    const lines = context.split('\n');
    const normalized: string[] = [];
    let currentFile: string | null = null;
    const seenFiles = new Set<string>();
    let lastWasEmpty = false;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Check if this is a file header
        if (line.startsWith('--- FILE: ') && line.endsWith(' ---')) {
            const filePath = line.replace('--- FILE: ', '').replace(' ---', '').trim();
            
            // Skip duplicates
            if (seenFiles.has(filePath)) {
                // Skip until next file header
                currentFile = null;
                continue;
            }
            
            seenFiles.add(filePath);
            currentFile = filePath;
            normalized.push(line);
            lastWasEmpty = false;
            continue;
        }
        
        // Skip empty lines at the start or multiple consecutive empty lines
        if (line.trim() === '') {
            if (lastWasEmpty || normalized.length === 0) {
                continue;
            }
            lastWasEmpty = true;
        } else {
            lastWasEmpty = false;
        }
        
        // Only add lines if we're in a file context
        if (currentFile || line.includes('NOTE:') || line.includes('CONTEXT')) {
            normalized.push(line);
        }
    }
    
    // Remove trailing empty lines
    while (normalized.length > 0 && normalized[normalized.length - 1].trim() === '') {
        normalized.pop();
    }
    
    return normalized.join('\n');
}

/**
 * Build context index: extract file structure with line ranges
 */
export function buildContextIndex(context: string): ContextIndex {
    const index: ContextIndex = {};
    
    if (!context) return index;
    
    const lines = context.split('\n');
    let currentFile: string | null = null;
    let fileStartLine = 0;
    let fileLineCount = 0;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Check if this is a file header
        if (line.startsWith('--- FILE: ') && line.endsWith(' ---')) {
            // Save previous file if exists
            if (currentFile && fileLineCount > 0) {
                index[currentFile] = {
                    path: currentFile,
                    startLine: fileStartLine,
                    endLine: fileStartLine + fileLineCount - 1,
                    lineCount: fileLineCount
                };
            }
            
            // Start new file
            const filePath = line.replace('--- FILE: ', '').replace(' ---', '').trim();
            currentFile = filePath;
            fileStartLine = 1; // Files start at line 1
            fileLineCount = 0;
            continue;
        }
        
        // Count lines in file (skip file header and empty lines after header)
        if (currentFile && line.trim() !== '') {
            // Check if line has format "  42 | code" (numbered line)
            if (/^\s*\d+\s*\|/.test(line)) {
                fileLineCount++;
            }
        }
    }
    
    // Save last file
    if (currentFile && fileLineCount > 0) {
        index[currentFile] = {
            path: currentFile,
            startLine: 1,
            endLine: fileLineCount,
            lineCount: fileLineCount
        };
    }
    
    return index;
}

/**
 * Format context index for prompt
 */
export function formatContextIndex(index: ContextIndex): string {
    if (Object.keys(index).length === 0) {
        return "No files in context.";
    }
    
    const entries = Object.entries(index)
        .map(([path, info]) => `  - ${path}: lines ${info.startLine}-${info.endLine} (${info.lineCount} lines)`)
        .join('\n');
    
    return `Available files in context:\n${entries}`;
}

/**
 * Validate line numbers in answer against context
 */
export function validateLineNumbers(answer: string, contextIndex: ContextIndex): {
    valid: boolean;
    errors: string[];
} {
    const errors: string[] = [];
    
    // Extract all file references with line numbers
    const fileRefRegex = /\[file:([^\]:]+):(\d+)(?:-(\d+))?\]/g;
    let match;
    
    while ((match = fileRefRegex.exec(answer)) !== null) {
        const filePath = match[1].trim();
        const startLine = parseInt(match[2], 10);
        const endLine = match[3] ? parseInt(match[3], 10) : startLine;
        
        // Check if file exists in index
        if (!contextIndex[filePath]) {
            errors.push(`File "${filePath}" not found in context`);
            continue;
        }
        
        const fileInfo = contextIndex[filePath];
        
        // Check if line numbers are valid
        if (startLine < fileInfo.startLine || startLine > fileInfo.endLine) {
            errors.push(`Line ${startLine} in "${filePath}" is out of range (file has lines ${fileInfo.startLine}-${fileInfo.endLine})`);
        }
        
        if (endLine && (endLine < fileInfo.startLine || endLine > fileInfo.endLine)) {
            errors.push(`Line range ${startLine}-${endLine} in "${filePath}" is out of range (file has lines ${fileInfo.startLine}-${fileInfo.endLine})`);
        }
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Extract snippet with context (20-30 lines before/after)
 */
export function extractSnippetWithContext(
    context: string,
    filePath: string,
    targetLine: number,
    linesBefore: number = 25,
    linesAfter: number = 25
): string | null {
    if (!context) return null;
    
    const lines = context.split('\n');
    let inTargetFile = false;
    let currentLineNumber = 0;
    let fileStartIndex = -1;
    
    // Find the file and target line
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        if (line.startsWith('--- FILE: ') && line.endsWith(' ---')) {
            const path = line.replace('--- FILE: ', '').replace(' ---', '').trim();
            if (path === filePath) {
                inTargetFile = true;
                fileStartIndex = i + 1;
                currentLineNumber = 1;
                continue;
            } else {
                inTargetFile = false;
                currentLineNumber = 0;
            }
        }
        
        if (inTargetFile && /^\s*\d+\s*\|/.test(line)) {
            const lineMatch = line.match(/^\s*(\d+)\s*\|/);
            if (lineMatch) {
                const lineNum = parseInt(lineMatch[1], 10);
                if (lineNum === targetLine) {
                    // Found target line, extract snippet
                    const startIndex = Math.max(fileStartIndex, i - linesBefore);
                    const endIndex = Math.min(lines.length, i + linesAfter + 1);
                    return lines.slice(startIndex, endIndex).join('\n');
                }
            }
        }
    }
    
    return null;
}

