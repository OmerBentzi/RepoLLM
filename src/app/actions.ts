"use server";

import { 
    cloneOrUpdateRepo, 
    parseGitHubUrl, 
    getLocalRepo, 
    getLocalRepoFileTree, 
    getLocalFileContent, 
    getLocalFileContentBatch,
    getLocalRepoReadme,
    type LocalRepo
} from "@/lib/local-repo";
// Profile functions disabled - using GitHub API would require token
// Keeping imports for compatibility but functions will throw errors
const getProfile = () => { throw new Error("Profile mode disabled"); };
const getProfileReadme = () => { throw new Error("Profile mode disabled"); };
const getUserRepos = () => { throw new Error("Profile mode disabled"); };
const getRepoReadme = () => { throw new Error("Profile mode disabled"); };
import { analyzeFileSelection, answerWithContext, answerWithContextStream } from "@/lib/open-ai";
import { enhancedFileSelection } from "@/lib/file-selection-enhanced";
import { scanFiles, getScanSummary, groupBySeverity, type SecurityFinding, type ScanSummary } from "@/lib/security-scanner";
import { analyzeCodeWithOpenAI } from "@/lib/llm-security";
import { countTokens } from "@/lib/tokens";
import type { StreamUpdate } from "@/lib/streaming-types";
import { normalizeContext, buildContextIndex, formatContextIndex, validateLineNumbers, type ContextIndex } from "@/lib/context-utils";
import { sanitizeUserInput, sanitizeFilePath, sanitizeRepoIdentifier } from "@/lib/security-utils";

export async function fetchGitHubData(input: string) {
    // SECURITY: Sanitize input before processing
    const sanitizedInput = sanitizeUserInput(input);
    
    // Input format: GitHub URL or "owner/repo"
    try {
        // Parse the input to get owner/repo
        const parsed = parseGitHubUrl(input); // Use original for URL parsing, sanitization is for AI prompts
        if (!parsed) {
            return { error: "Invalid GitHub URL or repository format. Use: https://github.com/owner/repo or owner/repo" };
        }

        const { owner, repo } = parsed;

        // Clone or update the repository locally
        try {
            await cloneOrUpdateRepo(input);
        } catch (cloneError: any) {
            // If clone partially succeeded (directory exists), continue
            const path = await import('path');
            const localPath = path.join((process as any).cwd(), '.repos', owner, repo);
            const fs = await import('fs/promises');
            try {
                await fs.access(localPath);
                // Directory exists, continue with partial clone
                console.warn('Using partial clone - some files may be missing due to Windows path length limits');
            } catch {
                // Directory doesn't exist, re-throw the error
                throw cloneError;
            }
        }

        // Get repository data from local filesystem
        let repoData;
        let tree;
        let hiddenFiles;
        
        try {
            repoData = await getLocalRepo(owner, repo);
        } catch (e: any) {
            console.error("Error getting local repo:", e);
            return { 
                error: `Failed to read repository metadata: ${e.message || 'Repository may not have been cloned successfully'}` 
            };
        }
        
        try {
            const fileTreeResult = await getLocalRepoFileTree(owner, repo);
            tree = fileTreeResult.tree;
            hiddenFiles = fileTreeResult.hiddenFiles;
        } catch (e: any) {
            console.error("Error getting file tree:", e);
            // If we have repo data but file tree fails, return partial data
            if (repoData) {
                console.warn("Returning partial data - file tree unavailable");
                return { 
                    type: "repo", 
                    data: repoData, 
                    fileTree: [], 
                    hiddenFiles: [],
                    warning: `File tree unavailable: ${e.message || 'Some files may not be accessible'}` 
                };
            }
            return { 
                error: `Failed to read repository file tree: ${e.message || 'Repository may not have been cloned successfully'}` 
            };
        }

        return { type: "repo", data: repoData, fileTree: tree, hiddenFiles };
    } catch (e: any) {
        console.error("Repo fetch error:", e);
        // Check if it's a partial clone issue
        if (e.message?.includes('Filename too long') || e.message?.includes('path length')) {
            return { 
                error: `Repository cloned but some files are missing due to Windows path length limits (260 chars). The app will work with available files. Error: ${e.message}` 
            };
        }
        // Ensure error message is serializable
        const errorMessage = e?.message || String(e) || 'Unknown error occurred';
        return { error: `Failed to load repository: ${errorMessage}` };
    }
}

