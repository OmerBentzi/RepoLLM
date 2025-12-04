import { simpleGit, SimpleGit } from 'simple-git';
import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';

/**
 * Local repository management - clones GitHub repos and reads from local filesystem
 * No GitHub API required!
 */

const REPOS_DIR = path.join((process as any).cwd(), '.repos');

// Ensure repos directory exists
async function ensureReposDir() {
  try {
    await fs.mkdir(REPOS_DIR, { recursive: true });
  } catch (error) {
    console.error('Failed to create repos directory:', error);
  }
}

/**
 * Parse GitHub URL to extract owner and repo
 * Supports: https://github.com/owner/repo, github.com/owner/repo, owner/repo
 */
export function parseGitHubUrl(urlOrPath: string): { owner: string; repo: string; url: string } | null {
  // Remove trailing .git if present
  let input = urlOrPath.trim().replace(/\.git$/, '');
  
  // If it's already owner/repo format
  if (!input.includes('://') && !input.includes('github.com')) {
    const parts = input.split('/');
    if (parts.length === 2) {
      return {
        owner: parts[0],
        repo: parts[1],
        url: `https://github.com/${parts[0]}/${parts[1]}.git`
      };
    }
    return null;
  }

  // Parse GitHub URL
  const githubMatch = input.match(/github\.com[/:]([^/]+)\/([^/]+)/);
  if (githubMatch) {
    return {
      owner: githubMatch[1],
      repo: githubMatch[2],
      url: `https://github.com/${githubMatch[1]}/${githubMatch[2]}.git`
    };
  }

  return null;
}

/**
 * Get local repository path
 */
function getRepoPath(owner: string, repo: string): string {
  return path.join(REPOS_DIR, owner, repo);
}

/**
 * Configure git for Windows long path support
 */
async function configureGitLongPaths(git: any) {
  try {
    await git.addConfig('core.longpaths', 'true', false, 'local');
    console.log('Configured git for long paths support');
  } catch (error) {
    // Ignore if config already exists or fails
    console.warn('Could not set git long paths config:', error);
  }
}

/**
 * Clone or update a repository
 */
export async function cloneOrUpdateRepo(githubUrl: string): Promise<{ owner: string; repo: string; localPath: string }> {
  await ensureReposDir();
  
  const parsed = parseGitHubUrl(githubUrl);
  if (!parsed) {
    throw new Error(`Invalid GitHub URL: ${githubUrl}`);
  }

  const { owner, repo, url } = parsed;
  const localPath = getRepoPath(owner, repo);

  // Check if repo already exists
  if (existsSync(localPath)) {
    console.log(`Repository ${owner}/${repo} already cloned, updating...`);
    try {
      const git = simpleGit(localPath);
      await configureGitLongPaths(git);
      await git.pull();
      return { owner, repo, localPath };
    } catch (error) {
      console.warn('Failed to pull, cloning fresh:', error);
      // Remove and re-clone if pull fails
      await fs.rm(localPath, { recursive: true, force: true });
    }
  }

  // Clone the repository
  console.log(`Cloning ${owner}/${repo} from ${url}...`);
  const git = simpleGit(REPOS_DIR);
  
  // Configure long paths globally for this git instance
  try {
    await git.addConfig('core.longpaths', 'true', false, 'global');
  } catch (e) {
    // Ignore if already set or fails
  }
  
  try {
    // Clone the repository
    await git.clone(url, path.join(owner, repo));
    
    // After clone, configure long paths in the cloned repo and try to restore files
    if (existsSync(localPath)) {
      const repoGit = simpleGit(localPath);
      try {
        await repoGit.addConfig('core.longpaths', 'true', false, 'local');
        // Try to restore files that may have failed to checkout
        await repoGit.raw(['restore', '--source=HEAD', ':/']);
        console.log('Restored files after clone');
      } catch (restoreError: any) {
        // Check if we have files despite restore failure
        const files = await fs.readdir(localPath);
        if (files.length > 0) {
          console.warn(`Partial clone: Some files may be missing due to Windows path length limits. ${files.length} items found.`);
          // Continue with partial clone
        } else {
          throw new Error('Clone succeeded but no files were checked out. This may be due to Windows path length limits.');
        }
      }
    }
    
    console.log(`Successfully cloned ${owner}/${repo}`);
    return { owner, repo, localPath };
  } catch (error: any) {
    // Check if clone partially succeeded (directory exists)
    if (existsSync(localPath)) {
      const files = await fs.readdir(localPath);
      if (files.length > 0) {
        console.warn(`Partial clone detected: ${files.length} items available. Some files may be missing due to Windows path length limits.`);
        // Try to configure and restore
        try {
          const repoGit = simpleGit(localPath);
          await repoGit.addConfig('core.longpaths', 'true', false, 'local');
          await repoGit.raw(['restore', '--source=HEAD', ':/']);
        } catch (e) {
          // Ignore - continue with partial clone
        }
        // Return partial clone - better than nothing
        return { owner, repo, localPath };
      }
    }
    
    if (error.message?.includes('already exists')) {
      // Repo exists, just return the path
      return { owner, repo, localPath };
    }
    
    // Check if it's a checkout failure but clone succeeded
    const errorMsg = error.message || '';
    if (errorMsg.includes('checkout') || errorMsg.includes('Filename too long') || errorMsg.includes('unable to checkout')) {
      if (existsSync(localPath)) {
        console.warn('Clone succeeded but checkout failed. Attempting to work with partial clone...');
        // Try to restore what we can
        try {
          const repoGit = simpleGit(localPath);
          await repoGit.addConfig('core.longpaths', 'true', false, 'local');
          await repoGit.raw(['restore', '--source=HEAD', ':/']);
        } catch (e) {
          // Ignore restore errors, continue with partial clone
          console.warn('Could not restore all files, continuing with partial clone');
        }
        return { owner, repo, localPath };
      }
    }
    
    throw new Error(`Failed to clone repository: ${error.message}`);
  }
}

