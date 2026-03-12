import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class WaveformViewer {
    private static currentPanel: vscode.WebviewPanel | undefined;

    public static show(extensionUri: vscode.Uri, waveformPath: string) {
        if (!fs.existsSync(waveformPath)) {
            vscode.window.showErrorMessage(`Waveform file not found: ${waveformPath}`);
            return;
        }

        const fileName = path.basename(waveformPath);

        if (WaveformViewer.currentPanel) {
            WaveformViewer.currentPanel.title = `Waveform: ${fileName}`;
            WaveformViewer.currentPanel.webview.postMessage({ type: 'load_waveform', path: waveformPath });
            WaveformViewer.currentPanel.reveal(vscode.ViewColumn.Beside);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'hdlWaveform',
            `Waveform: ${fileName}`,
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'resources', 'surfer')]
            }
        );

        WaveformViewer.currentPanel = panel;

        // 这里是 Surfer WASM 集成的 MVP UI 壳
        // 实际使用时需要将 surfer 的 js/wasm/html 放到 resources/surfer 目录
        panel.webview.html = WaveformViewer.getWebviewContent(panel.webview, extensionUri);

        // 通知 WebView 加载文件
        panel.webview.postMessage({ type: 'load_waveform', path: waveformPath });

        panel.onDidDispose(() => {
            WaveformViewer.currentPanel = undefined;
        });
    }

    private static getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri): string {
        // 由于此处暂不提供完整的 10MB+ surfer web 构建产物，这里提供一个集成占位/指引面板
        // 在正式版中，将会读取资源的 index.html 并注入 vscode api
        
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Waveform Viewer</title>
    <style>
        body { font-family: var(--vscode-font-family); padding: 20px; color: var(--vscode-editor-foreground); background-color: var(--vscode-editor-background); }
        h1 { color: var(--vscode-editorHoverWidget-highlightForeground); }
        .container { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 80vh; text-align: center; }
        .box { border: 1px solid var(--vscode-widget-border); padding: 30px; border-radius: 8px; background: var(--vscode-editorWidget-background); }
        button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 8px 16px; cursor: pointer; border-radius: 4px; margin-top: 20px; font-size: 14px; }
        button:hover { background: var(--vscode-button-hoverBackground); }
    </style>
</head>
<body>
    <div class="container">
        <div class="box">
            <h1>📊 HDL Waveform Viewer Engine</h1>
            <p><strong>FST (Fast Signal Trace)</strong> engine is initializing...</p>
            <p style="color: grey; font-size: 12px; margin-top: 10px;">
                Waiting for Surfer WASM backend bundle.<br/>
                File requested: <span id="filename"></span>
            </p>
        </div>
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'load_waveform') {
                document.getElementById('filename').innerText = message.path;
                // In full implementation, pass the ArrayBuffer to Surfer WASM here
            }
        });
    </script>
</body>
</html>`;
    }
}