export async function fetchProfile(username: string) {
    // Profile mode is disabled in local-only mode
    // Return null instead of throwing to avoid 500 errors
    return null;
}

export async function fetchProfileReadme(username: string) {
    throw new Error("Profile mode is not supported in local-only mode.");
}

export async function fetchUserRepos(username: string): Promise<any[]> {
    // Profile mode is disabled in local-only mode
    // Return empty array instead of throwing to avoid breaking the UI
    return [];
}

export async function fetchRepoDetails(owner: string, repo: string) {
    return await getLocalRepo(owner, repo);
}

export async function processChatQuery(
    query: string,
    repoContext: { owner: string; repo: string; filePaths: string[] },
    history: { role: "user" | "model"; content: string }[] = []
) {
    // Deprecated: Use analyzeRepoFiles + fetchRepoFiles + generateAnswer instead
    return { answer: "This function is deprecated. Please refresh the page.", relevantFiles: [] };
}

/**
 * Step 1: Analyze and select relevant files
 * This can be called first to show progress
 */
export async function analyzeRepoFiles(
    query: string,
    filePaths: string[],
    owner?: string,
    repo?: string
): Promise<{ relevantFiles: string[]; fileCount: number }> {
    // SECURITY: Sanitize query and identifiers
    const sanitizedQuery = sanitizeUserInput(query);
    const sanitizedOwner = owner ? sanitizeRepoIdentifier(owner) : owner;
    const sanitizedRepo = repo ? sanitizeRepoIdentifier(repo) : repo;
    
    // Sanitize file paths
    const sanitizedFilePaths = filePaths.map((p: string) => sanitizeFilePath(p)).filter((p: string) => p.length > 0);
    // Prune the tree to remove noise (images, locks, etc.)
    // This reduces token usage and improves AI focus
    const prunedTree = filePaths.filter(path =>
        !path.match(/\.(png|jpg|jpeg|gif|svg|ico|lock|pdf|zip|tar|gz|map)$/i) &&
        !path.includes('node_modules/') &&
        !path.includes('.git/')
    );

    // Try enhanced selection first (with semantic scoring and neighbor expansion)
    let relevantFiles: string[];
    try {
        relevantFiles = await enhancedFileSelection(query, prunedTree, owner, repo);
        console.log(' Enhanced file selection:', relevantFiles.length, 'files selected');
    } catch (e) {
        console.warn(' Enhanced selection failed, using fallback:', e);
        // Fallback to original method
        relevantFiles = await analyzeFileSelection(query, prunedTree, owner, repo);
    }
    
    return { relevantFiles, fileCount: relevantFiles.length };
}

/**
 * Step 2: Fetch selected files with progress
 */
export async function fetchRepoFiles(
    owner: string,
    repo: string,
    files: Array<{ path: string; sha?: string }>
): Promise<{ context: string; filesProcessed: number }> {
    const fileResults = await getLocalFileContentBatch(owner, repo, files);

    let context = "";
    let currentTokenCount = 0;
    // GPT-4o-mini supports 128K tokens, but we need to reserve space for:
    // - System prompt (~2K tokens)
    // - User question (~1K tokens)
    // - History (~5K tokens)
    // - Response buffer (~10K tokens)
    // So we limit context to ~110K tokens to be safe
    const MAX_CONTEXT_TOKENS = 110000;

    for (const { path, content } of fileResults) {
        if (content) {
            // Add line numbers to the content so AI can reference them
            const lines = content.split('\n');
            const numberedContent = lines.map((line, index) => {
                const lineNum = (index + 1).toString().padStart(4, ' ');
                return `${lineNum} | ${line}`;
            }).join('\n');
            
            const fileTokens = countTokens(numberedContent);

            if (currentTokenCount + fileTokens > MAX_CONTEXT_TOKENS) {
                context += `\n--- NOTE: Context truncated due to token limit (${MAX_CONTEXT_TOKENS} tokens) ---\n`;
                break;
            }

            context += `\n--- FILE: ${path} ---\n${numberedContent}\n`;
            currentTokenCount += fileTokens;
        }
    }

    if (!context) {
        context = "No specific files were selected.";
    }

    // Normalize context: remove empty lines, duplicates, ensure perfect format
    context = normalizeContext(context);

    return { context, filesProcessed: fileResults.filter(f => f.content).length };
}