/**
 * Get repository metadata from local filesystem
 */
export interface LocalRepo {
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  language: string | null;
  forks_count: number;
  open_issues_count: number;
  default_branch: string;
  owner: {
    login: string;
  };
  updated_at: string;
}

export async function getLocalRepo(owner: string, repo: string): Promise<LocalRepo> {
  const localPath = getRepoPath(owner, repo);
  
  if (!existsSync(localPath)) {
    throw new Error(`Repository ${owner}/${repo} not found locally. Please clone it first.`);
  }

  // Read package.json or other files to get metadata
  let description: string | null = null;
  let language: string | null = null;
  
  try {
    const packageJsonPath = path.join(localPath, 'package.json');
    if (existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
      description = packageJson.description || null;
    }
  } catch (e) {
    // Ignore
  }

  // Try to detect language from files
  try {
    const files = await fs.readdir(localPath);
    const extensions = new Set<string>();
    for (const file of files) {
      const ext = path.extname(file);
      if (ext) extensions.add(ext);
    }
    // Simple language detection
    if (extensions.has('.ts') || extensions.has('.tsx')) language = 'TypeScript';
    else if (extensions.has('.js') || extensions.has('.jsx')) language = 'JavaScript';
    else if (extensions.has('.py')) language = 'Python';
    else if (extensions.has('.java')) language = 'Java';
    else if (extensions.has('.go')) language = 'Go';
    else if (extensions.has('.rs')) language = 'Rust';
  } catch (e) {
    // Ignore
  }

  // Get last modified time
  const stats = await fs.stat(localPath);
  const updated_at = stats.mtime.toISOString();

  // Get default branch (try to read from .git/HEAD or default to 'main')
  let default_branch = 'main';
  try {
    const gitHeadPath = path.join(localPath, '.git', 'HEAD');
    if (existsSync(gitHeadPath)) {
      const headContent = await fs.readFile(gitHeadPath, 'utf-8');
      const branchMatch = headContent.match(/ref: refs\/heads\/(.+)/);
      if (branchMatch) {
        default_branch = branchMatch[1];
      }
    }
  } catch (e) {
    // Default to 'main'
  }

  return {
    name: repo,
    full_name: `${owner}/${repo}`,
    description,
    html_url: `https://github.com/${owner}/${repo}`,
    stargazers_count: 0,
    language,
    forks_count: 0,
    open_issues_count: 0,
    default_branch,
    owner: {
      login: owner,
    },
    updated_at,
  };
}

/**
 * File node interface matching GitHub API format
 */
export interface FileNode {
  path: string;
  mode: string;
  type: "blob" | "tree";
  sha: string;
  size?: number;
  url: string;
}

/**
 * Recursively build file tree from local filesystem
 */
