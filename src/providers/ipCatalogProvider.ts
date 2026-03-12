import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class IpCatalogProvider implements vscode.TreeDataProvider<IpNode> {
    private _onDidChangeTreeData: vscode.EventEmitter<IpNode | undefined | null | void> = new vscode.EventEmitter<IpNode | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<IpNode | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor() {
        // Initial scan is handled when the view becomes visible or upon explicit refresh
    }

    public refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: IpNode): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: IpNode): Promise<IpNode[]> {
        if (element) {
            return []; // Currently no nested structure for IP catalog, just a flat list
        } else {
            return await this.scanForIps();
        }
    }

    private async scanForIps(): Promise<IpNode[]> {
        if (!vscode.workspace.workspaceFolders) {
            return [];
        }

        const ipNodes: IpNode[] = [];
        
        // Scan for Vivado IPs (.xci, .xcix) and generic IPs (.ip)
        const xciFiles = await vscode.workspace.findFiles('**/*.xci');
        const xcixFiles = await vscode.workspace.findFiles('**/*.xcix');
        const genericIpFiles = await vscode.workspace.findFiles('**/*.ip');

        const allFiles = [...xciFiles, ...xcixFiles, ...genericIpFiles];

        for (const fileUri of allFiles) {
            const fileName = path.basename(fileUri.fsPath);
            const ext = path.extname(fileName).toLowerCase();
            const ipName = fileName.replace(ext, '');
            
            // Try to resolve vendor/version from file path (heuristic for Vivado `.srcs/sources_1/ip/` folders)
            // A more sophisticated approach would parse the XML inside the .xci file
            const description = `${ext.replace('.', '').toUpperCase()} IP Core`;
            
            const node = new IpNode(
                ipName,
                description,
                fileUri,
                vscode.TreeItemCollapsibleState.None
            );
            
            ipNodes.push(node);
        }

        // Sort alphabetically
        ipNodes.sort((a, b) => a.label.localeCompare(b.label));

        return ipNodes;
    }
}

export class IpNode extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly description: string,
        public readonly fileUri: vscode.Uri,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        this.tooltip = `${this.label} (${this.fileUri.fsPath})`;
        this.description = description;

        // Add a click command to open the IP file (which will likely just open as XML text for now, 
        // but can be extended to trigger Vivado IP customization in the future)
        this.command = {
            command: 'vscode.open',
            title: 'Open IP File',
            arguments: [this.fileUri]
        };
        
        this.iconPath = new vscode.ThemeIcon('server');
    }
}