/**
 * Step 3: Generate AI response (server action wrapper)
 */
export async function generateAnswer(
    query: string,
    context: string,
    repoDetails: { owner: string; repo: string },
    history: { role: "user" | "model"; content: string }[] = [],
    profileData?: any, // Optional profile data
    visitorId?: string,
    contextIndex?: ContextIndex // Optional context index for validation
): Promise<string> {
    // Track analytics
    try {
        // Skip tracking in development
        if ((process as any).env.NODE_ENV === 'development') {
            console.log(`[Analytics] Skipped (Development Mode)`);
        } else if (visitorId) {
            const headersList = await headers();
            const userAgent = headersList.get("user-agent") || "";
            const country = "Local";
            const isMobile = /mobile/i.test(userAgent);

            await trackEvent(visitorId, 'query', {
                country,
                device: isMobile ? 'mobile' : 'desktop',
                userAgent
            });
        }
    } catch (e) {
        console.error("Analytics tracking failed:", e);
    }

    return await answerWithContext(query, context, repoDetails, profileData, history, contextIndex);
}

import { headers } from "next/headers";
import { trackEvent } from "@/lib/analytics";

export async function processProfileQuery(
    query: string,
    profileContext: {
        username: string;
        profile: any; // Full GitHub profile object
        profileReadme: string | null;
        repoReadmes: { repo: string; content: string; updated_at: string; description: string | null; stars: number; forks: number }[]
    },
    visitorId?: string,
    history: { role: "user" | "model"; content: string }[] = []
) {
    // Track analytics
    try {
        // Skip tracking in development
        if ((process as any).env.NODE_ENV === 'development') {
            console.log(`[Analytics] Skipped (Development Mode)`);
        } else if (visitorId) {
            const headersList = await headers();
            const userAgent = headersList.get("user-agent") || "";
            const country = "Local";
            const isMobile = /mobile/i.test(userAgent);

            await trackEvent(visitorId, 'query', {
                country,
                device: isMobile ? 'mobile' : 'desktop',
                userAgent
            });
        }
    } catch (e) {
        console.error("Analytics tracking failed:", e);
    }

    // Build context from profile data, README and repo READMEs
    let context = "";

    // Add profile metadata first
    context += `\n--- GITHUB PROFILE METADATA ---\n`;
    context += `Username: ${profileContext.profile.login}\n`;
    context += `Name: ${profileContext.profile.name || 'N/A'}\n`;
    context += `Bio: ${profileContext.profile.bio || 'N/A'}\n`;
    context += `Location: ${profileContext.profile.location || 'N/A'}\n`;
    context += `Blog/Website: ${profileContext.profile.blog || 'N/A'}\n`;
    context += `Avatar URL: ${profileContext.profile.avatar_url}\n`;
    context += `Public Repos: ${profileContext.profile.public_repos}\n`;
    context += `Followers: ${profileContext.profile.followers}\n`;
    context += `Following: ${profileContext.profile.following}\n\n`;

    if (profileContext.profileReadme) {
        context += `\n--- ${profileContext.username}'S PROFILE README ---\n${profileContext.profileReadme}\n\n`;
    }

    // Add repo READMEs
    for (const readme of profileContext.repoReadmes) {
        let content = readme.content;
        // Lazy load if content is empty and repo is mentioned
        if (!content && query.toLowerCase().includes(readme.repo.toLowerCase())) {
            console.log(`Lazy loading README for ${readme.repo}`);
            // Try to get README from local repo if it exists
            try {
                const parsed = parseGitHubUrl(`https://github.com/${profileContext.username}/${readme.repo}`);
                if (parsed) {
                    await cloneOrUpdateRepo(`https://github.com/${profileContext.username}/${readme.repo}`);
                    content = await getLocalRepoReadme(parsed.owner, parsed.repo) || "";
                }
            } catch (e) {
                content = "";
            }
        }

        if (content) {
            context += `\n--- REPO: ${readme.repo} ---\nLast Updated: ${readme.updated_at}\nDescription: ${readme.description || 'N/A'}\nStars: ${readme.stars}\nForks: ${readme.forks}\n\nREADME Content:\n${content}\n\n`;
        } else {
            context += `\n--- REPO: ${readme.repo} ---\nLast Updated: ${readme.updated_at}\nDescription: ${readme.description || 'N/A'}\nStars: ${readme.stars}\nForks: ${readme.forks}\n(README not loaded - ask about this repo to see more details)\n\n`;
        }
    }

    if (!context) {
        context = `No profile README or repository READMEs found for ${profileContext.username}.`;
    }

    // Answer using profile context, passing profile data for developer cards
    const answer = await answerWithContext(
        query,
        context,
        { owner: profileContext.username, repo: "profile" },
        profileContext.profile, // Pass profile data
        history // Pass conversation history
    );
    return { answer };
}

