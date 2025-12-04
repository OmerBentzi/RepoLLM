/**
 * Simple in-memory caching utilities for GitHub API responses
 * For local development only - no external dependencies
 */

// Simple in-memory cache
const cache = new Map<string, { data: any; expires: number }>();

// Cache TTLs (in milliseconds)
const TTL_FILE = 3600 * 1000; // 1 hour
const TTL_REPO = 900 * 1000; // 15 minutes
const TTL_PROFILE = 1800 * 1000; // 30 minutes

// Helper to clean expired entries
function cleanExpired() {
    const now = Date.now();
    for (const [key, value] of cache.entries()) {
        if (value.expires < now) {
            cache.delete(key);
        }
    }
}

/**
 * Cache file content with SHA-based key for auto-invalidation
 */
export async function cacheFile(
    owner: string,
    repo: string,
    path: string,
    sha: string,
    content: string
): Promise<void> {
    const key = `file:${owner}/${repo}:${path}:${sha}`;
    cache.set(key, { data: content, expires: Date.now() + TTL_FILE });
}

/**
 * Get cached file content by SHA
 * Returns null if not found
 */
export async function getCachedFile(
    owner: string,
    repo: string,
    path: string,
    sha: string
): Promise<string | null> {
    cleanExpired();
    const key = `file:${owner}/${repo}:${path}:${sha}`;
    const entry = cache.get(key);
    return entry ? entry.data : null;
}

/**
 * Cache repository metadata
 */
export async function cacheRepoMetadata(
    owner: string,
    repo: string,
    data: any,
    ttl: number = TTL_REPO
): Promise<void> {
    const key = `repo:${owner}/${repo}`;
    cache.set(key, { data, expires: Date.now() + ttl });
}

/**
 * Get cached repository metadata
 */
export async function getCachedRepoMetadata(
    owner: string,
    repo: string
): Promise<any | null> {
    cleanExpired();
    const key = `repo:${owner}/${repo}`;
    const entry = cache.get(key);
    return entry ? entry.data : null;
}

/**
 * Cache profile data
 */
export async function cacheProfileData(
    username: string,
    data: any,
    ttl: number = TTL_PROFILE
): Promise<void> {
    const key = `profile:${username}`;
    cache.set(key, { data, expires: Date.now() + ttl });
}

/**
 * Get cached profile data
 */
export async function getCachedProfileData(username: string): Promise<any | null> {
    cleanExpired();
    const key = `profile:${username}`;
    const entry = cache.get(key);
    return entry ? entry.data : null;
}

/**
 * Cache File Tree (Large object, important to cache)
 */
export async function cacheFileTree(
    owner: string,
    repo: string,
    branch: string,
    tree: any[]
): Promise<void> {
    const key = `tree:${owner}/${repo}:${branch}`;
    cache.set(key, { data: tree, expires: Date.now() + TTL_REPO });
}

export async function getCachedFileTree(
    owner: string,
    repo: string,
    branch: string
): Promise<any[] | null> {
    cleanExpired();
    const key = `tree:${owner}/${repo}:${branch}`;
    const entry = cache.get(key);
    return entry ? entry.data : null;
}

/**
 * Cache Query Selection (Smart Caching)
 * Maps a query to the files selected by AI
 */
export async function cacheQuerySelection(
    owner: string,
    repo: string,
    query: string,
    files: string[]
): Promise<void> {
    // Normalize query to lowercase and trim to increase hit rate
    const normalizedQuery = query.toLowerCase().trim();
    const key = `query:${owner}/${repo}:${normalizedQuery}`;
    // Cache for 24 hours - queries usually yield same files
    cache.set(key, { data: files, expires: Date.now() + 86400 * 1000 });
}

export async function getCachedQuerySelection(
    owner: string,
    repo: string,
    query: string
): Promise<string[] | null> {
    cleanExpired();
    const normalizedQuery = query.toLowerCase().trim();
    const key = `query:${owner}/${repo}:${normalizedQuery}`;
    const entry = cache.get(key);
    return entry ? entry.data : null;
}

/**
 * Clear all cache for a repository (useful for manual invalidation)
 */
export async function clearRepoCache(owner: string, repo: string): Promise<void> {
    const prefix = `*:${owner}/${repo}:*`;
    for (const key of cache.keys()) {
        if (key.includes(`${owner}/${repo}`)) {
            cache.delete(key);
        }
    }
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
    available: boolean;
    keys?: number;
}> {
    cleanExpired();
    return { available: true, keys: cache.size };
}
