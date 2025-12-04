import { ImageResponse } from 'next/og';
import { getAnalyticsData } from "@/lib/analytics";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const data = await getAnalyticsData();
        const count = data.totalQueries || 0;
        const formattedCount = count.toLocaleString();

        return new ImageResponse(
            (
                <div
                    style={{
                        height: '100%',
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: '#0f172a', // slate-900
                        backgroundImage: 'linear-gradient(to bottom right, #1e293b, #312e81, #1e293b)',
                        border: '1px solid #3b82f6', // blue-500
                        borderRadius: '12px',
                        fontFamily: 'sans-serif',
                        position: 'relative',
                        overflow: 'hidden',
                    }}
                >
                    {/* Background Glow */}
                    <div
                        style={{
                            position: 'absolute',
                            top: '-50%',
                            left: '-50%',
                            width: '200%',
                            height: '200%',
                            backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(59, 130, 246, 0.2), transparent 50%)', // blue-500
                            pointerEvents: 'none',
                        }}
                    />

                    {/* Content Container */}
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '8px',
                            zIndex: 10,
                        }}
                    >
                        {/* Label */}
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                fontSize: '16px',
                                color: '#a1a1aa', // zinc-400
                                fontWeight: 500,
                                letterSpacing: '0.05em',
                                textTransform: 'uppercase',
                            }}
                        >
                            <svg
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="#3b82f6" // blue-500
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                            </svg>
                            Total Queries Processed
                        </div>

                        {/* Number */}
                        <div
                            style={{
                                fontSize: '64px',
                                fontWeight: 800,
                                lineHeight: 1,
                                textShadow: '0 4px 20px rgba(59, 130, 246, 0.5)', // blue glow
                                backgroundImage: 'linear-gradient(to bottom, #ffffff, #bfdbfe)', // white to blue-200
                                backgroundClip: 'text',
                                color: 'transparent',
                            }}
                        >
                            {formattedCount}
                        </div>

                        {/* Footer */}
                        <div
                            style={{
                                marginTop: '12px',
                                fontSize: '12px',
                                color: '#52525b', // zinc-600
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                            }}
                        >
                            <span>Powered by</span>
                            <span style={{ color: '#3b82f6', fontWeight: 600 }}>RepoLLM AI</span>
                        </div>
                    </div>
                </div>
            ),
            {
                width: 400,
                height: 200,
            }
        );
    } catch (error) {
        console.error("Failed to generate stats card:", error);
        return new Response("Failed to generate image", { status: 500 });
    }
}
