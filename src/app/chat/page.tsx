import { Suspense } from "react";
import { RepoLoader } from "@/components/RepoLoader";
import { AlertCircle, ArrowLeft, Search } from "lucide-react";
import Link from "next/link";

export default async function ChatPage({
    searchParams,
}: {
    searchParams: Promise<{ q?: string }>;
}) {
    let query: string | undefined;
    try {
        const params = await searchParams;
        query = params.q;
    } catch (error) {
        console.error("Error reading searchParams:", error);
        query = undefined;
    }

    if (!query) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-black text-white gap-4">
                <Search className="w-12 h-12 text-zinc-600" />
                <h1 className="text-2xl font-bold">No Query Provided</h1>
                <p className="text-zinc-400">Please search for a GitHub user or repository</p>
                <Link href="/" className="mt-4 px-6 py-3 bg-white text-black rounded-lg hover:bg-zinc-200 transition-colors flex items-center gap-2">
                    <ArrowLeft className="w-4 h-4" />
                    Back to Home
                </Link>
            </div>
        );
    }

    // If it's a profile query (no slash), show error (profile mode disabled in local-only mode)
    if (!query.includes("/")) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-black text-white gap-4">
                <AlertCircle className="w-12 h-12 text-yellow-500" />
                <h1 className="text-2xl font-bold">Profile Mode Not Available</h1>
                <p className="text-zinc-400 max-w-md text-center">
                    Profile analysis is not supported in local-only mode. Please use a repository URL instead.
                </p>
                <p className="text-zinc-500 text-sm">
                    Example: <code className="bg-zinc-900 px-2 py-1 rounded">https://github.com/{query}/repo-name</code>
                </p>
                <Link href="/" className="mt-4 px-6 py-3 bg-white text-black rounded-lg hover:bg-zinc-200 transition-colors flex items-center gap-2">
                    <ArrowLeft className="w-4 h-4" />
                    Back to Home
                </Link>
            </div>
        );
    }

    // For repos, use RepoLoader for client-side loading
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center h-screen bg-black text-white">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                    <p className="text-zinc-400">Loading repository...</p>
                </div>
            </div>
        }>
            <RepoLoader query={query} />
        </Suspense>
    );
}
