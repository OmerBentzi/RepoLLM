import { useState, useRef, useEffect, useMemo } from "react";
import { Send, Loader2, FileCode, ChevronRight, ArrowLeft, Sparkles, Github, Menu, MessageCircle, Shield, AlertTriangle, Download, CheckCircle, Info, Trash2 } from "lucide-react";
import { BotIcon } from "@/components/icons/BotIcon";
import { UserIcon } from "@/components/icons/UserIcon";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { analyzeRepoFiles, fetchRepoFiles, generateAnswer, scanRepositoryVulnerabilities, fetchProfile } from "@/app/actions";
import { sanitizeUserInput, validateInputSafety, sanitizeMarkdown } from "@/lib/security-utils";
import { cn } from "@/lib/utils";
import mermaid from "mermaid";
import html2canvas from "html2canvas-pro";
import { EnhancedMarkdown } from "./EnhancedMarkdown";
import { countMessageTokens, formatTokenCount, getTokenWarningLevel, isRateLimitError, getRateLimitErrorMessage, MAX_TOKENS } from "@/lib/tokens";
import { validateMermaidSyntax, sanitizeMermaidCode, getFallbackTemplate, generateMermaidFromJSON } from "@/lib/diagram-utils";
import { saveConversation, loadConversation, clearConversation } from "@/lib/storage";
import { ConfirmDialog } from "./ConfirmDialog";
import { CodeBlock } from "./CodeBlock";
import { ChatInput } from "./ChatInput";
import Link from "next/link";
import { StreamingProgress } from "./StreamingProgress";
import type { StreamUpdate } from "@/lib/streaming-types";

// Initialize mermaid
mermaid.initialize({
    startOnLoad: false,
    theme: 'base',
    securityLevel: 'strict', // Prevent XSS attacks by enabling HTML sanitization
    themeVariables: {
        primaryColor: '#18181b', // zinc-900
        primaryTextColor: '#e4e4e7', // zinc-200
        primaryBorderColor: '#3f3f46', // zinc-700
        lineColor: '#a1a1aa', // zinc-400
        secondaryColor: '#27272a', // zinc-800
        tertiaryColor: '#27272a', // zinc-800
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    }
});

import { Mermaid } from "./Mermaid";

// ... (imports remain the same, remove local Mermaid definition)

import { repairMarkdown } from "@/lib/markdown-utils";
import { parseFileReferences, getUniqueFileReferences, replaceFileReferencesWithLinks } from "@/lib/file-references";

// ... (imports)

