import * as vscode from 'vscode';
import { HdlModule } from './hdlSymbol';

export class HdlWorkspace {
    public moduleMap = new Map<string, HdlModule>();
    public fileMap = new Map<string, string[]>();
    public includeDirs: string[] = [];
    public topModule: string | null = null;

    constructor(
        public name: string,
        public rootUri: vscode.Uri
    ) {}

    public clear() {
        this.moduleMap.clear();
        this.fileMap.clear();
        this.includeDirs = [];
        this.topModule = null;
    }
}