/**
 * Streaming variant of processProfileQuery
 */
export async function* processProfileQueryStream(
    query: string,
    profileContext: {
        username: string;
        profile: any;
        profileReadme: string | null;
        repoReadmes: { repo: string; content: string; updated_at: string; description: string | null; stars: number; forks: number }[]
    }
): AsyncGenerator<StreamUpdate> {
    try {
        yield { type: "status", message: "Loading profile data...", progress: 20 };

        let context = "";
        context += `\n--- GITHUB PROFILE METADATA ---\n`;
        context += `Username: ${profileContext.profile.login}\n`;
        context += `Name: ${profileContext.profile.name || 'N/A'}\n`;
        context += `Bio: ${profileContext.profile.bio || 'N/A'}\n`;
        context += `Location: ${profileContext.profile.location || 'N/A'}\n`;
        context += `Blog/Website: ${profileContext.profile.blog || 'N/A'}\n`;
        context += `Avatar URL: ${profileContext.profile.avatar_url}\n`;
        context += `Public Repos: ${profileContext.profile.public_repos}\n`;
        context += `Followers: ${profileContext.profile.followers}\n`;
        context += `Following: ${profileContext.profile.following}\n\n`;

        if (profileContext.profileReadme) {
            context += `\n--- ${profileContext.username}'S PROFILE README ---\n${profileContext.profileReadme}\n\n`;
        }

        yield { type: "status", message: "Analyzing repositories...", progress: 50 };

        for (const readme of profileContext.repoReadmes) {
            let content = readme.content;
            // Lazy load if content is empty and repo is mentioned
            if (!content && query.toLowerCase().includes(readme.repo.toLowerCase())) {
                yield { type: "status", message: `Reading ${readme.repo}...`, progress: 60 };
                // Try to get README from local repo if it exists
            try {
                const parsed = parseGitHubUrl(`https://github.com/${profileContext.username}/${readme.repo}`);
                if (parsed) {
                    await cloneOrUpdateRepo(`https://github.com/${profileContext.username}/${readme.repo}`);
                    content = await getLocalRepoReadme(parsed.owner, parsed.repo) || "";
                }
            } catch (e) {
                content = "";
            }
            }

            if (content) {
                context += `\n--- REPO: ${readme.repo} ---\nLast Updated: ${readme.updated_at}\nDescription: ${readme.description || 'N/A'}\nStars: ${readme.stars}\nForks: ${readme.forks}\n\nREADME Content:\n${content}\n\n`;
            } else {
                context += `\n--- REPO: ${readme.repo} ---\nLast Updated: ${readme.updated_at}\nDescription: ${readme.description || 'N/A'}\nStars: ${readme.stars}\nForks: ${readme.forks}\n(README not loaded - ask about this repo to see more details)\n\n`;
            }
        }

        if (!context) {
            context = `No profile README or repository READMEs found for ${profileContext.username}.`;
        }

        yield { type: "status", message: "Thinking & Checking Real-time Data...", progress: 85 };
        // yield { type: "status", message: "Generating response...", progress: 90 }; // Removed to prevent overwriting the search status too quickly

        const stream = answerWithContextStream(
            query,
            context,
            { owner: profileContext.username, repo: "profile" },
            profileContext.profile
        );

        for await (const chunk of stream) {
            yield { type: "content", text: chunk, append: true };
        }

        yield { type: "complete", relevantFiles: [] };

    } catch (error: any) {
        console.error("Profile stream error:", error);
        yield { type: "error", message: error.message || "An error occurred" };
    }
}

