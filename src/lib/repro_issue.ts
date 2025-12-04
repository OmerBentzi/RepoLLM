
import { repairMarkdown } from './markdown-utils';

const input = `import { createRoot } from 'react-dom/client';

function HelloMessage({ name }) {
  return <div>Hello {name}</div>;
}

const root = createRoot(document.getElementById('container'));
root.render(<HelloMessage name="Taylor" />);
\`\`\`

-   This snippet uses **JSX**, an HTML-like syntax that is not strictly required but highly recommended for readability.

### ⚛️ React Compiler

The \`compiler/\` directory houses the **React Compiler**:

-   **Purpose**:
    -   Optimizes React applications to ensure **minimal re-rendering** on state changes.
    -   Validates that components and hooks adhere to the **Rules of React**.
-   **Integration**:
    -   The **\`babel-plugin-react-compiler\`** package provides the Babel plugin necessary to use the compiler in projects.
    -   It intercepts \`Program\` nodes during Babel transformation to compile React functions.
-   **Configuration**:
    -   Compiler options are parsed and applied via **\`src/Entrypoint/Options.ts\`** within the Babel plugin.
    -   Supports various \`compilationMode\` settings (e.g., \`infer\`, \`syntax\`, \`annotation\`, \`all\`).
    -   Includes options for \`gating\`, \`dynamicGating\`, \`panicThreshold\`, and \`outputMode\` (e.g., \`ssr\`, \`client\`).
-   **Pipeline**:
    -   The compilation process, defined in **\`src/Entrypoint/Pipeline.ts\`**, involves multiple stages: lowering, SSA, type inference, various optimizations (dead code elimination, instruction reordering, JSX outlining), reactive scope analysis, and codegen.
-   **Playground**:
    -   An interactive playground, located in \`compiler/apps/playground/\`, demonstrates and tests the compiler.
    -   Its \`next.config.js\` shows how the compiler is enabled via \`experimental.reactCompiler: true\`.

### 🤝 Contributing

-   **Code of Conduct**:
    -   Adhere to the [Facebook Code of Conduct](https://code.fb.com/codeofconduct) when contributing.
-   **Contributing Guide**:
    -   Refer to the comprehensive [Contributing Guide](https://legacy.reactjs.org/docs/how-to-contribute.html) for details on the development process, proposing changes, and testing.
-   **Good First Issues**:
    -   New contributors can start with [good first issues](https://github.com/facebook/react/labels/good%20first%20issue) to familiarize themselves with the project.`;

// Prepend the opening fence which was in the previous message but implied here
const fullInput = `\`\`\`\`jsx
${input}`;

console.log("--- Input ---");
console.log(fullInput);
console.log("\n--- Repaired ---");
const repaired = repairMarkdown(fullInput);
console.log(repaired);

if (repaired === fullInput) {
  console.log("\n❌ No changes made!");
} else {
  console.log("\n✅ Changes made.");
}
