export default function JsonLd() {
    return (
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
                __html: JSON.stringify({
                    "@context": "https://schema.org",
                    "@type": "WebSite",
                    name: "RepoLLM",
                    url: process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000",
                }),
            }}
        />
    );
}
