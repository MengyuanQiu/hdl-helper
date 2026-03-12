import * as vscode from 'vscode';
import { AstParser } from '../project/astParser';

export async function visualizeFsm() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('No active editor.');
        return;
    }

    const doc = editor.document;
    if (doc.languageId !== 'verilog' && doc.languageId !== 'systemverilog') {
        vscode.window.showWarningMessage('Not a Verilog/SystemVerilog file.');
        return;
    }

    const cursorLine = editor.selection.active.line;
    const text = doc.getText();
    const tree = AstParser.getTree(text);

    if (!tree) {
        vscode.window.showErrorMessage('AST Parser not ready or failed to parse.');
        return;
    }

    // Find the enclosing process statement (always block)
    let currentNode = tree.rootNode.descendantForPosition({
        row: cursorLine,
        column: editor.selection.active.character
    });

    while (currentNode && currentNode.type !== 'always_construct') {
        currentNode = currentNode.parent;
    }

    if (!currentNode) {
        vscode.window.showWarningMessage('No always block found at cursor position.');
        return;
    }

    // Find case statement inside this block
    const fsmStates: Map<string, Array<{ to: string, condition: string }>> = new Map();
    let foundCase = false;

    // A recursive walk to find the state transitions
    function walk(node: any) {
        if (node.type === 'case_item') {
            foundCase = true;
            // First child might be the state constant matching the case
            const stateNodeList = node.children.find((c: any) => c.type === 'expression_list');
            let stateName = 'default';
            if (stateNodeList) {
               stateName = stateNodeList.text;
            }

            if (!fsmStates.has(stateName)) {
                fsmStates.set(stateName, []);
            }

            // Look for nonblocking assignments to NEXT_STATE or state variables
            // This is a heuristic. Let's just catch *all* RHS of nonblocking assigned identifiers in this case_item.
            const assignments = findAssignments(node);
            for (const v of assignments) {
                // If the right-hand side is just a word (likely a state name), record it
                if (/^[a-zA-Z0-9_]+$/.test(v.rhs)) {
                    fsmStates.get(stateName)!.push({
                        to: v.rhs,
                        condition: extractCondition(v.node) || ''
                    });
                }
            }
        } else {
            for (const child of node.children) {
                walk(child);
            }
        }
    }

    function findAssignments(root: any): Array<{ rhs: string, node: any }> {
        const results: Array<{ rhs: string, node: any }> = [];
        function walkEq(n: any) {
            if (n.type === 'nonblocking_assignment' || n.type === 'blocking_assignment') {
                const rhsNode = n.children.find((c: any) => c.type === 'identifier' || c.type === 'simple_identifier' || c.type === 'number');
                // The right hand side is usually the last child or follows '<='
                const eqIdx = n.children.findIndex((c: any) => c.text === '<=' || c.text === '=');
                if (eqIdx !== -1 && eqIdx + 1 < n.children.length) {
                    results.push({
                        rhs: n.children[eqIdx + 1].text,
                        node: n
                    });
                }
            } else {
                for (const c of n.children) walkEq(c);
            }
        }
        walkEq(root);
        return results;
    }

    function extractCondition(assignmentNode: any): string | null {
        // Trace back up to find if statement
        let p = assignmentNode.parent;
        while (p && p.type !== 'if_statement' && p.type !== 'case_item') {
            p = p.parent;
        }
        if (p && p.type === 'if_statement') {
            const cond = p.children.find((c: any) => c.type === 'parenthesized_expression');
            if (cond) return cond.text;
        }
        return null;
    }

    walk(currentNode);

    if (!foundCase || fsmStates.size === 0) {
        vscode.window.showWarningMessage('No FSM structure (case statement assigning to states) detected in the block.');
        return;
    }

    // Generate Mermaid Text
    let mermaidText = 'stateDiagram-v2\n';
    
    // Deduplicate transitions
    for (const [state, transitions] of fsmStates.entries()) {
        const uniqueTrans = new Map<string, string>();
        for (const t of transitions) {
            if (!uniqueTrans.has(t.to)) {
                uniqueTrans.set(t.to, t.condition);
            } else if (t.condition) {
                uniqueTrans.set(t.to, uniqueTrans.get(t.to) + ' | ' + t.condition);
            }
        }
        for (const [to, cond] of uniqueTrans.entries()) {
            mermaidText += `    ${state} --> ${to}`;
            if (cond) {
                // Strip parentheses from condition if desired
                let cleanCond = cond.startsWith('(') && cond.endsWith(')') ? cond.slice(1, -1) : cond;
                mermaidText += ` : ${cleanCond}`;
            }
            mermaidText += '\n';
        }
    }

    // Open WebView
    showFsmWebView(mermaidText);
}

function showFsmWebView(mermaidText: string) {
    const panel = vscode.window.createWebviewPanel(
        'fsmViewer',
        'FSM Viewer',
        vscode.ViewColumn.Two,
        {
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );

    panel.webview.html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>FSM Viewer</title>
            <script type="module">
                import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
                mermaid.initialize({ startOnLoad: true, theme: 'dark' });
            </script>
            <style>
                body {
                    background-color: transparent;
                    color: var(--vscode-editor-foreground);
                    font-family: var(--vscode-font-family);
                    padding: 20px;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                }
                .mermaid {
                    background-color: var(--vscode-editor-background);
                    border-radius: 8px;
                    padding: 20px;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                }
            </style>
        </head>
        <body>
            <pre class="mermaid">
${mermaidText}
            </pre>
        </body>
        </html>
    `;
}
