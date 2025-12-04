/**
 * Parse file references from AI response
 * Format: [file:path/to/file.ts:42] or [file:path/to/file.ts:42-50]
 */
export interface FileReference {
    filePath: string;
    startLine: number;
    endLine?: number;
    fullMatch: string;
}

export function parseFileReferences(content: string): FileReference[] {
    // Match [file:path:line] or [file:path:line-line] format
    // Also handle cases where the format might be slightly different
    // Support both [file:path:line] and `[file:path:line]` (with backticks)
    const regex = /(?:`)?\[file:([^\]:]+):(\d+)(?:-(\d+))?\](?:`)?/g;
    const references: FileReference[] = [];
    let match;

    while ((match = regex.exec(content)) !== null) {
        const filePath = match[1].trim();
        const startLine = parseInt(match[2], 10);
        const endLine = match[3] ? parseInt(match[3], 10) : undefined;
        
        // Only add if we have valid data
        if (filePath && !isNaN(startLine)) {
            references.push({
                filePath,
                startLine,
                endLine,
                fullMatch: match[0]
            });
        }
    }

    // Always log for debugging
    console.log('🔍 parseFileReferences:', {
        contentLength: content.length,
        hasFileKeyword: content.includes('[file:'),
        referencesFound: references.length,
        references: references.map(r => ({ filePath: r.filePath, startLine: r.startLine, endLine: r.endLine })),
        contentPreview: content.substring(0, 500)
    });

    if (content.includes('[file:') && references.length === 0) {
        // Found [file: but didn't parse - log for debugging
        const unparsed = content.match(/\[file:[^\]]+\]/g);
        if (unparsed) {
            console.warn(' Found file references but couldn\'t parse:', unparsed);
            console.warn(' Full matches:', content.match(/(?:`)?\[file:[^\]]+\](?:`)?/g));
        }
    }

    return references;
}

/**
 * Replace file references in content with clickable markdown links
 */
export function replaceFileReferencesWithLinks(content: string, repoOwner: string, repoName: string): string {
    const references = parseFileReferences(content);
    
    console.log('🔄 replaceFileReferencesWithLinks:', {
        contentLength: content.length,
        referencesFound: references.length,
        references: references.map(r => ({ filePath: r.filePath, startLine: r.startLine, endLine: r.endLine, fullMatch: r.fullMatch }))
    });
    
    let result = content;
    // Sort by position (reverse order) to avoid index shifting issues
    const sortedRefs = [...references].sort((a, b) => {
        const aIndex = content.indexOf(a.fullMatch);
        const bIndex = content.indexOf(b.fullMatch);
        return bIndex - aIndex; // Replace from end to start
    });
    
    for (const ref of sortedRefs) {
        const lineText = ref.endLine ? `${ref.startLine}-${ref.endLine}` : ref.startLine.toString();
        // Format: full file path - lines X or lines X-Y
        const linesLabel = ref.endLine ? `lines ${lineText}` : `line ${lineText}`;
        const displayText = `**${ref.filePath}** - ${linesLabel}`;
        // Create a link that will trigger file preview
        const link = `[${displayText}](#preview-${ref.filePath}:${ref.startLine}${ref.endLine ? `-${ref.endLine}` : ''})`;
        console.log('🔗 Replacing:', { from: ref.fullMatch, to: link });
        result = result.replace(ref.fullMatch, link);
    }
    
    console.log(' Final result preview:', result.substring(0, 500));
    
    return result;
}

/**
 * Extract unique file references from content
 */
export function getUniqueFileReferences(content: string): Map<string, FileReference[]> {
    const references = parseFileReferences(content);
    const fileMap = new Map<string, FileReference[]>();
    
    for (const ref of references) {
        const existing = fileMap.get(ref.filePath) || [];
        existing.push(ref);
        fileMap.set(ref.filePath, existing);
    }
    
    return fileMap;
}

