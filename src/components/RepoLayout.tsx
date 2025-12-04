"use client";

import { useState, useEffect } from "react";
import { RepoSidebar } from "./RepoSidebar";
import { ChatInterface } from "./ChatInterface";
import { FilePreview } from "./FilePreview";

interface RepoLayoutProps {
    fileTree: any[];
    repoName: string;
    owner: string;
    repo: string;
    hiddenFiles?: { path: string; reason: string }[];
    repoData: any; // Full GitHubRepo object
}

export function RepoLayout({ fileTree, repoName, owner, repo, hiddenFiles = [], repoData }: RepoLayoutProps) {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [previewFile, setPreviewFile] = useState<string | null>(null);
    const [highlightedLines, setHighlightedLines] = useState<number[]>([]);

    const handleFileDoubleClick = (filePath: string) => {
        setPreviewFile(filePath);
        // Close sidebar on mobile after selecting a file
        if (window.innerWidth < 768) {
            setSidebarOpen(false);
        }
    };

    // Listen for custom event to open file preview from chat
    useEffect(() => {
        const handleOpenPreview = (e: CustomEvent<string | { filePath: string; lineInfo?: string; highlightedLines?: number[] }>) => {
            const detail = e.detail;
            if (typeof detail === 'string') {
                setPreviewFile(detail);
                setHighlightedLines([]);
            } else if (detail && typeof detail === 'object' && 'filePath' in detail) {
                setPreviewFile(detail.filePath);
                // Parse line info to get all highlighted lines
                if (detail.highlightedLines && Array.isArray(detail.highlightedLines)) {
                    setHighlightedLines(detail.highlightedLines);
                } else if (detail.lineInfo) {
                    // Parse lineInfo string (e.g., "42" or "42-50")
                    const lines: number[] = [];
                    if (detail.lineInfo.includes('-')) {
                        const [start, end] = detail.lineInfo.split('-').map(Number);
                        for (let i = start; i <= end; i++) {
                            lines.push(i);
                        }
                    } else {
                        lines.push(Number(detail.lineInfo));
                    }
                    setHighlightedLines(lines);
                } else {
                    setHighlightedLines([]);
                }
            }
        };

        window.addEventListener('open-file-preview' as any, handleOpenPreview as any);
        return () => {
            window.removeEventListener('open-file-preview' as any, handleOpenPreview as any);
        };
    }, []);

    return (
        <>
            <div className="flex h-[100dvh] w-full bg-black overflow-hidden">
                <RepoSidebar
                    fileTree={fileTree}
                    repoName={repoName}
                    isOpen={sidebarOpen}
                    onClose={() => setSidebarOpen(false)}
                    onFileDoubleClick={handleFileDoubleClick}
                    hiddenFiles={hiddenFiles}
                    repoData={repoData}
                />
                <div className="flex-1 h-full flex flex-col min-w-0">
                    {/* Hamburger button for mobile */}
                    <ChatInterface
                        repoContext={{
                            owner,
                            repo,
                            fileTree
                        }}
                        onToggleSidebar={() => setSidebarOpen(true)}
                    />
                </div>
            </div>

            <FilePreview
                isOpen={previewFile !== null}
                filePath={previewFile}
                repoOwner={owner}
                repoName={repo}
                onClose={() => {
                    setPreviewFile(null);
                    setHighlightedLines([]);
                }}
                highlightedLines={highlightedLines}
            />
        </>
    );
}