// Extract MessageContent to a memoized component
const MessageContent = ({ content, messageId, repoOwner, repoName }: { content: string, messageId: string, repoOwner?: string, repoName?: string }) => {
    // SECURITY: Sanitize markdown content first
    const sanitizedContent = useMemo(() => sanitizeMarkdown(content), [content]);
    
    // Replace file references with clickable links before repairing markdown
    const contentWithLinks = useMemo(() => {
        if (repoOwner && repoName) {
            return replaceFileReferencesWithLinks(sanitizedContent, repoOwner, repoName);
        }
        return sanitizedContent;
    }, [sanitizedContent, repoOwner, repoName]);
    
    const repairedContent = useMemo(() => repairMarkdown(contentWithLinks), [contentWithLinks]);

    // Use a ref to allow recursive reference to components
    const componentsRef = useRef<any>(null);

    const components = useMemo(() => {
        const comps = {
            code: ({ className, children, ...props }: any) => {
                const match = /language-(\w+)/.exec(className || "");
                const isMermaid = match && match[1] === "mermaid";
                const isMermaidJson = match && match[1] === "mermaid-json";

                if (isMermaid) {
                    return <Mermaid key={messageId} chart={String(children).replace(/\n$/, "")} />;
                }

                if (isMermaidJson) {
                    try {
                        const jsonContent = String(children).replace(/\n$/, "");
                        const data = JSON.parse(jsonContent);
                        const chart = generateMermaidFromJSON(data);
                        return <Mermaid key={messageId} chart={chart} />;
                    } catch (e) {
                        return (
                            <div className="flex items-center gap-2 p-4 bg-zinc-900/50 rounded-lg border border-white/10">
                                <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                                <span className="text-zinc-400 text-sm">Generating diagram...</span>
                            </div>
                        );
                    }
                }

                return match ? (
                    <CodeBlock
                        language={match[1]}
                        value={String(children).replace(/\n$/, "")}
                        components={componentsRef.current}
                    />
                ) : (
                    <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-red-400 font-mono text-sm" {...props}>
                        {children}
                    </code>
                );
            },
            // Special handling for inline code that appears in file reference links
            strong: ({ children, ...props }: any) => {
                // Check if we're inside a file preview link (parent context)
                // For now, just render normally but we'll style it in the link component
                return <strong className="font-semibold text-purple-200" {...props}>{children}</strong>;
            },
            pre: ({ children }: any) => <>{children}</>,
            table: ({ children }: any) => (
                <div className="overflow-x-auto my-4">
                    <table className="min-w-full border-collapse border border-zinc-700">
                        {children}
                    </table>
                </div>
            ),
            thead: ({ children }: any) => (
                <thead className="bg-zinc-800">{children}</thead>
            ),
            tbody: ({ children }: any) => (
                <tbody className="bg-zinc-900/50">{children}</tbody>
            ),
            tr: ({ children }: any) => (
                <tr className="border-b border-zinc-700">{children}</tr>
            ),
            th: ({ children }: any) => (
                <th className="px-4 py-2 text-left text-sm font-semibold text-white border border-zinc-700">
                    {children}
                </th>
            ),
            td: ({ children }: any) => (
                <td className="px-4 py-2 text-sm text-zinc-300 border border-zinc-700">
                    {children}
                </td>
            ),
            a: ({ href, children, ...props }: any) => {
                // Handle file preview links
                if (href?.startsWith('#preview-')) {
                    const previewData = href.replace('#preview-', '');
                    const parts = previewData.split(':');
                    const filePath = parts[0];
                    const lineInfo = parts.slice(1).join(':');
                    
                    return (
                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                // Parse lineInfo to get highlighted lines
                                const lines: number[] = [];
                                if (lineInfo) {
                                    if (lineInfo.includes('-')) {
                                        const [start, end] = lineInfo.split('-').map(Number);
                                        for (let i = start; i <= end; i++) {
                                            lines.push(i);
                                        }
                                    } else {
                                        lines.push(Number(lineInfo));
                                    }
                                }
                                
                                // Dispatch event to open file preview
                                window.dispatchEvent(new CustomEvent('open-file-preview', { 
                                    detail: { filePath, lineInfo, highlightedLines: lines } 
                                }));
                            }}
                            className="text-purple-300 hover:text-purple-200 inline-flex items-center gap-2 cursor-pointer text-sm px-3 py-1.5 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 hover:border-purple-500/50 transition-all my-1.5 font-mono"
                            title={`Open ${filePath}${lineInfo ? ` at line ${lineInfo}` : ''}`}
                            {...props}
                        >
                            {children}
                        </button>
                    );
                }
                return <a href={href} {...props}>{children}</a>;
            },
        };
        componentsRef.current = comps;
        return comps;
    }, [messageId]);

    return (
        <EnhancedMarkdown
            content={repairedContent}
            components={components}
        />
    );
};

// ... (rest of the file)

// In the render loop:
// <div className="prose prose-invert prose-sm max-w-none leading-relaxed break-words overflow-hidden w-full min-w-0">
//     <MessageContent content={msg.content} messageId={msg.id} />
// </div>

const REPO_SUGGESTIONS = [
    "Show me the user flow chart",
    "Find security vulnerabilities",
    "Evaluate code quality",
    "What's the tech stack?",
    "Explain the architecture",
];

interface Vulnerability {
    title: string;
    severity: string;
    description: string;
    file: string;
    line?: number;
    recommendation: string;
}

interface Message {
    id: string;
    role: "user" | "model";
    content: string;
    relevantFiles?: string[];
    tokenCount?: number;
    vulnerabilities?: Vulnerability[];
}

interface ChatInterfaceProps {
    repoContext: { owner: string; repo: string; fileTree: any[] };
    onToggleSidebar?: () => void;
}

