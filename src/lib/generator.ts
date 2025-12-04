import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

/**
 * Generate documentation for code
 */
export async function generateDocumentation(
    code: string,
    type: 'jsdoc' | 'readme' | 'comments' = 'jsdoc'
): Promise<string> {
    try {
        const prompt = `
      Generate ${type.toUpperCase()} documentation for the following code.
      Return ONLY the documentation code block, no markdown wrappers if possible, or just the content.
      
      Code:
      ${code}
    `;

        const result = await client.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
        });
        return (result.choices[0]?.message?.content || "").replace(/```\w*\n/g, '').replace(/```$/g, '');
    } catch (error) {
        console.error('Doc generation failed:', error);
        return 'Failed to generate documentation.';
    }
}

/**
 * Generate unit tests
 */
export async function generateTests(
    code: string,
    framework: 'jest' | 'vitest' = 'jest'
): Promise<string> {
    try {
        const prompt = `
      Generate ${framework} unit tests for the following code.
      Include imports and mock setups if necessary.
      Return ONLY the test code.
      
      Code:
      ${code}
    `;

        const result = await client.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
        });
        return (result.choices[0]?.message?.content || "").replace(/```\w*\n/g, '').replace(/```$/g, '');
    } catch (error) {
        console.error('Test generation failed:', error);
        return '// Failed to generate tests.';
    }
}

/**
 * Suggest refactoring
 */
export async function suggestRefactoring(code: string): Promise<string> {
    try {
        const prompt = `
      Suggest a refactoring for this code to improve readability and performance.
      
      IMPORTANT FORMATTING RULES:
      1. Use standard Markdown.
      2. Provide explanations as normal text.
      3. Use code blocks ONLY for the actual code.
      4. DO NOT wrap the entire response in a single code block.
      
      Structure:
      ### Explanation
      (Your explanation here)
      
      ### Refactored Code
      \`\`\`(language)
            (Your code here)
            \`\`\`
      
      Code:
      ${code}
    `;

        const result = await client.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
        });
        return result.choices[0]?.message?.content || 'Failed to generate suggestions.';
    } catch (error) {
        return 'Failed to generate suggestions.';
    }
}