/**
 * Analyze a code snippet directly for security vulnerabilities
 * Used when user provides code directly (not from repository)
 */
export async function analyzeCodeSnippet(
    codeSnippet: string,
    filename: string = "user-provided-code"
): Promise<{ findings: SecurityFinding[]; summary: ScanSummary; grouped: Record<string, SecurityFinding[]> }> {
    try {
        // Parse code snippet from user input
        // Format: "FILE: filename code here" or just "code here"
        const filesToAnalyze: Array<{ path: string; content: string }> = [];
        
        // Check if input contains "FILE:" pattern
        const fileMatch = codeSnippet.match(/FILE:\s*([^\s\n]+)\s*([\s\S]+)/);
        if (fileMatch) {
            const filePath = fileMatch[1].trim();
            const code = fileMatch[2].trim();
            filesToAnalyze.push({ path: filePath, content: code });
        } else {
            // No FILE: prefix, treat entire input as code
            filesToAnalyze.push({ path: filename, content: codeSnippet.trim() });
        }

        console.log('🔍 Analyzing code snippet:', filesToAnalyze);

        // AI-powered analysis FIRST (this is the primary method)
        let aiFindings: SecurityFinding[] = [];
        try {
            console.log('🤖 Calling AI security analysis...');
            aiFindings = await analyzeCodeWithOpenAI(filesToAnalyze);
            console.log('🤖 AI scan found', aiFindings.length, 'issues');
            
            // If AI found issues, use ONLY AI findings (more accurate)
            if (aiFindings.length > 0) {
                console.log(' Using AI findings only (more accurate than pattern matching)');
                const summary = getScanSummary(aiFindings);
                const grouped = groupBySeverity(aiFindings);
                return { findings: aiFindings, summary, grouped };
            }
        } catch (aiError) {
            console.error(' AI security analysis failed:', aiError);
            // Fall through to pattern-based scanning
        }

        // Pattern-based scanning (fallback only if AI fails or finds nothing)
        console.log('🔎 Falling back to pattern-based scanning...');
        const patternFindings = scanFiles(filesToAnalyze);
        console.log('🔎 Pattern-based scan found', patternFindings.length, 'issues');

        // Use pattern findings as fallback
        const allFindings = deduplicateFindings(patternFindings);
        const filteredFindings = allFindings.filter(f =>
            !f.confidence || f.confidence !== 'low'
        );

        const summary = getScanSummary(filteredFindings);
        const grouped = groupBySeverity(filteredFindings);

        return { findings: filteredFindings, summary, grouped };
    } catch (error: any) {
        console.error('Code snippet analysis error:', error);
        throw new Error(`Failed to analyze code snippet: ${error.message}`);
    }
}

/**
 * Scan repository for security vulnerabilities
 * Uses pattern-based detection + GPT-5 Instant AI analysis
 */
