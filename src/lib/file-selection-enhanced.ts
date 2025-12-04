/**
 * Enhanced file selection with semantic scoring and neighbor expansion
 * Future: Add OpenAI embeddings for better semantic matching
 */

export interface FileWithScore {
  path: string;
  score: number;
  reason: string;
}

/**
 * Classify question type to improve file selection
 */
export async function classifyQuestion(question: string): Promise<{
  type: 'code-location' | 'explanation' | 'flow' | 'architecture' | 'bug-analysis' | 'improvement' | 'documentation' | 'general';
  keywords: string[];
}> {
  const questionLower = question.toLowerCase();
  
  // Code location patterns
  if (questionLower.match(/(where|find|locate|which file|what file|show me).*(function|class|method|code|implementation)/i)) {
    return { type: 'code-location', keywords: extractKeywords(question) };
  }
  
  // Architecture patterns (specific to architecture questions)
  if (questionLower.match(/(architecture|architectural|system design|design pattern|layers|components|structure)/i)) {
    return { type: 'architecture', keywords: extractKeywords(question) };
  }
  
  // Flow/process patterns
  if (questionLower.match(/(how.*work|flow|process|sequence|pipeline)/i)) {
    return { type: 'flow', keywords: extractKeywords(question) };
  }
  
  // Bug analysis patterns
  if (questionLower.match(/(bug|error|issue|problem|fix|broken|wrong|why.*not|why.*fail)/i)) {
    return { type: 'bug-analysis', keywords: extractKeywords(question) };
  }
  
  // Improvement patterns
  if (questionLower.match(/(improve|better|optimize|refactor|enhance|suggest)/i)) {
    return { type: 'improvement', keywords: extractKeywords(question) };
  }
  
  // Documentation patterns
  if (questionLower.match(/(readme|document|doc|explain|describe|what is|tell me about)/i)) {
    return { type: 'documentation', keywords: extractKeywords(question) };
  }
  
  // Explanation patterns
  if (questionLower.match(/(explain|how|what does|why|meaning|purpose)/i)) {
    return { type: 'explanation', keywords: extractKeywords(question) };
  }
  
  return { type: 'general', keywords: extractKeywords(question) };
}

function extractKeywords(question: string): string[] {
  // Extract important words (skip common words)
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who', 'where', 'when', 'why', 'how', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'about', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'up', 'down', 'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once']);
  
  const words = question.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
  
  return [...new Set(words)].slice(0, 10);
}

/**
 * Enhanced file selection with semantic scoring
 */
export async function selectFilesWithScoring(
  question: string,
  fileTree: string[],
  questionType: ReturnType<typeof classifyQuestion> extends Promise<infer T> ? T : never
): Promise<FileWithScore[]> {
  const keywords = questionType.keywords;
  const scores: FileWithScore[] = [];
  
  for (const filePath of fileTree) {
    let score = 0;
    const reasons: string[] = [];
    
    // 1. Exact filename match (high score)
    const filename = filePath.split('/').pop()?.toLowerCase() || '';
    if (question.toLowerCase().includes(filename)) {
      score += 50;
      reasons.push('exact filename match');
    }
    
    // 2. Keyword matching in path
    const pathLower = filePath.toLowerCase();
    for (const keyword of keywords) {
      if (pathLower.includes(keyword)) {
        score += 20;
        reasons.push(`keyword "${keyword}" in path`);
      }
    }
    
    // 3. File type relevance based on question type
    if (questionType.type === 'code-location' || questionType.type === 'explanation') {
      if (/\.(ts|tsx|js|jsx|py|java|go|rs|rb)$/.test(filePath)) {
        score += 15;
        reasons.push('code file for code-location question');
      }
    }
    
    if (questionType.type === 'flow' || questionType.type === 'architecture') {
      if (/\.(ts|tsx|js|jsx|py)$/.test(filePath) && (pathLower.includes('route') || pathLower.includes('api') || pathLower.includes('controller'))) {
        score += 25;
        reasons.push('route/api file for flow question');
      }
    }
    
    if (questionType.type === 'documentation') {
      if (/\.(md|txt|rst)$/i.test(filePath) || filename === 'readme.md') {
        score += 30;
        reasons.push('documentation file');
      }
    }
    
    // 4. Common important files
    if (['package.json', 'package-lock.json', 'requirements.txt', 'pom.xml', 'cargo.toml'].includes(filename)) {
      score += 10;
      reasons.push('dependency file');
    }
    
    if (filename === 'readme.md' || filename === 'readme.txt') {
      score += 15;
      reasons.push('readme file');
    }
    
    // 5. Config files for setup questions
    if (questionType.type === 'explanation' && /\.(json|yaml|yml|toml|ini|conf)$/i.test(filePath)) {
      score += 5;
      reasons.push('config file');
    }
    
    if (score > 0) {
      scores.push({
        path: filePath,
        score,
        reason: reasons.join(', ')
      });
    }
  }
  
  // Sort by score and return top files
  return scores.sort((a, b) => b.score - a.score).slice(0, 30);
}

/**
 * Expand selection with neighbors (sibling files, importers)
 */
export function expandWithNeighbors(
  selectedFiles: string[],
  fileTree: string[]
): string[] {
  const expanded = new Set<string>(selectedFiles);
  
  for (const filePath of selectedFiles) {
    // Add sibling files (same directory)
    const dir = filePath.substring(0, filePath.lastIndexOf('/'));
    if (dir) {
      const siblings = fileTree.filter(f => 
        f.startsWith(dir + '/') && 
        f !== filePath &&
        !expanded.has(f)
      );
      siblings.slice(0, 3).forEach(f => expanded.add(f));
    }
    
    // Add parent directory files (if it's a nested file)
    const parts = filePath.split('/');
    if (parts.length > 2) {
      const parentDir = parts.slice(0, -2).join('/');
      const parentFiles = fileTree.filter(f => 
        f.startsWith(parentDir + '/') &&
        f !== filePath &&
        !expanded.has(f) &&
        /\.(ts|tsx|js|jsx|py)$/.test(f)
      );
      parentFiles.slice(0, 2).forEach(f => expanded.add(f));
    }
  }
  
  return Array.from(expanded);
}

/**
 * Enhanced file selection with all improvements
 */
export async function enhancedFileSelection(
  question: string,
  fileTree: string[],
  owner?: string,
  repo?: string
): Promise<string[]> {
  // 1. Classify question
  const questionType = await classifyQuestion(question);
  console.log('📋 Question type:', questionType.type);
  
  // 2. Select files with scoring
  const scoredFiles = await selectFilesWithScoring(question, fileTree, questionType);
  console.log('📊 Top scored files:', scoredFiles.slice(0, 10).map(f => `${f.path} (${f.score})`));
  
  // 3. Take top files
  const topFiles = scoredFiles
    .filter(f => f.score >= 10) // Minimum threshold
    .slice(0, 20)
    .map(f => f.path);
  
  // 4. Expand with neighbors
  const expanded = expandWithNeighbors(topFiles, fileTree);
  
  // 5. Always include important files if not already included
  const importantFiles = ['README.md', 'package.json', 'tsconfig.json', 'requirements.txt'];
  for (const important of importantFiles) {
    const found = fileTree.find(f => f.endsWith(important));
    if (found && !expanded.includes(found)) {
      expanded.push(found);
    }
  }
  
  return expanded.slice(0, 30); // Max 30 files
}

