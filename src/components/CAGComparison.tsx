"use client";

import { motion } from "framer-motion";
import { Check, X, Brain, Database, Zap, HardDrive } from "lucide-react";

export default function CAGComparison() {
    return (
        <section id="cag-comparison" className="py-24 px-4 relative overflow-hidden bg-gradient-to-b from-transparent via-slate-950/30 to-transparent">
            <div className="max-w-6xl mx-auto relative z-10">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6 }}
                    className="text-center mb-16"
                >
                    <h2 className="text-3xl md:text-5xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-violet-400 to-fuchsia-400">
                        RAG vs. CAG Architecture
                    </h2>
                    <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
                      RepoLLM is powered by <strong>Context Augmented Generation (CAG)</strong><br />
                      Instead of pulling isolated snippets, it captures the full context and delivers a complete understanding of the codebase.
                    </p>  
                </motion.div>

                <div className="grid md:grid-cols-2 gap-8">
                    {/* Traditional RAG Card */}
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        whileHover={{ y: -5, scale: 1.02 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.4 }}
                        className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-8 backdrop-blur-sm hover:bg-zinc-900/80 hover:border-zinc-700 transition-colors cursor-default"
                    >
                        <div className="flex items-center gap-3 mb-8">
                            <div className="p-3 bg-zinc-800 rounded-lg">
                                <Database className="w-6 h-6 text-zinc-400" />
                            </div>
                            <h3 className="text-2xl font-semibold text-zinc-300">Traditional RAG</h3>
                        </div>

                        <div className="space-y-6">
                            <div className="flex items-start gap-4">
                                <div className="mt-1 p-1 bg-red-500/10 rounded-full">
                                    <X className="w-4 h-4 text-red-500" />
                                </div>
                                <div>
                                    <h4 className="font-medium text-zinc-200">Vector Chunking</h4>
                                    <p className="text-sm text-zinc-500 mt-1">Splits code into 256-512 token fragments, losing semantic coherence across function boundaries and imports.</p>
                                </div>
                            </div>

                            <div className="flex items-start gap-4">
                                <div className="mt-1 p-1 bg-red-500/10 rounded-full">
                                    <X className="w-4 h-4 text-red-500" />
                                </div>
                                <div>
                                    <h4 className="font-medium text-zinc-200">Cosine Similarity Search</h4>
                                    <p className="text-sm text-zinc-500 mt-1">Relies on embedding distance metrics that fail to capture logical dependencies and control flow relationships.</p>
                                </div>
                            </div>

                            <div className="flex items-start gap-4">
                                <div className="mt-1 p-1 bg-red-500/10 rounded-full">
                                    <X className="w-4 h-4 text-red-500" />
                                </div>
                                <div>
                                    <h4 className="font-medium text-zinc-200">Stateless Retrieval</h4>
                                    <p className="text-sm text-zinc-500 mt-1">Each query requires full vector DB scan. No session-level context retention or query pattern optimization.</p>
                                </div>
                            </div>
                        </div>
                    </motion.div>

                    {/* RepoLLM CAG Card */}
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        whileHover={{ y: -5, scale: 1.02 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.4 }}
                        className="bg-gradient-to-b from-violet-900/20 to-fuchsia-900/20 border border-violet-500/30 rounded-2xl p-8 backdrop-blur-sm relative overflow-hidden hover:border-violet-500/50 transition-colors cursor-default"
                    >
                        <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/10 blur-[50px] rounded-full" />

                        <div className="flex items-center gap-3 mb-8">
                            <div className="p-3 bg-violet-500/20 rounded-lg">
                                <Brain className="w-6 h-6 text-violet-400" />
                            </div>
                            <h3 className="text-2xl font-semibold text-white">RepoLLM (CAG)</h3>
                        </div>

                        <div className="space-y-6">
                            <div className="flex items-start gap-4">
                                <div className="mt-1 p-1 bg-green-500/10 rounded-full">
                                    <Check className="w-4 h-4 text-green-400" />
                                </div>
                                <div>
                                    <h4 className="font-medium text-white">Full File Context Loading</h4>
                                    <p className="text-sm text-zinc-400 mt-1">Loads complete source files (up to 200K tokens) preserving semantic integrity. AI agent selects files based on dependency graphs and import relationships.</p>
                                </div>
                            </div>

                            <div className="flex items-start gap-4">
                                <div className="mt-1 p-1 bg-green-500/10 rounded-full">
                                    <Check className="w-4 h-4 text-green-400" />
                                </div>
                                <div>
                                    <h4 className="font-medium text-white">Intelligent File Selection</h4>
                                    <p className="text-sm text-zinc-400 mt-1">GPT-4o-mini analyzes file tree structure and query intent to select minimal relevant files. Query-based caching (24h TTL) eliminates redundant selections.</p>
                                </div>
                            </div>

                            <div className="flex items-start gap-4">
                                <div className="mt-1 p-1 bg-green-500/10 rounded-full">
                                    <Check className="w-4 h-4 text-green-400" />
                                </div>
                                <div>
                                    <h4 className="font-medium text-white">Session-Aware Caching</h4>
                                    <p className="text-sm text-zinc-400 mt-1">In-memory cache with TTL-based invalidation. File content (1h), metadata (15m), and query selections persist across requests for instant follow-ups.</p>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}
