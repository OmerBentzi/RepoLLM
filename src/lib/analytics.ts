/**
 * Simple analytics tracking for local development
 * No external dependencies - data is not persisted
 */

export interface AnalyticsData {
    totalVisitors: number;
    totalQueries: number;
    activeUsers24h: number;
    deviceStats: Record<string, number>;
    countryStats: Record<string, number>;
    recentVisitors: VisitorData[];
}

export interface VisitorData {
    id: string;
    country: string;
    device: string;
    lastSeen: number;
    queryCount: number;
    firstSeen: number;
}

// Simple in-memory storage (resets on server restart)
const analyticsData: {
    visitors: Map<string, VisitorData>;
    totalQueries: number;
} = {
    visitors: new Map(),
    totalQueries: 0,
};

/**
 * Track a user event (e.g., query)
 */
export async function trackEvent(
    visitorId: string,
    eventType: 'query' | 'visit',
    metadata: {
        country?: string;
        device?: 'mobile' | 'desktop' | 'unknown';
        userAgent?: string;
    }
) {
    try {
        const timestamp = Date.now();
        const existing = analyticsData.visitors.get(visitorId);

        if (!existing) {
            // New visitor
            analyticsData.visitors.set(visitorId, {
                id: visitorId,
                firstSeen: timestamp,
                lastSeen: timestamp,
                country: metadata.country || 'Unknown',
                device: metadata.device || 'unknown',
                queryCount: eventType === 'query' ? 1 : 0,
            });
        } else {
            // Update existing visitor
            existing.lastSeen = timestamp;
            if (metadata.country) existing.country = metadata.country;
            if (metadata.device) existing.device = metadata.device;
            if (eventType === 'query') {
                existing.queryCount = (existing.queryCount || 0) + 1;
            }
        }

        if (eventType === 'query') {
            analyticsData.totalQueries++;
        }
    } catch (error) {
        console.error("Failed to track analytics event:", error);
        // Don't throw, analytics shouldn't break the app
    }
}

/**
 * Fetch aggregated analytics data for the dashboard
 */
export async function getAnalyticsData(): Promise<AnalyticsData> {
    try {
        const visitors = Array.from(analyticsData.visitors.values());
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

        const activeUsers24h = visitors.filter(v => v.lastSeen > oneDayAgo).length;

        const deviceStats: Record<string, number> = { mobile: 0, desktop: 0, unknown: 0 };
        const countryStats: Record<string, number> = {};

        visitors.forEach(visitor => {
            const device = visitor.device || 'unknown';
            deviceStats[device] = (deviceStats[device] || 0) + 1;

            const country = visitor.country || 'Unknown';
            countryStats[country] = (countryStats[country] || 0) + 1;
        });

        // Sort visitors by last seen (descending)
        const recentVisitors = [...visitors].sort((a, b) => b.lastSeen - a.lastSeen);

        return {
            totalVisitors: visitors.length,
            totalQueries: analyticsData.totalQueries,
            activeUsers24h,
            deviceStats,
            countryStats,
            recentVisitors
        };

    } catch (error) {
        console.error("Failed to fetch analytics data:", error);
        return {
            totalVisitors: 0,
            totalQueries: 0,
            activeUsers24h: 0,
            deviceStats: {},
            countryStats: {},
            recentVisitors: []
        };
    }
}
