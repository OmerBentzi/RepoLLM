"use client";

import { useEffect, useState, useRef } from "react";
import { X, Loader2, FileCode, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { getFilePreview } from "@/app/actions";

interface FilePreviewProps {
    isOpen: boolean;
    filePath: string | null;
    repoOwner: string;
    repoName: string;
    onClose: () => void;
    highlightedLines?: number[]; // Array of line numbers to highlight
}

export function FilePreview({ isOpen, filePath, repoOwner, repoName, onClose, highlightedLines = [] }: FilePreviewProps) {
    const [content, setContent] = useState<string>("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fileInfo, setFileInfo] = useState<{ size: number; html_url: string } | null>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen || !filePath) {
            setContent("");
            setLoading(false);
            setError(null);
            setFileInfo(null);
            return;
        }

        const fetchFileContent = async () => {
            setLoading(true);
            setError(null);
            setFileInfo(null);
            try {
                const result = await getFilePreview(repoOwner, repoName, filePath);
                
                if ('error' in result) {
                    throw new Error(result.error);
                }

                const { content, size } = result;
                setFileInfo({ size, html_url: `https://github.com/${repoOwner}/${repoName}/blob/main/${filePath}` });

                // Check for binary/video/large files based on extension and size
                const ext = filePath.split('.').pop()?.toLowerCase() || '';
                const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext);
                const isVideo = ['mp4', 'mov', 'avi', 'webm', 'mkv'].includes(ext);
                const isBinary = ['pdf', 'zip', 'tar', 'gz', 'exe', 'dll', 'bin'].includes(ext);

                // 1. File > 1MB
                if (size > 1000000) {
                    setError('File is too large to show (>1MB)');
                    return;
                }

                // 2. Image > 500KB
                if (isImage && size > 500000) {
                    setError('Image is too large to show (>500KB)');
                    return;
                }

                // 3. Video or Binary
                if (isVideo || isBinary) {
                    setError('Cannot preview binary or video file');
                    return;
                }

                setContent(content);
            } catch (err: any) {
                const errorMessage = err.message || 'Failed to load file content';
                setError(errorMessage);
                toast.error(errorMessage);
                console.error("FilePreview Error:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchFileContent();
    }, [isOpen, filePath, repoOwner, repoName]);

    // Scroll to first highlighted line after content is rendered
    useEffect(() => {
        if (content && highlightedLines.length > 0 && contentRef.current) {
            const timer = setTimeout(() => {
                try {
                    const firstLine = Math.min(...highlightedLines);
                    const lineElement = document.getElementById(`line-${firstLine}`);
                    if (lineElement) {
                        lineElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                } catch (e) {
                    console.warn('Failed to scroll to highlighted line:', e);
                }
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [content, highlightedLines]);

    if (!isOpen) return null;

    const getLanguage = (path: string) => {
        const ext = path.split('.').pop()?.toLowerCase();
        const langMap: Record<string, string> = {
            'js': 'javascript',
            'jsx': 'javascript',
            'ts': 'typescript',
            'tsx': 'typescript',
            'py': 'python',
            'rb': 'ruby',
            'go': 'go',
            'rs': 'rust',
            'java': 'java',
            'cpp': 'cpp',
            'c': 'c',
            'css': 'css',
            'html': 'html',
            'json': 'json',
            'md': 'markdown',
            'yaml': 'yaml',
            'yml': 'yaml',
            'sh': 'bash',
        };
        return langMap[ext || ''] || 'plaintext';
    };

    const isMarkdown = filePath?.endsWith('.md');
    const language = filePath ? getLanguage(filePath) : 'plaintext';

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                    onClick={onClose}
                />

                {/* Modal */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="relative w-full max-w-5xl max-h-[90vh] bg-zinc-900 border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-white/10 bg-zinc-900/80 backdrop-blur-sm">
                        <div className="flex items-center gap-3">
                            <FileCode className="w-5 h-5 text-purple-400" />
                            <h2 className="text-white font-semibold truncate max-w-md" title={filePath || ''}>
                                {filePath}
                            </h2>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                        >
                            <X className="w-5 h-5 text-zinc-400 hover:text-white" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-auto p-6 bg-zinc-950">
                        {loading && (
                            <div className="flex items-center justify-center h-full">
                                <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
                            </div>
                        )}

                        {error && (
                            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
                                <AlertCircle className="w-12 h-12 text-zinc-500" />
                                <p className="text-zinc-400 text-lg font-medium">{error}</p>
                                {fileInfo?.html_url && (
                                    <a
                                        href={fileInfo.html_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-purple-400 hover:text-purple-300 underline underline-offset-4"
                                    >
                                        View file on GitHub
                                    </a>
                                )}
                            </div>
                        )}

                        {!loading && !error && content && (() => {
                            const lines = content.split('\n');
                            console.log('📄 FilePreview rendering:', {
                                filePath,
                                linesCount: lines.length,
                                highlightedLines,
                                hasContent: !!content,
                                contentLength: content.length
                            });
                            return (
                                <div ref={contentRef} className="text-sm font-mono overflow-x-auto bg-zinc-950 rounded-lg border border-white/5">
                                    <div className="relative">
                                        {lines.map((line, index) => {
                                            const lineNumber = index + 1;
                                            const isHighlighted = highlightedLines.includes(lineNumber);
                                            return (
                                                <div
                                                    key={index}
                                                    id={`line-${lineNumber}`}
                                                    className={`flex items-start ${isHighlighted 
                                                        ? "bg-purple-500/20 border-l-4 border-purple-500 pl-3 pr-4 py-1" 
                                                        : "pl-3 pr-4 py-0.5 hover:bg-zinc-900/50"
                                                    }`}
                                                >
                                                    <span className="text-zinc-500 select-none mr-4 inline-block w-14 text-right font-mono text-sm shrink-0 font-medium">
                                                        {lineNumber}
                                                    </span>
                                                    <span className={`flex-1 whitespace-pre ${isHighlighted ? "text-white font-semibold" : "text-zinc-300"}`}>
                                                        {line || '\u00A0'}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })()}
                    </div>

                    {/* Footer */}
                    <div className="p-3 border-t border-white/10 bg-zinc-900/80 backdrop-blur-sm flex items-center justify-between text-xs text-zinc-500">
                        <span>{content ? `${content.split('\n').length} lines` : 'N/A'}</span>
                        <span>{fileInfo?.size ? `${(fileInfo.size / 1024).toFixed(2)} KB` : '0 KB'}</span>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
