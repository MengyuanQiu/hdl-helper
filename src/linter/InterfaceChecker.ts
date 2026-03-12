import * as vscode from 'vscode';
import { ProjectManager } from '../project/projectManager';

export class InterfaceChecker {
    constructor(private projectManager: ProjectManager) {}

    /**
     * Checks all module instantiations within a document and returns diagnostics
     * if there are mismatched, missing, or extra ports.
     */
    public checkInterfaces(doc: vscode.TextDocument): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = [];
        
        // Find modules defined in this file (the contexts where instantiations occur)
        const modulesInFile = this.projectManager.getModulesInFile(doc.uri.fsPath);
        
        for (const mod of modulesInFile) {
            for (const instance of mod.instances) {
                // Find the definition of the instantiated module
                const targetMod = this.projectManager.getModule(instance.type);
                if (!targetMod) continue; // If module definition isn't found in workspace, skip checking

                const targetPorts = targetMod.ports.map(p => p.name);
                const connectedPorts = instance.portConnections;

                // If no ports are explicitly connected (e.g. ordered connection mapping), we currently skip checking
                // because ordered connection checking requires analyzing the AST order vs port definition order,
                // which is more complex. We only check named connections `.port(sig)` here.
                if (connectedPorts.length === 0 && targetPorts.length > 0) {
                    continue;
                }

                // Check for missing ports (ports required by target module but not connected in the instance)
                const missingPorts = targetPorts.filter(p => !connectedPorts.includes(p));
                
                // Check for extra ports (ports connected in the instance but not existing in the target module definition)
                const extraPorts = connectedPorts.filter(p => !targetPorts.includes(p));

                if (missingPorts.length > 0) {
                    const msg = `[Interface Check] Missing port connections for instance '${instance.name}' of module '${instance.type}': ${missingPorts.join(', ')}`;
                    const diagnostic = new vscode.Diagnostic(
                        instance.range,
                        msg,
                        vscode.DiagnosticSeverity.Warning
                    );
                    diagnostic.source = "HDL-Helper";
                    diagnostics.push(diagnostic);
                }

                if (extraPorts.length > 0) {
                    const msg = `[Interface Check] Extra port connections found that do not exist in module '${instance.type}': ${extraPorts.join(', ')}`;
                    const diagnostic = new vscode.Diagnostic(
                        instance.range,
                        msg,
                        vscode.DiagnosticSeverity.Error
                    );
                    diagnostic.source = "HDL-Helper";
                    diagnostics.push(diagnostic);
                }
            }
        }

        return diagnostics;
    }
}
