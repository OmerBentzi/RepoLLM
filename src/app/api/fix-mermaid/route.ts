import { NextRequest, NextResponse } from 'next/server';
import { fixMermaidSyntax } from '@/lib/open-ai';

export async function POST(req: NextRequest) {
    try {
        const { code } = await req.json();

        if (!code) {
            return NextResponse.json(
                { error: 'Missing code parameter' },
                { status: 400 }
            );
        }

        const fixed = await fixMermaidSyntax(code);

        if (!fixed) {
            return NextResponse.json(
                { error: 'Failed to fix Mermaid syntax' },
                { status: 500 }
            );
        }

        return NextResponse.json({ fixed });
    } catch (error: any) {
        console.error('Error fixing Mermaid syntax:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
