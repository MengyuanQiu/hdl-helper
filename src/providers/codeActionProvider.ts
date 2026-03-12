import * as vscode from 'vscode';

/**
 * Provides Quick Fixes (Code Actions) for HDL linting diagnostics.
 */
export class HdlCodeActionProvider implements vscode.CodeActionProvider {

    public static readonly providedCodeActionKinds = [
        vscode.CodeActionKind.QuickFix
    ];

    public provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {

        const actions: vscode.CodeAction[] = [];

        // For each diagnostic the cursor is on or intersecting
        for (const diagnostic of context.diagnostics) {

            // Fix 1: Verible "no-trailing-spaces" or similar whitespace warnings
            if (this.isTrailingSpaceWarning(diagnostic)) {
                actions.push(this.createFixTrailingSpaces(document, diagnostic));
            }

            // Fix 2: Convert "always @(*)" to "always_comb"
            if (this.isAlwaysCombWarning(diagnostic)) {
                actions.push(this.createFixAlwaysComb(document, diagnostic));
            }
        }

        return actions;
    }

    private isTrailingSpaceWarning(diagnostic: vscode.Diagnostic): boolean {
        // Checking for common string identifiers from Verible/Verilator
        const msg = diagnostic.message.toLowerCase();
        return msg.includes('trailing') && msg.includes('space');
    }

    private createFixTrailingSpaces(document: vscode.TextDocument, diagnostic: vscode.Diagnostic): vscode.CodeAction {
        const action = new vscode.CodeAction('Remove trailing spaces', vscode.CodeActionKind.QuickFix);
        action.diagnostics = [diagnostic];
        action.edit = new vscode.WorkspaceEdit();
        action.isPreferred = true;

        // The diagnostic range might span the entire line or just the trailing spaces.
        // We'll just carefully remove spaces at the end of the line.
        const lineText = document.lineAt(diagnostic.range.start.line).text;
        const trimmedText = lineText.trimEnd();

        // If the trimmed text is actually shorter, generate an edit
        if (trimmedText.length < lineText.length) {
            const replaceRange = new vscode.Range(
                diagnostic.range.start.line, trimmedText.length,
                diagnostic.range.start.line, lineText.length
            );
            action.edit.delete(document.uri, replaceRange);
        }

        return action;
    }

    private isAlwaysCombWarning(diagnostic: vscode.Diagnostic): boolean {
        const msg = diagnostic.message.toLowerCase();
        return msg.includes('always_comb') || (msg.includes('always') && msg.includes('@(*)'));
    }

    private createFixAlwaysComb(document: vscode.TextDocument, diagnostic: vscode.Diagnostic): vscode.CodeAction {
        const action = new vscode.CodeAction('Convert to always_comb', vscode.CodeActionKind.QuickFix);
        action.diagnostics = [diagnostic];
        action.edit = new vscode.WorkspaceEdit();
        action.isPreferred = true;

        // Extract the original text to double check
        const text = document.getText(diagnostic.range);
        
        // Verible usually flags `always @*` or `always @(*)`
        // We can do a string replacement on the diagnostic range.
        let newText = text;
        if (newText.includes('always @(*)')) {
            newText = newText.replace('always @(*)', 'always_comb');
        } else if (newText.includes('always @*')) {
            newText = newText.replace('always @*', 'always_comb');
        } else {
            // Fallback, maybe the range only covers `always`
            newText = 'always_comb';
            // We should ideally replace up to the `@(*)` but safely guessing simple replacement
            const lineFragment = document.getText(new vscode.Range(diagnostic.range.start.line, diagnostic.range.start.character, diagnostic.range.start.line, diagnostic.range.start.character + 20));
            const match = lineFragment.match(/always\s*@\s*\(\s*\*\s*\)|always\s*@\s*\*/);
            if (match) {
                const preciseRange = new vscode.Range(
                    diagnostic.range.start.line, diagnostic.range.start.character,
                    diagnostic.range.start.line, diagnostic.range.start.character + match[0].length
                );
                action.edit.replace(document.uri, preciseRange, 'always_comb');
                return action;
            }
        }

        action.edit.replace(document.uri, diagnostic.range, newText);
        return action;
    }
}
