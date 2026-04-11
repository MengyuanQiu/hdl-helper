import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import { ProjectManager } from '../project/projectManager';

export interface SynthResult {
    success: boolean;
    logPath: string;
}

export interface ImplResult {
    success: boolean;
    logPath: string;
    bitstreamPath?: string;
}

export class VivadoBridge {
    private static outputChannel = vscode.window.createOutputChannel('HDL Vivado Bridge');

    /**
     * 以批处理模式运行综合
     */
    public static async runSynth(projectDir: string, topModule: string): Promise<SynthResult> {
        this.outputChannel.show();
        this.outputChannel.clear();
        this.outputChannel.appendLine(`[Vivado] Starting Synthesis for top module: ${topModule}`);

        const tclPath = path.join(projectDir, 'synth.tcl');
        const buildDir = path.join(projectDir, 'build', 'vivado');
        
        if (!fs.existsSync(buildDir)) {
            fs.mkdirSync(buildDir, { recursive: true });
        }

        // 1. 生成综合 TCL 脚本
        const tclScript = `
# Auto-generated synthesis script by HDL-Helper
create_project -in_memory -part xc7z020clg400-1
set_property board_part tul.com.tw:pynq-z2:part0:1.0 [current_project]

# 寻找 src 目录下的全部设计文件
read_verilog [glob -nocomplain ${projectDir.replace(/\\/g, '/')}/src/**/*.v]
read_verilog -sv [glob -nocomplain ${projectDir.replace(/\\/g, '/')}/src/**/*.sv]

# 读取约束文件
read_xdc [glob -nocomplain ${projectDir.replace(/\\/g, '/')}/xdc/**/*.xdc]

synth_design -top ${topModule} -part xc7z020clg400-1

report_utilization -file ${buildDir.replace(/\\/g, '/')}/synth_utilization.rpt
report_timing_summary -file ${buildDir.replace(/\\/g, '/')}/synth_timing.rpt

write_checkpoint -force ${buildDir.replace(/\\/g, '/')}/post_synth.dcp
`;
        fs.writeFileSync(tclPath, tclScript);

        // 2. 运行 Vivado
        const cmd = `vivado -mode batch -source "${tclPath}" -journal "${path.join(buildDir, 'vivado.jou')}" -log "${path.join(buildDir, 'vivado.log')}"`;
        
        try {
            this.outputChannel.appendLine(`[Vivado] Executing: vivado -mode batch -source synth.tcl`);
            await this.execPromise(cmd, projectDir);
            this.outputChannel.appendLine(`[Vivado] ✅ Synthesis complete!`);
            return {
                success: true,
                logPath: path.join(buildDir, 'vivado.log')
            };
        } catch (err: any) {
            this.outputChannel.appendLine(`[Vivado] ❌ Synthesis failed:\n${err.message}`);
            return {
                success: false,
                logPath: path.join(buildDir, 'vivado.log')
            };
        }
    }

    /**
     * 以批处理模式运行实现及生成 Bitstream
     */
    public static async runImpl(projectDir: string): Promise<ImplResult> {
        this.outputChannel.show();
        this.outputChannel.clear();
        this.outputChannel.appendLine(`[Vivado] Starting Implementation and Bitstream Generation...`);

        const tclPath = path.join(projectDir, 'impl.tcl');
        const buildDir = path.join(projectDir, 'build', 'vivado');
        const synthDcp = path.join(buildDir, 'post_synth.dcp');

        if (!fs.existsSync(synthDcp)) {
            vscode.window.showErrorMessage(`[Vivado] Synthesis checkpoint not found. Please run Synthesis first.`);
            return { success: false, logPath: '' };
        }

        const tclScript = `
# Auto-generated implementation script by HDL-Helper
open_checkpoint ${synthDcp.replace(/\\/g, '/')}

opt_design
place_design
phys_opt_design
route_design

report_timing_summary -file ${buildDir.replace(/\\/g, '/')}/impl_timing.rpt
report_utilization -file ${buildDir.replace(/\\/g, '/')}/impl_utilization.rpt

write_checkpoint -force ${buildDir.replace(/\\/g, '/')}/post_route.dcp
write_bitstream -force ${buildDir.replace(/\\/g, '/')}/top.bit
`;
        fs.writeFileSync(tclPath, tclScript);

        const cmd = `vivado -mode batch -source "${tclPath}" -journal "${path.join(buildDir, 'vivado_impl.jou')}" -log "${path.join(buildDir, 'vivado_impl.log')}"`;
        
        try {
            this.outputChannel.appendLine(`[Vivado] Executing: vivado -mode batch -source impl.tcl`);
            await this.execPromise(cmd, projectDir);
            this.outputChannel.appendLine(`[Vivado] ✅ Implementation and bitstream generation complete!`);
            return {
                success: true,
                logPath: path.join(buildDir, 'vivado_impl.log'),
                bitstreamPath: path.join(buildDir, 'top.bit')
            };
        } catch (err: any) {
            this.outputChannel.appendLine(`[Vivado] ❌ Implementation failed:\n${err.message}`);
            return {
                success: false,
                logPath: path.join(buildDir, 'vivado_impl.log')
            };
        }
    }

    private static execPromise(command: string, cwd: string): Promise<string> {
        return new Promise((resolve, reject) => {
            cp.exec(command, { cwd }, (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(stdout + '\n' + stderr));
                } else {
                    resolve(stdout);
                }
            });
        });
    }

    /**
     * 极简版解析 Utilization Report (只提取 LUT, FF, BRAM, DSP)
     */
    public static parseUtilization(rptPath: string): Record<string, string> | null {
        if (!fs.existsSync(rptPath)) {return null;}
        
        const content = fs.readFileSync(rptPath, 'utf8');
        const results: Record<string, string> = {};

        // 简陋的正则匹配，真实场景下需要更严谨的表头识别
        const lutMatch = content.match(/\|\s*Slice LUTs\s*\|\s*(\d+)/);
        const regMatch = content.match(/\|\s*Slice Registers\s*\|\s*(\d+)/);
        const bramMatch = content.match(/\|\s*Block RAM Tile\s*\|\s*(\d+)/);
        const dspMatch = content.match(/\|\s*DSPs\s*\|\s*(\d+)/);

        if (lutMatch) {results['LUT'] = lutMatch[1];}
        if (regMatch) {results['FF'] = regMatch[1];}
        if (bramMatch) {results['BRAM'] = bramMatch[1];}
        if (dspMatch) {results['DSP'] = dspMatch[1];}

        return results;
    }

    /**
     * 极简版解析 Timing Summary (提取 WNS, TNS, WHS, THS)
     */
    public static parseTiming(rptPath: string): Record<string, string> | null {
        if (!fs.existsSync(rptPath)) {return null;}
        
        const content = fs.readFileSync(rptPath, 'utf8');
        const results: Record<string, string> = {};

        const lines = content.split('\n');
        let inSummaryTable = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.includes('Design Timing Summary')) {
                inSummaryTable = true;
            }
            if (inSummaryTable && line.includes('WNS(ns)')) {
                // 通常标题和数值差两行
                const valLine = lines[i + 2].trim().split(/\s+/);
                if (valLine.length >= 4) {
                    results['WNS(ns)'] = valLine[0];
                    results['TNS(ns)'] = valLine[1];
                    results['WHS(ns)'] = valLine[6];
                    results['THS(ns)'] = valLine[7];
                }
                break;
            }
        }
        return results;
    }
}