export function ChatInterface({ repoContext, onToggleSidebar }: ChatInterfaceProps) {
    const [messages, setMessages] = useState<Message[]>([
        {
            id: "welcome",
            role: "model",
            content: `Hello! I've analyzed **${repoContext.owner}/${repoContext.repo}**. Ask me anything about the code structure, dependencies, or specific features.`,
        },
    ]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(true);
    const [scanning, setScanning] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [initialized, setInitialized] = useState(false);
    const [showClearConfirm, setShowClearConfirm] = useState(false);

    // Streaming state
    const [streamingStatus, setStreamingStatus] = useState<{ message: string; progress: number } | null>(null);
    const [currentStreamingMessage, setCurrentStreamingMessage] = useState("");
    const [ownerProfile, setOwnerProfile] = useState<any>(null);

    // Fetch owner profile on mount (disabled in local-only mode)
    useEffect(() => {
        const loadProfile = async () => {
            try {
                const profile = await fetchProfile(repoContext.owner);
                // Profile mode disabled in local-only mode - returns null
                // Owner profile is not essential for repo analysis
                if (profile) {
                    setOwnerProfile(profile);
                }
            } catch (e) {
                // Silently ignore errors - profile is optional
                console.warn("Profile fetch failed (expected in local-only mode):", e);
            }
        };
        loadProfile();
    }, [repoContext.owner]);

    // Load conversation on mount
    const toastShownRef = useRef(false);
    useEffect(() => {
        const saved = loadConversation(repoContext.owner, repoContext.repo);
        if (saved && saved.length > 1) {
            setMessages(saved);
            setShowSuggestions(false);
            if (!toastShownRef.current) {
                toast.info('Conversation restored', { duration: 2000 });
                toastShownRef.current = true;
            }
        }
        setInitialized(true);
    }, [repoContext.owner, repoContext.repo]);

    // Save on every message change
    useEffect(() => {
        if (initialized && messages.length > 1) {
            saveConversation(repoContext.owner, repoContext.repo, messages);
        }
    }, [messages, initialized, repoContext.owner, repoContext.repo]);

    // Calculate total token count
    const totalTokens = useMemo(() => {
        return countMessageTokens(messages.map(m => ({ role: m.role, parts: m.content })));
    }, [messages]);

    const tokenWarningLevel = getTokenWarningLevel(totalTokens);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSuggestionClick = (suggestion: string) => {
        setInput(suggestion);
        setShowSuggestions(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || loading) return;

        // SECURITY: Validate and sanitize input
        const safetyCheck = validateInputSafety(input);
        if (!safetyCheck.safe) {
            console.warn(' Security warning:', safetyCheck.warnings);
            toast.warning("Input contains suspicious patterns", {
                description: "Your input has been sanitized for security.",
                duration: 3000,
            });
        }
        
        const sanitizedInput = sanitizeUserInput(input);
        
        if (!sanitizedInput.trim()) {
            toast.error("Invalid input", {
                description: "Please provide a valid question.",
                duration: 3000,
            });
            return;
        }

        // Check token limit
        if (totalTokens >= MAX_TOKENS) {
            toast.error("Conversation limit reached", {
                description: "Please clear the chat to start a new conversation.",
                duration: 5000,
            });
            return;
        }

        setShowSuggestions(false);

        const userMsg: Message = {
            id: Date.now().toString(),
            role: "user",
            content: sanitizedInput, // Use sanitized input
        };

        setMessages((prev) => [...prev, userMsg]);
        setInput("");
        setLoading(true);

        // Handle special commands (use sanitized input)
        // Detect security analysis requests
        const isSecurityRequest = 
            sanitizedInput.toLowerCase().includes("find security vulnerabilities") || 
            sanitizedInput.toLowerCase().includes("scan for vulnerabilities") ||
            sanitizedInput.toLowerCase().includes("analyze") && (
                sanitizedInput.toLowerCase().includes("innerhtml") ||
                sanitizedInput.toLowerCase().includes("xss") ||
                sanitizedInput.toLowerCase().includes("sql injection") ||
                sanitizedInput.toLowerCase().includes("security") ||
                sanitizedInput.toLowerCase().includes("vulnerability")
            );
        
        // Check if user provided code directly (with "FILE:" or code snippet)
        const hasDirectCode = /FILE:\s*\w+/.test(sanitizedInput) || 
                             (sanitizedInput.includes("innerHTML") || 
                              sanitizedInput.includes("req.query") || 
                              sanitizedInput.includes("req.body") ||
                              sanitizedInput.includes("req.params"));
        
        if (isSecurityRequest && hasDirectCode) {
            // User provided code directly - analyze it
            console.log('🎯 Direct code analysis triggered!');
            setScanning(true);
            try {
                setStreamingStatus({ message: "Analyzing code snippet...", progress: 50 });
                
                const { analyzeCodeSnippet } = await import("@/app/actions");
                const { findings, summary } = await analyzeCodeSnippet(sanitizedInput);
                
                console.log(' Code analysis complete! Findings:', findings.length);
                
                let content = '';
                if (summary.total === 0) {
                    content = `\`\`\`json\n{\n  "status": "no_vulnerabilities",\n  "tool_calls": []\n}\n\`\`\``;
                } else {
                    // Format as structured JSON-like output showing function calls
                    content = `\`\`\`json\n{\n  "status": "vulnerabilities_found",\n  "total": ${summary.total},\n  "severity_breakdown": {\n`;
                    if (summary.critical > 0) content += `    "critical": ${summary.critical},\n`;
                    if (summary.high > 0) content += `    "high": ${summary.high},\n`;
                    if (summary.medium > 0) content += `    "medium": ${summary.medium},\n`;
                    if (summary.low > 0) content += `    "low": ${summary.low}\n`;
                    content += `  },\n  "tool_calls": [\n`;
                    
                    findings.forEach((f, index) => {
                        const functionName = f.title.toLowerCase().includes('xss') ? 'report_xss' :
                                           f.title.toLowerCase().includes('sql') ? 'report_sql_injection' :
                                           f.title.toLowerCase().includes('injection') && !f.title.toLowerCase().includes('sql') ? 'report_injection' :
                                           f.title.toLowerCase().includes('auth') ? 'report_auth_issue' :
                                           f.title.toLowerCase().includes('crypto') ? 'report_crypto_issue' :
                                           'report_vulnerability';
                        
                        content += `    {\n`;
                        content += `      "function": "${functionName}",\n`;
                        content += `      "arguments": {\n`;
                        content += `        "file": "${f.file}",\n`;
                        if (f.line) content += `        "line": ${f.line},\n`;
                        content += `        "code_snippet": "${f.file}:${f.line || 1}",\n`;
                        content += `        "severity": "${f.severity}",\n`;
                        content += `        "explanation": "${f.description || 'Security vulnerability detected'}"\n`;
                        content += `      }\n`;
                        content += `    }${index < findings.length - 1 ? ',' : ''}\n`;
                    });
                    
                    content += `  ]\n}\n\`\`\``;
                }
                
                const modelMsg: Message = {
                    id: (Date.now() + 1).toString(),
                    role: "model",
                    content: content,
                    vulnerabilities: findings as any
                };
                setMessages((prev) => [...prev, modelMsg]);
                setStreamingStatus(null);
                setLoading(false);
                setScanning(false);
                return;
            } catch (error) {
                console.error("Code analysis failed:", error);
                toast.error("Code analysis failed", {
                    description: error instanceof Error ? error.message : "An error occurred"
                });
                setStreamingStatus(null);
                setScanning(false);
                setLoading(false);
                return;
            }
        }
        
        if (isSecurityRequest) {
            console.log('🎯 Security scan triggered!');
            setScanning(true);
            try {
                // Step 1: Start scan
                setStreamingStatus({ message: "Preparing security scan...", progress: 10 });

                const filesToScan = repoContext.fileTree.map((f: any) => ({ path: f.path, sha: f.sha }));
                console.log('📋 Total files in tree:', filesToScan.length);

                // Step 2: Show file count
                const codeFileCount = filesToScan.filter((f: any) =>
                    /\.(js|jsx|ts|tsx|py|java|php|rb|go|rs)$/i.test(f.path) || f.path === 'package.json'
                ).length;
                console.log('💻 Code files found:', codeFileCount);
                setStreamingStatus({ message: `Scanning ${Math.min(codeFileCount, 20)} code files...`, progress: 30 });

                // Step 3: Run scan
                setStreamingStatus({ message: "Running pattern-based analysis...", progress: 50 });
                console.log('🚀 Calling scanRepositoryVulnerabilities...');

                const { findings, summary } = await scanRepositoryVulnerabilities(
                    repoContext.owner,
                    repoContext.repo,
                    filesToScan
                );

                console.log(' Scan complete! Findings:', findings.length, 'Summary:', summary);
                console.log('📊 Debug Info:', summary.debug);

                // Step 4: Finalizing
                setStreamingStatus({ message: "Analyzing results...", progress: 90 });



                let content = '';

                if (summary.total === 0) {
                    // No vulnerabilities found
                    const filesScanned = summary.debug?.filesSuccessfullyFetched || 0;
                    content = `\`\`\`json\n{\n  "status": "scan_complete",\n  "files_scanned": ${filesScanned},\n  "vulnerabilities_found": 0,\n  "tool_calls": []\n}\n\`\`\``;
                } else {
                    // Vulnerabilities found
                    const filesScanned = summary.debug?.filesSuccessfullyFetched || 0;
                    content = `\`\`\`json\n{\n  "status": "scan_complete",\n  "files_scanned": ${filesScanned},\n  "vulnerabilities_found": ${summary.total},\n  "severity_breakdown": {\n`;
                    if (summary.critical > 0) content += `    "critical": ${summary.critical},\n`;
                    if (summary.high > 0) content += `    "high": ${summary.high},\n`;
                    if (summary.medium > 0) content += `    "medium": ${summary.medium},\n`;
                    if (summary.low > 0) content += `    "low": ${summary.low}\n`;
                    content += `  },\n  "tool_calls": [\n`;

                    findings.slice(0, 10).forEach((f, index) => {
                        const functionName = f.title.toLowerCase().includes('xss') ? 'report_xss' :
                                           f.title.toLowerCase().includes('sql') ? 'report_sql_injection' :
                                           f.title.toLowerCase().includes('injection') && !f.title.toLowerCase().includes('sql') ? 'report_injection' :
                                           f.title.toLowerCase().includes('auth') ? 'report_auth_issue' :
                                           f.title.toLowerCase().includes('crypto') ? 'report_crypto_issue' :
                                           'report_vulnerability';
                        
                        content += `    {\n`;
                        content += `      "function": "${functionName}",\n`;
                        content += `      "arguments": {\n`;
                        content += `        "file": "${f.file}",\n`;
                        if (f.line) content += `        "line": ${f.line},\n`;
                        content += `        "code_snippet": "${f.file}:${f.line || 1}",\n`;
                        content += `        "severity": "${f.severity}",\n`;
                        content += `        "explanation": "${(f.description || 'Security vulnerability detected').replace(/"/g, '\\"')}"\n`;
                        content += `      }\n`;
                        content += `    }${index < Math.min(findings.length, 10) - 1 ? ',' : ''}\n`;
                    });

                    content += `  ]\n`;
                    if (findings.length > 10) {
                        content += `  "note": "...and ${findings.length - 10} more issues (showing first 10)"\n`;
                    }
                    content += `}\n\`\`\``;
                }


                const modelMsg: Message = {
                    id: (Date.now() + 1).toString(),
                    role: "model",
                    content: content,
                    vulnerabilities: findings as any
                };
                setMessages((prev) => [...prev, modelMsg]);
                setStreamingStatus(null); // Clear streaming status
                setLoading(false);
                setScanning(false);
                return;
            } catch (error) {
                console.error("Scan failed:", error);
                toast.error("Security scan failed", {
                    description: error instanceof Error ? error.message : "An error occurred during scanning"
                });
                setStreamingStatus(null); // Clear streaming status
                setScanning(false);
                setLoading(false);

                // Show error message to user
                const errorMsg: Message = {
                    id: (Date.now() + 1).toString(),
                    role: "model",
                    content: "I encountered an error while scanning for security vulnerabilities. Please try again.",
                };
                setMessages((prev) => [...prev, errorMsg]);
                return; // Don't fall through to normal chat
            }
        }

        try {
            const filePaths = repoContext.fileTree.map((f: any) => f.path);

            // Step 1: Analyze files
            setStreamingStatus({ message: "Selecting relevant files...", progress: 10 });
            const { relevantFiles, fileCount } = await analyzeRepoFiles(input, filePaths, repoContext.owner, repoContext.repo);

            // Step 2: Fetch files  
            setStreamingStatus({ message: `Fetching ${fileCount} file${fileCount !== 1 ? 's' : ''} from GitHub...`, progress: 40 });

            const filesToFetch = relevantFiles.map(path => {
                const node = repoContext.fileTree.find((f: any) => f.path === path);
                return { path, sha: node?.sha || "" };
            });

            const { context } = await fetchRepoFiles(repoContext.owner, repoContext.repo, filesToFetch);

            // Step 3: Generate response
            setStreamingStatus({ message: "Generating response...", progress: 70 });
            // Get visitor ID
            let visitorId = localStorage.getItem("visitor_id");
            if (!visitorId) {
                visitorId = crypto.randomUUID();
                localStorage.setItem("visitor_id", visitorId);
            }

            const answer = await generateAnswer(
                input,
                context,
                { owner: repoContext.owner, repo: repoContext.repo },
                messages.map(m => ({ role: m.role, content: m.content })),
                ownerProfile, // Pass profile data for developer cards
                visitorId
            );

            const modelMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: "model",
                content: answer,
                relevantFiles,
            };

            setMessages((prev) => [...prev, modelMsg]);
            setStreamingStatus(null);
        } catch (error: any) {
            console.error(error);

            // Check if it's a rate limit error
            if (isRateLimitError(error)) {
                toast.error(getRateLimitErrorMessage(error), {
                    description: "Please wait a few moments before trying again.",
                    duration: 5000,
                });
            } else {
                toast.error("Failed to analyze code", {
                    description: "An unexpected error occurred. Please try again.",
                });
            }

            // Show user-friendly error message
            const errorMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: "model",
                content: "I encountered an error while analyzing the code. Please try again or rephrase your question.",
            };
            setMessages((prev) => [...prev, errorMsg]);
            setStreamingStatus(null);
        } finally {
            setLoading(false);
        }
    };

    const handleClearChat = () => {
        clearConversation(repoContext.owner, repoContext.repo);
        setMessages([
            {
                id: "welcome",
                role: "model",
                content: `Hello! I've analyzed **${repoContext.owner}/${repoContext.repo}**. Ask me anything about the code structure, dependencies, or specific features.`,
            },
        ]);
        setShowSuggestions(true);
        toast.success("Chat history cleared");
    };

    return (
        <div className="flex flex-col h-full bg-black text-white">
            {/* Repo Header */}
            <div className="border-b border-white/10 p-4 bg-zinc-900/50 backdrop-blur-sm">
                <div className="flex items-center gap-4 max-w-3xl mx-auto">
                    {onToggleSidebar && (
                        <button
                            onClick={onToggleSidebar}
                            className="md:hidden p-2 -ml-2 hover:bg-white/10 rounded-lg transition-colors"
                        >
                            <Menu className="w-5 h-5 text-zinc-400" />
                        </button>
                    )}
                    <Link
                        href="/"
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                        title="Back to home"
                    >
                        <ArrowLeft className="w-5 h-5 text-zinc-400 hover:text-white" />
                    </Link>
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                        <Github className="w-5 h-5 text-zinc-400 shrink-0" />
                        <h1 className="text-lg font-semibold text-zinc-100 truncate">{repoContext.owner}/{repoContext.repo}</h1>
                    </div>

                    <div className={cn(
                        "ml-auto hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                        tokenWarningLevel === 'danger' && "bg-red-500/10 text-red-400 border border-red-500/20",
                        tokenWarningLevel === 'warning' && "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
                        tokenWarningLevel === 'safe' && "bg-zinc-800 text-zinc-400 border border-white/10"
                    )}>
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>{formatTokenCount(totalTokens)} / {formatTokenCount(MAX_TOKENS)} tokens</span>
                    </div>


                    <button
                        onClick={() => setShowClearConfirm(true)}
                        className="p-2 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 rounded-lg transition-colors"
                        title="Clear Chat"
                    >
                        <Trash2 className="w-5 h-5" />
                    </button>


                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                <AnimatePresence initial={false}>
                    {messages.map((msg) => (
                        <motion.div
                            key={msg.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={cn(
                                "flex gap-4 max-w-3xl mx-auto",
                                msg.role === "user" ? "flex-row-reverse" : "flex-row"
                            )}
                        >
                            <div className={cn(
                                "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-lg",
                                msg.role === "model"
                                    ? "bg-gradient-to-br from-purple-600 to-blue-600"
                                    : "bg-gradient-to-br from-zinc-700 to-zinc-900 border border-white/10"
                            )}>
                                {msg.role === "model" ? (
                                    <BotIcon className="w-6 h-6 text-white" />
                                ) : (
                                    <UserIcon className="w-6 h-6 text-white" />
                                )}
                            </div>

                            <div className={cn(
                                "flex flex-col gap-2",
                                msg.role === "user" ? "items-end max-w-[85%] md:max-w-[80%]" : "items-start max-w-full md:max-w-full w-full min-w-0"
                            )}>
                                <div className={cn(
                                    "p-4 rounded-2xl overflow-hidden w-full min-w-0",
                                    msg.role === "user"
                                        ? "bg-blue-600 text-white rounded-tr-none"
                                        : "bg-zinc-900 border border-white/10 rounded-tl-none"
                                )}>
                                    <div className="prose prose-invert prose-sm max-w-none leading-relaxed break-words overflow-hidden w-full min-w-0">
                                        <MessageContent 
                                            content={msg.content} 
                                            messageId={msg.id}
                                            repoOwner={repoContext.owner}
                                            repoName={repoContext.repo}
                                        />
                                    </div>
                                </div>

                                {(() => {
                                    // Extract file references from content
                                    const fileRefs = getUniqueFileReferences(msg.content);
                                    const hasFileRefs = fileRefs.size > 0;
                                    const hasRelevantFiles = msg.relevantFiles && msg.relevantFiles.length > 0;
                                    
                                    // Debug logging - Always log to help debug
                                    console.log('🔍 Checking file references:', {
                                        hasFileRefs: fileRefs.size > 0,
                                        fileRefsCount: fileRefs.size,
                                        fileRefs: Array.from(fileRefs.entries()),
                                        hasRelevantFiles: hasRelevantFiles,
                                        relevantFilesCount: msg.relevantFiles?.length || 0,
                                        contentPreview: msg.content.substring(0, 200)
                                    });
                                    
                                    if (fileRefs.size === 0 && msg.content) {
                                        // Check if content has file references that weren't parsed
                                        const testRefs = msg.content.match(/\[file:[^\]]+\]/g);
                                        if (testRefs) {
                                            console.warn(' Found unparsed file references:', testRefs);
                                        } else {
                                            console.log('ℹ️ No file references found in content');
                                        }
                                    }
                                    
                                    if (!hasFileRefs && !hasRelevantFiles) return null;
                                    
                                    return (
                                        <details className="group mt-1">
                                            <summary className="flex items-center gap-2 text-xs text-zinc-500 cursor-pointer hover:text-zinc-300 transition-colors select-none">
                                                <FileCode className="w-3 h-3" />
                                                <span>
                                                    {hasFileRefs 
                                                        ? `${fileRefs.size} file${fileRefs.size !== 1 ? 's' : ''} referenced`
                                                        : `${msg.relevantFiles!.length} file${msg.relevantFiles!.length !== 1 ? 's' : ''} analyzed`
                                                    }
                                                </span>
                                                <ChevronRight className="w-3 h-3 group-open:rotate-90 transition-transform" />
                                            </summary>
                                            <ul className="mt-2 space-y-2 text-xs pl-4">
                                                {hasFileRefs ? (
                                                    // Show file references with line numbers
                                                    Array.from(fileRefs.entries()).map(([filePath, refs]) => (
                                                        <li key={filePath} className="flex items-start gap-2">
                                                            <button
                                                                onClick={() => {
                                                                    // Collect all line numbers from all references
                                                                    const allLines: number[] = [];
                                                                    refs.forEach(ref => {
                                                                        if (ref.endLine) {
                                                                            for (let i = ref.startLine; i <= ref.endLine; i++) {
                                                                                allLines.push(i);
                                                                            }
                                                                        } else {
                                                                            allLines.push(ref.startLine);
                                                                        }
                                                                    });
                                                                    
                                                                    const firstRef = refs[0];
                                                                    window.dispatchEvent(new CustomEvent('open-file-preview', { 
                                                                        detail: { 
                                                                            filePath, 
                                                                            lineInfo: firstRef.endLine 
                                                                                ? `${firstRef.startLine}-${firstRef.endLine}` 
                                                                                : firstRef.startLine.toString(),
                                                                            highlightedLines: allLines
                                                                        } 
                                                                    }));
                                                                }}
                                                                className="hover:text-purple-400 transition-colors text-left flex items-center gap-2 group"
                                                            >
                                                                <FileCode className="w-3 h-3 text-zinc-500 group-hover:text-purple-400 shrink-0" />
                                                                <span className="font-mono text-zinc-300">{filePath}</span>
                                                                <span className="flex items-center gap-1 flex-wrap">
                                                                    {refs.map((ref, i) => (
                                                                        <span 
                                                                            key={i}
                                                                            className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 font-semibold text-xs"
                                                                            title={ref.endLine ? `Lines ${ref.startLine}-${ref.endLine}` : `Line ${ref.startLine}`}
                                                                        >
                                                                            {ref.endLine ? `${ref.startLine}-${ref.endLine}` : ref.startLine}
                                                                        </span>
                                                                    ))}
                                                                </span>
                                                            </button>
                                                        </li>
                                                    ))
                                                ) : (
                                                    // Fallback to relevant files list
                                                    msg.relevantFiles!.map((file, i) => (
                                                        <li key={i} className="flex items-center gap-2">
                                                            <button
                                                                onClick={() => {
                                                                    window.dispatchEvent(new CustomEvent('open-file-preview', { 
                                                                        detail: { filePath: file, highlightedLines: [] } 
                                                                    }));
                                                                }}
                                                                className="hover:text-purple-400 transition-colors text-left flex items-center gap-2 group"
                                                            >
                                                                <FileCode className="w-3 h-3 text-zinc-500 group-hover:text-purple-400 shrink-0" />
                                                                <span className="font-mono text-zinc-300">{file}</span>
                                                                <span className="text-zinc-600 text-xs">(click to view)</span>
                                                            </button>
                                                        </li>
                                                    ))
                                                )}
                                            </ul>
                                        </details>
                                    );
                                })()}
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {(loading || streamingStatus) && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex gap-4 max-w-3xl mx-auto"
                    >
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center shrink-0 shadow-lg animate-pulse">
                            <BotIcon className="w-6 h-6 text-white opacity-80" />
                        </div>
                        <div className="bg-zinc-900 border border-white/10 p-4 rounded-2xl rounded-tl-none flex-1">
                            {streamingStatus ? (
                                <StreamingProgress
                                    message={streamingStatus.message}
                                    progress={streamingStatus.progress}
                                />
                            ) : (
                                <div className="flex items-center gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                                    <span className="text-zinc-400 text-sm">Analyzing code...</span>
                                </div>
                            )}

                            {/* Show streaming content if available */}
                            {currentStreamingMessage && (
                                <div className="prose prose-invert prose-sm max-w-none leading-relaxed break-words overflow-hidden w-full min-w-0 mt-4 border-t border-white/10 pt-4">
                                    <MessageContent content={currentStreamingMessage} messageId="streaming" />
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="p-4 border-t border-white/10 bg-black/50 backdrop-blur-lg space-y-3">
                {/* Suggestions */}
                {showSuggestions && messages.length === 1 && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="max-w-3xl mx-auto"
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <Sparkles className="w-4 h-4 text-purple-400" />
                            <span className="text-sm text-zinc-400">Try asking:</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {REPO_SUGGESTIONS.map((suggestion, index) => (
                                <button
                                    key={index}
                                    onClick={() => handleSuggestionClick(suggestion)}
                                    className="text-sm px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-white/10 hover:border-purple-600/50 rounded-full text-zinc-300 hover:text-white transition-all"
                                >
                                    {suggestion}
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}

                <form onSubmit={handleSubmit} className="max-w-3xl mx-auto relative">
                    <ChatInput
                        value={input}
                        onChange={setInput}
                        onSubmit={handleSubmit}
                        placeholder={totalTokens >= MAX_TOKENS ? "Conversation limit reached. Please clear chat." : "Ask a question about the code..."}
                        disabled={totalTokens >= MAX_TOKENS}
                        loading={loading}
                    />
                </form>
            </div>

            <ConfirmDialog
                isOpen={showClearConfirm}
                title="Clear Chat History?"
                message="This will permanently delete all messages in this conversation. This action cannot be undone."
                confirmText="Clear Chat"
                cancelText="Cancel"
                confirmVariant="danger"
                onConfirm={handleClearChat}
                onCancel={() => setShowClearConfirm(false)}
            />
        </div>
    );
}