export async function scanRepositoryVulnerabilities(
    owner: string,
    repo: string,
    files: Array<{ path: string; sha?: string }>
): Promise<{ findings: SecurityFinding[]; summary: ScanSummary; grouped: Record<string, SecurityFinding[]> }> {
    try {
        // Select relevant files for security scanning (focus on code files)
        const codeFiles = files.filter(f =>
            /\.(js|jsx|ts|tsx|py|java|php|rb|go|rs)$/i.test(f.path) || f.path === 'package.json'
        ).slice(0, 20); // Limit to 20 files for performance

        console.log('🔍 Security Scan: Found', codeFiles.length, 'code files to scan');
        console.log('📁 Files to scan:', codeFiles.map(f => f.path));

        // Fetch file contents
        const filesWithContent: Array<{ path: string; content: string }> = [];
        for (const file of codeFiles) {
            try {
                const content = await getLocalFileContent(owner, repo, file.path);
                // Ensure content is a string (skip binary files)
                if (typeof content === 'string' && content.length > 0) {
                    filesWithContent.push({ path: file.path, content });
                    console.log(' Fetched:', file.path, `(${content.length} bytes)`);
                } else {
                    console.warn(` Skipping ${file.path}: content is not a string or is empty`);
                }
            } catch (e) {
                console.warn(` Failed to fetch ${file.path} for security scan:`, e);
            }
        }

        console.log('📄 Successfully fetched', filesWithContent.length, 'files for scanning');

        // Pattern-based scanning (fast, zero API costs)
        const patternFindings = scanFiles(filesWithContent);
        console.log('🔎 Pattern-based scan found', patternFindings.length, 'issues');

        // AI-powered analysis (more thorough, uses GPT-5 Instant)
        let aiFindings: SecurityFinding[] = [];
        try {
            aiFindings = await analyzeCodeWithOpenAI(filesWithContent);
            console.log('🤖 AI scan found', aiFindings.length, 'issues');
        } catch (aiError) {
            console.warn('AI security analysis failed, continuing with pattern-based results only:', aiError);
            // Continue with pattern findings only if AI fails
        }

        // Combine and deduplicate findings
        const allFindings = deduplicateFindings([...patternFindings, ...aiFindings]);
        console.log('🔗 Combined findings (before dedup):', patternFindings.length + aiFindings.length);
        console.log('🔗 After deduplication:', allFindings.length);

        // Filter by confidence (only show high/medium confidence)
        const filteredFindings = allFindings.filter(f =>
            !f.confidence || f.confidence !== 'low'
        );
        console.log('✨ After confidence filtering:', filteredFindings.length);
        console.log('📊 Final results:', filteredFindings);

        // Get summary and grouped results
        const summary = getScanSummary(filteredFindings);

        // Add debug info to summary
        summary.debug = {
            filesReceived: files.length,
            codeFilesFiltered: codeFiles.length,
            filesSuccessfullyFetched: filesWithContent.length,
            patternFindings: patternFindings.length,
            aiFindings: aiFindings.length,
            afterDedup: allFindings.length,
            afterConfidenceFilter: filteredFindings.length
        };

        const grouped = groupBySeverity(filteredFindings);

        return { findings: filteredFindings, summary, grouped };
    } catch (error: any) {
        console.error('Vulnerability scanning error:', error);
        // Provide more detailed error message
        const errorMessage = error?.message || 'Unknown error occurred';
        throw new Error(`Failed to scan repository for vulnerabilities: ${errorMessage}`);
    }
}

/**
 * Deduplicate findings based on file, line, and title
 */
function deduplicateFindings(findings: SecurityFinding[]): SecurityFinding[] {
    const seen = new Set<string>();
    return findings.filter(f => {
        const key = `${f.file}:${f.line || 0}:${f.title}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// --- Final Phase Actions ---

export async function getFilePreview(owner: string, repo: string, filePath: string): Promise<{ content: string; size: number } | { error: string }> {
    try {
        const content = await getLocalFileContent(owner, repo, filePath);
        const fs = await import('fs/promises');
        const path = await import('path');
        const fullPath = path.join((process as any).cwd(), '.repos', owner, repo, filePath);
        const stats = await fs.stat(fullPath);
        return { content, size: stats.size };
    } catch (error: any) {
        return { error: error.message || 'Failed to read file' };
    }
}