async function buildFileTree(dirPath: string, repoPath: string, basePath: string = ''): Promise<FileNode[]> {
  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    // Directory might not be accessible (Windows long path issue)
    console.warn(`Could not read directory ${dirPath}:`, error);
    return [];
  }

  const nodes: FileNode[] = [];

  for (const entry of entries) {
    // Skip .git directory and other hidden/system files
    if (entry.name.startsWith('.') && entry.name !== '.env' && entry.name !== '.gitignore') {
      continue;
    }

    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.join(basePath, entry.name).replace(/\\/g, '/');
    
    try {
      const stats = await fs.stat(fullPath);

      if (entry.isDirectory()) {
        nodes.push({
          path: relativePath,
          mode: '040000',
          type: 'tree',
          sha: '', // Not needed for local
          size: 0,
          url: '',
        });

        // Recursively get children
        const children = await buildFileTree(fullPath, repoPath, relativePath);
        nodes.push(...children);
      } else {
        nodes.push({
          path: relativePath,
          mode: '100644',
          type: 'blob',
          sha: '', // Not needed for local
          size: stats.size,
          url: '',
        });
      }
    } catch (error) {
      // Skip files/directories that can't be accessed (Windows long path issue)
      console.warn(`Skipping ${relativePath}:`, error);
      continue;
    }
  }

  return nodes;
}

/**
 * Get file tree from local repository
 */
export async function getLocalRepoFileTree(
  owner: string,
  repo: string
): Promise<{ tree: FileNode[]; hiddenFiles: { path: string; reason: string }[] }> {
  const localPath = getRepoPath(owner, repo);
  
  if (!existsSync(localPath)) {
    throw new Error(`Repository ${owner}/${repo} not found locally`);
  }

  const tree = await buildFileTree(localPath, localPath);
  const hiddenFiles: { path: string; reason: string }[] = [];

  // Filter out common build/dependency directories
  const filteredTree = tree.filter(node => {
    const pathParts = node.path.split('/');
    
    // Skip node_modules, .next, dist, build, etc.
    if (pathParts.some(part => 
      part === 'node_modules' || 
      part === '.next' || 
      part === 'dist' || 
      part === 'build' ||
      part === '.git' ||
      part === 'coverage' ||
      part === '.cache'
    )) {
      if (node.type === 'tree') {
        hiddenFiles.push({ path: node.path, reason: 'Build/dependency directory' });
      }
      return false;
    }

    // Skip common build artifacts
    if (node.path.endsWith('.map') || 
        node.path.endsWith('.log') ||
        pathParts[pathParts.length - 1].startsWith('.')) {
      if (node.type === 'blob') {
        hiddenFiles.push({ path: node.path, reason: 'Build artifact or hidden file' });
      }
      return false;
    }

    return true;
  });

  return { tree: filteredTree, hiddenFiles };
}

/**
 * Read file content from local repository
 */
export async function getLocalFileContent(
  owner: string,
  repo: string,
  filePath: string
): Promise<string> {
  const localPath = getRepoPath(owner, repo);
  const fullPath = path.join(localPath, filePath);

  // Security: Ensure the path is within the repo directory
  const resolvedPath = path.resolve(fullPath);
  const resolvedRepoPath = path.resolve(localPath);
  
  if (!resolvedPath.startsWith(resolvedRepoPath)) {
    throw new Error('Invalid file path: outside repository directory');
  }

  if (!existsSync(fullPath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const stats = await fs.stat(fullPath);
  if (!stats.isFile()) {
    throw new Error(`Path is not a file: ${filePath}`);
  }

  try {
    return await fs.readFile(fullPath, 'utf-8');
  } catch (error: any) {
    // If file is binary or encoding fails, return empty or error
    if (error.code === 'EISDIR') {
      throw new Error(`Path is a directory: ${filePath}`);
    }
    throw new Error(`Failed to read file: ${error.message}`);
  }
}

/**
 * Batch read multiple files
 */
export async function getLocalFileContentBatch(
  owner: string,
  repo: string,
  files: Array<{ path: string }>
): Promise<Array<{ path: string; content: string | null }>> {
  const results = await Promise.allSettled(
    files.map(async (file) => {
      try {
        const content = await getLocalFileContent(owner, repo, file.path);
        return { path: file.path, content };
      } catch (error) {
        console.warn(`Failed to read ${file.path}:`, error);
        return { path: file.path, content: null };
      }
    })
  );

  return results.map((result) => 
    result.status === 'fulfilled' ? result.value : { path: files[results.indexOf(result)].path, content: null }
  );
}

/**
 * Read README from local repository
 */
export async function getLocalRepoReadme(owner: string, repo: string): Promise<string | null> {
  const readmeNames = ['README.md', 'README.txt', 'README', 'readme.md', 'Readme.md'];
  const localPath = getRepoPath(owner, repo);

  for (const readmeName of readmeNames) {
    const readmePath = path.join(localPath, readmeName);
    if (existsSync(readmePath)) {
      try {
        return await fs.readFile(readmePath, 'utf-8');
      } catch (error) {
        // Try next
        continue;
      }
    }
  }

  return null;
}

